export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function aISO(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

export function rangoUltimosDias(dias) {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  return { desde: aISO(desde), hasta: aISO(hasta) };
}

export function formatearISO(iso) {
  const [anio, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

export function etiquetaCorta(iso, agrupacion) {
  const [anio, mes, dia] = iso.split('-');
  return agrupacion === 'mes' ? `${MESES_CORTOS[Number(mes) - 1]} ${anio.slice(2)}` : `${dia}/${mes}`;
}

export function etiquetaLarga(iso, agrupacion) {
  const [anio, mes] = iso.split('-');
  return agrupacion === 'mes' ? `${MESES_CORTOS[Number(mes) - 1]} ${anio}` : formatearISO(iso);
}

export function diasDelRango(desde, hasta) {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
}

export function formatearNumero(valor, moneda) {
  if (valor === null || valor === undefined) return '—';
  if (moneda) {
    return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  }
  return valor.toLocaleString('es-AR');
}

export function escalaRedonda(maximo) {
  const tope = Math.ceil(maximo);
  if (tope <= 4) return 4;
  const magnitud = 10 ** Math.floor(Math.log10(tope));
  if (magnitud === 1) return tope + (tope % 2);
  return Math.ceil(tope / magnitud) * magnitud;
}

export function validarRango({ desde, hasta }, hoy) {
  if (!desde || !hasta) return 'Completá ambas fechas.';
  if (hasta < desde) return 'La fecha de fin no puede ser anterior a la fecha de inicio.';
  if (hasta > hoy) return 'La fecha de fin no puede ser posterior a hoy.';
  return '';
}