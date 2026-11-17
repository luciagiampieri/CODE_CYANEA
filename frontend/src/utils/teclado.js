import { Platform } from "react-native";

// Cuándo cierra el teclado una lista al desplazarla.
//
// En la web, react-native-web aplica "on-drag" a CUALQUIER desplazamiento, no
// solo al arrastre del dedo: al tocar un campo, Safari del iPhone corre la
// pantalla para mostrarlo, eso cuenta como desplazamiento y el teclado se cierra
// en el acto (no se puede escribir). En la web el teclado lo maneja el navegador.
export const MODO_CIERRE_TECLADO = Platform.OS === "web" ? "none" : "on-drag";

// Si algo se oculta mientras el teclado está abierto (para ganar lugar). Solo en
// Android/iOS: en la web, sacarlo y volverlo a poner hacía saltar toda la pantalla al
// abrir y cerrar el teclado (Safari ya mueve la página por su cuenta).
export function ocultarConTeclado(tecladoVisible) {
  return Boolean(tecladoVisible) && Platform.OS !== "web";
}
