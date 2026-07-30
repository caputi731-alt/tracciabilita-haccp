# Creare l'app dal telefono (Google Pixel)

Guida completa per ottenere l'APK usando **solo il Pixel**, senza computer.
Tutti i file sono ora nella stessa cartella (nessuna sottocartella), così il
caricamento da telefono funziona.

Tempo: circa 30 minuti la prima volta. Poi, per gli aggiornamenti, pochi minuti.

---

## Cosa ti serve
- Il tuo Pixel con Chrome
- Un account Google (ce l'hai già)
- Il file `haccp-flat.zip` scaricato sul telefono

---

## PARTE 1 — Prepara i file sul telefono

1. Scarica `haccp-flat.zip` sul Pixel.
2. Apri l'app **File** (o "Files by Google").
3. Trova il file ZIP nella cartella **Download**.
4. Toccalo e scegli **Estrai** / **Extract**.
5. Si crea una cartella `haccp-flat` con dentro tutti i file. Tienila da parte.

---

## PARTE 2 — Crea l'account e il progetto su GitHub

1. Con Chrome vai su **github.com**.
2. Se non hai un account, tocca **Sign up** e registrati (gratis).
3. Fatto l'accesso, tocca l'icona **+** in alto a destra → **New repository**.
4. In **Repository name** scrivi: `tracciabilita-haccp`
5. Scegli **Public**.
   (Con Public le compilazioni sono sempre gratuite e illimitate. Il codice è
   visibile ad altri, ma non contiene dati del ristorante: quelli restano sul tablet.)
6. Tocca **Create repository**.

---

## PARTE 3 — Carica i file dell'app

1. Nella pagina del repository tocca **Add file** → **Upload files**.
   (Se non vedi il menu, tocca prima "uploading an existing file" nel testo blu.)
2. Tocca **choose your files**.
3. Si apre il selettore file del Pixel: entra nella cartella `haccp-flat`,
   **seleziona tutti i file `.js` e i file** `app.json`, `eas.json`,
   `package.json`, `README.md`, `COME-OTTENERE-APK.md`.
   - Per selezionarli tutti: tieni premuto sul primo, poi tocca gli altri.
4. Tocca **Apri** / conferma. I file si caricano nella pagina.
5. Scorri in fondo e tocca **Commit changes**.

> Il file del "motore" di compilazione (`build-apk.yml`) sta in una cartella
> speciale `.github/workflows` che il telefono non riesce a caricare in blocco.
> Lo creiamo a mano nella parte successiva: è un attimo.

---

## PARTE 4 — Crea il file di compilazione a mano

1. Sempre nel repository, tocca **Add file** → **Create new file**.
2. Nel campo del nome in alto scrivi **esattamente** questo, comprese le barre:
   ```
   .github/workflows/build-apk.yml
   ```
   Man mano che scrivi le barre `/`, GitHub crea le cartelle da solo.
3. Nel riquadro grande sotto, incolla tutto il contenuto del file
   `build-apk.yml` (lo trovi nella cartella estratta: aprilo con un editor di
   testo, seleziona tutto e copia).
4. Scorri in fondo e tocca **Commit changes**.

---

## PARTE 5 — La compilazione parte da sola

Appena salvi il file della Parte 4, GitHub inizia a costruire l'APK.

1. In alto nella pagina tocca il tab **Actions**.
2. Vedrai una voce **Compila APK** con un pallino giallo che gira.
3. Aspetta circa 10–15 minuti (puoi chiudere e riaprire, va avanti da solo).
4. Quando compare il segno di spunta **verde**, è pronto.

Se compare una **X rossa**, qualcosa è andato storto: toccala, fai uno
screenshot del messaggio in rosso e mandamelo. Di solito è una versione di un
pacchetto da correggere e si risolve in un minuto.

---

## PARTE 6 — Scarica e installa l'APK

1. Nel tab **Actions**, tocca la compilazione col segno verde.
2. Scorri in fondo, nella sezione **Artifacts** tocca **tracciabilita-haccp-apk**.
3. Si scarica un file ZIP. Aprilo con l'app **File** ed estrai l'APK che c'è dentro.
4. Tocca l'APK per installarlo.
5. Android dirà che l'installazione da questa fonte non è consentita: tocca
   **Impostazioni** e attiva **Consenti da questa fonte**, poi torna indietro e
   conferma l'installazione.
6. L'app **Tracciabilità HACCP** compare tra le tue applicazioni.

Puoi provarla subito sul Pixel; quando sei soddisfatto installi lo stesso APK
sul tablet della cucina.

---

## Per gli aggiornamenti futuri

Quando ti mando file aggiornati:
1. Repository → **Add file** → **Upload files**
2. Carichi i file modificati (sovrascrivono i vecchi) → **Commit changes**
3. La compilazione riparte da sola, e in ~10 minuti hai il nuovo APK in **Actions**

I dati inseriti nell'app **non si perdono** con l'aggiornamento, purché non
cambi il nome pacchetto in `app.json`.

---

## Promemoria backup
Finché non aggiungiamo il backup automatico, i dati vivono solo sul dispositivo.
È la prossima cosa che ti conviene far fare all'app, prima ancora della Fase 2.
