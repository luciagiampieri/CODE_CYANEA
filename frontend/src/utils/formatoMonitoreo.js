// Formatos del monitoreo de consumo de IA del backoffice (US 114).

function conComaDecimal(texto) {
  const [entero, decimales] = texto.split('.');
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales ? `${conMiles},${decimales}` : conMiles;
}

// Los costos por solicitud son de fracciones de centavo: debajo de 1 USD se
// muestran 4 decimales para que no aparezcan como 0,00.
export function formatearUSD(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
  const numero = Number(valor);
  const decimales = numero !== 0 && Math.abs(numero) < 1 ? 4 : 2;
  return `USD ${conComaDecimal(numero.toFixed(decimales))}`;
}

export function formatearDuracion(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${conComaDecimal((ms / 1000).toFixed(1))} s`;
}

export function formatearPorcentaje(valor) {
  if (valor === null || valor === undefined) return '—';
  return `${conComaDecimal(Number(valor).toFixed(Number.isInteger(valor) ? 0 : 1))}%`;
}

export function tasaDeFallas(fallidas, solicitudes) {
  if (!solicitudes) return null;
  return Math.round((fallidas / solicitudes) * 1000) / 10;
}

// Interpreta el umbral que escribe el administrador ("150", "150,50", "1.200,5").
export function parsearUmbral(texto) {
  const limpio = String(texto ?? '').trim().replace(/\s/g, '');
  if (!limpio) return { valor: null, error: 'Ingresá un umbral mayor a cero.' };
  let normalizado = limpio;
  if (limpio.includes(',')) {
    normalizado = limpio.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    // "1.200" es mil doscientos (separador de miles), no 1,2.
    normalizado = limpio.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) {
    return { valor: null, error: 'Ingresá un número válido, con hasta dos decimales.' };
  }
  const valor = Number(normalizado);
  if (!(valor > 0)) return { valor: null, error: 'Ingresá un umbral mayor a cero.' };
  return { valor, error: '' };
}

export const NIVELES_ALERTA = {
  sin_umbral: 'sin_umbral',
  normal: 'normal',
  advertencia: 'advertencia',
  superado: 'superado',
};
