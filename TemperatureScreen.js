import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Alert, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, fmtDataOra } from './theme';
import {
  Bottone, useAvviso,
} from './UI';
import {
  listaPuntiControllo, registraTemperatura, temperatureDiOggi, query, modificaTemperatura, annullaTemperatura,
} from './database';

export default function TemperatureScreen() {
  const [punti, setPunti] = useState([]);
  const [valori, setValori] = useState({});
  const [oggi, setOggi] = useState([]);
  const [storico, setStorico] = useState([]);
  const [inModifica, setInModifica] = useState(null);
  const [nuovoValore, setNuovoValore] = useState('');
  const { avviso, mostra } = useAvviso();

  const ricarica = useCallback(() => {
    (async () => {
      setPunti(await listaPuntiControllo());
      setOggi(await temperatureDiOggi());
      setStorico(await query(
        `SELECT r.*, pc.nome FROM registro_temperature r
         JOIN punti_controllo pc ON pc.id = r.punto_controllo_id
         ORDER BY r.data_ora DESC LIMIT 30`));
    })();
  }, []);
  useFocusEffect(ricarica);

  const registra = async (punto) => {
    const v = valori[punto.id];
    const numero = Number(String(v ?? '').replace(',', '.'));
    if (v === undefined || v === '' || Number.isNaN(numero)) {
      return Alert.alert('Valore mancante', `Inserisci la temperatura di ${punto.nome}.`);
    }
    const { conforme, id, ncId } = await registraTemperatura(punto.id, numero, null);
    setValori((s) => ({ ...s, [punto.id]: '' }));
    ricarica();
    if (conforme) {
      mostra(`Salvato ✓ ${punto.nome}: ${String(numero).replace('.', ',')}°C`, {
        testo: 'Annulla',
        onPress: async () => { await annullaTemperatura(id, ncId); ricarica(); mostra('Rilevazione annullata'); },
      });
    }
    if (!conforme) {
      Alert.alert(
        'Temperatura fuori limite',
        `${punto.nome}: ${v}°C, fuori dall'intervallo ${punto.temp_min}/${punto.temp_max}°C.\n\n` +
        "È stata aperta una non conformità: interviene subito e annota l'azione correttiva."
      );
    }
  };

  const apriModifica = (r) => {
    setInModifica(r);
    setNuovoValore(String(r.temperatura));
  };

  const salvaModifica = async () => {
    const v = nuovoValore.replace(',', '.');
    if (v === '' || Number.isNaN(Number(v))) {
      return Alert.alert('Valore non valido', 'Inserisci una temperatura numerica.');
    }
    const esito = await modificaTemperatura(inModifica.id, Number(v));
    setInModifica(null);
    ricarica();
    if (esito && !esito.conforme) {
      Alert.alert('Temperatura fuori limite',
        `${esito.nome}: ${v}°C, fuori dall'intervallo ${esito.temp_min}/${esito.temp_max}°C.\n\n` +
        'La non conformità è aperta: annota l\'azione correttiva.');
    } else {
      Alert.alert('Salvato ✓', 'Rilevazione corretta. Il valore originale resta annotato nel registro.');
    }
  };

  const fattoOggi = (id) => oggi.find((o) => o.punto_controllo_id === id);

  return (
    <View style={S.screen}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={S.content}>
      <Text style={S.h1}>Registro temperature</Text>
      <Text style={[S.muted, { marginBottom: 16 }]}>Rilevazione giornaliera</Text>

      {punti.length === 0 && (
        <Text style={S.empty}>
          Configura prima i tuoi frigoriferi nella sezione "Frigoriferi".
        </Text>
      )}

      {punti.map((p) => {
        const fatto = fattoOggi(p.id);
        return (
          <View key={p.id} style={[S.card, fatto && {
            borderLeftWidth: 4,
            borderLeftColor: fatto.esito === 'conforme' ? COLORS.ok : COLORS.danger,
          }]}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{p.nome}</Text>
            <Text style={S.muted}>Limiti {p.temp_min}°C / {p.temp_max}°C</Text>

            {fatto ? (
              <TouchableOpacity onPress={() => apriModifica({ ...fatto, nome: p.nome })}>
              <Text style={{
                marginTop: 8, fontSize: 16, fontWeight: '700',
                color: fatto.esito === 'conforme' ? COLORS.ok : COLORS.danger,
              }}>
                Rilevato oggi: {fatto.temperatura}°C ({fatto.esito})
              </Text>
              <Text style={{ color: COLORS.azione, fontWeight: '700', marginTop: 4 }}>✎ Modifica</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
                <TextInput
                  style={[S.input, { flex: 1 }]}
                  placeholder="°C"
                  keyboardType="numbers-and-punctuation"
                  value={valori[p.id] ?? ''}
                  onChangeText={(v) => setValori((s) => ({ ...s, [p.id]: v }))}
                  placeholderTextColor="#9CA3AF"
                />
                <View style={{ width: 130 }}>
                  <Bottone testo="Registra" onPress={() => registra(p)} />
                </View>
              </View>
            )}
          </View>
        );
      })}

      {storico.length > 0 && (
        <>
          <Text style={[S.h2, { marginTop: 20 }]}>Ultime rilevazioni</Text>
          <View style={S.card}>
            {storico.map((r) => (
              <TouchableOpacity key={r.id} onPress={() => apriModifica(r)}
                style={[S.row, { paddingVertical: 7 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{r.nome}</Text>
                  <Text style={S.muted}>{fmtDataOra(r.data_ora)}</Text>
                  {!!r.note && <Text style={[S.muted, { fontStyle: 'italic' }]}>{r.note}</Text>}
                </View>
                <Text style={{
                  fontWeight: '700',
                  color: r.esito === 'conforme' ? COLORS.ok : COLORS.danger,
                }}>
                  {r.temperatura}°C  <Text style={{ color: COLORS.azione }}>✎</Text>
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Modal visible={!!inModifica} transparent animationType="fade"
        onRequestClose={() => setInModifica(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={S.card}>
            <Text style={S.h2}>Correggi rilevazione</Text>
            {inModifica && (
              <Text style={[S.muted, { marginBottom: 10 }]}>
                {inModifica.nome} · {fmtDataOra(inModifica.data_ora)}
              </Text>
            )}
            <TextInput
              style={S.input}
              keyboardType="numbers-and-punctuation"
              value={nuovoValore}
              onChangeText={setNuovoValore}
              autoFocus
              selectTextOnFocus
            />
            <View style={{ marginTop: 12 }}>
              <Bottone testo="Salva correzione" onPress={salvaModifica} />
              <Bottone testo="Annulla" ghost onPress={() => setInModifica(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    {avviso}
    </View>
  );
}
