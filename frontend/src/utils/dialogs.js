/**
 * Diálogos multiplataforma con el estilo de Cyanea (AppDialog), también en web:
 * nunca se usan `window.alert` ni `window.confirm` del navegador.
 */
import { appAlert } from "../components/ui/AppDialog";

export function avisar(titulo, mensaje, onAceptar) {
  if (onAceptar) {
    appAlert(titulo, mensaje, [{ text: "Aceptar", onPress: onAceptar }]);
  } else {
    appAlert(titulo, mensaje);
  }
}

/** Pide confirmación y resuelve true si el usuario acepta. */
export function confirmar({
  titulo,
  mensaje,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  destructivo = false,
  // Fuerza el ícono y color del diálogo ("warning", "info", ...); si no se
  // indica, AppDialog lo deduce del título.
  tipo,
}) {
  return new Promise((resolve) => {
    appAlert(
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
      { cancelable: true, onDismiss: () => resolve(false), ...(tipo ? { tipo } : {}) }
    );
  });
}
