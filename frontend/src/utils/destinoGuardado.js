// Destino del viaje al que pertenece cada lugar guardado. Lo usan Explorar (selector de
// destino y pestaña Guardados) y las sugerencias de guardados de Nueva actividad. No se
// guarda nada: se calcula por coordenadas contra los destinos del recorrido.

import { clasificarDias, TIPOS_DIA } from "./destinosDias";
import {
  MODOS_RECORRIDO,
  calcularNochesViaje,
  calcularTramos,
  modoRecorrido,
  textoNoches,
  textoRangoTramo,
} from "./recorrido";
import { getTodayIso } from "./dates";

// Un guardado a más de esta distancia de todos los destinos va a "Otros lugares". Cubre
// las excursiones de un día (Madrid → Toledo 70 km, Florencia → Pisa 85 km).
export const RADIO_DESTINO_KM = 150;

const RADIO_TIERRA_KM = 6371;

function tieneCoordenadas(item) {
  return typeof item?.lat === "number" && typeof item?.lng === "number";
}

function aRadianes(grados) {
  return (grados * Math.PI) / 180;
}

/** Distancia en km entre dos puntos { lat, lng } (haversine). */
export function distanciaKm(a, b) {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** El viaje tiene más de un destino: solo entonces se trabaja por destino. */
export function esMultidestino(destinos) {
  return (destinos || []).length > 1;
}

/**
 * Índice (en el orden del recorrido) del destino más cercano al lugar, o null si el viaje
 * tiene un solo destino, si faltan coordenadas o si el más cercano está a más de
 * RADIO_DESTINO_KM ("Otros lugares").
 */
export function destinoDeLugar(lugar, destinos) {
  if (!esMultidestino(destinos) || !tieneCoordenadas(lugar)) return null;
  let mejor = null;
  destinos.forEach((destino, indice) => {
    if (!tieneCoordenadas(destino)) return;
    const distancia = distanciaKm(lugar, destino);
    if (!mejor || distancia < mejor.distancia) mejor = { indice, distancia };
  });
  return mejor && mejor.distancia <= RADIO_DESTINO_KM ? mejor.indice : null;
}

function recorridoArmado(destinos, startDate, endDate) {
  if (!startDate || !endDate) return false;
  return modoRecorrido(destinos, calcularNochesViaje(startDate, endDate)) === MODOS_RECORRIDO.ARMADO;
}

/**
 * Destinos en el orden del recorrido con su rango de fechas y noches. Sin recorrido armado
 * `rango` y `noches` quedan en null y solo se muestra el nombre.
 */
export function resumenDestinos(destinos, startDate, endDate) {
  const lista = destinos || [];
  const armado = recorridoArmado(lista, startDate, endDate);
  const tramos = armado ? calcularTramos(lista, startDate) : [];
  return lista.map((destino, indice) => ({
    indice,
    nombre: destino.name,
    lat: destino.lat,
    lng: destino.lng,
    conUbicacion: tieneCoordenadas(destino),
    noches: armado ? destino.noches : null,
    textoNoches: armado ? textoNoches(destino.noches) : null,
    rango: armado ? textoRangoTramo(tramos[indice]) : null,
  }));
}

function infoDeFecha(destinos, startDate, endDate, fecha) {
  if (!esMultidestino(destinos) || !fecha) return null;
  const clasificacion = clasificarDias(destinos, startDate, endDate);
  return clasificacion?.get(String(fecha).slice(0, 10)) ?? null;
}

/**
 * Destinos de una fecha del viaje, con la misma clasificación del itinerario (US 138): uno
 * en un día normal, dos en un día de traslado sin noches en viaje y ninguno en viaje, en un
 * día sin destino o si el recorrido no está armado.
 */
export function indicesDestinoDeFecha(destinos, startDate, endDate, fecha) {
  return infoDeFecha(destinos, startDate, endDate, fecha)?.indices ?? [];
}

/**
 * Destino con el que se abre Explorar: el de hoy si el viaje está en curso (en un traslado,
 * el de salida; en viaje, al que van; en los días libres del final, el último) y si no el
 * primero. `indicesHoy` marca "Hoy" en la hoja de destinos.
 */
export function destinoInicial(destinos, startDate, endDate, hoy = getTodayIso()) {
  const info = infoDeFecha(destinos, startDate, endDate, hoy);
  if (!info) return { indice: 0, indicesHoy: [] };
  if (info.indices.length > 0) return { indice: info.indices[0], indicesHoy: info.indices };
  if (info.tipo === TIPOS_DIA.EN_VIAJE) return { indice: info.seccion + 1, indicesHoy: [] };
  if (info.tipo === TIPOS_DIA.SIN_DESTINO) return { indice: destinos.length - 1, indicesHoy: [] };
  return { indice: 0, indicesHoy: [] };
}

/** "Día 2, Día 4": días del itinerario con actividades en el guardado, ordenados y sin repetir. */
export function textoDias(lugar) {
  const indices = [...new Set((lugar?.scheduledDays || []).map((dia) => dia.dayIndex))].sort((a, b) => a - b);
  return indices.map((indice) => `Día ${indice}`).join(", ");
}

/** "Madrid", "Roma y París". */
export function nombresDestinos(destinos, indices) {
  const nombres = (indices || []).map((indice) => destinos?.[indice]?.name).filter(Boolean);
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}
