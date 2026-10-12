// Pestaña del viaje que abre cada notificación. Se reconoce tanto el payload
// del push (eventType / notificationType) como el `tipo` que guarda la
// notificación en la app (lista de la campanita).
const TAB_POR_EVENTO = {
  activity_created: "itinerario",
  activity_updated: "itinerario",
  activity_deleted: "itinerario",
  activity_reminder: "itinerario",
  expense_created: "gastos",
  expense_updated: "gastos",
  settlement_updated: "gastos",
  voting_created: "votar",
};

const TAB_POR_TIPO = {
  // tipo de la notificación (tabla Notificaciones)
  actividad_creada: "itinerario",
  actividad_actualizada: "itinerario",
  actividad_eliminada: "itinerario",
  recordatorio_actividad: "itinerario",
  gasto_creado: "gastos",
  gasto_modificado: "gastos",
  liquidacion_actualizada: "gastos",
  nueva_votacion: "votar",
  nuevo_administrador: "grupo",
  participante_salio: "grupo",
  // notificationType del push
  nuevo_gasto: "gastos",
};

// Avisos sobre un viaje al que el usuario ya no tiene acceso: no abren nada.
const TIPOS_SIN_VIAJE = new Set(["invitacion_cancelada"]);

export function resolveNotificationTarget(data = {}) {
  const tripId = data.tripId ?? data.viajeId ?? data.idViaje ?? data.IdViaje;
  if (!tripId) return null;
  if (TIPOS_SIN_VIAJE.has(data.tipo)) return null;

  const initialTab =
    TAB_POR_EVENTO[data.eventType] ??
    TAB_POR_TIPO[data.notificationType] ??
    TAB_POR_TIPO[data.tipo] ??
    TAB_POR_EVENTO[data.tipo] ??
    "resumen";

  return {
    tripId,
    initialTab,
    activityId: data.activityId,
    dayId: data.dayId,
    expenseId: data.expenseId,
    votingId: data.votingId,
  };
}