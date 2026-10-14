const TAB_POR_EVENTO = {
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
  voting_activity_added: "itinerario",
  voting_tie: "votar",
  voting_tie_expired: "votar",
  voting_day_missing: "votar",
};

const TAB_POR_TIPO = {
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
  nuevo_administrador: "grupo",
  participante_salio: "grupo",
  actividad_incorporada_votacion: "itinerario",
  votacion_empate: "votar",
  votacion_empate_vencido: "votar",
  votacion_dia_inexistente: "votar",
  nuevo_gasto: "gastos",
};

const VER_TRANSFERENCIAS = new Set([
  "settlement_updated",
  "transfer_reported",
  "transfer_rejected",
  "liquidacion_actualizada",
  "transferencia_informada",
  "transferencia_rechazada",
]);

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