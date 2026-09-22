import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert, Animated, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { rendiPermanente } from './foto';
import { S, COLORS, dataPerCampo, isoDaCampo } from './theme';

/** L'errore resta visibile finché il valore è quello che l'ha causato: appena si corregge, sparisce. */
const testoErrore = (e) => (e && typeof e === 'object' ? e.testo : e) || null;

function useErroreVisibile(errore, valore) {
  const [valoreErrato, setValoreErrato] = useState(undefined);
  // errore è un oggetto nuovo a ogni tentativo di salvataggio: l'effetto riparte anche con lo stesso testo
  React.useEffect(() => { setValoreErrato(errore ? valore : undefined); }, [errore]);
  return errore && valore === valoreErrato ? testoErrore(errore) : null;
}

export function Campo({ label, value, onChange, errore, style, ...props }) {
  const visibile = useErroreVisibile(errore, value);
  return (
    <View>
      <Text style={[S.label, visibile && { color: COLORS.danger }]}>{label}</Text>
      <TextInput
        style={[S.input, visibile && S.inputErrore, style]}
        value={value === null || value === undefined ? '' : String(value)}
        onChangeText={onChange}
        placeholderTextColor="#8A958F"
        {...props}
      />
      {!!visibile && <Text style={S.testoErrore}>{visibile}</Text>}
    </View>
  );
}

/**
 * Errori di compilazione mostrati sui campi invece che in finestre da chiudere.
 * const { errori, segnala, azzera, riepilogo } = useErrori();
 * azzera() all'inizio del salvataggio, segnala('campo', 'messaggio') e return; {riepilogo} sopra il pulsante.
 */
export function useErrori() {
  const [errori, setErrori] = useState({});
  const azzera = useCallback(() => setErrori({}), []);
  const segnala = useCallback((campo, messaggio) => {
    setErrori((e) => ({ ...e, [campo]: { testo: messaggio, id: Math.random() } }));
    return false;
  }, []);
  const n = Object.keys(errori).length;
  const riepilogo = n ? (
    <View style={{ backgroundColor: COLORS.dangerSoft, borderRadius: 12, padding: 12, marginTop: 14 }}>
      <Text style={{ color: COLORS.danger, fontWeight: '800', fontSize: 15 }}>
        {n === 1 ? Object.values(errori)[0].testo : `Controlla i ${n} campi evidenziati in rosso`}
      </Text>
    </View>
  ) : null;
  return { errori, segnala, azzera, riepilogo };
}

