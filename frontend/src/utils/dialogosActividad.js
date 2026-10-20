// Diálogos que se muestran al registrar o modificar una actividad del itinerario,
// compartidos por el formulario de actividades (AddActivityScreen) y por el alta
// desde un lugar guardado en Explorar (PlaceScheduleSheet):
// - la advertencia de horario (US 98), que permite corregir o registrar igual;
// - la recomendación de entradas o reservas, que se muestra con el mismo diálogo de
//   la app (no con un pop up de formulario) una vez guardada la actividad, con
//   "Recordármelo" para agregarla como tarea al checklist;
// - el aviso de que se eliminan las tareas pendientes de "Recordármelo" al cambiar
//   el lugar de la actividad.
import { Linking } from "react-native";

import { appAlert, appToast } from "../components/ui/AppDialog";
import { crearTareaEntradas } from "../services/api";
import {
  accionPrincipal,
  descripcionCorta,
  enlaceSitioOficial,
  iconoRecomendacion,
  ofreceRecordatorio,
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

  appAlert(titulo, mensaje, [
    { text: textoModificar, style: "cancel" },
    { text: textoConfirmar, onPress: onConfirmar },
  ]);
}

/**
 * Recomendación de entradas o reservas, con el diálogo de mensajes de la app.
 *
 * Se muestra con el formulario ya cerrado (la actividad está guardada), sobre el
 * itinerario. La confirmación de guardado va en una franja verde arriba; debajo, el
 * ícono de la recomendación, un título corto, el lugar en una píldora y una frase.
 *
 * Botones (de más a menos importante):
 * - el enlace oficial para comprar o reservar (si hay), con ícono de enlace externo;
 * - "Recordármelo" (si hay que reservar o comprar antes y se pasó `recordatorio`),
 *   con borde: crea la tarea en el checklist y avisa con un toast;
 * - "Ahora no" como cruz arriba a la derecha (o tocando afuera).
 * En boletería no hay nada para recordar: "Entendido" y "Ver sitio oficial".
 *
 * `recordatorio`: { tripId, activityId } de la actividad guardada.
 */
export function mostrarRecomendacionEntradas(recomendacion, { mensajeExito, onCerrar, recordatorio } = {}) {
  const enlace = accionPrincipal(recomendacion) ?? enlaceSitioOficial(recomendacion);
  const conRecordatorio = Boolean(
    recordatorio?.tripId && recordatorio?.activityId && ofreceRecordatorio(recomendacion)
  );
  const lineas = [descripcionCorta(recomendacion)];
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

  const recordar = () => {
    onCerrar?.();
    return agregarTareaAlChecklist(recomendacion, recordatorio, enlace?.url ?? null);
  };

  const botonEnlace = enlace
    ? { text: enlace.texto, icono: "arrow-up-right-from-square", onPress: abrirEnlace }
    : null;

  const botones = conRecordatorio
    ? [
        { text: "Ahora no", style: "cancel", onPress: onCerrar },
        { text: "Recordármelo", icono: "bell", variante: botonEnlace ? "contorno" : undefined, onPress: recordar },
        ...(botonEnlace ? [botonEnlace] : []),
      ]
    : [
        ...(botonEnlace ? [{ ...botonEnlace, variante: "contorno" }] : []),
        { text: "Entendido", onPress: onCerrar },
      ];

  appAlert(tituloRecomendacion(recomendacion.tipo), lineas.join("\n"), botones, {
    tipo: "info",
    icono: iconoRecomendacion(recomendacion.tipo),
    confirmacion: mensajeExito,
    etiqueta: recomendacion.nombreLugar ? { icono: "location-dot", texto: recomendacion.nombreLugar } : undefined,
    botonCerrar: conRecordatorio,
  });
}

/**
 * "Recordármelo": crea la tarea en el checklist y lo confirma con un aviso breve
 * (toast), sin otro diálogo que haya que cerrar. Si falla, la actividad sigue
 * guardada; solo se informa el error.
 */
export async function agregarTareaAlChecklist(recomendacion, { tripId, activityId }, enlace = null) {
  try {
    const resultado = await crearTareaEntradas(tripId, activityId, {
      tipo: recomendacion.tipo,
      enlace: urlSegura(enlace),
      nombreLugar: recomendacion.nombreLugar,
    });
    appToast(
      resultado?.creada === false ? "Ya estaba en tu checklist" : "Listo, lo agregamos a tu checklist",
      { icono: resultado?.creada === false ? "list-check" : "circle-check" }
    );
    return resultado;
  } catch (error) {
    appAlert(
      "No se pudo agregar la tarea",
      `${error?.message || "Ocurrió un error al crear la tarea."}\n\nLa actividad quedó guardada igual.`,
      undefined,
      { tipo: "error" }
    );
    return null;
  }
}

/**
 * Aviso antes de guardar una edición que cambia el lugar de la actividad: se
 * eliminarán las tareas pendientes de "Recordármelo". "Cancelar" no guarda nada;
 * "Cambiar lugar" llama `onConfirmar` con los ids de las tareas.
 */
export function mostrarConfirmacionTareasEntradas(datos, { onConfirmar } = {}) {
  const ids = (datos?.tareas || []).map((t) => t.idChecklist);
  const mensaje = `${datos?.mensaje || "Al cambiar el lugar de la actividad se eliminará la tarea del checklist."}\n\nSi cancelás, no se guardan los cambios.`;

  appAlert("¿Cambiar el lugar de la actividad?", mensaje, [
    { text: "Cancelar", style: "cancel" },
    { text: "Cambiar lugar", style: "destructive", onPress: () => onConfirmar?.(ids) },
  ]);
}

/** Texto extra para el aviso de eliminar una actividad con tareas pendientes. */
export function avisoTareasAlEliminar(tareas) {
  if (!Array.isArray(tareas) || tareas.length === 0) return "";
  if (tareas.length === 1) return `\n\nTambién se eliminará la tarea «${tareas[0].nombre}» del checklist.`;
  return `\n\nTambién se eliminarán estas tareas del checklist: ${tareas
    .map((t) => `«${t.nombre}»`)
    .join(", ")}.`;
}
