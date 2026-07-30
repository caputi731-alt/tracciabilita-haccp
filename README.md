# Tracciabilità HACCP — Fase 1

App Android offline per la tracciabilità alimentare di un ristorante.
Tutti i dati restano sul dispositivo in un database SQLite locale.

## Cosa fa già

- Anagrafica **fornitori** (con partita IVA e numero di riconoscimento CE)
- Catalogo **prodotti** con allergeni, temperature di conservazione, codice a barre
- **Ricevimento merce**: fornitore, DDT, lotto, scadenza, quantità, foto del documento e dell'etichetta
- **Controllo al ricevimento**: temperatura, integrità imballo, etichettatura → in caso di esito negativo apre automaticamente una non conformità
- **Magazzino**: lotti disponibili ordinati per scadenza, scarichi, scarti, storico movimenti
- **Frigoriferi/congelatori**: configurazione dei punti di controllo con i propri limiti
- **Registro temperature** giornaliero con allarme e non conformità automatica
- **Dashboard** con scadenze imminenti, controlli da fare e non conformità aperte

Fasi successive: rintracciabilità lotto→piatto, ricette, report PDF per l'ASL, export CSV, OCR fatture, etichette termiche, backup automatico.

---

## Come installarla — passo per passo

Serve solo un computer con Node.js installato (gratuito, da nodejs.org).

### 1. Crea il progetto base

```bash
npx create-expo-app@latest tracciabilita-haccp --template blank
cd tracciabilita-haccp
```

### 2. Copia i file

Copia dentro la cartella appena creata: `App.js`, `app.json`, `eas.json` e l'intera cartella `src/`, sovrascrivendo quelli esistenti.

### 3. Installa le dipendenze

`npx expo install` sceglie da solo le versioni compatibili — non modificare i numeri a mano.

```bash
npx expo install expo-sqlite expo-camera expo-image-picker \
  @react-navigation/native @react-navigation/native-stack \
  react-native-screens react-native-safe-area-context
```

### 4. Prova l'app subito (facoltativo)

```bash
npx expo start
```

Installa **Expo Go** dal Play Store sul tablet e inquadra il QR code. Utile per provare l'interfaccia, ma la fotocamera per i codici a barre funziona bene solo nell'APK vero.

### 5. Genera l'APK

```bash
npm install -g eas-cli
eas login          # crea un account gratuito su expo.dev
eas build:configure
eas build -p android --profile preview
```

Dopo 10–20 minuti ricevi un link. Aprilo dal tablet, scarica l'APK e installalo (Android chiederà di autorizzare l'installazione da origini sconosciute).

### 6. Primo avvio

1. **Frigoriferi** → aggiungi i tuoi frigoriferi e congelatori con i relativi limiti
2. **Fornitori** → inserisci i primi fornitori
3. **Ricevi merce** → i prodotti si creano man mano, non serve precaricare nulla

---

## Costi

| Voce | Costo |
|---|---|
| Expo SDK e CLI | gratuito |
| EAS Build (piano Free) | gratuito, 15 build Android al mese |
| Hosting / server | nessuno, i dati sono sul tablet |
| Google Play | non necessario, si installa l'APK direttamente |

---

## Nota importante sui backup

I dati esistono in una sola copia, sul tablet. Finché la funzione di backup automatico non è implementata (Fase 5), esporta periodicamente il database:

il file si trova in `/data/data/com.ristorante.tracciabilita/databases/haccp.db` e va copiato con un file manager o via USB.

In caso di controllo ASL, un dispositivo perso o rotto significa tracciabilità perduta: è il rischio principale della scelta "solo offline".
