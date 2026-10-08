# Suite Tenuta Coppa

App Android del ristorante Tenuta Coppa: registri HACCP e rintracciabilità, più le proposte di menù.
Funziona senza rete: tutti i dati restano sul telefono, in un database locale.
Sul telefono si chiama **Tenuta Coppa**.

## Cosa fa

| Sezione | Contenuto |
|---|---|
| **Oggi** | Controlli della giornata (temperature, pulizie, scadenze), cose da sistemare, prossimo menù, pulsante "Registra" |
| **Magazzino** | Lotti in giacenza per scadenza, scarichi e scarti, rintracciabilità del lotto, richiami |
| **Menù** | Calendario degli eventi, proposte e menù da tavolo in PDF e immagine, invio su WhatsApp, stampe |
| **Altro** | Temperature, sanificazione, non conformità, carico merce (anche da fattura PDF), produzioni, etichette, anagrafiche, registri PDF per l'ASL, backup |

## Dati e backup

- I dati vivono solo sul telefono. Il **backup automatico** scrive una copia al giorno in una cartella scelta da te
  e tiene quelle degli ultimi 3 giorni.
- Con il **PIN del titolare** impostato, i backup sono cifrati: senza PIN non si aprono, e se il PIN viene dimenticato non si recuperano.
- Una volta a settimana conviene inviare una copia fuori dal telefono (Drive, email): l'app lo ricorda.

## Come si aggiorna

Ogni modifica caricata sul ramo `main` fa partire la compilazione su GitHub Actions (test, controllo del codice, APK firmato).
L'APK finisce nelle [Releases](../../releases): le istruzioni per installarlo sono in [COME-OTTENERE-APK.md](COME-OTTENERE-APK.md).

## Per chi lavora sul codice

- Expo SDK 52 / React Native, database SQLite (`expo-sqlite`); il Menù è una pagina web (`menu/`) mostrata dentro l'app.
- Regole e convenzioni del progetto: [CLAUDE.md](CLAUDE.md).
- Controlli: `npm test`, `npm run lint`, `python3 test/menu-suite.py`.
- Il repository è pubblico: non deve contenere dati reali del ristorante, né chiavi o password.
