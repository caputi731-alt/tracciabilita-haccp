import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { S, COLORS } from './theme';

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
