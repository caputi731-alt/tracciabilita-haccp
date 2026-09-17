/**
 * Estrazione del testo da PDF in puro JavaScript, completamente offline.
 * Nessun modulo nativo: usa solo pako per decomprimere i contenuti (FlateDecode).
 * Funziona con PDF generati da software (fatture, DDT); non con le scansioni.
 * Restituisce le righe di testo di ogni pagina, ricostruite in base alla posizione.
 */
import pako from 'pako';

/* ---------- utilità di base ---------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(b64) {
  const pulito = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((pulito.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < pulito.length; i += 4) {
    const a = B64.indexOf(pulito[i]);
    const b = B64.indexOf(pulito[i + 1]);
    const c = i + 2 < pulito.length ? B64.indexOf(pulito[i + 2]) : 0;
    const d = i + 3 < pulito.length ? B64.indexOf(pulito[i + 3]) : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < len) out[o++] = (n >> 16) & 255;
    if (o < len && i + 2 < pulito.length) out[o++] = (n >> 8) & 255;
    if (o < len && i + 3 < pulito.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

function bytesToBinary(bytes, start = 0, end = bytes.length) {
  let s = '';
  const CH = 8192;
  for (let i = start; i < end; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, end)));
  }
  return s;
}

const WS = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
const DELIM = (c) => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93
  || c === 123 || c === 125 || c === 47 || c === 37;

function ascii85(bytes) {
  const out = [];
  let gruppo = [];
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 126) break; // "~>" fine dati
    if (c === 122 && gruppo.length === 0) { out.push(0, 0, 0, 0); continue; } // "z"
    if (c < 33 || c > 117) continue;
    gruppo.push(c - 33);
    if (gruppo.length === 5) {
      let n = 0;
      for (const g of gruppo) n = n * 85 + g;
      out.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
      gruppo = [];
    }
  }
  if (gruppo.length > 1) {
    const mancanti = 5 - gruppo.length;
    let n = 0;
    for (const g of gruppo.concat(Array(mancanti).fill(84))) n = n * 85 + g;
    const b = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...b.slice(0, 4 - mancanti));
  }
  return new Uint8Array(out);
}

function asciiHex(bytes) {
  const out = [];
  let prec = -1;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 62) break;
    const v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
    if (v < 0) continue;
    if (prec < 0) prec = v; else { out.push(prec * 16 + v); prec = -1; }
  }
  if (prec >= 0) out.push(prec * 16);
  return new Uint8Array(out);
}

/* ---------- parser degli oggetti PDF ---------- */

class Lexer {
  constructor(s, pos = 0) { this.s = s; this.p = pos; }

  skip() {
    const s = this.s;
    while (this.p < s.length) {
      const c = s.charCodeAt(this.p);
      if (WS(c)) this.p++;
      else if (c === 37) { while (this.p < s.length && s[this.p] !== '\n' && s[this.p] !== '\r') this.p++; }
      else break;
    }
  }

  /** Legge un valore: numero, nome, stringa, array, dizionario, riferimento o operatore. */
  next() {
    this.skip();
    const s = this.s;
    if (this.p >= s.length) return undefined;
    const c = s[this.p];

    if (c === '/') {
      let e = this.p + 1;
      while (e < s.length && !WS(s.charCodeAt(e)) && !DELIM(s.charCodeAt(e))) e++;
      const nome = s.slice(this.p + 1, e).replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      this.p = e;
      return { n: nome };
    }
    if (c === '(') return { str: this.literal() };
    if (c === '<') {
      if (s[this.p + 1] === '<') { this.p += 2; return this.dict(); }
      const e = s.indexOf('>', this.p);
      const hex = s.slice(this.p + 1, e).replace(/\s/g, '');
      this.p = e + 1;
      let out = '';
      for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt((hex[i] + (hex[i + 1] || '0')), 16));
      return { str: out };
    }
    if (c === '[') {
      this.p++;
      const arr = [];
      for (;;) {
        this.skip();
        if (this.p >= s.length) break;
        if (s[this.p] === ']') { this.p++; break; }
        arr.push(this.valore());
      }
      return arr;
    }
    if (c === ']' || c === '>' || c === ')' || c === '{' || c === '}') { this.p++; return { op: c }; }

