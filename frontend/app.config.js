const fs = require("fs");
const path = require("path");

const PLUGINS_REQUERIDOS = ["expo-sharing"];

function configurarGoogleMapsAndroid(plugins) {
  const googleMapsAndroidApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

  return (plugins ?? []).map((plugin) => {
    const nombrePlugin = Array.isArray(plugin) ? plugin[0] : plugin;

    if (nombrePlugin !== "react-native-maps") {
      return plugin;
    }

    const opcionesActuales = Array.isArray(plugin) ? plugin[1] ?? {} : {};
    const opciones = googleMapsAndroidApiKey
      ? { ...opcionesActuales, androidGoogleMapsApiKey: googleMapsAndroidApiKey }
      : opcionesActuales;

    return Object.keys(opciones).length > 0 ? ["react-native-maps", opciones] : "react-native-maps";
  });
}

function agregarPluginsRequeridos(plugins) {
  const nombres = new Set(plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin)));
  return [...plugins, ...PLUGINS_REQUERIDOS.filter((nombre) => !nombres.has(nombre))];
}


module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";
  const existeArchivo = fs.existsSync(path.resolve(__dirname, googleServicesFile));

  const { googleServicesFile: _omitido, ...androidSinArchivo } = config.android ?? {};

  return {
    ...config,
    android: existeArchivo ? { ...config.android, googleServicesFile } : androidSinArchivo,
    plugins: agregarPluginsRequeridos(configurarGoogleMapsAndroid(config.plugins)),
  };
};