/**
 * Reglas del formulario de gasto precargado desde un comprobante (US 94).
 * Funciones puras para poder probarlas sin renderizar la pantalla.
 */
import { formatDateDisplay } from "./dates";

export const MONEDA_PESOS_ARGENTINOS = "ARS";

/**
 * Interpreta un monto ingresado por el usuario (acepta coma o punto decimal).
 * RN-21: el monto debe ser numérico y mayor a cero.
 * Devuelve { valor } si es válido o { error } con el mensaje a mostrar.
 */
export function parsearMonto(texto, { obligatorio = "El monto es obligatorio" } = {}) {
  const limpio = String(texto ?? "").trim().replace(",", ".");
  if (!limpio) return { error: obligatorio };
  if (!/^\d+(\.\d+)?$/.test(limpio)) return { error: "El monto debe ser un número válido" };
  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor <= 0) return { error: "El monto debe ser mayor a cero" };
  return { valor };
}

/** RN-39: un gasto escaneado en otra moneda requiere el monto convertido a ARS. */
export function requiereConversionARS(moneda) {
  return Boolean(moneda) && String(moneda).toUpperCase() !== MONEDA_PESOS_ARGENTINOS;
}

function soloFecha(valor) {
  return valor ? String(valor).slice(0, 10) : "";
}

/** true si la fecha (YYYY-MM-DD) cae antes del inicio o después del fin del viaje. */
export function fechaFueraDelViaje(fechaIso, fechaInicio, fechaFin) {
  const fecha = soloFecha(fechaIso);
  const inicio = soloFecha(fechaInicio);
  const fin = soloFecha(fechaFin);
  if (!fecha || (!inicio && !fin)) return false;
  return (inicio && fecha < inicio) || (fin && fecha > fin) ? true : false;
}

/**
 * Nota informativa cuando la fecha cae fuera del viaje (AC8). No bloquea:
 * pagar antes del viaje (reservas, excursiones, pasajes) es normal; la nota
 * sirve para detectar una fecha mal leída del comprobante. null si no aplica.
 */
export function mensajeFechaFueraDelViaje(fechaIso, fechaInicio, fechaFin) {
  const fecha = soloFecha(fechaIso);
  const inicio = soloFecha(fechaInicio);
  const fin = soloFecha(fechaFin);
  if (!fecha) return null;
  if (inicio && fecha < inicio) {
    return `La fecha es anterior al inicio del viaje (${formatDateDisplay(inicio)})`;
  }
  if (fin && fecha > fin) {
    return `La fecha es posterior al fin del viaje (${formatDateDisplay(fin)})`;
  }
  return null;
}
