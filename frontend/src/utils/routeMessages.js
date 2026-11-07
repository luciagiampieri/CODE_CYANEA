export const MIN_ACTIVIDADES_PARA_RUTA = 2;

/**
 * @param {object} params
 * @param {boolean} params.hasRoute - el día ya tiene una ruta generada
 * @param {number} params.activitiesWithLocation - actividades del día con ubicación
 * @param {boolean} params.canEdit - el usuario puede generar rutas en este viaje
 * @returns {string|null} el mensaje a mostrar, o null si no corresponde ninguno
 */
export function getRouteHint({ hasRoute, activitiesWithLocation = 0, canEdit = false }) {
  if (hasRoute) return null;

  if (!canEdit) {
    return "Todavía no hay un recorrido generado para este día.";
  }

  const faltan = Math.max(MIN_ACTIVIDADES_PARA_RUTA - activitiesWithLocation, 0);

  if (faltan === 0) {
    return "Todavía no hay recorrido para este día. Elegí cómo se van a mover y generalo para verlo en el mapa.";
  }

  if (faltan === 1 && activitiesWithLocation > 0) {
    return "Todavía no hay recorrido para este día. Agregá 1 actividad más con ubicación para poder generarlo.";
  }

  return `Todavía no hay recorrido para este día. Agregá al menos ${MIN_ACTIVIDADES_PARA_RUTA} actividades con ubicación para poder generarlo.`;
}

export const MENSAJE_TRASLADO_SIN_AGENDAR = "Agendá el traslado para calcular la ruta de cada destino.";

// Día de traslado sin el traslado agendado: no hay rutas hasta poder separar los destinos.
export function getRouteHintDelDia({ sinAgendar, ...resto }) {
  return sinAgendar ? MENSAJE_TRASLADO_SIN_AGENDAR : getRouteHint(resto);
}

export function faltanActividadesEnDestino(nombre) {
  return `En ${nombre} faltan actividades con ubicación para armar la ruta.`;
}
