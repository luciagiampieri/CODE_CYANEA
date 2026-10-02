/**
 * Diálogos multiplataforma. En Expo Web `Alert.alert` no muestra botones,
 * así que ahí se usan `window.alert` y `window.confirm`.
 */
import { Alert, Platform } from "react-native";

export function avisar(titulo, mensaje, onAceptar) {
  if (Platform.OS === "web") {
    window.alert(mensaje ? `${titulo}\n\n${mensaje}` : titulo);
    onAceptar?.();
    return;
  }
  if (onAceptar) {
    Alert.alert(titulo, mensaje, [{ text: "Aceptar", onPress: onAceptar }]);
  } else {
    Alert.alert(titulo, mensaje);
  }
}

/** Pide confirmación y resuelve true si el usuario acepta. */
export function confirmar({
  titulo,
  mensaje,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  destructivo = false,
}) {
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(`${titulo}\n\n${mensaje}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      titulo,
      mensaje,
      [
        { text: textoCancelar, style: "cancel", onPress: () => resolve(false) },
        {
          text: textoConfirmar,
          style: destructivo ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
