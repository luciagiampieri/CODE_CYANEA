/**
 * Reglas de edición de un viaje, en un solo lugar.
 *
 * - Si el usuario dejó el viaje (hasLeft): todo es de solo lectura.
 * - Si el viaje finalizó: todo es de solo lectura salvo Gastos, porque las
 *   cuentas se suelen cerrar después de volver.
 *
 * El backend valida lo mismo y responde 409 (TRIP_FINISHED); esto solo
 * decide qué mostrar.
 */

export const TRIP_FINISHED_CODE = "TRIP_FINISHED";

const EDITABLE_WHEN_FINISHED = new Set(["gastos"]);

const EDITABLE_WHEN_OFFLINE = new Set(["gastos"]);

const LOCKED_TABS_WHEN_FINISHED = new Set(["itinerario", "docs", "checklist", "votar", "grupo"]);

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function toLocalDate(isoDate) {
  if (!isoDate) return null;
  const date = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLongDate(isoDate) {
  const date = toLocalDate(isoDate);
  if (!date) return null;
  return `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addOneMonth(date) {
  if (!date) return null;
  const year = date.getFullYear() + (date.getMonth() === 11 ? 1 : 0);
  const month = (date.getMonth() + 1) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDay));
}


export function getInfoEditableUntil(trip) {
  if (!trip) return null;
  return toLocalDate(trip.infoEditableUntil) ?? addOneMonth(toLocalDate(trip.endDate));
}


export function isTripFinished(trip, today = new Date()) {
  if (!trip) return false;
  const status = String(trip.status ?? "").trim().toLowerCase();
  if (status) return status === "finalizado";

  const end = toLocalDate(trip.endDate);
  if (!end) return false;
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  return end < startOfToday;
}

export function getTripLock(trip, today = new Date(), opciones = {}) {
  const hasLeft = Boolean(trip?.hasLeft);
  const isFinished = isTripFinished(trip, today);
  const sinConexion = Boolean(opciones?.sinConexion);

  const infoEditableUntil = getInfoEditableUntil(trip);
  const canEditInfo =
    Boolean(trip) &&
    !hasLeft &&
    (!infoEditableUntil || startOfDay(today) <= startOfDay(infoEditableUntil));

  function canEdit(section) {
    if (!trip || hasLeft) return false;
    if (sinConexion) return EDITABLE_WHEN_OFFLINE.has(section);
    if (section === "viaje") return canEditInfo;
    if (isFinished) return EDITABLE_WHEN_FINISHED.has(section);
    return true;
  }


  function isTabLocked(tabId) {
    if (hasLeft) return false;
    return isFinished && LOCKED_TABS_WHEN_FINISHED.has(tabId);
  }

  return {
    hasLeft,
    isFinished,
    sinConexion,
    readOnly: hasLeft || isFinished || sinConexion,
    endDateLabel: formatLongDate(trip?.endDate),
    infoEditableUntilLabel: infoEditableUntil
      ? `${infoEditableUntil.getDate()} de ${MONTHS[infoEditableUntil.getMonth()]}`
      : null,
    canEdit,
    isTabLocked,
  };
}

export function isTripFinishedError(error) {
  if (!error) return false;
  if (error.code === TRIP_FINISHED_CODE) return true;
  return error.status === 409 && /viaje ya finaliz/i.test(error.message ?? "");
}