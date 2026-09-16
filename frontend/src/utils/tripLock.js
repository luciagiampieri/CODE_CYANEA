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

// Secciones que siguen editables cuando el viaje terminó.
const EDITABLE_WHEN_FINISHED = new Set(["gastos"]);

// Pestañas de TripDetailScreen que quedan bloqueadas al finalizar.
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

/**
 * Último día en que el admin puede editar los datos generales del viaje
 * (título, fechas, destinos, portada). Lo calcula el backend
 * (infoEditableUntil = fecha de fin + 1 mes); si no vino, se calcula igual acá.
 */
export function getInfoEditableUntil(trip) {
  if (!trip) return null;
  return toLocalDate(trip.infoEditableUntil) ?? addOneMonth(toLocalDate(trip.endDate));
}

/**
 * El backend calcula el estado (status "finalizado" desde el día siguiente a
 * la fecha de fin), así que si viene, es la fuente de verdad. La comparación
 * de fechas es solo un respaldo para datos sin estado.
 */
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

export function getTripLock(trip, today = new Date()) {
  const hasLeft = Boolean(trip?.hasLeft);
  const isFinished = isTripFinished(trip, today);

  const infoEditableUntil = getInfoEditableUntil(trip);
  const canEditInfo =
    Boolean(trip) &&
    !hasLeft &&
    (!infoEditableUntil || startOfDay(today) <= startOfDay(infoEditableUntil));

  function canEdit(section) {
    if (!trip || hasLeft) return false;
    // Los datos generales del viaje tienen su propio plazo (un mes después del fin).
    if (section === "viaje") return canEditInfo;
    if (isFinished) return EDITABLE_WHEN_FINISHED.has(section);
    return true;
  }

  // Candado en la pestaña: solo para viajes finalizados. Quien dejó el viaje
  // ya ve todo en solo lectura y tiene su propio aviso.
  function isTabLocked(tabId) {
    if (hasLeft) return false;
    return isFinished && LOCKED_TABS_WHEN_FINISHED.has(tabId);
  }

  return {
    hasLeft,
    isFinished,
    readOnly: hasLeft || isFinished,
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
  // En web el header puede no ser legible si CORS no lo expone.
  return error.status === 409 && /viaje ya finaliz/i.test(error.message ?? "");
}