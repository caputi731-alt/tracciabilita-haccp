import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { S, COLORS, TIPI_PUNTO } from './theme';
import { Campo, Chips, Bottone, conferma } from './UI';
import {
  listaPuntiControllo, salvaPuntoControllo, eliminaPuntoControllo,
} from './database';

/** Limiti suggeriti per tipo, modificabili */
const PRESET = {
  frigorifero: { temp_min: 0, temp_max: 4 },
  congelatore: { temp_min: -25, temp_max: -18 },
  cella: { temp_min: 0, temp_max: 4 },
  abbattitore: { temp_min: -20, temp_max: 3 },
  banco: { temp_min: 0, temp_max: 6 },
};

const VUOTO = { nome: '', tipo: 'frigorifero', temp_min: 0, temp_max: 4, posizione: '' };

export default function PuntiControlloScreen() {
  const [punti, setPunti] = useState([]);
  const [form, setForm] = useState(null);

  const ricarica = useCallback(() => { listaPuntiControllo().then(setPunti); }, []);
  useFocusEffect(ricarica);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setNum = (k) => (v) => setForm((f) => ({ ...f, [k]: v === '' || v === '-' ? v : Number(v) }));

  const cambiaTipo = (tipo) =>
    setForm((f) => ({ ...f, tipo, ...(f.id ? {} : PRESET[tipo]) }));

  const salva = async () => {
    if (!form.nome.trim()) return Alert.alert('Dato mancante', 'Dai un nome al punto di controllo.');
    const min = Number(form.temp_min), max = Number(form.temp_max);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      return Alert.alert('Temperature non valide', 'Inserisci due numeri.');
    }
    if (min >= max) {
      return Alert.alert('Limiti invertiti', 'La temperatura minima deve essere inferiore alla massima.');
    }
    await salvaPuntoControllo({ ...form, temp_min: min, temp_max: max });
    setForm(null);
    ricarica();
  };

  const elimina = (p) =>
    conferma('Eliminare il punto di controllo?',
      `${p.nome} non comparirà più nel registro. Le rilevazioni passate restano archiviate.`,
      async () => { await eliminaPuntoControllo(p.id); ricarica(); });

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={S.content}>
        <Text style={[S.muted, { marginBottom: 12 }]}>
          Qui inserisci i tuoi frigoriferi, congelatori e celle con i relativi limiti di
          temperatura. Ogni giorno l'app ti chiederà una rilevazione per ciascuno.
        </Text>

        {punti.length === 0 && (
          <Text style={S.empty}>Nessun punto di controllo configurato.</Text>
        )}

        {punti.map((p) => (
          <TouchableOpacity key={p.id} style={S.card} onPress={() => setForm({ ...p })}
            onLongPress={() => elimina(p)}>
            <Text style={{ fontSize: 16, fontWeight: '700' }}>{p.nome}</Text>
            <Text style={S.muted}>{p.tipo}{p.posizione ? ` · ${p.posizione}` : ''}</Text>
            <Text style={{ color: COLORS.primary, fontWeight: '600', marginTop: 4 }}>
              Limiti: da {p.temp_min}°C a {p.temp_max}°C
            </Text>
          </TouchableOpacity>
        ))}

        {punti.length > 0 && (
          <Text style={[S.muted, { textAlign: 'center', marginTop: 8 }]}>
            Tocca per modificare · tieni premuto per eliminare
          </Text>
        )}
      </ScrollView>

      <View style={{ padding: 16, paddingTop: 0 }}>
        <Bottone testo="+ Aggiungi frigorifero o congelatore"
          onPress={() => setForm({ ...VUOTO })} />
      </View>

      <Modal visible={!!form} animationType="slide" onRequestClose={() => setForm(null)}>
        {form && (
          <ScrollView style={S.screen} contentContainerStyle={[S.content, { paddingTop: 50 }]}>
            <Text style={S.h1}>{form.id ? 'Modifica punto' : 'Nuovo punto di controllo'}</Text>
            <Campo label="Nome *" value={form.nome} onChange={set('nome')}
              placeholder="es. Frigo cucina 1" />
            <Chips label="Tipo" opzioni={TIPI_PUNTO} valore={form.tipo} onChange={cambiaTipo} />
            <Campo label="Posizione" value={form.posizione} onChange={set('posizione')}
              placeholder="es. cucina, retro, cantina" />
            <Campo label="Temperatura minima (°C)" value={form.temp_min}
              onChange={setNum('temp_min')} keyboardType="numbers-and-punctuation" />
            <Campo label="Temperatura massima (°C)" value={form.temp_max}
              onChange={setNum('temp_max')} keyboardType="numbers-and-punctuation" />
            <Text style={[S.muted, { marginTop: 10 }]}>
              I valori proposti sono quelli abituali per il tipo scelto: correggili secondo il
              tuo piano di autocontrollo.
            </Text>
            <Bottone testo="Salva" onPress={salva} />
            <Bottone testo="Annulla" ghost onPress={() => setForm(null)} />
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}