    let e = this.p;
    while (e < s.length && !WS(s.charCodeAt(e)) && !DELIM(s.charCodeAt(e))) e++;
    if (e === this.p) { this.p++; return { op: c }; }
    const tok = s.slice(this.p, e);
    this.p = e;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) return Number(tok);
    if (tok === 'true') return true;
    if (tok === 'false') return false;
    if (tok === 'null') return null;
    return { op: tok };
  }

  /** Come next(), ma riconosce i riferimenti indiretti "12 0 R". */
  valore() {
    const v = this.next();
    if (typeof v === 'number' && Number.isInteger(v)) {
      const salva = this.p;
      const g = this.next();
      if (typeof g === 'number' && Number.isInteger(g)) {
        const r = this.next();
        if (r && r.op === 'R') return { ref: v };
      }
      this.p = salva;
    }
    return v;
  }

  dict() {
    const d = {};
    const s = this.s;
    for (;;) {
      this.skip();
      if (this.p >= s.length) break;
      if (s[this.p] === '>' && s[this.p + 1] === '>') { this.p += 2; break; }
      const k = this.next();
      if (!k || k.n === undefined) continue;
      d[k.n] = this.valore();
    }
    return d;
  }

  literal() {
    const s = this.s;
    let p = this.p + 1;
    let prof = 1;
    let out = '';
    while (p < s.length) {
      const c = s[p];
      if (c === '\\') {
        const n = s[p + 1];
        p += 2;
        if (n === 'n') out += '\n';
        else if (n === 'r') out += '\r';
        else if (n === 't') out += '\t';
        else if (n === 'b') out += '\b';
        else if (n === 'f') out += '\f';
        else if (n === '\r') { if (s[p] === '\n') p++; }
        else if (n === '\n') { /* continuazione di riga */ }
        else if (n >= '0' && n <= '7') {
          let oct = n;
          while (oct.length < 3 && s[p] >= '0' && s[p] <= '7') oct += s[p++];
          out += String.fromCharCode(parseInt(oct, 8) & 255);
        } else out += n;
        continue;
      }
      if (c === '(') prof++;
      else if (c === ')') { prof--; if (prof === 0) { p++; break; } }
      out += c;
      p++;
    }
    this.p = p;
    return out;
  }
}

/* ---------- documento ---------- */

class Documento {
  constructor(bytes) {
    this.bytes = bytes;
    this.bin = bytesToBinary(bytes);
    this.oggetti = {};
    this.cache = {};
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(this.bin))) {
      this.oggetti[Number(m[1])] = m.index + m[0].length;
    }
  }

  risolvi(v) {
    let giri = 0;
    while (v && typeof v === 'object' && v.ref !== undefined && giri++ < 20) v = this.oggetto(v.ref).valore;
    return v;
  }

  oggetto(num) {
    if (this.cache[num]) return this.cache[num];
    const pos = this.oggetti[num];
    if (pos === undefined) return { valore: null };
    const lx = new Lexer(this.bin, pos);
    const valore = lx.valore();
    const ogg = { valore, stream: null };
    lx.skip();
    if (this.bin.startsWith('stream', lx.p)) {
      let inizio = lx.p + 6;
      if (this.bin[inizio] === '\r') inizio++;
      if (this.bin[inizio] === '\n') inizio++;
      let fine = null;
      const lung = valore && typeof valore === 'object' ? this.risolvi(valore.Length) : null;
      if (typeof lung === 'number' && this.bin.startsWith('endstream', this.skipWs(inizio + lung))) {
        fine = inizio + lung;
      } else {
        fine = this.bin.indexOf('endstream', inizio);
        while (fine > inizio && (this.bin[fine - 1] === '\n' || this.bin[fine - 1] === '\r')) fine--;
      }
      ogg.stream = { inizio, fine };
    }
    this.cache[num] = ogg;
    return ogg;
  }

  skipWs(p) {
    while (p < this.bin.length && WS(this.bin.charCodeAt(p))) p++;
    return p;
  }

  /** Contenuto decompresso di uno stream, come stringa binaria. */
  datiStream(ref) {
    const ogg = this.oggetto(ref.ref);
    if (!ogg.stream) return '';
    let dati = this.bytes.subarray(ogg.stream.inizio, ogg.stream.fine);
    const filtri = [].concat(this.risolvi(ogg.valore.Filter) || []);
    for (const f of filtri) {
      const nome = f && f.n;
      if (nome === 'FlateDecode' || nome === 'Fl') {
        try { dati = pako.inflate(dati); } catch (e) {
          try { dati = pako.inflateRaw(dati.subarray(2)); } catch (e2) { return ''; }
        }
      } else if (nome === 'ASCII85Decode' || nome === 'A85') {
        dati = ascii85(dati);
      } else if (nome === 'ASCIIHexDecode' || nome === 'AHx') {
        dati = asciiHex(dati);
      } else {
        return ''; // immagini o filtri non gestiti: non contengono testo utile
      }
    }
    return bytesToBinary(dati);
  }

  pagine() {
    let catalogo = null;
    for (const num of Object.keys(this.oggetti)) {
      const v = this.oggetto(Number(num)).valore;
      if (v && v.Type && v.Type.n === 'Catalog') { catalogo = v; break; }
    }
    const out = [];
    const visita = (nodo, eredita) => {
      nodo = this.risolvi(nodo);
      if (!nodo) return;
      const res = nodo.Resources !== undefined ? nodo.Resources : eredita;
      if (nodo.Type && nodo.Type.n === 'Pages') {
        for (const k of this.risolvi(nodo.Kids) || []) visita(k, res);
      } else {
        out.push({ nodo, risorse: this.risolvi(res) });
      }
    };
    if (catalogo) visita(catalogo.Pages, null);
    return out;
  }
}

