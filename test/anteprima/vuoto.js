// Solo per l'anteprima nel browser: sostituto generico dei moduli che esistono solo sul telefono.
const React = require('react');
const nulla = async () => null;
// La vista delle cucine nel browser: la pagina vera dentro un iframe (cartella "asset" accanto all'anteprima, vedi vedi.py).
// Le altre pagine (il Menù) restano vuote.
const WebView = React.forwardRef(({ source, onMessage, style }, ref) => {
  const el = React.useRef(null);
  const ascolta = React.useRef(onMessage); ascolta.current = onMessage;
  React.useImperativeHandle(ref, () => ({ injectJavaScript: (js) => { try { el.current.contentWindow.eval(js); } catch (e) { /* pagina non pronta */ } } }));
  const uri = String((source && source.uri) || '');
  if (!uri.includes('/cucine/')) return null;
  return React.createElement('iframe', {
    ref: el, src: uri.replace('file:///android_asset/', '/asset/'), style: { border: 0, width: '100%', height: '100%' },
    onLoad: () => {
      const w = el.current.contentWindow;
      const manda = (s) => ascolta.current && ascolta.current({ nativeEvent: { data: s } });
      w.ReactNativeWebView = { postMessage: manda };
      (w.__inviati || []).forEach((m) => manda(JSON.stringify(m)));
    },
  });
});
const base = {
  documentDirectory: 'file:///doc/', cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: async () => ({ exists: false }), readDirectoryAsync: async () => [], makeDirectoryAsync: nulla,
  getPermissionsAsync: async () => ({ granted: false, status: 'denied' }), requestPermissionsAsync: async () => ({ granted: false }),
  getAllScheduledNotificationsAsync: async () => [], setNotificationHandler: () => {}, setNotificationChannelAsync: nulla,
  addNotificationResponseReceivedListener: () => ({ remove() {} }), getLastNotificationResponseAsync: nulla,
  cancelAllScheduledNotificationsAsync: nulla, scheduleNotificationAsync: nulla, cancelScheduledNotificationAsync: nulla,
  AndroidImportance: {}, SchedulableTriggerInputTypes: {}, isAvailableAsync: async () => false,
  StorageAccessFramework: { readDirectoryAsync: async () => [], requestDirectoryPermissionsAsync: async () => ({ granted: false }) },
  useCameraPermissions: () => [{ granted: false }, nulla],
  WebView, CameraView: () => null,
};
const p = new Proxy(base, { get: (t, k) => (k in t ? t[k] : k === '__esModule' ? true : k === 'default' ? p : nulla) });
module.exports = p;
