// Sostituto, per i test in Node, del modulo nativo react-native-aes-crypto: stessi calcoli e stessi formati
// del codice Android (android/src/main/java/com/tectiv3/aes/Aes.java della libreria, versione 3.3.0):
//  - pbkdf2(password, sale, giri, lunghezza IN BIT, algoritmo): password e sale presi come testo UTF-8, risultato esadecimale
//  - encrypt(testo UTF-8, chiave esadecimale, iv esadecimale) → base64; decrypt fa il contrario (AES-CBC, riempimento PKCS7)
//  - hmac256(testo UTF-8, chiave esadecimale) → esadecimale;  randomKey(byte) → esadecimale
import crypto from 'node:crypto';

const cifrario = (alg) => { if (alg !== 'aes-256-cbc') throw new Error('algoritmo non previsto'); return alg; };

export default {
  pbkdf2: async (pwd, salt, cost, bit, alg) => crypto.pbkdf2Sync(Buffer.from(pwd, 'utf8'), Buffer.from(salt, 'utf8'), cost, bit / 8, alg).toString('hex'),
  encrypt: async (testo, chiave, iv, alg) => {
    if (!testo) return null;
    const c = crypto.createCipheriv(cifrario(alg), Buffer.from(chiave, 'hex'), Buffer.from(iv, 'hex'));
    return Buffer.concat([c.update(testo, 'utf8'), c.final()]).toString('base64');
  },
  decrypt: async (dati, chiave, iv, alg) => {
    if (!dati) return null;
    const d = crypto.createDecipheriv(cifrario(alg), Buffer.from(chiave, 'hex'), Buffer.from(iv, 'hex'));
    return Buffer.concat([d.update(Buffer.from(dati, 'base64')), d.final()]).toString('utf8');
  },
  hmac256: async (testo, chiave) => crypto.createHmac('sha256', Buffer.from(chiave, 'hex')).update(testo, 'utf8').digest('hex'),
  randomKey: async (byte) => crypto.randomBytes(byte).toString('hex'),
};
