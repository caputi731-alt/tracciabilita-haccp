// Configurazione di Metro. Per l'APK non cambia nulla: l'unica aggiunta riguarda la piattaforma "web", usata solo
// per l'anteprima delle schermate nel browser (test/anteprima/): lì i moduli che esistono solo sul telefono
// vengono sostituiti da versioni finte e il database gira in memoria.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const FINTI = ['expo-notifications', 'expo-file-system', 'expo-camera', 'expo-image-picker', 'expo-document-picker', 'expo-print',
  'expo-sharing', 'expo-intent-launcher', 'expo-clipboard', 'react-native-webview', 'react-native-share', 'expo-screen-orientation'];
const prima = config.resolver.resolveRequest;
config.resolver.resolveRequest = (ctx, nome, piattaforma) => {
  if (piattaforma === 'web') {
    if (nome === 'expo-sqlite') return { type: 'sourceFile', filePath: path.join(__dirname, 'test', 'anteprima', 'sqlite.js') };
    if (nome === 'react-native-aes-crypto') return { type: 'sourceFile', filePath: path.join(__dirname, 'test', 'anteprima', 'aes.js') };
    if (FINTI.includes(nome)) return { type: 'sourceFile', filePath: path.join(__dirname, 'test', 'anteprima', 'vuoto.js') };
  }
  return (prima || ctx.resolveRequest)(ctx, nome, piattaforma);
};
module.exports = config;
