// Pestaña del viaje que abre cada notificación. Se reconoce tanto el payload
// del push (eventType / notificationType) como el `tipo` que guarda la
// notificación en la app (lista de la campanita).
const TAB_POR_EVENTO = {
  administration_transferred: "grupo",
  member_joined: "grupo",
  activity_created: "itinerario",
  activity_updated: "itinerario",
  activity_deleted: "itinerario",
  activity_reminder: "itinerario",
  expense_created: "gastos",
  expense_updated: "gastos",
  settlement_updated: "gastos",
  transfer_reported: "gastos",
  transfer_rejected: "gastos",
  voting_created: "votar",
  checklist_task_created: "checklist",
  checklist_task_assigned: "checklist",
  checklist_task_deleted: "checklist",
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
  transferencia_informada: "gastos",
  transferencia_rechazada: "gastos",
  nueva_votacion: "votar",
  tarea_entradas_creada: "checklist",
  tarea_entradas_asignada: "checklist",
  tarea_entradas_eliminada: "checklist",
  nuevo_administrador: "grupo",
  participante_incorporado: "grupo",
  participante_salio: "grupo",
  // notificationType del push
  nuevo_gasto: "gastos",
};

// Avisos que hablan de a quién transferir: abren Gastos en "Transferencias".
const VER_TRANSFERENCIAS = new Set([
  "settlement_updated",
  "transfer_reported",
  "transfer_rejected",
  "liquidacion_actualizada",
  "transferencia_informada",
  "transferencia_rechazada",
]);

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

  const verTransferencias =
    VER_TRANSFERENCIAS.has(data.eventType) ||
    VER_TRANSFERENCIAS.has(data.notificationType) ||
    VER_TRANSFERENCIAS.has(data.tipo);

  return {
    tripId,
    initialTab,
    gastosView: verTransferencias ? "transferencias" : undefined,
    activityId: data.activityId,
    dayId: data.dayId,
    expenseId: data.expenseId,
    votingId: data.votingId,
  };
}
