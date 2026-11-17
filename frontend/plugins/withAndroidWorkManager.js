const { withAppBuildGradle, CodeGenerator } = require("expo/config-plugins");

// WorkManager crea su base Room por reflexion antes de iniciar React Native.
// Las reglas viven fuera de android/ para conservarse al regenerar con prebuild.
module.exports = function withAndroidWorkManager(config) {
  return withAppBuildGradle(config, (configMod) => {
    if (configMod.modResults.language !== "groovy") {
      throw new Error("Cyanea requiere el build.gradle Groovy de la plantilla Expo Android.");
    }

    configMod.modResults.contents = CodeGenerator.mergeContents({
      tag: "cyanea-workmanager-room",
      src: configMod.modResults.contents,
      newSrc:
        'android.buildTypes.release.proguardFiles(new File(rootDir, "../plugins/android-workmanager.pro"))',
      anchor: /^dependencies\s*\{/m,
      offset: 0,
      comment: "//",
    }).contents;
    return configMod;
  });
};
