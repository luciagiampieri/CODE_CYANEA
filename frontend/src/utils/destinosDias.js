import { colorDeDestino, colorSuaveDeDestino, colorTinteDeDestino, colors } from "../theme/tokens";
import { formatDuration } from "./agenda";
import { formatWeekdayDay } from "./dates";
import {
  MODOS_RECORRIDO,
  calcularNochesViaje,
  calcularTramos,
  modoRecorrido,
  sumarDias,
  textoNoches,
  textoRangoTramo,
} from "./recorrido";
import { TIPOS_TRAMO, VALIDEZ } from "./traslados";

// Destino de cada día del itinerario (US 138). Todo se deriva del recorrido con
// `calcularTramos`; sin recorrido armado no hay nada para mostrar.

export const TIPOS_DIA = {
  EN_DESTINO: "enDestino",
  TRASLADO: "traslado",
  SALIDA_EN_VIAJE: "salidaEnViaje",
  EN_VIAJE: "enViaje",
  LLEGADA: "llegada",
  ULTIMO: "ultimo",
  ULTIMO_EN_DESTINO: "ultimoEnDestino",
  SIN_DESTINO: "sinDestino",
};

const SECCION_SIN_DESTINO = "sinDestino";
const MINUTOS_DEL_DIA = 24 * 60;
// 35 %: el color suave del destino no se vería sobre el fondo de su propia zona.
const OPACIDAD_LINEA_ZONA = "59";

function fechaDe(valor) {
  return String(valor ?? "").slice(0, 10);
}

// Información de cada fecha del viaje, o null si el itinerario no muestra destinos.
// `indices` son las posiciones de los destinos del día: dos en un día de traslado y
// ninguna en los días en viaje o sin destino.
export function clasificarDias(destinos = [], startDate, endDate) {
  if (!startDate || !endDate) return null;
  const totalNoches = calcularNochesViaje(startDate, endDate);
  if (modoRecorrido(destinos, totalNoches) !== MODOS_RECORRIDO.ARMADO) return null;

  const tramos = calcularTramos(destinos, startDate);
  const dias = new Map();

  destinos.forEach((destino, indice) => {
    const tramo = tramos[indice];
    const siguiente = destinos[indice + 1];
    const llegoPorTraslado = indice > 0 && tramos[indice - 1].nochesEnViaje === 0;
    const llegoEnViaje = indice > 0 && !llegoPorTraslado;

    for (let noche = 0; noche < destino.noches; noche += 1) {
      // El primer día después de un traslado sin noches en viaje ya es el día de traslado.
      if (noche > 0 || !llegoPorTraslado) {
        dias.set(sumarDias(tramo.llegada, noche), {
          tipo: noche === 0 && llegoEnViaje ? TIPOS_DIA.LLEGADA : TIPOS_DIA.EN_DESTINO,
          indices: [indice],
          seccion: indice,
          destino: destino.name,
          noche: noche + 1,
          totalNoches: destino.noches,
        });
      }
    }

    if (!siguiente) {
      dias.set(tramo.salida, {
        tipo: tramo.salida === endDate ? TIPOS_DIA.ULTIMO : TIPOS_DIA.ULTIMO_EN_DESTINO,
        indices: [indice],
        seccion: indice,
        destino: destino.name,
      });
      return;
    }

    const viaje = { origen: destino.name, destino: siguiente.name, seccion: indice };
    if (tramo.nochesEnViaje === 0) {
      dias.set(tramo.salida, { ...viaje, tipo: TIPOS_DIA.TRASLADO, indices: [indice, indice + 1] });
      return;
    }
    dias.set(tramo.salida, { ...viaje, tipo: TIPOS_DIA.SALIDA_EN_VIAJE, indices: [indice] });
    for (let noche = 1; noche < tramo.nochesEnViaje; noche += 1) {
      dias.set(sumarDias(tramo.salida, noche), { ...viaje, tipo: TIPOS_DIA.EN_VIAJE, indices: [] });
    }
  });

  let fecha = sumarDias(tramos[tramos.length - 1].salida, 1);
  while (fecha <= endDate) {
    dias.set(fecha, {
      tipo: TIPOS_DIA.SIN_DESTINO,
      indices: [],
      seccion: SECCION_SIN_DESTINO,
      ultimoDelViaje: fecha === endDate,
    });
    fecha = sumarDias(fecha, 1);
  }
  return dias;
}

