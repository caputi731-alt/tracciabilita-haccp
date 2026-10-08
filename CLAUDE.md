# Istruzioni per Claude — Suite Tenuta Coppa (ex Tracciabilità HACCP)

App Android (Expo / React Native) del ristorante Tenuta Coppa: HACCP e rintracciabilità, più il modulo Menù.
Sul telefono si chiama "Tenuta Coppa"; pacchetto e chiave di firma restano quelli dell'app HACCP.
Funziona completamente offline con SQLite locale. L'APK viene compilato da GitHub Actions
a ogni push su `main` e pubblicato nelle Releases; Luca lo installa sul suo Pixel e lo testa.

## Flusso di lavoro
- Luca descrive la modifica; Claude modifica i file, fa commit e push direttamente su `main`.
- Un push = una build: raggruppare in un solo commit tutti i file di una stessa modifica.
- Messaggi di commit in italiano, chiari (es. "Non conformità: aggiunto campo note").
- Dopo il push, riepilogare a Luca cosa è cambiato e cosa testare.

## Regole vincolanti
- Struttura piatta: nessuna sottocartella per il codice dell'app (eccezioni: `.github/workflows/`, `test/`,
  `menu/` con l'app web del Menù e `plugins/` con i plugin di configurazione Expo).
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
- Backup automatico: `backupAutomatico.js` (cartella scelta via Storage Access Framework, 1 al giorno alla prima apertura dell'app; a rotazione
  resta un file per ognuno degli ultimi 3 giorni con un backup, scelta di Luca: `backupDaEliminare` in utile.js). La tabella `preferenze` è locale e non va nel backup.
- Firma APK: la build firma con la chiave dei Secrets ANDROID_KEYSTORE_BASE64, ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
  Se ne manca uno la build si ferma subito (niente più APK firmati con la chiave di debug), e si ferma anche se l'impronta
  dell'APK non è quella qui sotto (`IMPRONTA_ATTESA` in `build-apk.yml`).
- Chiave di firma attiva dal 17/09/2026 (alias `haccp`). Impronta SHA-256 del certificato:
  60:70:FD:FC:4C:AC:D6:8B:89:4F:CB:64:D6:8B:D5:F1:0D:0B:00:72:48:F2:31:E5:A8:9B:6A:44:F3:8B:ED:1B
  Ogni build deve mostrare questa impronta nel passo "Mostra con quale chiave è firmato l'APK". Non cambiare mai la chiave.
