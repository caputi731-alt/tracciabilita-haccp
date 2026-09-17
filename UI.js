import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert, Animated, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { rendiPermanente } from './foto';
import { S, COLORS, dataPerCampo, isoDaCampo } from './theme';

export function Campo({ label, value, onChange, ...props }) {
  return (
    <View>
      <Text style={S.label}>{label}</Text>
      <TextInput
        style={S.input}
        value={value === null || value === undefined ? '' : String(value)}
        onChangeText={onChange}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
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

/** Selettore da elenco (fornitori, prodotti...) con ricerca */
export function Selettore({ label, elementi, valore, etichetta, onChange, placeholder }) {
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState('');
  const sel = elementi.find((e) => e.id === valore);
  const filtrati = elementi.filter((e) =>
    etichetta(e).toLowerCase().includes(cerca.toLowerCase())
  );
  return (
    <View>
      <Text style={S.label}>{label}</Text>
      <TouchableOpacity style={S.input} onPress={() => setAperto(true)}>
        <Text style={{ fontSize: 16, color: sel ? COLORS.text : '#9CA3AF' }}>
          {sel ? etichetta(sel) : placeholder || 'Seleziona…'}
        </Text>
      </TouchableOpacity>

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

export function Bottone({ testo, onPress, ghost, colore }) {
  return (
    <TouchableOpacity
      style={[ghost ? S.btnGhost : S.btn, colore && !ghost && { backgroundColor: colore }]}
      onPress={onPress}
    >
      <Text style={ghost ? S.btnGhostText : S.btnText}>{testo}</Text>
    </TouchableOpacity>
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
            <TouchableOpacity style={{ flex: 1, padding: 20, backgroundColor: COLORS.primary }} onPress={scatta}>
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
  const opacita = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);
  const mostra = useCallback((t) => {
    setTesto(t);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacita, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacita, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }, 2200);
  }, [opacita]);
  const avviso = (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: 24, right: 24, bottom: 90, opacity: opacita,
      backgroundColor: COLORS.primaryDark, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18,
      elevation: 6,
    }}>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{testo}</Text>
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
  React.useEffect(() => {
    if (!visibile || !record) return;
    const v = {};
    campi.forEach((c) => {
      const x = record[c.chiave];
      if (c.tipo === 'data') v[c.chiave] = dataPerCampo(x);
      else if (c.tipo === 'numero' || c.tipo === 'intero') v[c.chiave] = x === null || x === undefined ? '' : String(x).replace('.', ',');
      else v[c.chiave] = x || '';
    });
    setValori(v);
  }, [visibile, record]);

  const salva = () => {
    const out = {};
    for (const c of campi) {
      const t = String(valori[c.chiave] ?? '').trim();
      if (c.tipo === 'data') {
        const iso = isoDaCampo(t);
        if (iso === undefined) return Alert.alert('Data non valida', `${c.label}: scrivi la data come gg/mm/aaaa.`);
        out[c.chiave] = iso;
      } else if (c.tipo === 'numero' || c.tipo === 'intero') {
        if (t === '') { out[c.chiave] = null; continue; }
        const n = Number(t.replace(',', '.'));
        if (!Number.isFinite(n) || (c.tipo === 'intero' && !Number.isInteger(n))) {
          return Alert.alert('Valore non valido', `${c.label}: inserisci un numero.`);
        }
        out[c.chiave] = n;
      } else {
        out[c.chiave] = t === '' ? null : t;
      }
      if (c.obbligatorio && (out[c.chiave] === null || out[c.chiave] === '')) {
        return Alert.alert('Dato mancante', `${c.label} è obbligatorio.`);
      }
    }
    onSalva(out);
  };

  return (
    <Modal visible={!!visibile} animationType="slide" onRequestClose={onChiudi}>
      <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}
        keyboardShouldPersistTaps="handled">
        <Text style={S.h1}>{titolo}</Text>
        {!!sottotitolo && <Text style={[S.muted, { marginBottom: 8 }]}>{sottotitolo}</Text>}
        <View style={S.card}>
          {campi.map((c) => (
            <Campo key={c.chiave} label={c.label} value={valori[c.chiave]}
              onChange={(v) => setValori((s) => ({ ...s, [c.chiave]: v }))}
              multiline={c.tipo === 'multiline'}
              placeholder={c.tipo === 'data' ? 'gg/mm/aaaa' : c.placeholder}
              keyboardType={c.tipo === 'numero' ? 'decimal-pad' : c.tipo === 'intero' ? 'number-pad' : 'default'} />
          ))}
          <Text style={[S.muted, { marginTop: 12 }]}>
            La correzione resta annotata nel registro con il valore precedente.
          </Text>
          <Bottone testo="Salva correzione" onPress={salva} />
          {azioni}
          <Bottone testo="Annulla" ghost onPress={onChiudi} />
        </View>
      </ScrollView>
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

