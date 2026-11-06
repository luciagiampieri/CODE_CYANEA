import { formatDayMonth, formatLongWeekdayDayMonth, formatWeekdayDayMonth } from "./dates";
import { calcularNochesViaje } from "./recorrido";

// Traslados del viaje (US 136). Las fechas, el estado y la validez de cada tramo los
// calcula el backend desde el recorrido; acá solo se presentan.

export const TIPOS_TRAMO = {
  IDA: "ida",
  ENTRE_DESTINOS: "entre_destinos",
  REGRESO: "regreso",
};

export const VALIDEZ = {
  VALIDO: "valido",
  NO_CORRESPONDE: "no_corresponde",
  SIN_FECHA: "sin_fecha",
};

export const ESTADOS_TRAMO = {
  PENDIENTE: "pendiente",
  OCULTO: "oculto",
  AGENDADO: "agendado",
};

export const MEDIOS_TRASLADO = [
  { name: "plane", label: "Avión", nombre: "Avión" },
  { name: "bus", label: "Micro", nombre: "Micro" },
  { name: "car", label: "Auto", nombre: "Auto" },
  { name: "train", label: "Tren", nombre: "Tren" },
  { name: "ship", label: "Barco o ferry", nombre: "Barco" },
  { name: "motorcycle", label: "Moto", nombre: "Moto" },
  { name: "bicycle", label: "Bicicleta", nombre: "Bicicleta" },
  { name: "person-walking", label: "A pie", nombre: "Caminando" },
  { name: "route", label: "Otro", nombre: "Traslado" },
];

export const ACLARACION_FECHAS = "Los días salen del recorrido del viaje.";
export const SIN_FECHA = "Sin fecha hasta armar el recorrido";
export const AVISO_SIN_FECHA = "Este traslado no tiene fecha porque el recorrido no está armado";
export const AVISO_NO_CORRESPONDE = "Este traslado ya no corresponde al recorrido";
export const AVISO_REVISAR_HORARIO = "Revisá el horario: la llegada quedó antes de la salida";

export function tituloTarjeta(tramo) {
  if (tramo.tipo === TIPOS_TRAMO.REGRESO) return "¿Cómo vuelven?";
  if (tramo.tipo === TIPOS_TRAMO.IDA) return `¿Cómo llegan a ${tramo.nombreLlegada}?`;
  return `¿Cómo viajan a ${tramo.nombreLlegada}?`;
}

export function subtextoTarjeta(tramo) {
  if (tramo.tipo === TIPOS_TRAMO.REGRESO) return `Salen de ${tramo.nombreOrigen}`;
  if (tramo.tipo === TIPOS_TRAMO.IDA) return "Es el viaje de llegada";
  return `Salen de ${tramo.nombreOrigen}`;
}

export function tituloFormulario(tramo) {
  if (tramo.tipo === TIPOS_TRAMO.REGRESO) return "Regreso";
  return `Traslado a ${tramo.nombreLlegada}`;
}

// Mismo criterio que `nombre_traslado` del backend, que es quien guarda el nombre.
export function nombreTraslado(medio, tramo) {
  const nombre = MEDIOS_TRASLADO.find((opcion) => opcion.name === medio)?.nombre ?? "Traslado";
  if (tramo.tipo === TIPOS_TRAMO.REGRESO) return `${nombre} de regreso`;
  return `${nombre} a ${tramo.nombreLlegada}`;
}

// "Miércoles 5 nov · Día 4". Un tramo sin fecha no tiene día.
export function subtituloDia(tramo, dias = []) {
  const fecha = tramo.fechaSalida ?? tramo.fechaLlegada;
  if (!fecha) return "";
  const dia = dias.find((item) => String(item.fechaRaw ?? "").slice(0, 10) === fecha);
  const texto = formatLongWeekdayDayMonth(fecha);
  return dia ? `${texto} · Día ${dia.dayIndex}` : texto;
}

// Paradas de la caja de recorrido. El viaje no guarda un punto de partida ni de vuelta:
// la ida solo tiene destino y el regreso, origen.
export function paradasDelTramo(tramo) {
  const sinFecha = tramo.validez === VALIDEZ.SIN_FECHA;
  const salida = tramo.fechaSalida ? `Salen el ${formatWeekdayDayMonth(tramo.fechaSalida)}` : "";
  const llegada = tramo.fechaLlegada ? `Llegan el ${formatWeekdayDayMonth(tramo.fechaLlegada)}` : "";
  return {
    nochesEnViaje: llegaOtroDia(tramo)
      ? calcularNochesViaje(tramo.fechaSalida, tramo.fechaLlegada)
      : 0,
    origen: tramo.nombreOrigen
      ? { nombre: tramo.nombreOrigen, fecha: sinFecha ? SIN_FECHA : salida }
      : null,
    llegada: tramo.nombreLlegada ? { nombre: tramo.nombreLlegada, fecha: llegada } : null,
  };
}

