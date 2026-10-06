// Lógica pura del itinerario: horarios, duraciones, huecos, superposiciones y estado "ahora / siguiente".
// Se mantiene fuera de las pantallas para poder probarla sin renderizar nada.

const MINUTOS_HUECO_MINIMO = 30;

export function toMinutes(valor) {
  if (typeof valor !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(valor.trim());
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
}

export function formatMinutes(total) {
  if (total == null) return "";
  const horas = String(Math.floor(total / 60)).padStart(2, "0");
  const minutos = String(total % 60).padStart(2, "0");
  return `${horas}:${minutos}`;
}

export function formatDuration(minutos) {
  if (minutos == null || minutos <= 0) return "";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

// Acepta la actividad ya normalizada (horaInicio/horaFin/time) o los nombres crudos del backend.
export function getActivityTimes(item) {
  let inicio = item?.horaInicio ?? item?.HoraInicio;
  let fin = item?.horaFin ?? item?.HoraFin;

  if (!inicio && typeof item?.time === "string") {
    const [a, b] = item.time.split("-").map((parte) => parte.trim());
    inicio = a;
    fin = b;
  } else if (!inicio && typeof item?.Hora === "string") {
    inicio = item.Hora;
  }

  const startMin = toMinutes(inicio);
  const endMin = toMinutes(fin);

  return {
    startMin,
    endMin: endMin != null && startMin != null && endMin > startMin ? endMin : null,
    start: formatMinutes(startMin),
    end: endMin != null && startMin != null && endMin > startMin ? formatMinutes(endMin) : "",
  };
}

// El lugar puede venir como objeto (nombre / name) o como texto.
export function getPlaceName(item) {
  const lugar = item?.lugarInteres;
  if (typeof lugar === "string" && lugar.trim()) return lugar.trim();
  if (lugar && typeof lugar === "object") {
    const nombre = lugar.nombre ?? lugar.Nombre ?? lugar.name ?? lugar.titulo ?? lugar.displayName;
    if (typeof nombre === "string" && nombre.trim()) return nombre.trim();
  }
  if (item?.idLugarInteres || lugar) return "Lugar guardado";
  return null;
}

export function ymdLocal(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export function isTodayISO(fechaRaw, ahora = new Date()) {
  if (typeof fechaRaw !== "string" || fechaRaw.length < 10) return false;
  return fechaRaw.slice(0, 10) === ymdLocal(ahora);
}

// Resumen para el encabezado del día: "Sin actividades", "1 actividad", "4 actividades".
export function resumenDelDia(actividades = []) {
  const cantidad = actividades.length;
  if (cantidad === 0) return "Sin actividades";
  return `${cantidad} ${cantidad === 1 ? "actividad" : "actividades"}`;
}

// Ordena por hora de inicio (las que no tienen hora van al final) y calcula, para cada una:
// duración, hueco libre previo, superposición con la anterior y estado si el día es hoy.
export function buildAgenda(actividades = [], { isToday = false, ahora = new Date() } = {}) {
  const ordenadas = actividades
    .map((item, indice) => ({ item, indice, ...getActivityTimes(item) }))
    .sort((a, b) => {
      if (a.startMin == null && b.startMin == null) return a.indice - b.indice;
      if (a.startMin == null) return 1;
      if (b.startMin == null) return -1;
      return a.startMin - b.startMin || a.indice - b.indice;
    });

  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  let siguienteAsignada = false;

  return ordenadas.map((entrada, posicion) => {
    const anterior = posicion > 0 ? ordenadas[posicion - 1] : null;
    const finAnterior = anterior ? anterior.endMin ?? null : null;

    let huecoLibre = null;
    let seSuperpone = false;
    if (finAnterior != null && entrada.startMin != null) {
      const diferencia = entrada.startMin - finAnterior;
      if (diferencia < 0) seSuperpone = true;
      else if (diferencia >= MINUTOS_HUECO_MINIMO) huecoLibre = formatDuration(diferencia);
    }

    let estado = null;
    if (isToday && entrada.startMin != null) {
      const fin = entrada.endMin ?? entrada.startMin;
      if (entrada.endMin != null && minutosAhora >= entrada.startMin && minutosAhora < entrada.endMin) {
        estado = "ahora";
      } else if (minutosAhora >= fin) {
        estado = "pasada";
      } else if (!siguienteAsignada) {
        estado = "siguiente";
        siguienteAsignada = true;
      }
    }

    return {
      item: entrada.item,
      start: entrada.start,
      end: entrada.end,
      duracion: entrada.endMin != null ? formatDuration(entrada.endMin - entrada.startMin) : "",
      huecoLibre,
      seSuperpone,
      estado,
    };
  });
}