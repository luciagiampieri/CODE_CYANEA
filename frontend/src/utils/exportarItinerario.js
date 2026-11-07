import { Platform } from "react-native";

export const MENSAJE_SIN_CONTENIDO =
  "Los días elegidos no tienen actividades ni traslados para exportar.";

const MENSAJES_POR_CODIGO = {
  ITINERARY_EMPTY: MENSAJE_SIN_CONTENIDO,
  TRIP_CANCELLED: "No se puede exportar el itinerario de un viaje cancelado.",
  EXPORT_FORBIDDEN: "Solo los participantes del viaje pueden exportar el itinerario.",
  DAY_NOT_FOUND: "Alguno de los días elegidos ya no existe. Cerrá y volvé a intentar.",
};

const SIN_REINTENTO = new Set(Object.keys(MENSAJES_POR_CODIGO));

export function nombreArchivoItinerario(titulo, formato) {
  const limpio = String(titulo ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `Itinerario - ${limpio || "Viaje"}.${formato}`;
}

export function diasExportables(dias = []) {
  return dias
    .filter((dia) => Number.isInteger(dia.dayId))
    .map((dia) => ({
      dayId: dia.dayId,
      etiqueta: `Día ${dia.dayIndex} · ${dia.dayDateTextCorta ?? ""}`.trim(),
      cantidad: dia.actividades?.length ?? 0,
    }));
}

export function tieneContenido(opciones, elegidos = []) {
  const seleccion = elegidos.length ? new Set(elegidos) : null;
  return opciones.some(
    (opcion) => (!seleccion || seleccion.has(opcion.dayId)) && opcion.cantidad > 0
  );
}

export function esErrorDeConexion(error) {
  return error?.name === "TypeError" || /network request failed|failed to fetch/i.test(error?.message ?? "");
}

export function mensajeErrorExportacion(error) {
  if (error?.code && MENSAJES_POR_CODIGO[error.code]) return MENSAJES_POR_CODIGO[error.code];
  if (esErrorDeConexion(error)) return "No hay conexión. Revisá tu internet e intentá de nuevo.";
  return error?.message || "No se pudo generar el archivo. Intentá de nuevo.";
}

export function errorReintentable(error) {
  return !SIN_REINTENTO.has(error?.code);
}

export async function compartirArchivoExportado(uri, formato) {
  if (Platform.OS === "web" || !uri) return false;
  const Sharing = await import("expo-sharing");
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
    mimeType: formato === "pdf" ? "application/pdf" : "text/calendar",
    UTI: formato === "pdf" ? "com.adobe.pdf" : "public.calendar-event",
    dialogTitle: "Compartir itinerario",
  });
  return true;
}