- Backup protetti con il PIN del titolare (6 cifre, scelta di Luca): `protezione.js` (calcolo) e `pin.js` (PIN del telefono; nelle
  preferenze locali restano solo sale e chiave ricavata, mai il PIN). I file di backup si scrivono sempre con `testoBackup(dump)` e si
  leggono con `leggiBackup(testo, pin)` (accetta anche i vecchi backup in chiaro); mai `JSON.stringify(esportaTutto())` verso un file che
  esce dal telefono. Senza PIN impostato i backup restano in chiaro. Foto e CSV non sono cifrati. La copia interna
  `prima-del-ripristino.json` resta in chiaro (non esce dall'app). Interfaccia in `RiquadroPin.js` (riquadro nella schermata Backup e `ModalePin`).
  I calcoli li fa il modulo nativo `react-native-aes-crypto` (PBKDF2-SHA256 300.000 giri, AES-256-CBC + HMAC-SHA256): in JavaScript
  sul telefono (Hermes) sarebbero troppo lenti, misurato. Nei test lo sostituisce `test/aes-finto.mjs`, che deve fare gli stessi calcoli
  del codice Android della libreria. La sezione Conti userà lo stesso PIN (`verificaPin`); a quel punto va rivisto "Ho dimenticato il PIN",
  che oggi permette di sceglierne uno nuovo senza conoscere il vecchio.
- Foto: sempre tramite `useFoto()` (UI.js), che copia in `documentDirectory/foto/` (`foto.js`); mai salvare URI della cache.
  Visualizzazione con `AnteprimaFoto`. Il backup automatico copia le foto nella sottocartella `foto` e `recuperaFotoMancanti` le riporta dopo una reinstallazione.
- Stati del lotto: disponibile, esaurito, bloccato (richiamo), annullato. Usare `statoDopo()` quando cambia la giacenza: bloccato/annullato non si perdono.
- Allergeni: `prodotti.allergeni_verificati` (1 quando il prodotto è salvato dall'anagrafica, 0 se creato dalle fatture). `tabellaAllergeni()` + `htmlTabellaAllergeni()` per il documento clienti.
- Schema: una sola definizione per tabella in `initDatabase`; le colonne nuove si aggiungono con `aggiungiSeManca`.
- Contenuto di una modale: sempre dentro `VistaModale` (UI.js), non uno `ScrollView` figlio diretto di `<Modal>` (su Android non scorrerebbe fino al primo nuovo layout).
- Struttura schermate: Magazzino contiene anche la rintracciabilità (modalità "In giacenza" / "Tutti i lotti"); la rotta `Rintracciabilita` punta a MagazzinoScreen per compatibilità. `CaricoMerce` è l'ingresso unico verso ImportaFattura e Ricevimento. PDF del lotto in `schedaLotto.js`.
- Anagrafiche (Prodotti/Fornitori/Ricette/Frigoriferi) e Documenti e dati (Registri PDF/Backup) sono contenitori a linguette: le schermate interne restano file separati e si aprono anche da rotta diretta con `{ scheda: '...' }`.

## Aspetto e navigazione della suite (tappa 2)
- Mockup approvato da Luca l'8/10/2026 (Material Design 3, verdi oliva e terracotta): artifact "Suite Tenuta Coppa — Mockup".
- `PrincipaleScreen.js` è la rotta `Home`: barra in basso con Oggi (`HomeScreen.js`), Magazzino (`MagazzinoScreen.js`),
  Menù (`MenuScreen.js`) e Altro (`AltroScreen.js`, tutte le altre funzioni). Il tasto indietro da
  Magazzino/Menù/Altro torna a Oggi. Quando arriverà la sezione Conti prenderà un posto nella barra.
  La barra si nasconde con la tastiera aperta e nelle schermate interne del Menù. Non esiste più la rotta `Menu`:
  le sezioni ricevono una `navigation` in cui `navigate('Menu')` porta alla linguetta.
- `HomeScreen.js`: riquadro dei controlli di oggi (anello disegnato con due mezzi cerchi, senza librerie grafiche),
  stato di temperature/pulizie/scadenze, cose da sistemare, prossimo menù (`prossimoMenu` in menuPonte.js) e pulsante "Registra".
- Carattere Manrope: `caratteri.js` aggancia `Text` e `TextInput` e sceglie il file in base a `fontWeight` (500/700/800).
  Negli stili si continua a scrivere solo `fontWeight`; non mettere `fontFamily` a mano (tranne nelle intestazioni di navigazione).
- Schermate interne: intestazione chiara (`COLORS.bg`), senza ombra.
- Anteprima nel browser per controllare l'aspetto senza telefono: `test/anteprima/vedi.py` (istruzioni nel file).
  `metro.config.js` serve solo a quello (piattaforma "web") e non cambia l'APK. Usarla prima di ogni modifica visibile.
- Tema scuro: segue il telefono e si decide all'avvio (`TEMA_SCURO` e le due tavolozze `CHIARO`/`SCURO` in `theme.js`, stesse chiavi;
  `COLORS` resta fisso finché l'app è aperta). Mai colori scritti a mano nelle schermate: sopra un fondo `azione` il testo è
  `COLORS.suAzione`, sopra `terra` è `suTerra`, i campi hanno fondo `campo`; il riquadro della Home usa le chiavi `eroe…`.
  `caratteri.js` dà `COLORS.text` ai testi senza colore (non a quelli dentro un altro testo). PDF, etichette e pagine dei menù restano chiari.
  Il Menù riceve `scuro` dalla suite e usa la parte "Tema scuro" di `menu/css/suite.css`. Controllare sempre entrambi i temi:
  `SCHEMI=dark,light python3 test/anteprima/vedi.py …`. Finestre di sistema (Alert, barra di navigazione di Android) non ancora adattate.

## Modulo Menù (suite Tenuta Coppa)
- La suite nasce da questa app: il Menù (prima app a parte, repository `menu-tenuta-coppa`) entra come modulo.
  Piano completo nel progetto Claude "Suite Tenuta Coppa".
- `menu/` è l'app web del Menù copiata com'è (HTML/JS puro, niente import: script caricati in ordine da `menu/index.html`).
  Da qui in poi le modifiche al Menù si fanno in questa cartella. `npm run lint` non la controlla.
- `plugins/conMenu.js` (in `app.json`) copia `menu/` negli asset dell'APK a ogni prebuild e dichiara WhatsApp nel manifest.
- PDF dei menù verticali: `verticaleA4` in `menu/js/03-pagine.js` ricompone la pagina 9:16 nelle proporzioni dell'A4: larga quanto
  l'immagine (niente spazio in più ai lati), illustrazione in basso scesa in fondo al foglio, portate almeno il 5% più grandi di prima
  (se serve stringe spazi e interlinea con `--sp` e `--lh`).
- `MenuScreen.js` mostra `file:///android_asset/menu/index.html` in una WebView (`react-native-webview`) come sezione di
  `PrincipaleScreen` (proprietà `attiva`, `comandi`, `suEsci`, `suVista`); una volta aperta resta caricata e nascosta.
  Si carica con `require` alla prima apertura dentro il riparo `Riparo`, e `menuInvio.js` al momento dell'uso: un problema del modulo non ferma il resto dell'app.
- Aspetto del Menù nella suite: `menu/css/suite.css` (vale con la classe `suite` su `<html>`, messa da `00-suite.js`): colori, Manrope
  e forme di `theme.js`; la barra delle sezioni del Menù diventa una riga di linguette in alto (Calendario, Proposte, Stampe, Didattica,
  Impostazioni). Se cambia la tavolozza in `theme.js` va aggiornata anche lì. Le pagine dei menù (`.pg`) non devono cambiare:
  lo controlla `test/menu-suite.py`. Dopo ogni disegno la pagina chiama `window.suiteVista()` e manda `{ tipo: 'vista', profonda }`.
- Dati condivisi (tappa 3, scelte di Luca del 8/10/2026): l'archivio del Menù resta quello dell'app web (chiave `state` di `menu_dati`),
  non viene convertito in tabelle; niente anagrafica clienti. Le portate dell'archivio possono collegarsi a una ricetta (`rid` sulla
  portata, id di `ricette`): gli allergeni vengono allora solo dalla ricetta e nel Menù non si modificano (`ricettaItem`, `algNums`,
  `algState` in `menu/js/03-pagine.js`). Ricetta senza ingredienti = "manca"; ingredienti con `allergeni_verificati = 0` = "verifica";
  se nel menù il testo della portata è cambiato, il collegamento non vale e restano le regole a mano. La suite fornisce le ricette con
  `ricettePerMenu()` (allergeni come numeri 1–14 = posizione in `ALLERGENI`, ora in utile.js) e le rimanda alla pagina a ogni ritorno
  al Menù (`scriptRicette`); "Crea la ricetta da questa portata" usa `creaRicettaDaPortata` e apre Anagrafiche → Ricette (`apriId`).
  Per leggere gli eventi dal resto della suite: `eventiMenu(testoStato)` in menuPonte.js (portate con `ricettaId`).
- Fabbisogno e costo degli eventi: `EventiScreen.js` (rotta `Eventi`, elenco oppure `{ evento: id }`; da Altro → Eventi e dal pulsante
  "Fabbisogno e costo" nel menù, messaggio `apriEvento`). Calcoli in `evento.js` (puro, `test/evento.test.mjs`), dati da
  `datiPerEventi()`: giacenza = lotti disponibili non scaduti, prezzo = ultimo `prezzo_unitario` caricato (IVA esclusa).
  Quello che non si può calcolare (portata senza ricetta, porzioni o quantità mancanti, unità non convertibili, prezzo assente)
  viene elencato, mai stimato. Ricavo al netto dell'IVA al 10% (`IVA_RISTORAZIONE`). Costi e margini si vedono solo dopo il PIN
  del titolare (`sbloccaCosti` / `costiSbloccati` in pin.js, 10 minuti): ogni nuova schermata con costi o incassi deve usare lo stesso blocco.
- Ponte pagina ↔ suite: `menu/js/00-suite.js` (lato pagina, caricato per primo) e `menuPonte.js` (lato suite, senza dipendenze
  dal telefono, provato in `test/menuPonte.test.mjs`). La pagina manda messaggi JSON `{ tipo, ... }`; la suite risponde
  eseguendo `window.__suiteRisposta(id, ok, valore)`.
- Archivio: dentro la suite la pagina non usa IndexedDB ma `window.SuiteKV` → tabella `menu_dati` (`menuLeggi`, `menuChiavi`,
  `menuScrivi` in database.js). I dati del Menù entrano così nel backup; `importaTutto` non svuota `menu_dati` se il backup
  è precedente al modulo (`TABELLE_NUOVE`).
- Telefono: `menuInvio.js` rifà le funzioni di `window.Android` dell'app originale — apri/condividi (`expo-sharing`,
  `expo-intent-launcher`), "Salva con nome" (cartella scelta con SAF), invio su WhatsApp (`react-native-share`, testo anche negli appunti).