/** Linguette per cambiare vista: una barra unica con la parte attiva evidenziata. */
export function Segmenti({ opzioni, valore, onChange }) {
  return (
    <View style={{
      flexDirection: 'row', backgroundColor: '#DCE3E0', borderRadius: 14, padding: 4, marginTop: 10,
    }}>
      {opzioni.map((o) => {
        const attivo = o === valore;
        return (
          <TouchableOpacity key={o} onPress={() => onChange(o)} activeOpacity={0.8}
            style={{
              flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
              paddingHorizontal: 4, backgroundColor: attivo ? '#fff' : 'transparent',
              elevation: attivo ? 2 : 0,
            }}>
            <Text numberOfLines={1} style={{
              fontSize: 14, fontWeight: attivo ? '800' : '600', color: attivo ? COLORS.azione : COLORS.muted,
            }}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Chips({ label, opzioni, valore, onChange, multiplo = false }) {
  const attivo = (o) => (multiplo ? (valore || []).includes(o) : valore === o);
  const tocca = (o) => {
    if (!multiplo) return onChange(o);
    const v = valore || [];
    onChange(v.includes(o) ? v.filter((x) => x !== o) : [...v, o]);
  };
  return (
    <View>
      {label ? <Text style={S.label}>{label}</Text> : null}
      <View style={S.chipWrap}>
        {opzioni.map((o) => (
          <TouchableOpacity
            key={o}
            style={[S.chip, attivo(o) && S.chipOn]}
            onPress={() => tocca(o)}
          >
            <Text style={[S.chipText, attivo(o) && S.chipTextOn]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/**
 * Contenitore scorrevole per il contenuto di una modale.
 * Su Android uno ScrollView figlio diretto di <Modal> viene misurato prima del layout:
 * il contenuto risulta "più corto" dello schermo e lo scorrimento resta bloccato finché
 * qualcosa non provoca un nuovo calcolo (per esempio toccando un'opzione). Qui lo
 * avvolgiamo in una vista con altezza definita e forziamo una misura subito dopo l'apertura.
 */
export function VistaModale({ children, contentContainerStyle, ...resto }) {
  const [misurato, setMisurato] = useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setMisurato(true), 60);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[S.content, { paddingTop: 50, paddingBottom: misurato ? 48 : 49 }, contentContainerStyle]}
        {...resto}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Selettore da elenco (fornitori, prodotti...) con ricerca */
export function Selettore({ label, elementi, valore, etichetta, onChange, placeholder, errore }) {
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState('');
  const sel = elementi.find((e) => e.id === valore);
  const filtrati = elementi.filter((e) =>
    etichetta(e).toLowerCase().includes(cerca.toLowerCase())
  );
  return (
    <View>
      <Text style={[S.label, !!errore && !sel && { color: COLORS.danger }]}>{label}</Text>
      <TouchableOpacity style={[S.input, !!errore && !sel && S.inputErrore]} onPress={() => setAperto(true)}>
        <Text style={{ fontSize: 16, color: sel ? COLORS.text : '#8A958F' }}>
          {sel ? etichetta(sel) : placeholder || 'Seleziona…'}
        </Text>
      </TouchableOpacity>
      {!!errore && !sel && <Text style={S.testoErrore}>{testoErrore(errore)}</Text>}

      <Modal visible={aperto} animationType="slide" onRequestClose={() => setAperto(false)}>
        <View style={[S.screen, { padding: 16, paddingTop: 50 }]}>
          <Text style={S.h2}>{label}</Text>
          <TextInput
            style={S.input}
            placeholder="Cerca…"
            value={cerca}
            onChangeText={setCerca}
            autoFocus
          />
          <ScrollView style={{ marginTop: 12 }}>
            {filtrati.map((e) => (
              <TouchableOpacity
                key={e.id}
                style={[S.card, { padding: 14 }]}
                onPress={() => { onChange(e.id); setAperto(false); setCerca(''); }}
              >
                <Text style={{ fontSize: 16 }}>{etichetta(e)}</Text>
              </TouchableOpacity>
            ))}
            {filtrati.length === 0 && <Text style={S.empty}>Nessun risultato</Text>}
          </ScrollView>
          <TouchableOpacity style={S.btnGhost} onPress={() => setAperto(false)}>
            <Text style={S.btnGhostText}>Annulla</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

/** Scanner codici a barre / QR */
export function Scanner({ visibile, onLetto, onChiudi }) {
  const [permesso, chiediPermesso] = useCameraPermissions();

  React.useEffect(() => {
    if (visibile && permesso && !permesso.granted) chiediPermesso();
  }, [visibile, permesso]);

  if (!visibile) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permesso?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr', 'upc_a'],
            }}
            onBarcodeScanned={({ data }) => onLetto(data)}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16 }}>
              Serve il permesso di usare la fotocamera per leggere i codici a barre.
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={{ padding: 20, backgroundColor: '#111' }}
          onPress={onChiudi}
        >
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '700' }}>
            Chiudi
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

/** Icona vettoriale (set Material Community, incluso in Expo). */
export function Icona({ nome, size = 22, colore = COLORS.text, style }) {
  return <MaterialCommunityIcons name={nome} size={size} color={colore} style={style} />;
}

export function Bottone({ testo, onPress, ghost, colore, icona }) {
  const coloreTesto = ghost ? (colore || COLORS.azione || COLORS.primary) : '#fff';
  return (
    <TouchableOpacity
      style={[ghost ? S.btnGhost : S.btn, colore && !ghost && { backgroundColor: colore },
        colore && ghost && { borderColor: colore },
        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]}
      onPress={onPress}
    >
      {!!icona && <Icona nome={icona} size={20} colore={coloreTesto} style={{ marginRight: 8 }} />}
      <Text style={[ghost ? S.btnGhostText : S.btnText, ghost && colore && { color: colore }]}>{testo}</Text>
    </TouchableOpacity>
  );
}

/** Sezione con titolo che si apre e si chiude con un tocco. */
export function Sezione({ titolo, icona, aperta = false, riassunto, children, colore }) {
  const [open, setOpen] = useState(aperta);
  React.useEffect(() => { if (aperta) setOpen(true); }, [aperta]);
  return (
    <View style={[S.card, { paddingVertical: 0 }]}>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
        {!!icona && <Icona nome={icona} colore={colore || COLORS.muted} style={{ marginRight: 10 }} />}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colore || COLORS.text }}>{titolo}</Text>
          {!open && !!riassunto && <Text style={S.muted} numberOfLines={1}>{riassunto}</Text>}
        </View>
        <Icona nome={open ? 'chevron-up' : 'chevron-down'} colore={COLORS.muted} />
      </TouchableOpacity>
      {open && <View style={{ paddingBottom: 14 }}>{children}</View>}
    </View>
  );
}

/** Segnaposto grigi mostrati mentre un elenco si carica. */
export function Caricamento({ righe = 3 }) {
  const opacita = useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(opacita, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(opacita, { toValue: 0.5, duration: 600, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [opacita]);
  return (
    <View>
      {Array.from({ length: righe }).map((_, i) => (
        <Animated.View key={i} style={[S.card, { opacity: opacita }]}>
          <View style={{ height: 18, width: '60%', backgroundColor: COLORS.border, borderRadius: 6 }} />
          <View style={{ height: 14, width: '85%', backgroundColor: COLORS.border, borderRadius: 6, marginTop: 10 }} />
          <View style={{ height: 14, width: '40%', backgroundColor: COLORS.border, borderRadius: 6, marginTop: 8 }} />
        </Animated.View>
      ))}
    </View>
  );
}

/** Elenco vuoto che spiega cosa fare e offre il pulsante per farlo. */
export function Vuoto({ icona = 'tray', titolo, testo, azione, onAzione }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 }}>
      <Icona nome={icona} size={48} colore={COLORS.muted} />
      <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, marginTop: 12, textAlign: 'center' }}>{titolo}</Text>
      {!!testo && <Text style={[S.muted, { textAlign: 'center', marginTop: 6 }]}>{testo}</Text>}
      {!!azione && <View style={{ alignSelf: 'stretch', marginTop: 10 }}><Bottone testo={azione} onPress={onAzione} /></View>}
    </View>
  );
}

const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto',
  'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const isoDi = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Campo data con calendario. value/onChange in formato ISO (AAAA-MM-GG) oppure null.
 * scorciatoie: [{ testo, giorni }] per date rapide (es. +3 giorni).
 */
export function CampoData({ label, value, onChange, errore, scorciatoie, facoltativo = true, nota }) {
  const [aperto, setAperto] = useState(false);
  const base = value && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T12:00:00`) : new Date();
  const [mese, setMese] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const apri = () => { setMese(new Date(base.getFullYear(), base.getMonth(), 1)); setAperto(true); };
  const scegli = (iso) => { onChange(iso); setAperto(false); };
  const primo = (mese.getDay() + 6) % 7; // lunedì = 0
  const giorni = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate();
  const celle = [...Array(primo).fill(null), ...Array.from({ length: giorni }, (_, i) => i + 1)];
  const oggi = isoDi(new Date());
  const piu = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDi(d); };
  return (
    <View>
      <Text style={[S.label, errore && { color: COLORS.danger }]}>{label}</Text>
      <TouchableOpacity onPress={apri} activeOpacity={0.7}
        style={[S.input, errore && S.inputErrore, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 16, color: value ? COLORS.text : '#8A958F' }}>
          {value ? dataPerCampo(value) : 'Tocca per scegliere'}
        </Text>
        <Icona nome="calendar-month" colore={COLORS.azione || COLORS.primary} />
      </TouchableOpacity>
      {!!nota && !errore && <Text style={[S.muted, { marginTop: 4 }]}>{nota}</Text>}
      {!!errore && <Text style={S.testoErrore}>{typeof errore === 'string' ? errore : errore.testo}</Text>}
      <Modal visible={aperto} transparent animationType="fade" onRequestClose={() => setAperto(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
          <View style={S.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <TouchableOpacity style={{ padding: 10 }}
                onPress={() => setMese(new Date(mese.getFullYear(), mese.getMonth() - 1, 1))}>
                <Icona nome="chevron-left" size={28} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text }}>
                {MESI[mese.getMonth()]} {mese.getFullYear()}
              </Text>
              <TouchableOpacity style={{ padding: 10 }}
                onPress={() => setMese(new Date(mese.getFullYear(), mese.getMonth() + 1, 1))}>
                <Icona nome="chevron-right" size={28} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((g, i) => (
                <Text key={i} style={{ flex: 1, textAlign: 'center', color: COLORS.muted, fontWeight: '700' }}>{g}</Text>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
              {celle.map((g, i) => {
                if (!g) return <View key={`v${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
                const iso = isoDi(new Date(mese.getFullYear(), mese.getMonth(), g));
                const sel = value && value.slice(0, 10) === iso;
                return (
                  <TouchableOpacity key={iso} onPress={() => scegli(iso)}
                    style={{ width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: sel ? (COLORS.azione || COLORS.primary) : 'transparent',
                      borderWidth: iso === oggi && !sel ? 1.5 : 0, borderColor: COLORS.azione || COLORS.primary,
                    }}>
                      <Text style={{ fontSize: 16, color: sel ? '#fff' : COLORS.text, fontWeight: sel ? '800' : '500' }}>{g}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[S.chipWrap, { marginTop: 8 }]}>
              <TouchableOpacity style={S.chip} onPress={() => scegli(oggi)}><Text style={S.chipText}>Oggi</Text></TouchableOpacity>
              {(scorciatoie || []).map((sc) => (
                <TouchableOpacity key={sc.testo} style={S.chip} onPress={() => scegli(piu(sc.giorni))}>
                  <Text style={S.chipText}>{sc.testo}</Text>
                </TouchableOpacity>
              ))}
              {facoltativo && !!value && (
                <TouchableOpacity style={S.chip} onPress={() => scegli(null)}><Text style={S.chipText}>Nessuna data</Text></TouchableOpacity>
              )}
            </View>
            <Bottone testo="Chiudi" ghost onPress={() => setAperto(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export const conferma = (titolo, messaggio, azione) =>
  Alert.alert(titolo, messaggio, [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Conferma', style: 'destructive', onPress: azione },
  ]);

/** Fotocamera per scattare foto (DDT, etichette) con CameraView */
export function CameraCapture({ visibile, onScattata, onChiudi }) {
  const [permesso, chiediPermesso] = useCameraPermissions();
  const camRef = React.useRef(null);
  const [inCorso, setInCorso] = useState(false);

  React.useEffect(() => {
    if (visibile && permesso && !permesso.granted) chiediPermesso();
  }, [visibile, permesso]);

  if (!visibile) return null;

  const scatta = async () => {
    if (!camRef.current || inCorso) return;
    try {
      setInCorso(true);
      const foto = await camRef.current.takePictureAsync({ quality: 0.5 });
      if (foto?.uri) onScattata(foto.uri);
    } catch (e) {
      Alert.alert('Foto non riuscita', String(e?.message || e));
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onChiudi}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {permesso?.granted ? (
          <CameraView ref={camRef} style={{ flex: 1 }} facing="back" />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16 }}>
              Serve il permesso di usare la fotocamera per scattare la foto.
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', backgroundColor: '#111' }}>
          <TouchableOpacity style={{ flex: 1, padding: 20 }} onPress={onChiudi}>
            <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '700' }}>
              Annulla
            </Text>
          </TouchableOpacity>
          {permesso?.granted && (
            <TouchableOpacity style={{ flex: 1, padding: 20, backgroundColor: COLORS.azione }} onPress={scatta}>
              <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '700' }}>
                {inCorso ? 'Scatto…' : 'Scatta'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Conferma breve a scomparsa ("Salvato ✓") che non richiede tocchi.
 * Uso: const { avviso, mostra } = useAvviso();  …  mostra('Salvato ✓');  …  {avviso}
 */
export function useAvviso() {
  const [testo, setTesto] = useState('');
  const [azione, setAzione] = useState(null); // { testo, onPress } per "Annulla"
  const [attivo, setAttivo] = useState(false);
  const opacita = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  const nascondi = useCallback(() => {
    setAttivo(false);
    Animated.timing(opacita, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setAzione(null));
  }, [opacita]);
  /** mostra('Salvato ✓') oppure mostra('Salvato ✓', { testo: 'Annulla', onPress: annulla }) */
  const mostra = useCallback((t, az = null) => {
    setTesto(t);
    setAzione(az);
    setAttivo(true);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacita, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    timer.current = setTimeout(nascondi, az ? 6000 : 2200);
  }, [opacita, nascondi]);
  const avviso = (
    <Animated.View pointerEvents={attivo && azione ? 'box-none' : 'none'} style={{
      position: 'absolute', left: 16, right: 16, bottom: 80, opacity: opacita,
      backgroundColor: '#1F2A26', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
      elevation: 8, flexDirection: 'row', alignItems: 'center', minHeight: 56,
    }}>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, textAlign: azione ? 'left' : 'center' }}>
        {testo}
      </Text>
      {!!azione && (
        <TouchableOpacity onPress={() => { if (timer.current) clearTimeout(timer.current); nascondi(); azione.onPress(); }}
          style={{ paddingHorizontal: 14, paddingVertical: 10, marginLeft: 8, borderRadius: 10, backgroundColor: '#ffffff22' }}>
          <Text style={{ color: '#9CC8FF', fontSize: 16, fontWeight: '800' }}>{azione.testo}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
  return { avviso, mostra };
}

/**
 * Modale generica per correggere un record già salvato.
 * campi: [{ chiave, label, tipo: 'testo' | 'numero' | 'intero' | 'data' | 'multiline' }]
 * onSalva(cambi) riceve solo i valori convertiti (numeri e date ISO).
 */
export function ModaleModifica({ visibile, titolo, sottotitolo, campi, record, onSalva, onChiudi, azioni }) {
  const [valori, setValori] = useState({});
  const { errori, segnala, azzera, riepilogo } = useErrori();
  React.useEffect(() => {
    if (!visibile || !record) return;
    const v = {};
    campi.forEach((c) => {
      const x = record[c.chiave];
      if (c.tipo === 'data') v[c.chiave] = x ? String(x).slice(0, 10) : '';
      else if (c.tipo === 'numero' || c.tipo === 'intero') v[c.chiave] = x === null || x === undefined ? '' : String(x).replace('.', ',');
      else v[c.chiave] = x || '';
    });
    setValori(v);
  }, [visibile, record]);

  const salva = () => {
    azzera();
    const out = {};
    let ok = true;
    for (const c of campi) {
      const t = String(valori[c.chiave] ?? '').trim();
      if (c.tipo === 'data') {
        const iso = isoDaCampo(t);
        if (iso === undefined) { ok = segnala(c.chiave, 'Scrivi la data come gg/mm/aaaa'); continue; }
        out[c.chiave] = iso;
      } else if (c.tipo === 'numero' || c.tipo === 'intero') {
        if (t === '') { out[c.chiave] = null; continue; }
        const n = Number(t.replace(',', '.'));
        if (!Number.isFinite(n) || (c.tipo === 'intero' && !Number.isInteger(n))) {
          ok = segnala(c.chiave, 'Inserisci un numero'); continue;
        }
        out[c.chiave] = n;
      } else {
        out[c.chiave] = t === '' ? null : t;
      }
      if (c.obbligatorio && (out[c.chiave] === null || out[c.chiave] === '')) {
        ok = segnala(c.chiave, 'Campo obbligatorio');
      }
    }
    if (ok) onSalva(out);
  };

  return (
    <Modal visible={!!visibile} animationType="slide" onRequestClose={onChiudi}>
      <VistaModale keyboardShouldPersistTaps="handled">
        <Text style={S.h1}>{titolo}</Text>
        {!!sottotitolo && <Text style={[S.muted, { marginBottom: 8 }]}>{sottotitolo}</Text>}
        <View style={S.card}>
          {campi.map((c) => (
            c.tipo === 'data' ? (
              <CampoData key={c.chiave} label={c.label} value={valori[c.chiave] || null}
                errore={errori[c.chiave]}
                onChange={(iso) => setValori((st) => ({ ...st, [c.chiave]: iso || '' }))} />
            ) : (
            <Campo key={c.chiave} label={c.label} value={valori[c.chiave]}
              onChange={(v) => setValori((s) => ({ ...s, [c.chiave]: v }))}
              errore={errori[c.chiave]}
              multiline={c.tipo === 'multiline'}
              placeholder={c.tipo === 'data' ? 'gg/mm/aaaa' : c.placeholder}
              keyboardType={c.tipo === 'numero' ? 'decimal-pad' : c.tipo === 'intero' ? 'number-pad' : 'default'} />
            )
          ))}
          <Text style={[S.muted, { marginTop: 12 }]}>
            La correzione resta annotata nel registro con il valore precedente.
          </Text>
          {riepilogo}
          <Bottone testo="Salva correzione" onPress={salva} />
          {azioni}
          <Bottone testo="Annulla" ghost onPress={onChiudi} />
        </View>
      </VistaModale>
    </Modal>
  );
}

/**
 * Acquisizione foto (fotocamera o galleria) già copiata nella memoria permanente.
 * Uso: const { chiediFoto, fotocamera } = useFoto();
 *      chiediFoto('etichetta', (uri) => …);   e nel JSX: {fotocamera}
 */
export function useFoto() {
  const [richiesta, setRichiesta] = useState(null); // { prefisso, onFoto }

  const consegna = async (uriTemporaneo, r) => {
    try {
      const uri = await rendiPermanente(uriTemporaneo, r.prefisso);
      r.onFoto(uri);
    } catch (e) {
      Alert.alert('Foto non salvata', String(e?.message || e));
    }
  };

  const galleria = async (r) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return Alert.alert('Permesso galleria', perm.canAskAgain
          ? 'Serve il permesso per accedere alle foto.'
          : 'Abilita il permesso da Impostazioni > App > Tracciabilità HACCP > Autorizzazioni.');
      }
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      if (!res.canceled && res.assets && res.assets[0]) await consegna(res.assets[0].uri, r);
    } catch (e) {
      Alert.alert('Errore galleria', String(e?.message || e));
    }
  };

  const chiediFoto = (prefisso, onFoto) => {
    const r = { prefisso, onFoto };
    Alert.alert('Aggiungi foto', 'Come vuoi aggiungere la foto?', [
      { text: 'Scatta foto', onPress: () => setRichiesta(r) },
      { text: 'Dalla galleria', onPress: () => galleria(r) },
      { text: 'Annulla', style: 'cancel' },
    ]);
  };

  const fotocamera = (
    <CameraCapture
      visibile={!!richiesta}
      onChiudi={() => setRichiesta(null)}
      onScattata={(uri) => { const r = richiesta; setRichiesta(null); if (r) consegna(uri, r); }}
    />
  );
  return { chiediFoto, fotocamera };
}

/** Miniatura toccabile che apre la foto a schermo intero. */
export function AnteprimaFoto({ uri, titolo, altezza = 160 }) {
  const [grande, setGrande] = useState(false);
  const [errore, setErrore] = useState(false);
  if (!uri) return null;
  return (
    <View style={{ marginTop: 10 }}>
      {!!titolo && <Text style={S.label}>{titolo}</Text>}
      {errore ? (
        <View style={{ height: 70, borderRadius: 10, backgroundColor: COLORS.warningSoft, justifyContent: 'center', padding: 10 }}>
          <Text style={{ color: COLORS.warning, fontWeight: '700' }}>
            Foto non disponibile su questo telefono (può essere recuperata dalla cartella dei backup).
          </Text>
        </View>
      ) : (
        <TouchableOpacity activeOpacity={0.8} onPress={() => setGrande(true)}>
          <Image source={{ uri }} onError={() => setErrore(true)}
            style={{ height: altezza, borderRadius: 10, backgroundColor: COLORS.bg }} resizeMode="cover" />
          <Text style={[S.muted, { marginTop: 4 }]}>Tocca per ingrandire</Text>
        </TouchableOpacity>
      )}
      <Modal visible={grande} animationType="fade" onRequestClose={() => setGrande(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flexGrow: 1 }}
            centerContent>
            <Image source={{ uri }} style={{ width: '100%', flex: 1, minHeight: 500 }} resizeMode="contain" />
          </ScrollView>
          <TouchableOpacity style={{ padding: 20, backgroundColor: '#111' }} onPress={() => setGrande(false)}>
            <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '700' }}>Chiudi</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

