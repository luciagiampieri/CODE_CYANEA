// Sugerencias de los lugares guardados del viaje en Nueva actividad (campo "Nombre", hoja
// "Tus guardados" y selector de "Ubicación"). Un guardado está "en el itinerario" si tiene
// `scheduledDays` (días con actividades en ese lugar); no hay otro "día asignado".
//
// `contexto` ({ destinos, indicesDia }) prioriza los guardados del destino del día de la
// actividad (`destinoDeLugar`). Sin contexto, con un solo destino o en un día sin destino
// (en viaje, sin recorrido armado) todo queda sin priorizar.

import { resolveVisibleCategory } from "../components/explore/exploreUtils";
import { destinoDeLugar, esMultidestino, nombresDestinos, textoDias } from "./destinoGuardado";
import { contieneTexto, normalizarTexto } from "./textoBusqueda";

export const MAX_SUGERENCIAS_GUARDADOS = 3;

export function enItinerario(lugar) {
  return (lugar?.scheduledDays || []).length > 0;
}

function contextoActivo(contexto) {
  return esMultidestino(contexto?.destinos) && (contexto?.indicesDia || []).length > 0;
}

/** El guardado está en uno de los destinos del día (solo con contexto activo). */
function delDestinoDelDia(lugar, contexto) {
  return contexto.indicesDia.includes(destinoDeLugar(lugar, contexto.destinos));
}

/**
 * "Museo · Sin día asignado" o "Ya en el itinerario · Día 2, Día 4". La categoría es la
 * que muestra Explorar (`resolveVisibleCategory`): el nombre en español que da Google; los
 * tipos crudos ("art_gallery") y genéricos no se muestran. Con contexto, un guardado de otro
 * destino suma su nombre ("Museo · Toledo · Sin día asignado").
 */
export function textoDetalleGuardado(lugar, contexto = null) {
  const partes = [];
  if (enItinerario(lugar)) {
    partes.push("Ya en el itinerario");
  } else {
    const categoria = resolveVisibleCategory(lugar?.category);
    if (categoria) partes.push(categoria);
  }
  if (contextoActivo(contexto)) {
    const indice = destinoDeLugar(lugar, contexto.destinos);
    if (indice !== null && !contexto.indicesDia.includes(indice)) partes.push(contexto.destinos[indice].name);
  }
  partes.push(enItinerario(lugar) ? textoDias(lugar) : "Sin día asignado");
  return partes.join(" · ");
}

// Primero los del destino del día y después los demás, sin cambiar el orden de la API.
function ordenarPorDestino(lugares, contexto) {
  if (!contextoActivo(contexto)) return lugares;
  return [
    ...lugares.filter((lugar) => delDestinoDelDia(lugar, contexto)),
    ...lugares.filter((lugar) => !delDestinoDelDia(lugar, contexto)),
  ];
}

/**
 * Con el campo vacío: los 3 últimos guardados que todavía no tienen actividad (la API ya
 * los devuelve del más nuevo al más viejo), primero los del destino del día.
 */
export function ultimosSinAgendar(lugares, contexto = null) {
  const sinAgendar = (lugares || []).filter((lugar) => !enItinerario(lugar));
  return ordenarPorDestino(sinAgendar, contexto).slice(0, MAX_SUGERENCIAS_GUARDADOS);
}

/** "Ver todos tus guardados (N)" solo si hay más guardados de los que entran en la lista. */
export function mostrarVerTodos(lugares) {
  return (lugares || []).length > MAX_SUGERENCIAS_GUARDADOS;
}

/**
 * Mientras se escribe: hasta 3 guardados que coinciden con el texto (sin distinguir
 * mayúsculas ni tildes). Primero los que no tienen actividad y al final los que ya están
 * en el itinerario; dentro de cada parte, primero los del destino del día. Cada uno trae
 * `detalle` y `enItinerario` (el resaltado lo hace ResaltarCoincidencia con el mismo texto).
 */
export function buscarGuardados(lugares, texto, contexto = null) {
  if (!normalizarTexto(texto)) return [];
  const coinciden = (lugares || []).filter((lugar) => contieneTexto(lugar?.name, texto));
  const sinAgendar = coinciden.filter((lugar) => !enItinerario(lugar));
  const agendados = coinciden.filter(enItinerario);
  return [...ordenarPorDestino(sinAgendar, contexto), ...ordenarPorDestino(agendados, contexto)]
    .slice(0, MAX_SUGERENCIAS_GUARDADOS)
    .map((lugar) => ({
      lugar,
      detalle: textoDetalleGuardado(lugar, contexto),
      enItinerario: enItinerario(lugar),
    }));
}

/**
 * Hoja "Tus guardados": todos, filtrados por el buscador si hay texto (sin distinguir
 * mayúsculas ni tildes), en grupos. Sin contexto: "Sin agendar" y "Ya en el itinerario".
 * Con contexto: "En <destino del día>" y "Otros destinos" (incluye los que están lejos de
 * todos), cada uno con los sin agendar primero. Los grupos vacíos no se devuelven.
 */
export function gruposGuardados(lugares, texto = "", contexto = null) {
  const conTexto = Boolean(normalizarTexto(texto));
  const visibles = (lugares || []).filter((lugar) => !conTexto || contieneTexto(lugar?.name, texto));
  const grupos = contextoActivo(contexto)
    ? [
        {
          clave: "destino-del-dia",
          titulo: `En ${nombresDestinos(contexto.destinos, contexto.indicesDia)}`,
          data: ordenarPorItinerario(visibles.filter((lugar) => delDestinoDelDia(lugar, contexto))),
        },
        {
          clave: "otros-destinos",
          titulo: "Otros destinos",
          data: ordenarPorItinerario(visibles.filter((lugar) => !delDestinoDelDia(lugar, contexto))),
        },
      ]
    : [
        { clave: "sin-agendar", titulo: "Sin agendar", data: visibles.filter((lugar) => !enItinerario(lugar)) },
        { clave: "itinerario", titulo: "Ya en el itinerario", data: visibles.filter(enItinerario) },
      ];
  return grupos.filter((grupo) => grupo.data.length > 0);
}

/** Para el selector de Ubicación: todos, primero los que no tienen actividad. */
export function ordenGuardadosUbicacion(lugares) {
  return ordenarPorItinerario(lugares || []);
}

function ordenarPorItinerario(lugares) {
  return [...lugares.filter((lugar) => !enItinerario(lugar)), ...lugares.filter(enItinerario)];
}