// Etiqueta de la caja de recorrido según las horas que pide el tramo.
export function etiquetaHoras(tramo) {
  if (tramo.tipo === TIPOS_TRAMO.IDA) return "Llegada";
  if (tramo.tipo === TIPOS_TRAMO.REGRESO) return "Salida";
  return "Salida y llegada";
}

export function textoOculto(tramo) {
  if (tramo.tipo === TIPOS_TRAMO.REGRESO) return "Regreso oculto";
  if (tramo.tipo === TIPOS_TRAMO.IDA) return `Llegada a ${tramo.nombreLlegada} oculta`;
  return `Traslado a ${tramo.nombreLlegada} oculto`;
}

export function llegaOtroDia(tramo) {
  return Boolean(
    tramo?.fechaSalida && tramo?.fechaLlegada && tramo.fechaSalida !== tramo.fechaLlegada
  );
}

// `horaInicio` es la salida y `horaFin` la llegada.
export function textoHorario(traslado, horaInicio, horaFin) {
  if (traslado.tipo === TIPOS_TRAMO.IDA) return `Llega ${horaFin}`;
  if (traslado.tipo === TIPOS_TRAMO.REGRESO) return `Sale ${horaInicio}`;
  if (llegaOtroDia(traslado)) {
    return `Sale ${horaInicio} · llega el ${formatDayMonth(traslado.fechaLlegada)} ${horaFin}`;
  }
  return `${horaInicio} → ${horaFin}`;
}

// Cartel del traslado agendado, o null si no hay nada para avisar.
export function avisoDeTraslado(traslado) {
  if (traslado?.validez === VALIDEZ.NO_CORRESPONDE) {
    return { tono: "danger", mensaje: AVISO_NO_CORRESPONDE };
  }
  if (traslado?.validez === VALIDEZ.SIN_FECHA) {
    return { tono: "danger", mensaje: AVISO_SIN_FECHA };
  }
  if (traslado?.revisarHorario) return { tono: "warning", mensaje: AVISO_REVISAR_HORARIO };
  return null;
}

export function tramosSinAgendar(tramos = []) {
  return tramos.filter(
    (tramo) => tramo.validez === VALIDEZ.VALIDO && tramo.estado !== ESTADOS_TRAMO.AGENDADO
  );
}

export function tramosDelDia(tramos = [], dayId) {
  return tramosSinAgendar(tramos).filter((tramo) => tramo.idDiaCronograma === dayId);
}

export function refDeTramo(tramo) {
  return {
    tipo: tramo.tipo,
    idDestinoOrigen: tramo.idDestinoOrigen ?? null,
    idDestinoLlegada: tramo.idDestinoLlegada ?? null,
  };
}

export function etiquetaTramo(tramo) {
  if (tramo.tipo === TIPOS_TRAMO.REGRESO) return "Regreso";
  if (tramo.tipo === TIPOS_TRAMO.IDA) return `Ida a ${tramo.nombreLlegada}`;
  return `${tramo.nombreOrigen} → ${tramo.nombreLlegada}`;
}

export function pideSalida(tramo) {
  return tramo?.tipo !== TIPOS_TRAMO.IDA;
}

export function pideLlegada(tramo) {
  return tramo?.tipo !== TIPOS_TRAMO.REGRESO;
}

// Devuelve el mensaje de error o null. Un tramo sin fecha no se compara: no se sabe si
// llega otro día.
export function validarTraslado({ medio, tramo, horaSalida, horaLlegada }) {
  if (!tramo) return "Elegí el tramo del recorrido para este traslado.";
  if (!medio) return "Elegí el medio de transporte.";
  if (pideSalida(tramo) && !horaSalida) return "Ingresá la hora de salida.";
  if (pideLlegada(tramo) && !horaLlegada) return "Ingresá la hora de llegada.";

  const comparar =
    tramo.tipo === TIPOS_TRAMO.ENTRE_DESTINOS &&
    tramo.validez !== VALIDEZ.SIN_FECHA &&
    !llegaOtroDia(tramo);
  if (comparar && horaLlegada <= horaSalida) {
    return "La hora de llegada debe ser posterior a la de salida.";
  }
  return null;
}
