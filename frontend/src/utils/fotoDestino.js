import { resolveDestination, searchDestinations } from "../services/api";

export function makeSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

// El backend puede devolver la foto de un destino bajo distintos nombres: se toma la primera URL usable.
export function pickDestinationImage(dest) {
    if (!dest) return null;
    const candidates = [
        dest.imageUrl,
        dest.image,
        dest.image_url,
        dest.imageURL,
        dest.photoUrl,
        dest.photoURL,
        dest.photoUri,
        dest.photo,
        dest.coverImage,
        dest.coverImageUrl,
        dest.thumbnail,
        dest.thumbnailUrl,
        dest.picture,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
        if (candidate && typeof candidate === "object") {
            const uri = candidate.uri || candidate.url;
            if (typeof uri === "string" && uri.trim()) return uri.trim();
        }
    }
    return null;
}

// Los destinos guardados en el viaje pueden venir sin foto: se pide a Google (vía resolveDestination)
// con el placeId, o buscándolo por nombre y país si el destino no tiene placeId.
export async function fetchDestinationImage(dest) {
    try {
        let placeId = dest.placeId;
        if (!placeId) {
            const query = [dest.name, dest.country].filter(Boolean).join(", ");
            const results = await searchDestinations(query, makeSessionToken());
            const match = (results || []).find(
                (r) =>
                    normalizeText(r.name) === normalizeText(dest.name) &&
                    (!dest.country || normalizeText(r.country) === normalizeText(dest.country))
            );
            // Si el país no coincide exacto (p. ej. otro idioma), se acepta un resultado cuyo nombre contenga al destino.
            const loose = (results || []).find((r) => normalizeText(r.name).includes(normalizeText(dest.name)));
            placeId = (match || loose)?.placeId;
        }
        if (!placeId) return null;
        const full = await resolveDestination(placeId, makeSessionToken());
        return pickDestinationImage(full);
    } catch {
        return null;
    }
}

// Una foto por destino y por sesión de la app: buscarla cuesta hasta dos llamadas a Google.
// Si no se consigue no queda guardada, para reintentar la próxima vez.
const fotosPedidas = new Map();

export function fotoDeDestino(destino) {
  const propia = pickDestinationImage(destino);
  if (propia) return Promise.resolve(propia);

  const clave = `${destino.name}|${destino.country}`;
  if (!fotosPedidas.has(clave)) {
    const pedido = fetchDestinationImage(destino).then((uri) => {
      if (!uri) fotosPedidas.delete(clave);
      return uri;
    });
    fotosPedidas.set(clave, pedido);
  }
  return fotosPedidas.get(clave);
}

export function limpiarFotosDestinos() {
  fotosPedidas.clear();
}
