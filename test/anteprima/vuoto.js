// Solo per l'anteprima nel browser: sostituto generico dei moduli che esistono solo sul telefono.
const nulla = async () => null;
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
  WebView: () => null, CameraView: () => null,
};
const p = new Proxy(base, { get: (t, k) => (k in t ? t[k] : k === '__esModule' ? true : k === 'default' ? p : nulla) });
module.exports = p;
