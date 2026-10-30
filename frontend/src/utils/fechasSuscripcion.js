// Fechas de suscripciones y pagos, siempre en hora de Argentina.
const OPCIONES = {
  timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const fechaCorta = (valor) => new Date(valor).toLocaleDateString('es-AR', OPCIONES);

// Arreglo fijo de meses para no depender de cómo abrevia cada motor de Intl.
function partes(valor) {
  const [dia, mes, anio] = fechaCorta(valor).split('/').map(Number);
  return { dia, mes: MESES[mes - 1], anio };
}

/** "25 oct – 25 nov 2026"; con años distintos, "25 dic 2026 – 25 ene 2027". */
export function formatearPeriodo(desde, hasta) {
  if (!desde || !hasta) return null;
  const inicio = partes(desde);
  const fin = partes(hasta);
  const textoInicio = inicio.anio === fin.anio ? `${inicio.dia} ${inicio.mes}` : `${inicio.dia} ${inicio.mes} ${inicio.anio}`;
  return `${textoInicio} – ${fin.dia} ${fin.mes} ${fin.anio}`;
}