/* ---------- font e decodifica caratteri ---------- */

const WIN_ANSI_EXTRA = {
  128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…', 134: '†', 135: '‡', 136: 'ˆ', 137: '‰',
  138: 'Š', 139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 146: '’', 147: '“', 148: '”', 149: '•',
  150: '–', 151: '—', 152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ', 158: 'ž', 159: 'Ÿ',
};

const GLIFI = {
  space: ' ', agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù', degree: '°',
  Euro: '€', quoteright: '’', quoteleft: '‘', hyphen: '-', endash: '–', emdash: '—',
  period: '.', comma: ',', colon: ':', semicolon: ';', slash: '/', percent: '%', parenleft: '(',
  parenright: ')', zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', asciicircum: '^', ampersand: '&', plus: '+', equal: '=',
};

function leggiCMap(testo) {
  const mappa = {};
  let byteCodice = 0;
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let m;
  while ((m = cs.exec(testo))) {
    const h = m[1].match(/<([0-9a-fA-F]+)>/);
    if (h) byteCodice = Math.max(byteCodice, h[1].length / 2);
  }
  const hexToStr = (h) => {
    let s = '';
    for (let i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4).padEnd(4, '0'), 16));
    return s;
  };
  const uni = (h) => (h.length % 4 === 0 ? hexToStr(h) : String.fromCharCode(parseInt(h, 16)));

  const bc = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = bc.exec(testo))) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
    let c;
    while ((c = re.exec(m[1]))) {
      mappa[parseInt(c[1], 16)] = uni(c[2]);
      byteCodice = byteCodice || c[1].length / 2;
    }
  }
  const br = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = br.exec(testo))) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]+)>|\[([^\]]*)\])/g;
    let r;
    while ((r = re.exec(m[1]))) {
      const da = parseInt(r[1], 16);
      const a = parseInt(r[2], 16);
      byteCodice = byteCodice || r[1].length / 2;
      if (r[4] !== undefined) {
        const base = r[4];
        const pre = base.slice(0, -4);
        const ultimo = parseInt(base.slice(-4), 16);
        for (let k = 0; k <= a - da && k < 65536; k++) {
          mappa[da + k] = hexToStr(pre) + String.fromCharCode(ultimo + k);
        }
      } else {
        const elenco = r[5].match(/<([0-9a-fA-F]+)>/g) || [];
        elenco.forEach((h, k) => { mappa[da + k] = uni(h.slice(1, -1)); });
      }
    }
  }
  return { mappa, byteCodice: byteCodice || 1 };
}