// Chip de los días especiales; los días normales no llevan.
export function chipDelDia(info) {
  switch (info?.tipo) {
    case TIPOS_DIA.TRASLADO:
      return {
        ruta: [
          { nombre: info.origen, color: colorDeDestino(info.indices[0]) },
          { nombre: info.destino, color: colorDeDestino(info.indices[1]) },
        ],
      };
    case TIPOS_DIA.SALIDA_EN_VIAJE:
      return { icono: "moon", texto: `Hoy viajan a ${info.destino}` };
    case TIPOS_DIA.EN_VIAJE:
      return { texto: `En viaje · ${info.origen} → ${info.destino}` };
    case TIPOS_DIA.LLEGADA:
      return { icono: "location-dot", texto: `Llegada a ${info.destino}` };
    case TIPOS_DIA.ULTIMO:
      return { icono: "flag", texto: "Último día" };
    case TIPOS_DIA.ULTIMO_EN_DESTINO:
      return { icono: "flag", texto: `Último día en ${info.destino}` };
    case TIPOS_DIA.SIN_DESTINO:
      return {
        texto: info.ultimoDelViaje ? "Sin destino asignado · Último día" : "Sin destino asignado",
      };
    default:
      return null;
  }
}

// En el calendario el día normal también lleva chip, con el color de su destino.
export function chipDelDiaCalendario(info) {
  if (info?.tipo !== TIPOS_DIA.EN_DESTINO) return chipDelDia(info);
  const indice = info.indices[0];
  return {
    icono: "location-dot",
    texto: `En ${info.destino}`,
    color: colorDeDestino(indice),
    fondo: colorSuaveDeDestino(indice),
  };
}

// Colores de la marca del día en el calendario: dos en un día de traslado.
export function coloresDelDia(info) {
  if (!info) return [];
  return info.indices.length > 0 ? info.indices.map(colorDeDestino) : [colors.borderStrong];
}

export function accesosDeDestino(destinos, startDate, fotos = {}) {
  const tramos = calcularTramos(destinos, startDate);
  return destinos.map((destino, indice) => ({
    indice,
    nombre: destino.name,
    rango: textoRangoTramo(tramos[indice]),
    noches: destino.noches,
    color: colorDeDestino(indice),
    primeraFecha: tramos[indice].llegada,
    foto: fotos[destino.name],
  }));
}

function encabezadoSinDestino(cantidad) {
  return {
    indice: null,
    nombre: `Sin destino asignado · ${textoNoches(cantidad)}`,
    color: colors.textMuted,
  };
}

// Encabezado que va antes de cada día, por `dayId`: solo los días que abren una sección.
export function encabezadosPorDia(dias, accesos) {
  const sinDestino = dias.filter((dia) => dia.infoDestino?.seccion === SECCION_SIN_DESTINO).length;
  const encabezados = {};
  let seccionActual;

  dias.forEach((dia) => {
    const seccion = dia.infoDestino?.seccion;
    if (seccion === undefined || seccion === seccionActual) return;
    seccionActual = seccion;
    if (seccion === SECCION_SIN_DESTINO) {
      encabezados[dia.dayId] = encabezadoSinDestino(sinDestino);
      return;
    }
    const acceso = accesos[seccion];
    encabezados[dia.dayId] = {
      indice: seccion,
      nombre: acceso.nombre,
      detalle: `${acceso.rango} · ${textoNoches(acceso.noches)}`,
      color: acceso.color,
      foto: acceso.foto,
    };
  });
  return encabezados;
}

function esTrasladoDelDia(actividad) {
  const traslado = actividad.traslado;
  return traslado?.tipo === TIPOS_TRAMO.ENTRE_DESTINOS && traslado.validez === VALIDEZ.VALIDO;
}

function destinoVisual(nombre, indice, fotos, idDestino = null) {
  return {
    nombre,
    idDestino,
    color: colorDeDestino(indice),
    linea: `${colorDeDestino(indice)}${OPACIDAD_LINEA_ZONA}`,
    suave: colorSuaveDeDestino(indice),
    tinte: colorTinteDeDestino(indice),
    foto: fotos[nombre],
  };
}

// Reparte un día de traslado agendado: lo que empieza antes de la salida es del destino de
// salida y el resto, del de llegada. Misma regla que `separar_actividades_dia` del backend.
export function separarActividadesDia(actividades = [], info, fotos = {}) {
  if (info?.tipo !== TIPOS_DIA.TRASLADO) return null;
  const traslado = actividades.find(esTrasladoDelDia);
  if (!traslado) return null;

  const comunes = actividades.filter((actividad) => actividad !== traslado);
  const despues = comunes.filter((actividad) => actividad.horaInicio >= traslado.horaInicio);
  return {
    traslado,
    antes: comunes.filter((actividad) => actividad.horaInicio < traslado.horaInicio),
    despues,
    superpuestas: despues.filter((actividad) => actividad.horaInicio < traslado.horaFin),
    salida: destinoVisual(
      info.origen,
      info.indices[0],
      fotos,
      traslado.traslado.idDestinoOrigen
    ),
    llegada: destinoVisual(
      info.destino,
      info.indices[1],
      fotos,
      traslado.traslado.idDestinoLlegada
    ),
  };
}

function minutos(hora) {
  const [horas, resto] = String(hora ?? "").split(":").map(Number);
  return horas * 60 + resto;
}

