// US 92: helpers puros para mostrar y seleccionar los días y franjas libres.

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function aMinutos(hhmm) {
  const [h, m] = String(hhmm ?? "").slice(0, 5).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

export function claveFranja(franja) {
  return `${franja.IdDiaCronograma}|${franja.HoraInicio}|${franja.HoraFin}`;
}

/** "2026-10-19" -> "Lunes 19 de octubre" (sin depender de la zona horaria). */
export function fechaLegible(fechaISO) {
  const [y, m, d] = String(fechaISO ?? "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  const fecha = new Date(y, m - 1, d, 12);
  return `${DIAS[fecha.getDay()]} ${d} de ${MESES[m - 1]}`;
}

export function textoFranja(franja) {
  const rango = `${franja.HoraInicio} – ${franja.HoraFin}`;
  if (franja.DiaCompleto) return `Día libre · ${rango}`;
  const minutos = aMinutos(franja.HoraFin) - aMinutos(franja.HoraInicio);
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  const duracion = resto ? `${horas} h ${resto} min` : `${horas} h`;
  return `${rango} · ${duracion} libres`;
}

/** Agrupa franjas o resultados por día, respetando el orden en que llegan. */
export function agruparPorDia(items) {
  const grupos = [];
  const porDia = new Map();
  (items ?? []).forEach((item) => {
    let grupo = porDia.get(item.IdDiaCronograma);
    if (!grupo) {
      grupo = {
        IdDiaCronograma: item.IdDiaCronograma,
        Fecha: item.Fecha,
        IndiceDia: item.IndiceDia ?? null,
        items: [],
      };
      porDia.set(item.IdDiaCronograma, grupo);
      grupos.push(grupo);
    }
    grupo.items.push(item);
  });
  return grupos;
}

/** Mensaje si la selección supera las solicitudes que le quedan hoy al viaje (RNF-36). */
export function avisoLimiteSeleccion(cantidad, restantes) {
  if (cantidad <= restantes) return null;
  if (restantes <= 0) {
    return "El viaje ya usó todas las solicitudes de sugerencias de hoy. Podés intentar mañana.";
  }
  const disponibles = restantes === 1 ? "queda 1 solicitud" : `quedan ${restantes} solicitudes`;
  return `Seleccionaste ${cantidad} franjas, pero hoy ${disponibles}. Cada franja cuenta como una solicitud.`;
}

export function payloadCompletar(franjas, { continuarSinPreferencias = false } = {}) {
  return {
    ContinuarSinPreferencias: continuarSinPreferencias,
    Franjas: franjas.map((f) => ({
      IdDiaCronograma: f.IdDiaCronograma,
      HoraInicio: f.HoraInicio,
      HoraFin: f.HoraFin,
    })),
  };
}
