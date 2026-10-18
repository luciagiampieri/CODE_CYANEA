// US 88: reglas puras para aceptar una sugerencia con un horario ajustado.

const PATRON_HORA = /^(\d{1,2}):(\d{2})(:\d{2})?$/;

/** Normaliza "9:30", "09:30" o "09:30:00" a "HH:MM". Devuelve null si no es una hora válida. */
export function normalizarHora(texto) {
  const match = PATRON_HORA.exec(String(texto ?? "").trim());
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas > 23 || minutos > 59) return null;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

/** Valida el horario elegido antes de confirmar. Devuelve el mensaje de error o null. */
export function validarHorarioSugerencia(inicio, fin) {
  const horaInicio = normalizarHora(inicio);
  const horaFin = normalizarHora(fin);
  if (!horaInicio || !horaFin) {
    return "Ingresá la hora de inicio y de fin con el formato HH:MM.";
  }
  if (horaFin <= horaInicio) {
    return "La hora de fin debe ser posterior a la hora de inicio.";
  }
  return null;
}

/** Texto de la advertencia de superposición con el detalle de las actividades. */
export function mensajeSuperposicion(resultado) {
  const detalle = (resultado?.Superpuestas ?? [])
    .map((a) => `• ${a.Nombre} (${a.HoraInicio} – ${a.HoraFin})`)
    .join("\n");
  const base = resultado?.Mensaje || "El horario se superpone con otras actividades del día.";
  return detalle ? `${base}\n\n${detalle}` : base;
}
