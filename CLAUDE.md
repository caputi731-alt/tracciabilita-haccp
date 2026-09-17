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
- Sintassi JS valida su tutti i file modificati.
- Nessun import verso file inesistenti o con maiuscole/minuscole diverse.
- Nessuna funzione duplicata in `database.js`.

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
