// Hook di caricamento per eseguire in Node i moduli dell'app (sintassi ES in file .js)
// e sostituire expo-sqlite con un database SQLite in memoria (node:sqlite).
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mock = pathToFileURL(path.join(radice, 'test', 'expo-sqlite-finto.mjs')).href;
const finti = {
  'react-native': 'data:text/javascript,export const StyleSheet = { create: (s) => s };',
  'expo-print': 'data:text/javascript,export const printAsync = async () => {};',
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo-sqlite') return { url: mock, shortCircuit: true };
  if (finti[specifier]) return { url: finti[specifier], shortCircuit: true };
  if (specifier.startsWith('./') && context.parentURL && !path.extname(specifier)) {
    const candidato = path.join(path.dirname(fileURLToPath(context.parentURL)), `${specifier}.js`);
    try { await access(candidato); return { url: pathToFileURL(candidato).href, shortCircuit: true }; } catch (e) { /* prosegui */ }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.js') && !url.includes('/node_modules/')) {
    const file = fileURLToPath(url);
    if (path.dirname(file) === radice) {
      return { format: 'module', source: await readFile(file, 'utf8'), shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
