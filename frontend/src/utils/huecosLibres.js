const MINUTOS_MINIMOS = 60;
const MINUTOS_MAXIMOS_SUGERIDOS = 240;
const ULTIMO_MINUTO_DEL_DIA = 23 * 60 + 59;

export function aMinutos(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

export function aHora(minutos) {
  const acotado = Math.max(0, Math.min(minutos, ULTIMO_MINUTO_DEL_DIA));
  const h = Math.floor(acotado / 60);
  const m = acotado % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}


export function calcularHuecosLibres(
  actividades,
  { inicioDia = "09:00", finDia = "23:00", minimo = MINUTOS_MINIMOS } = {}
) {
  const limiteFin = aMinutos(finDia);
  const bloques = (actividades ?? [])
    .map((a) => ({ inicio: aMinutos(a.horaInicio), fin: aMinutos(a.horaFin) }))
    .filter((b) => b.inicio != null && b.fin != null && b.fin > b.inicio)
    .sort((a, b) => a.inicio - b.inicio);

  const huecos = [];
  let cursor = aMinutos(inicioDia);
  for (const bloque of bloques) {
    const hasta = Math.min(bloque.inicio, limiteFin);
    if (hasta - cursor >= minimo) {
      huecos.push({ desde: aHora(cursor), hasta: aHora(hasta), minutos: hasta - cursor });
    }
    cursor = Math.max(cursor, bloque.fin);
  }
  if (limiteFin - cursor >= minimo) {
    huecos.push({ desde: aHora(cursor), hasta: aHora(limiteFin), minutos: limiteFin - cursor });
  }
  return huecos;
}

export function acotarFranja(franja, maximo = MINUTOS_MAXIMOS_SUGERIDOS) {
  if (!franja) return null;
  const inicio = aMinutos(franja.inicio);
  const fin = aMinutos(franja.fin);
  if (inicio == null || fin == null) return franja;
  return { inicio: aHora(inicio), fin: aHora(Math.min(fin, inicio + maximo)) };
}

export function primerHuecoLibre(actividades, opciones) {
  const [primero] = calcularHuecosLibres(actividades, opciones);
  return primero ? acotarFranja({ inicio: primero.desde, fin: primero.hasta }) : null;
}