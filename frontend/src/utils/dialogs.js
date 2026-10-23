import { appAlert } from "../components/ui/AppDialog";


export function avisar(titulo, mensaje, onAceptar, opciones) {
  const botones = onAceptar ? [{ text: "Aceptar", onPress: onAceptar }] : undefined;
  if (opciones) {
    appAlert(titulo, mensaje, botones, opciones);
  } else if (botones) {
    appAlert(titulo, mensaje, botones);
  } else {
    appAlert(titulo, mensaje);
  }
}


export function confirmar({
  titulo,
  mensaje,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  destructivo = false,
  tipo,
  opciones = {},
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
      {
        cancelable: true,
        onDismiss: () => resolve(false),
        ...(tipo ? { tipo } : {}),
        ...opciones,
      }
    );
  });
}