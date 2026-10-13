/** Datos del gasto que se va a registrar que usa la detección. */
export function criteriosDuplicado(gasto) {
  return {
    FechaGasto: gasto.FechaGasto,
    MontoOriginal: gasto.MontoOriginal,
    MonedaOriginal: gasto.MonedaOriginal,
    EsCompartido: Boolean(gasto.EsCompartido),
    IdPagador: gasto.EsCompartido ? gasto.IdPagador : null,
  };
}

export function avisoPosiblesDuplicados(cantidad = 1) {
  return cantidad > 1
    ? `Ya hay ${cantidad} gastos registrados con la misma fecha, monto, pagador y tipo.`
    : "Ya hay un gasto registrado con la misma fecha, monto, pagador y tipo.";
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function mismoDia(a, b) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * Cuándo se cargó un gasto, en la hora local del usuario: "hoy 18:20",
 * "ayer 9:05" o "12 oct 18:20" (con el año si no es el actual).
 */
export function formatFechaCarga(fechaIso, ahora = new Date()) {
  if (!fechaIso) return "";
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return "";

  const hora = `${fecha.getHours()}:${String(fecha.getMinutes()).padStart(2, "0")}`;
  const ayer = new Date(ahora);
  ayer.setDate(ahora.getDate() - 1);

  if (mismoDia(fecha, ahora)) return `hoy ${hora}`;
  if (mismoDia(fecha, ayer)) return `ayer ${hora}`;
  const anio = fecha.getFullYear() === ahora.getFullYear() ? "" : ` ${fecha.getFullYear()}`;
  return `${fecha.getDate()} ${MESES[fecha.getMonth()]}${anio} ${hora}`;
}
