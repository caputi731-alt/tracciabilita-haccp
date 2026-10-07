# Istruzioni per Claude — Tracciabilità HACCP

App Android (Expo / React Native) per HACCP e rintracciabilità di un piccolo ristorante.
Funziona completamente offline con SQLite locale. L'APK viene compilato da GitHub Actions
a ogni push su `main` e pubblicato nelle Releases; Luca lo installa sul suo Pixel e lo testa.

## Flusso di lavoro
- Luca descrive la modifica; Claude modifica i file, fa commit e push direttamente su `main`.
- Un push = una build: raggruppare in un solo commit tutti i file di una stessa modifica.
- Messaggi di commit in italiano, chiari (es. "Non conformità: aggiunto campo note").
- Dopo il push, riepilogare a Luca cosa è cambiato e cosa testare.

## Regole vincolanti
- Struttura piatta: nessuna sottocartella per il codice (eccezioni: `.github/workflows/` e `test/`).
- Nomi file in PascalCase esatto (es. `RicevimentoScreen.js`): Linux distingue maiuscole/minuscole.
- Kotlin resta fissato a 1.9.25 tramite `expo-build-properties` in `app.json`. Non rimuoverlo.
- `database.js`: prima di ogni commit verificare che non esistano funzioni dichiarate due volte
  (errore "Identifier already declared"), in particolare nel blocco ricette/produzioni.
- `package.json`: modificarlo sempre partendo dal file completo, senza perdere dipendenze esistenti.
- Fotocamera: usare `CameraView` + `takePictureAsync`. NON usare `launchCameraAsync` di
  `expo-image-picker` (fallisce silenziosamente sul dispositivo). La galleria di `expo-image-picker` funziona.
- Scanner barcode e fotocamera condividono lo stesso componente `CameraView`.
- Stili centralizzati in `theme.js`; report PDF tramite il modulo condiviso `report.js`.

