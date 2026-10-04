const fs = require("fs");
const path = require("path");

// google-services.json solo hace falta para compilar la app de Android con
// notificaciones push (EAS lo provee con la variable GOOGLE_SERVICES_JSON).
// Si el archivo no existe, se quita de la configuración: así Expo Go y la
// versión web funcionan sin él y sin advertencias.
module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json";
  const existeArchivo = fs.existsSync(path.resolve(__dirname, googleServicesFile));

  const { googleServicesFile: _omitido, ...androidSinArchivo } = config.android ?? {};

  return {
    ...config,
    android: existeArchivo ? { ...config.android, googleServicesFile } : androidSinArchivo,
  };
};
