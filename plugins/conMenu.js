/**
 * Plugin di configurazione Expo per il modulo Menù.
 * Gira durante "expo prebuild" (cioè a ogni build su GitHub) e fa due cose:
 *  1. copia la cartella menu/ (l'app web del Menù) negli asset dell'APK, dove la WebView la legge
 *     come file:///android_asset/menu/index.html;
 *  2. dichiara nel manifest che l'app chiede ad Android se WhatsApp è installato
 *     (da Android 11 senza questa dichiarazione la risposta è sempre "no").
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest } = require('expo/config-plugins');

const PACCHETTI = ['com.whatsapp', 'com.whatsapp.w4b'];

function copiaMenu(config) {
  return withDangerousMod(config, ['android', async (cfg) => {
    const origine = path.join(cfg.modRequest.projectRoot, 'menu');
    const destinazione = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'menu');
    if (!fs.existsSync(path.join(origine, 'index.html'))) {
      throw new Error('Modulo Menù: manca menu/index.html, la cartella menu/ non è completa.');
    }
    fs.rmSync(destinazione, { recursive: true, force: true });
    fs.mkdirSync(destinazione, { recursive: true });
    fs.cpSync(origine, destinazione, { recursive: true });
    return cfg;
  }]);
}

function dichiaraWhatsApp(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!Array.isArray(manifest.queries) || manifest.queries.length === 0) manifest.queries = [{}];
    const blocco = manifest.queries[0];
    blocco.package = blocco.package || [];
    for (const nome of PACCHETTI) {
      if (!blocco.package.some((p) => p.$ && p.$['android:name'] === nome)) {
        blocco.package.push({ $: { 'android:name': nome } });
      }
    }
    return cfg;
  });
}

module.exports = function conMenu(config) {
  return dichiaraWhatsApp(copiaMenu(config));
};