## Controlli prima del commit
- `npm test` e `npm run lint` devono passare (li esegue anche GitHub Actions, insieme a una prova di impacchettamento
  `expo export`: se uno fallisce l'APK non viene creato). Il lint trova variabili e import inesistenti e chiavi doppie.
- Nessun import verso file inesistenti o con maiuscole/minuscole diverse.
- Nessuna funzione duplicata in `database.js`.

## Numeri e date (modulo `utile.js`, riesportato da `theme.js`)
- Numeri digitati: sempre `aNumero(testo)` (accetta virgola e segno meno; non valido → null). MAI `Number(testo)` su un campo.
  Nei moduli i valori numerici restano testo e si convertono al salvataggio; per mostrarli `numeroPerCampo`.
- Giorni: sempre quelli del telefono. `oggiLocale()`, `piuGiorni(iso, n)`, `giornoDi(istante)`.
  MAI `toISOString().slice(0, 10)` (è il giorno UTC: dopo mezzanotte sbaglia giorno).
- Ricerche per periodo nel database: `limitiGiorni(da, a)` + `data_ora >= ? AND data_ora < ?`, non `substr(data_ora, 1, 10)`.
- Testi dentro l'HTML di stampe ed etichette: sempre `escHtml` (o `esc` di report.js).

## Giacenze e transazioni
- Ogni salvataggio in più passi va in `d.withTransactionAsync` (le transazioni sono messe in fila in `getDb`:
  mai aprirne una dentro un'altra; per questo esiste `caricoInTransazione`).
- `registraScarico` e `registraProduzione` rifiutano quantità non valide o superiori alla giacenza e i lotti scaduti
  (un lotto scaduto si può solo scartare o rendere). Le schermate ripartiscono le quantità in FIFO sui lotti non scaduti.
- `Bottone` blocca i doppi tocchi se `onPress` è asincrono e mostra l'errore se la funzione fallisce.
- Produzioni: allergeni salvati in `produzioni.allergeni` al momento della produzione; `annullaProduzione` riporta le quantità nei lotti.

## Temperature e promemoria
- Più rilevazioni al giorno per frigorifero; `registraTemperatura(punto, valore, note, giorno)` con `giorno` passato
  annota la riga come "Registrata in ritardo il …". Nessun operatore (scelta di Luca).
- La non conformità automatica è collegata con `non_conformita.temperatura_id`.
- `notifiche.js` (expo-notifications ~0.29.14, solo notifiche locali): un avviso al giorno all'ora scelta, riprogrammato
  a ogni apertura e dopo ogni registrazione per i 14 giorni successivi; quello di oggi salta se le temperature sono complete.
  Il tocco apre `Temperature` con `{ daNotifica }` e parte l'inserimento in sequenza. Impostazioni in `RiquadroPromemoria.js`.
- Pulizie: "da fare" secondo la frequenza dell'area (`areeConStato`, `GIORNI_FREQUENZA`).

## Importazione fatture PDF
- `letturaPdf.js`: estrazione testo da PDF in puro JS (solo `pako`, nessun modulo nativo). Non aggiungere librerie PDF native.
- `fattura.js`: riconoscimento righe. Layout supportato: Altasfera/Maiora (ARTICOLO DESCRIZIONE CONF UM COLLI QTÀ PREZZO IMPORTO IVA).
  Per un nuovo fornitore aggiungere un pattern e testarlo in Node sul PDF reale prima del commit.
- `ImportaFatturaScreen.js`: verifica righe, abbinamenti articolo→prodotto (tabella `abbinamenti_articoli`), carico in transazione.

## Correzioni e conferme
- Mai UPDATE diretti sui registri dalle schermate: usare `correggiRecord(tabella, id, cambi)` (traccia in
  `registro_modifiche` e nelle note), `correggiUscita`, `annullaCarico`. Nuovi campi correggibili vanno in `CAMPI_CORREGGIBILI`.
- Form di correzione: componente `ModaleModifica` (UI.js). Conferme brevi: `useAvviso()` → "Salvato ✓".
- Date nei campi di testo: `dataPerCampo` / `isoDaCampo` (theme.js), formato gg/mm/aaaa.

## Test e backup
- `npm test` (Node 22): test in `test/*.test.mjs`, eseguiti da GitHub Actions prima della build; se falliscono l'APK non viene creato.
  I moduli dell'app girano in Node grazie a `test/hooks.mjs` (expo-sqlite sostituito da node:sqlite). Ogni nuova logica di database va coperta da un test.
- Nel repository (pubblico) mai dati reali: la fattura di test `test/fattura-esempio.pdf` ha dati inventati.
- Backup automatico: `backupAutomatico.js` (cartella scelta via Storage Access Framework, 1 al giorno, ultime 14 copie). La tabella `preferenze` è locale e non va nel backup.
- Firma APK: se esistono i Secrets ANDROID_KEYSTORE_BASE64, ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD la build firma con quella chiave, altrimenti con la chiave di debug.
- Chiave di firma attiva dal 17/09/2026 (alias `haccp`). Impronta SHA-256 del certificato:
  60:70:FD:FC:4C:AC:D6:8B:89:4F:CB:64:D6:8B:D5:F1:0D:0B:00:72:48:F2:31:E5:A8:9B:6A:44:F3:8B:ED:1B
  Ogni build deve mostrare questa impronta nel passo "Mostra con quale chiave è firmato l'APK". Non cambiare mai la chiave.
- Foto: sempre tramite `useFoto()` (UI.js), che copia in `documentDirectory/foto/` (`foto.js`); mai salvare URI della cache.
  Visualizzazione con `AnteprimaFoto`. Il backup automatico copia le foto nella sottocartella `foto` e `recuperaFotoMancanti` le riporta dopo una reinstallazione.
- Stati del lotto: disponibile, esaurito, bloccato (richiamo), annullato. Usare `statoDopo()` quando cambia la giacenza: bloccato/annullato non si perdono.
- Allergeni: `prodotti.allergeni_verificati` (1 quando il prodotto è salvato dall'anagrafica, 0 se creato dalle fatture). `tabellaAllergeni()` + `htmlTabellaAllergeni()` per il documento clienti.
- Schema: una sola definizione per tabella in `initDatabase`; le colonne nuove si aggiungono con `aggiungiSeManca`.
- Contenuto di una modale: sempre dentro `VistaModale` (UI.js), non uno `ScrollView` figlio diretto di `<Modal>` (su Android non scorrerebbe fino al primo nuovo layout).
- Struttura schermate: Magazzino contiene anche la rintracciabilità (modalità "In giacenza" / "Tutti i lotti"); la rotta `Rintracciabilita` punta a MagazzinoScreen per compatibilità. `CaricoMerce` è l'ingresso unico verso ImportaFattura e Ricevimento. PDF del lotto in `schedaLotto.js`.
- Anagrafiche (Prodotti/Fornitori/Ricette/Frigoriferi) e Documenti e dati (Registri PDF/Backup) sono contenitori a linguette: le schermate interne restano file separati e si aprono anche da rotta diretta con `{ scheda: '...' }`.

## Linee guida UX (pacchetto build 60)
- Colori: `COLORS.azione` (blu) per pulsanti, collegamenti e scelte attive; il verde (`primary`/`ok`) solo per intestazione e stati positivi.
- Testi: `S.muted` 15pt, etichette 13pt; pulsanti ≥ 50px, chip ≥ 46px.
- Errori di compilazione: `useErrori()` + prop `errore` su `Campo`/`Selettore` + `{riepilogo}` sopra il pulsante. Niente `Alert` per dati mancanti.
- Registrazioni frequenti (scarico, temperatura, pulizia): nessuna conferma preventiva, avviso con "Annulla" (`mostra(testo, { testo: 'Annulla', onPress })`) e funzioni `annullaUscita` / `annullaTemperatura` / `annullaSanificazione`.
- Cambi di vista: `Segmenti`, non `Chips`.
- Componenti UI comuni: `Icona` (MaterialCommunityIcons da @expo/vector-icons, niente emoji), `Bottone icona=`, `Sezione` (blocchi apribili),
  `Caricamento` (segnaposto), `Vuoto` (elenco vuoto con azione), `CampoData` (calendario, valori ISO). Le date si scelgono sempre con `CampoData`.
- Registri PDF: i corpi HTML stanno in report.js (`corpoTemperature`, `corpoCarichi`, ...) e sono riusati da `htmlPacchettoASL`.
- Accessibilità: i componenti di UI.js hanno già ruolo ed etichetta; per i `TouchableOpacity` scritti a mano aggiungere
  `accessibilityRole="button"` (e `accessibilityLabel` se il testo non basta). Aree toccabili ≥ 48px.
  Colori dei testi con contrasto ≥ 4,5:1 (`COLORS.warning`, `danger`, `segnaposto`); bordo dei campi `COLORS.bordoCampo`.
- Niente azioni raggiungibili solo con la pressione lunga: "Elimina" sta dentro la finestra di modifica.
- Condivisione di PDF/CSV/backup: `condividi.js` (file nella memoria temporanea, non in documentDirectory).
- Backup: prima di ogni ripristino `salvaCopiaDiSicurezza()`; la copia inviata fuori dal telefono aggiorna la preferenza
  `backup_esterno_ultimo` (la Home avvisa dopo 7 giorni). `pulisciFotoInutili()` elimina le foto non più collegate.
- Dipendenze: `package-lock.json` è nel repository e la build usa `npm ci`: dopo ogni modifica a package.json rigenerarlo
  (`npm install --package-lock-only`) e includerlo nello stesso commit.
- Il numero di build compare in fondo alla Home (`build.js`, scritto da GitHub Actions; non modificarlo a mano).
- Dipendenze: mai versioni con "^" per pacchetti che contengono codice nativo. Devono restare quelle di Expo SDK 52
  (es. expo-font ~13.0.4, @expo/vector-icons ~14.0.4): la 14.1 di vector-icons trascina expo-font 57 e rompe la compilazione Android.
