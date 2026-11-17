import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

import { tecladoAbierto } from "../utils/viewportWeb";

/**
 * Si el teclado está abierto. En Android/iOS con los eventos de Keyboard; en la web, donde
 * esos eventos no existen, con el `resize` del visualViewport y el mismo criterio que el
 * ajuste de App.js (`tecladoAbierto`: un zoom no cuenta como teclado).
 *
 * Usarlo para lo que se oculta con el teclado abierto (pies con botones, etc.). Una copia
 * sin la rama web deja esos elementos visibles en la web y tapan los campos.
 */
export default function useTecladoVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") {
      const vv = typeof window !== "undefined" ? window.visualViewport : null;
      if (!vv) return undefined;
      const check = () => setVisible(tecladoAbierto(window));
      check();
      vv.addEventListener("resize", check);
      return () => vv.removeEventListener("resize", check);
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return visible;
}
