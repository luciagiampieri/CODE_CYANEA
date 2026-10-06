import { getTodayIso } from "./dates";

/**
 * Fase de un viaje y sus etiquetas, compartido por Home y Mis viajes para que
 * las dos pantallas muestren siempre lo mismo.
 *
 * Fases:
 *  - "en_curso": hoy está entre la fecha de inicio y la de fin (ambas inclusive).
 *  - "proximo":  todavía no empezó.
 *  - "pasado":   ya terminó (desde el día siguiente a la fecha de fin), lo abandonaste,
 *                o el backend lo marca finalizado / cancelado / eliminado.
 *
 * Las fechas se comparan como días "YYYY-MM-DD" en hora local. Antes se usaba
 * `new Date("2026-10-06")`, que JS interpreta como medianoche UTC (21 hs del día
 * anterior en Argentina): un viaje que terminaba hoy figuraba finalizado desde
 * la noche anterior y uno que empezaba mañana figuraba "en curso" desde las 21 hs.
 */

const ESTADOS_INACTIVOS = new Set(["finalizado", "cancelado", "eliminado"]);

export const PHASE_ORDER = { en_curso: 0, proximo: 1, pasado: 2 };

/** "2026-10-06", "2026-10-06T00:00:00", Date → "2026-10-06" (o null). */
export function toDayKey(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function getTripStartKey(trip) {
  return toDayKey(trip.startDate ?? trip.FechaInicio);
}

export function getTripEndKey(trip) {
  return toDayKey(trip.endDate ?? trip.FechaFin);
}

export function getTripPhase(trip, today = getTodayIso()) {
  const status = String(trip.status ?? trip.Estado ?? "").toLowerCase();
  const hasLeft = trip.hasLeft ?? trip.HasLeft ?? false;
  const start = getTripStartKey(trip);
  const end = getTripEndKey(trip);

  if (hasLeft || ESTADOS_INACTIVOS.has(status) || (end && end < today)) return "pasado";
  if (start && start > today) return "proximo";
  return "en_curso";
}

/** Id del viaje próximo que arranca primero (el que lleva el badge "Próximo"). */
export function getNextTripId(trips, today = getTodayIso()) {
  let next = null;
  for (const trip of trips) {
    if (getTripPhase(trip, today) !== "proximo") continue;
    const start = getTripStartKey(trip) ?? "9999-12-31";
    if (next === null || start < next.start) next = { id: trip.id ?? trip.IdViaje, start };
  }
  return next?.id ?? null;
}

/** Badges de un viaje: mismos textos y colores en Home y en Mis viajes. */
export function getTripBadges({ phase, hasLeft = false, isNext = false }) {
  if (hasLeft) return [{ tone: "saliste", label: "Saliste" }];
  if (phase === "pasado") return [{ tone: "finalizado", label: "Finalizado" }];
  if (phase === "en_curso") return [{ tone: "activo", label: "En curso" }];

  const badges = [{ tone: "planificando", label: "Planificando" }];
  if (isNext) badges.unshift({ tone: "proximo", label: "Próximo" });
  return badges;
}