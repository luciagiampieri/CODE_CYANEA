import { Platform } from "react-native";

const STYLE_TAG_ID = "cyanea-web-focus-styles";

/**
 * En web, React Native Web renderiza cada <TextInput> como un <input> nativo del
 * navegador. Al hacer foco, el navegador dibuja su propio "outline" (el borde negro
 * grueso que se ve por defecto). Esto se aplica una única vez para toda la app y
 * reemplaza ese outline por nada, dejando el borde/fondo ya definidos en cada
 * pantalla (styles.inputBox, etc.) como única señal visual de foco.
 */
export function injectWebFocusStyles() {
  if (Platform.OS !== "web") return;
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_TAG_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = `
    input, textarea, select {
      outline: none !important;
    }
    input:focus, textarea:focus, select:focus,
    input:focus-visible, textarea:focus-visible, select:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}
