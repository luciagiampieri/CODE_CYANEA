export function regresionLineal(valores) {
  const n = valores?.length ?? 0;
  if (n < 2) return null;
  let sumaX = 0;
  let sumaY = 0;
  let sumaXY = 0;
  let sumaXX = 0;
  valores.forEach((y, x) => {
    sumaX += x;
    sumaY += y;
    sumaXY += x * y;
    sumaXX += x * x;
  });
  const divisor = n * sumaXX - sumaX * sumaX;
  if (divisor === 0) return null;
  const pendiente = (n * sumaXY - sumaX * sumaY) / divisor;
  const ordenada = (sumaY - pendiente * sumaX) / n;
  return { pendiente, ordenada };
}

export function lineaTendencia(valores) {
  const recta = regresionLineal(valores);
  return recta ? valores.map((_, x) => recta.ordenada + recta.pendiente * x) : null;
}

export function variacion(actual, anterior) {
  if (typeof actual !== 'number' || typeof anterior !== 'number') return null;
  if (anterior === 0) return actual === 0 ? { porcentaje: 0, direccion: 'igual' } : null;
  const porcentaje = Math.round(((actual - anterior) / anterior) * 100);
  let direccion = 'igual';
  if (porcentaje > 0) direccion = 'sube';
  if (porcentaje < 0) direccion = 'baja';
  return { porcentaje, direccion };
}

export function describirTendencia(valores, agrupacion) {
  const recta = regresionLineal(valores);
  if (!recta) return 'Sin datos suficientes';
  const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
  const relativa = promedio ? Math.abs(recta.pendiente) / promedio : 0;
  if (Math.abs(recta.pendiente) < 0.01 || relativa < 0.01) return 'Estable';
  const unidad = agrupacion === 'mes' ? 'mes' : 'día';
  const magnitud = Math.abs(recta.pendiente).toLocaleString('es-AR', { maximumFractionDigits: 1 });
  return recta.pendiente > 0
    ? `En alza (+${magnitud} por ${unidad})`
    : `En baja (−${magnitud} por ${unidad})`;
}

export function mesDestacado(filas) {
  if (!filas?.length) return null;
  const totales = Array.from({ length: 12 }, (_, mes) =>
    filas.reduce((suma, fila) => suma + (fila.meses[mes] || 0), 0)
  );
  const maximo = Math.max(...totales);
  if (maximo === 0) return null;
  return { mes: totales.indexOf(maximo), total: maximo };
}