import { Alert } from "react-native";

/**
 * Simula al usuario frente a los diálogos de la app. En los tests `appAlert`
 * delega en `Alert.alert` (no hay <DialogHost root />), así que se lo espía y
 * se responde según el tipo de diálogo:
 *
 * - avisos (un solo botón o ninguno: éxito, error): se registran en `avisos`
 *   con el texto "titulo\n\nmensaje" y se aceptan enseguida.
 * - confirmaciones (un botón "cancel" y otra acción): se registran en
 *   `confirmaciones`; si devuelve true se pulsa la acción principal (la última),
 *   si no, el botón de cancelar.
 * - diálogos con ícono propio (recomendación de entradas): no se responden;
 *   cada test pulsa el botón que quiera.
 */
export function simularDialogos({ confirma = false } = {}) {
  const avisos = jest.fn();
  const confirmaciones = jest.fn().mockReturnValue(confirma);

  jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones, opciones) => {
    if (opciones?.icono) return;
    const texto = mensaje ? `${titulo}\n\n${mensaje}` : titulo;
    const lista = Array.isArray(botones) ? botones : [];
    const cancelar = lista.find((b) => b.style === "cancel");
    const acciones = lista.filter((b) => b.style !== "cancel");

    if (cancelar && acciones.length > 0) {
      const boton = confirmaciones(texto) ? acciones[acciones.length - 1] : cancelar;
      boton.onPress?.();
      return;
    }
    avisos(texto);
    acciones[0]?.onPress?.();
  });

  return { avisos, confirmaciones };
}

/** Llamadas a `Alert.alert` que corresponden a una recomendación de entradas. */
export function recomendaciones() {
  return Alert.alert.mock.calls.filter(([, , , opciones]) => opciones?.icono);
}
