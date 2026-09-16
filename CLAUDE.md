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
- Struttura piatta: nessuna sottocartella per il codice (eccezione: `.github/workflows/`).
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
