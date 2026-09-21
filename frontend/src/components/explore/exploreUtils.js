export const NEARBY_CATEGORIES = [
  { key: "todos", apiKey: null, label: "Todo cerca", icon: "border-all" },
  { key: "restaurantes", apiKey: "restaurantes", label: "Restaurantes", icon: "utensils" },
  { key: "cafeterias", apiKey: "cafeterias", label: "Cafeterías", icon: "mug-hot" },
  { key: "atracciones", apiKey: "atracciones", label: "Atracciones", icon: "camera" },
  { key: "servicios", apiKey: "servicios", label: "Servicios", icon: "briefcase-medical" },
];

export const NEARBY_PAGE_SIZE = 8;

// ~1 km: a partir de ahí ofrecemos "Buscar en esta zona".
const SEARCH_AREA_THRESHOLD = 0.01;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function getMarkerKey(marker) {
  if (!marker) return null;
  return `${marker.kind}-${marker.id ?? marker.placeId ?? marker.name}`;
}

export function hasCoordinates(item) {
  return typeof item?.lat === "number" && typeof item?.lng === "number";
}

export function hasMovedEnough(from, to) {
  if (!from || !to) return false;
  return (
    Math.abs(from.lat - to.lat) > SEARCH_AREA_THRESHOLD ||
    Math.abs(from.lng - to.lng) > SEARCH_AREA_THRESHOLD
  );
}

export function resolveVisibleCategory(category) {
  if (!category) return null;
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("_")) return null;
  if (normalized === "establishment" || normalized === "point of interest") return null;
  return category;
}

export function formatDistance(distanceMeters) {
  if (typeof distanceMeters !== "number") return null;
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function formatRatingCount(total) {
  if (typeof total !== "number" || total <= 0) return null;
  if (total >= 1000) return `${(total / 1000).toFixed(1).replace(".0", "")}k`;
  return String(total);
}

export function formatShortDate(isoDate) {
  if (!isoDate) return null;
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function normalizeDestination(destination) {
  return {
    id: `destination-${destination.id ?? destination.name}`,
    kind: "tripDestination",
    placeId: null,
    name: destination.name,
    address: destination.country ? `${destination.name}, ${destination.country}` : destination.name,
    lat: destination.lat,
    lng: destination.lng,
    category: "Destino base",
    scheduledDays: [],
  };
}

/**
 * Cruza un resultado externo (búsqueda, cercanos, populares) con los lugares
 * ya guardados, para que la UI sepa si mostrarlo como guardado.
 */
export function mergeWithSaved(item, savedPlacesByPlaceId, extra = {}) {
  const saved = item?.placeId ? savedPlacesByPlaceId.get(item.placeId) : null;
  if (saved) {
    return {
      ...saved,
      alreadySaved: true,
      rating: item.rating ?? saved.rating,
      userRatingsTotal: item.userRatingsTotal ?? saved.userRatingsTotal,
      distanceMeters: item.distanceMeters,
      ...extra,
    };
  }
  return { ...item, kind: "searchResult", alreadySaved: false, ...extra };
}

export function resolveTripDays(trip) {
  const rawDays = trip?.cronograma ?? trip?.Cronograma ?? trip?.dias ?? [];
  if (Array.isArray(rawDays) && rawDays.length > 0) {
    return rawDays;
  }

  if (!trip?.startDate || !trip?.endDate) {
    return [];
  }

  const start = new Date(`${trip.startDate}T12:00:00`);
  const end = new Date(`${trip.endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [];
  }

  const days = [];
  const cursor = new Date(start);
  let index = 1;
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    days.push({
      id: `fallback-day-${index}`,
      idDiaCronograma: index,
      indiceDia: index,
      fecha: `${year}-${month}-${day}`,
    });
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }

  return days;
}

const byName = (left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" });

/**
 * Agrupa los lugares guardados: primero los que no tienen día (son los que
 * requieren una acción) y después uno por día del itinerario.
 */
export function groupSavedPlacesByDay(places, tripDays = []) {
  const unscheduled = [];
  const byDay = new Map();

  places.forEach((place) => {
    const days = place.scheduledDays || [];
    if (days.length === 0) {
      unscheduled.push(place);
      return;
    }
    days.forEach((day) => {
      if (!byDay.has(day.dayIndex)) {
        const tripDay = tripDays.find(
          (item) => (item.indiceDia ?? item.IndiceDia ?? item.dayIndex) === day.dayIndex
        );
        byDay.set(day.dayIndex, {
          dayIndex: day.dayIndex,
          dateLabel: formatShortDate(tripDay?.fecha ?? tripDay?.Fecha ?? tripDay?.date),
          places: [],
        });
      }
      byDay.get(day.dayIndex).places.push(place);
    });
  });

  const dayGroups = Array.from(byDay.values())
    .sort((left, right) => left.dayIndex - right.dayIndex)
    .map((group) => ({ ...group, places: [...group.places].sort(byName) }));

  return { unscheduled: unscheduled.sort(byName), dayGroups };
}
