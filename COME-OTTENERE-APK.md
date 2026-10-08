# Installare o aggiornare l'app sul telefono

L'app non è sul Play Store: si installa dal file APK che GitHub prepara a ogni modifica.

## Aggiornare (app già installata)

1. Dal telefono apri la pagina **Releases** del repository e scegli la build più recente (numero più alto).
2. Tocca il file `tracciabilita-haccp-build-N.apk` e aspetta la fine del download (circa 94 MB).
3. Apri il file scaricato e tocca **Aggiorna**. I dati restano al loro posto.
4. Controlla il numero in fondo alla sezione **Altro** ("Versione: build N").

## Prima installazione su un telefono

1. Scarica l'APK come sopra e aprilo.
2. Android chiede il permesso di installare da questa fonte: tocca **Impostazioni**, attiva **Consenti da questa fonte** e torna indietro.
3. Tocca **Installa**.
4. Per portare i dati da un altro telefono: Altro → Documenti e dati → Backup e dati → **Ripristina da un backup**
   (se il backup è protetto serve il PIN del titolare).

## Se l'installazione non riesce

| Messaggio | Cosa fare |
|---|---|
| "Il pacchetto sembra non valido" | Il download si è interrotto: cancella il file e riscaricalo |
| Avviso di Play Protect | "Altri dettagli" → "Installa comunque" |
| "Spazio insufficiente" | Libera spazio sul telefono |
| "In conflitto con un pacchetto esistente" | **Non disinstallare l'app**: si perderebbero i dati. Prima invia un backup fuori dal telefono, poi chiedi assistenza |

## Se la compilazione fallisce

Nella scheda **Actions** del repository la build ha una X rossa: aprendola, il riepilogo mostra le righe dell'errore.
L'APK precedente resta disponibile nelle Releases.