function preparaFont(doc, fontRef) {
  const f = doc.risolvi(fontRef) || {};
  const sottotipo = f.Subtype && f.Subtype.n;
  const composto = sottotipo === 'Type0';
  const font = { composto, byte: composto ? 2 : 1, mappa: null, larghezze: {}, def: composto ? 1000 : 500, diff: {} };

  if (f.ToUnicode && f.ToUnicode.ref !== undefined) {
    const cm = leggiCMap(doc.datiStream(f.ToUnicode));
    font.mappa = cm.mappa;
    if (composto) font.byte = cm.byteCodice;
  }

  if (composto) {
    const disc = doc.risolvi((doc.risolvi(f.DescendantFonts) || [])[0]) || {};
    if (typeof disc.DW === 'number') font.def = disc.DW;
    const w = doc.risolvi(disc.W) || [];
    for (let i = 0; i < w.length;) {
      const primo = doc.risolvi(w[i]);
      const secondo = doc.risolvi(w[i + 1]);
      if (Array.isArray(secondo)) {
        secondo.forEach((l, k) => { font.larghezze[primo + k] = doc.risolvi(l); });
        i += 2;
      } else {
        const l = doc.risolvi(w[i + 2]);
        for (let c = primo; c <= secondo; c++) font.larghezze[c] = l;
        i += 3;
      }
    }
  } else {
    const base = (f.BaseFont && f.BaseFont.n) || '';
    if (/Courier/i.test(base)) font.def = 600; // font standard a larghezza fissa, spesso senza /Widths
    const primo = doc.risolvi(f.FirstChar) || 0;
    (doc.risolvi(f.Widths) || []).forEach((l, k) => { font.larghezze[primo + k] = doc.risolvi(l); });
    const desc = doc.risolvi(f.FontDescriptor);
    if (desc && typeof desc.MissingWidth === 'number' && desc.MissingWidth > 0) font.def = desc.MissingWidth;
    const enc = doc.risolvi(f.Encoding);
    if (enc && Array.isArray(enc.Differences)) {
      let codice = 0;
      for (const v of enc.Differences) {
        if (typeof v === 'number') codice = v;
        else if (v && v.n) {
          const nome = v.n;
          let ch = GLIFI[nome];
          if (!ch && /^uni[0-9A-F]{4}$/.test(nome)) ch = String.fromCharCode(parseInt(nome.slice(3), 16));
          if (!ch && nome.length === 1) ch = nome;
          if (ch) font.diff[codice] = ch;
          codice++;
        }
      }
    }
  }
  return font;
}

function decodifica(font, s) {
  let testo = '';
  let larghezza = 0;
  let spazi = 0;
  for (let i = 0; i < s.length; i += font.byte) {
    let codice = 0;
    for (let k = 0; k < font.byte; k++) codice = (codice << 8) | (s.charCodeAt(i + k) || 0);
    let ch;
    if (font.mappa && font.mappa[codice] !== undefined) ch = font.mappa[codice];
    else if (font.diff[codice]) ch = font.diff[codice];
    else if (font.composto) ch = '';
    else ch = WIN_ANSI_EXTRA[codice] || String.fromCharCode(codice);
    testo += ch;
    const l = font.larghezze[codice];
    larghezza += (typeof l === 'number' ? l : font.def);
    if (font.byte === 1 && codice === 32) spazi++;
  }
  return { testo, larghezza, n: s.length / font.byte, spazi };
}

/* ---------- interprete del contenuto di pagina ---------- */

const molt = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

