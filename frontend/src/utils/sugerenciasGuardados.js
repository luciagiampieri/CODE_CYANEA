// Sugerencias de los lugares guardados del viaje en Nueva actividad (campo "Nombre", hoja
// "Tus guardados" y selector de "Ubicación"). Un guardado está "en el itinerario" si tiene
// `scheduledDays` (días con actividades en ese lugar); no hay otro "día asignado".

import { resolveVisibleCategory } from "../components/explore/exploreUtils";
import { contieneTexto, normalizarTexto } from "./textoBusqueda";

export const MAX_SUGERENCIAS_GUARDADOS = 3;

export function enItinerario(lugar) {
  return (lugar?.scheduledDays || []).length > 0;
}

function textoDias(lugar) {
  const indices = [...new Set((lugar.scheduledDays || []).map((dia) => dia.dayIndex))].sort((a, b) => a - b);
  return indices.map((indice) => `Día ${indice}`).join(", ");
}

/**
 * "Museo · Sin día asignado" o "Ya en el itinerario · Día 2, Día 4". La categoría es la
 * que muestra Explorar (`resolveVisibleCategory`): el nombre en español que da Google; los
 * tipos crudos ("art_gallery") y genéricos no se muestran.
 */
export function textoDetalleGuardado(lugar) {
  if (enItinerario(lugar)) return `Ya en el itinerario · ${textoDias(lugar)}`;
  const categoria = resolveVisibleCategory(lugar?.category);
  return categoria ? `${categoria} · Sin día asignado` : "Sin día asignado";
}

/**
 * Con el campo vacío: los 3 últimos guardados que todavía no tienen actividad (la API ya
 * los devuelve del más nuevo al más viejo).
 */
export function ultimosSinAgendar(lugares) {
  return (lugares || []).filter((lugar) => !enItinerario(lugar)).slice(0, MAX_SUGERENCIAS_GUARDADOS);
}

/** "Ver todos tus guardados (N)" solo si hay más guardados de los que entran en la lista. */
export function mostrarVerTodos(lugares) {
  return (lugares || []).length > MAX_SUGERENCIAS_GUARDADOS;
}

/**
 * Mientras se escribe: hasta 3 guardados que coinciden con el texto (sin distinguir
 * mayúsculas ni tildes). Primero los que no tienen actividad y al final los que ya están
 * en el itinerario. Cada uno trae `detalle` y `enItinerario` (el resaltado lo hace
 * ResaltarCoincidencia con el mismo texto).
 */
export function buscarGuardados(lugares, texto) {
  if (!normalizarTexto(texto)) return [];
  const coinciden = (lugares || []).filter((lugar) => contieneTexto(lugar?.name, texto));
  return ordenarPorItinerario(coinciden)
    .slice(0, MAX_SUGERENCIAS_GUARDADOS)
    .map((lugar) => ({
      lugar,
      detalle: textoDetalleGuardado(lugar),
      enItinerario: enItinerario(lugar),
    }));
}

/**
 * Hoja "Tus guardados": todos, en dos grupos ("Sin agendar" y "Ya en el itinerario"),
 * filtrados por el buscador si hay texto (sin distinguir mayúsculas ni tildes).
 */
export function gruposGuardados(lugares, texto = "") {
  const conTexto = Boolean(normalizarTexto(texto));
  const visibles = (lugares || []).filter((lugar) => !conTexto || contieneTexto(lugar?.name, texto));
  return {
    sinAgendar: visibles.filter((lugar) => !enItinerario(lugar)),
    enItinerario: visibles.filter(enItinerario),
  };
}

/** Para el selector de Ubicación: todos, primero los que no tienen actividad. */
export function ordenGuardadosUbicacion(lugares) {
  return ordenarPorItinerario(lugares || []);
}

function ordenarPorItinerario(lugares) {
  return [...lugares.filter((lugar) => !enItinerario(lugar)), ...lugares.filter(enItinerario)];
}
