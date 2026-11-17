import { Platform } from "react-native";

// Cuándo cierra el teclado una lista al desplazarla.
//
// En la web, react-native-web aplica "on-drag" a CUALQUIER desplazamiento, no
// solo al arrastre del dedo: al tocar un campo, Safari del iPhone corre la
// pantalla para mostrarlo, eso cuenta como desplazamiento y el teclado se cierra
// en el acto (no se puede escribir). En la web el teclado lo maneja el navegador.
export const MODO_CIERRE_TECLADO = Platform.OS === "web" ? "none" : "on-drag";