- Prova della parte web: `python3 test/menu-suite.py` (Playwright, pagina aperta da file con una finta suite). Gira anche su GitHub
  prima della build: se fallisce l'APK non viene creato.
- Se la compilazione Android fallisce, il passo "Compila l'APK" scrive le righe d'errore nel riepilogo della build.

## Linee guida UX (pacchetto build 60)
- Colori (tavolozza della suite, vedi `theme.js`): `COLORS.azione` è il verde oliva di pulsanti, collegamenti e scelte attive;
  `COLORS.terra` (terracotta) è l'accento del pulsante "Registra" e delle cose da sistemare; gli stati usano `ok`/`warning`/`danger`
  e sono sempre scritti anche a parole. Niente bordo colorato solo a sinistra sulle schede: lo stato si mostra con un contorno intero.
- Testi: `S.muted` 15pt, etichette 13pt; pulsanti ≥ 50px, chip ≥ 46px.
- Errori di compilazione: `useErrori()` + prop `errore` su `Campo`/`Selettore` + `{riepilogo}` sopra il pulsante. Niente `Alert` per dati mancanti.
- "Annulla" funziona solo entro `MINUTI_ANNULLA` (10) dalla registrazione: lo controlla il database con la colonna `creato_il`
  (istante vero della scrittura, diverso da `data_ora` per le registrazioni in ritardo). Dopo resta la correzione.
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
