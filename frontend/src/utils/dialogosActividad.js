// Diálogos que se muestran al registrar o modificar una actividad del itinerario,
// compartidos por el formulario de actividades (AddActivityScreen) y por el alta
// desde un lugar guardado en Explorar (PlaceScheduleSheet):
// - la advertencia de horario (US 98), que permite corregir o registrar igual;
// - la recomendación de entradas o reservas, que se muestra con el mismo diálogo de
//   la app (no con un pop up de formulario) una vez guardada la actividad.
import { Linking, Platform } from "react-native";

import { appAlert } from "../components/ui/AppDialog";
import {
  accionPrincipal,
  descripcionCorta,
  enlaceSitioOficial,
  tituloRecomendacion,
  urlSegura,
} from "./recomendacionEntradas";

// Tipos que devuelve el backend: fuera_de_horario | cerrado_dia |
// cerrado_temporalmente | cerrado_permanentemente.
export function tituloAdvertenciaHorario(tipo) {
  if (tipo === "cerrado_dia") return "El lugar está cerrado ese día";
  if (tipo === "cerrado_temporalmente") return "El lugar está cerrado temporalmente";
  if (tipo === "cerrado_permanentemente") return "El lugar cerró definitivamente";
  return "Revisá el horario de tu actividad";
}

export function mensajeAdvertenciaHorario(datos, { esEdicion = false } = {}) {
  const lugar = datos.nombreLugar || `el lugar de ${datos.nombreActividad}`;
  const cierre = esEdicion
    ? "Podés modificar la actividad o guardarla igualmente."
    : "Podés modificar la actividad o registrarla igualmente.";

  if (
    datos.tipo === "cerrado_dia" ||
    datos.tipo === "cerrado_temporalmente" ||
    datos.tipo === "cerrado_permanentemente"
  ) {
    // El backend ya arma el texto completo (cuándo reabre, reformas, etc.).
    return `${datos.mensaje || `Detectamos que ${lugar} está cerrado.`}\n\n${cierre}`;
  }

  let mensaje = `Detectamos que ${lugar} no se encuentra abierto durante el horario seleccionado.`;

  if (datos.horariosApertura) {
    mensaje += `\n\nHorario del establecimiento: ${datos.horariosApertura.replace(/ - /g, " a ")}`;
  } else if (datos.mensaje) {
    mensaje += `\n\n${datos.mensaje}`;
  }

  mensaje += `\nHorario de tu actividad: ${datos.horarioActividad}`;
  mensaje += `\n\n${
    esEdicion
      ? "Podés modificar el horario de la actividad o guardarla igualmente."
      : "Podés modificar el horario de la actividad o registrarla igualmente."
  }`;
  return mensaje;
}

/**
 * Advertencia de horario con "Modificar" (no hace nada, el formulario sigue abierto)
 * y "Registrar igual" / "Guardar igual" (llama `onConfirmar`).
 */
export function mostrarAdvertenciaHorario(datos, { esEdicion = false, onConfirmar } = {}) {
  const titulo = tituloAdvertenciaHorario(datos.tipo);
  const mensaje = mensajeAdvertenciaHorario(datos, { esEdicion });
  const textoConfirmar = esEdicion ? "Guardar igual" : "Registrar igual";
  const esFueraDeHorario = datos.tipo === "fuera_de_horario" || !datos.tipo;
  const textoModificar = esFueraDeHorario ? "Modificar horario" : "Modificar actividad";
  const accionModificarWeb = esFueraDeHorario ? "modificar el horario" : "modificar la actividad";

  if (Platform.OS === "web") {
    const confirmado = window.confirm(
      `${titulo}\n\n${mensaje}\n\nAceptar: ${textoConfirmar.toLowerCase()}. Cancelar: ${accionModificarWeb}.`
    );
    if (confirmado) onConfirmar?.();
    return;
  }

  appAlert(titulo, mensaje, [
    { text: textoModificar, style: "cancel" },
    { text: textoConfirmar, onPress: onConfirmar },
  ]);
}

/**
 * Recomendación de entradas o reservas, con el diálogo de mensajes de la app. La
 * confirmación de guardado ("Actividad registrada correctamente.") va en una franja
 * propia arriba del diálogo, separada de la recomendación. Botones: "Entendido" y, si
 * hay compra o reserva en línea, el enlace oficial. Ambos llaman `onCerrar`.
 */
export function mostrarRecomendacionEntradas(recomendacion, { mensajeExito, onCerrar } = {}) {
  const enlace = accionPrincipal(recomendacion) ?? enlaceSitioOficial(recomendacion);
  const lineas = [];
  if (recomendacion.nombreLugar) lineas.push(recomendacion.nombreLugar);
  lineas.push(descripcionCorta(recomendacion));
  if (enlace?.aclaracion) lineas.push("", `${enlace.aclaracion}.`);
  if (!enlace && recomendacion.avisoEnlace) lineas.push("", recomendacion.avisoEnlace);

  const abrirEnlace = async () => {
    const url = urlSegura(enlace?.url);
    onCerrar?.();
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      // Si el sistema no puede abrir el navegador no hay nada más que hacer:
      // la actividad ya está guardada.
    }
  };

  appAlert(
    tituloRecomendacion(recomendacion.tipo),
    lineas.join("\n"),
    [
      { text: "Entendido", style: enlace ? "cancel" : undefined, onPress: onCerrar },
      ...(enlace ? [{ text: enlace.texto, onPress: abrirEnlace }] : []),
    ],
    { tipo: "info", confirmacion: mensajeExito }
  );
}