function eseguiContenuto(doc, contenuto, risorse, ctmIniziale, elementi, profondita = 0) {
  if (profondita > 5) return;
  const fontRisorse = doc.risolvi(risorse && risorse.Font) || {};
  const xobj = doc.risolvi(risorse && risorse.XObject) || {};
  const cacheFont = {};

  let ctm = ctmIniziale;
  const pila = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let font = null;
  let dim = 12;
  let tc = 0; let tw = 0; let th = 1; let tl = 0; let rise = 0;
  let operandi = [];

  const mostra = (s) => {
    if (!font) return;
    const d = decodifica(font, s);
    const trm = molt([dim * th, 0, 0, dim, 0, rise], molt(tm, ctm));
    const scala = Math.sqrt(trm[2] * trm[2] + trm[3] * trm[3]) || dim;
    const avanzamento = (d.larghezza / 1000) * dim + tc * d.n + tw * d.spazi;
    if (d.testo) {
      elementi.push({
        x: trm[4], y: trm[5], testo: d.testo, dim: scala,
        fine: trm[4] + avanzamento * th * (trm[0] / (dim * th || 1)),
      });
    }
    tm = molt([1, 0, 0, 1, avanzamento * th, 0], tm);
  };

  const lx = new Lexer(contenuto);
  for (;;) {
    const t = lx.next();
    if (t === undefined) break;
    if (!(t && t.op !== undefined) || t.op === ']' ) {
      if (!(t && t.op === ']')) operandi.push(t);
      continue;
    }
    const op = t.op;
    const o = operandi;
    operandi = [];
    switch (op) {
      case 'q': pila.push(ctm); break;
      case 'Q': ctm = pila.pop() || ctm; break;
      case 'cm': if (o.length >= 6) ctm = molt(o.slice(-6), ctm); break;
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case 'Tf': {
        const nome = o[0] && o[0].n;
        dim = o[1];
        if (!cacheFont[nome]) cacheFont[nome] = preparaFont(doc, fontRisorse[nome]);
        font = cacheFont[nome];
        break;
      }
      case 'Tc': tc = o[0]; break;
      case 'Tw': tw = o[0]; break;
      case 'Tz': th = o[0] / 100; break;
      case 'TL': tl = o[0]; break;
      case 'Ts': rise = o[0]; break;
      case 'Td': tlm = molt([1, 0, 0, 1, o[0], o[1]], tlm); tm = tlm; break;
      case 'TD': tl = -o[1]; tlm = molt([1, 0, 0, 1, o[0], o[1]], tlm); tm = tlm; break;
      case 'Tm': tlm = o.slice(0, 6); tm = tlm; break;
      case 'T*': tlm = molt([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
      case 'Tj': if (o[0] && o[0].str !== undefined) mostra(o[0].str); break;
      case "'":
        tlm = molt([1, 0, 0, 1, 0, -tl], tlm); tm = tlm;
        if (o[0] && o[0].str !== undefined) mostra(o[0].str);
        break;
      case '"':
        tw = o[0]; tc = o[1];
        tlm = molt([1, 0, 0, 1, 0, -tl], tlm); tm = tlm;
        if (o[2] && o[2].str !== undefined) mostra(o[2].str);
        break;
      case 'TJ': {
        const arr = Array.isArray(o[0]) ? o[0] : [];
        for (const el of arr) {
          if (typeof el === 'number') {
            const sposta = (-el / 1000) * dim * th;
            if (el < -250 && font) {
              const trm = molt([dim * th, 0, 0, dim, 0, rise], molt(tm, ctm));
              elementi.push({ x: trm[4], y: trm[5], testo: ' ', dim: dim, fine: trm[4], spazio: true });
            }
            tm = molt([1, 0, 0, 1, sposta, 0], tm);
          } else if (el && el.str !== undefined) mostra(el.str);
        }
        break;
      }
      case 'Do': {
        const nome = o[0] && o[0].n;
        const ref = xobj[nome];
        const x = doc.risolvi(ref);
        if (x && x.Subtype && x.Subtype.n === 'Form' && ref && ref.ref !== undefined) {
          const matrice = Array.isArray(x.Matrix) ? x.Matrix : [1, 0, 0, 1, 0, 0];
          const ris = doc.risolvi(x.Resources) || risorse;
          eseguiContenuto(doc, doc.datiStream(ref), ris, molt(matrice, ctm), elementi, profondita + 1);
        }
        break;
      }
      case 'BI': {
        const idx = contenuto.indexOf('EI', lx.p);
        lx.p = idx < 0 ? contenuto.length : idx + 2;
        break;
      }
      default: break;
    }
  }
}

function componiRighe(elementi) {
  const validi = elementi.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y));
  validi.sort((a, b) => b.y - a.y || a.x - b.x);
  const righe = [];
  for (const e of validi) {
    const tolleranza = Math.max(2, e.dim * 0.35);
    let riga = righe.length ? righe[righe.length - 1] : null;
    if (!riga || Math.abs(riga.y - e.y) > tolleranza) {
      riga = { y: e.y, el: [] };
      righe.push(riga);
    }
    riga.el.push(e);
  }
  return righe.map((r) => {
    r.el.sort((a, b) => a.x - b.x);
    let testo = '';
    let fine = null;
    for (const e of r.el) {
      if (e.spazio) { if (testo && !testo.endsWith(' ')) testo += ' '; continue; }
      if (fine !== null && e.x - fine > e.dim * 0.2 && !testo.endsWith(' ')) testo += ' ';
      testo += e.testo;
      fine = Math.max(fine === null ? -Infinity : fine, e.fine);
    }
    return testo.replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
}

/**
 * Estrae il testo da un PDF.
 * @param {Uint8Array} bytes contenuto del file
 * @returns {string[][]} per ogni pagina, l'elenco delle righe di testo
 */
export function estraiTestoPdf(bytes) {
  const doc = new Documento(bytes);
  if (/\/Encrypt\b/.test(doc.bin.slice(-4096)) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(doc.bin)) {
    throw new Error('Il PDF è protetto e non può essere letto.');
  }
  return doc.pagine().map(({ nodo, risorse }) => {
    const contenuti = [].concat(nodo.Contents || []);
    let testo = '';
    for (const c of contenuti) {
      const r = doc.risolvi(c);
      if (Array.isArray(r)) r.forEach((x) => { testo += doc.datiStream(x) + '\n'; });
      else if (c && c.ref !== undefined) testo += doc.datiStream(c) + '\n';
    }
    const elementi = [];
    eseguiContenuto(doc, testo, risorse, [1, 0, 0, 1, 0, 0], elementi);
    return componiRighe(elementi);
  });
}