// Tiempo de viaje, contando las noches en viaje. Con la llegada antes de la salida no hay
// duración posible.
export function duracionTraslado(item) {
  const { fechaSalida, fechaLlegada } = item.traslado;
  const dias = fechaSalida && fechaLlegada ? calcularNochesViaje(fechaSalida, fechaLlegada) : 0;
  const total = dias * MINUTOS_DEL_DIA + minutos(item.horaFin) - minutos(item.horaInicio);
  return total > 0 ? formatDuration(total) : "";
}

// Datos de la tarjeta del viaje: traslado entre destinos válido en su día de salida.
function viajeDelDia(info, actividades, separacion) {
  const esMismoDia = info?.tipo === TIPOS_DIA.TRASLADO;
  if (!esMismoDia && info?.tipo !== TIPOS_DIA.SALIDA_EN_VIAJE) return null;
  const item = separacion?.traslado ?? actividades.find(esTrasladoDelDia);
  if (!item) return null;

  const indiceSalida = info.indices[0];
  const fechaLlegada = item.traslado.fechaLlegada;
  return {
    item,
    otroDia: !esMismoDia,
    duracion: duracionTraslado(item),
    salida: {
      nombre: info.origen,
      hora: item.horaInicio,
      etiqueta: esMismoDia ? "Sale" : "Sale hoy",
      color: colorDeDestino(indiceSalida),
    },
    llegada: {
      nombre: info.destino,
      hora: item.horaFin,
      fecha: formatWeekdayDay(fechaLlegada),
      etiqueta: esMismoDia ? "Llega" : `Llega el ${formatWeekdayDay(fechaLlegada)}`,
      color: colorDeDestino(indiceSalida + 1),
    },
  };
}

function horaDeLlegada(info, fecha, tramos, dias) {
  if (info?.tipo !== TIPOS_DIA.LLEGADA) return null;
  const tramo = tramos.find(
    (item) =>
      item.tipo === TIPOS_TRAMO.ENTRE_DESTINOS &&
      item.idActividad &&
      item.fechaLlegada === fechaDe(fecha) &&
      item.validez === VALIDEZ.VALIDO
  );
  if (!tramo) return null;
  const actividad = dias
    .flatMap((dia) => dia.actividades ?? [])
    .find((item) => item.id === tramo.idActividad);
  return actividad?.horaFin ?? null;
}

// "Llegás a Mendoza · 08:00": solo el día de llegada después de noches en viaje, con el
// traslado agendado. El traslado está en el día de salida.
export function textoMarcaLlegada(info, fecha, tramos = [], dias = []) {
  const hora = horaDeLlegada(info, fecha, tramos, dias);
  return hora ? `Llegás a ${info.destino} · ${hora}` : null;
}

// Franjas de la grilla horaria: fondo y etiqueta de cada tramo del día. `desde` y `hasta` en
// null llegan al borde de la grilla.
function franjasDelDia(dia, tramos, dias, fotos) {
  const { infoDestino: info, separacion } = dia;
  if (separacion && !separacion.traslado.traslado?.revisarHorario) {
    return [
      {
        clave: "salida",
        desde: null,
        hasta: minutos(separacion.traslado.horaInicio),
        destino: separacion.salida,
        etiqueta: `En ${separacion.salida.nombre}`,
      },
      {
        clave: "llegada",
        desde: minutos(separacion.traslado.horaFin),
        hasta: null,
        destino: separacion.llegada,
        etiqueta: `En ${separacion.llegada.nombre}`,
      },
    ];
  }
  if (info?.tipo !== TIPOS_DIA.LLEGADA) return null;
  const hora = horaDeLlegada(info, dia.fechaRaw, tramos, dias);
  return [
    {
      clave: "llegada",
      desde: null,
      hasta: null,
      destino: destinoVisual(info.destino, info.indices[0], fotos),
      etiqueta: hora ? `Llegan a ${info.destino} · ${hora}` : null,
    },
  ];
}

// Suma a cada día lo que necesitan las dos vistas del itinerario.
export function agregarDestinosADias(dias, destinos, startDate, endDate, opciones = {}) {
  const { tramos = [], fotos = {} } = opciones;
  const clasificacion = clasificarDias(destinos, startDate, endDate);
  if (!clasificacion) return { dias, accesos: null, encabezados: {} };

  const conDestino = dias.map((dia) => {
    const infoDestino = clasificacion.get(fechaDe(dia.fechaRaw)) ?? null;
    const separacion = separarActividadesDia(dia.actividades, infoDestino, fotos);
    return {
      ...dia,
      infoDestino,
      separacion,
      viaje: viajeDelDia(infoDestino, dia.actividades ?? [], separacion),
    };
  });
  const completos = conDestino.map((dia) => ({
    ...dia,
    franjas: franjasDelDia(dia, tramos, conDestino, fotos),
    marcaLlegada: textoMarcaLlegada(dia.infoDestino, dia.fechaRaw, tramos, conDestino),
  }));
  const accesos = accesosDeDestino(destinos, startDate, fotos);
  return { dias: completos, accesos, encabezados: encabezadosPorDia(completos, accesos) };
}
