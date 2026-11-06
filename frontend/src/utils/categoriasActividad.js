// Categorías de las actividades del itinerario. Se guardan como ícono en
// `ActividadesItinerario.Icono`. Vuelo y Traslado no son categorías: esos viajes se
// agendan como traslados del recorrido (US 136, ver `utils/traslados.js`).
export const ICON_OPTIONS = [
  { name: "building", label: "Hotel" },
  { name: "utensils", label: "Comida" },
  { name: "camera", label: "Turismo" },
  { name: "ticket", label: "Evento" },
  { name: "person-hiking", label: "Excursión" },
  { name: "location-dot", label: "Otro" },
];

export const ICONO_POR_DEFECTO = "location-dot";

// Palabras de viajes: ya no eligen avión ni auto, pero siguen resolviendo a "Otro" en el
// mismo orden de antes para que "Vuelo a Bariloche" no caiga en Comida por contener "bar".
const PALABRAS_DE_VUELOS = ["vuelo", "avion", "avión", "aeropuerto", "embarque", "flight", "aterrizaje", "despegue", "boarding", "boarding pass", "aerolinea", "aerolínea", "airline", "gate", "conexion"];
const PALABRAS_DE_TRASLADOS = ["traslado", "taxi", "bus", "colectivo", "transporte", "uber", "remis", "transfer", "shuttle", "metro", "tren", "subte", "alquiler", "renta", "conducción", "puerto", "ferry", "estación", "terminal", "autobús", "camioneta", "van", "vehículo", "carro", "coche", "auto", "ride", "transportation", "commute", "ave"];

const ICON_KEYWORDS = [
  [ICONO_POR_DEFECTO, PALABRAS_DE_VUELOS],
  ["building", ["hotel", "alojamiento", "hostel", "check-in", "check in", "check-out", "check out", "hospedaje", "apartamento", "cabaña", "resort", "bnb", "dormir", "habitación", "recepción", "reserva", "booking", "hostería", "hospedería", "hostal", "airbnb"]],
  ["utensils", ["cena", "almuerzo", "desayuno", "comida", "restaurante", "brunch", "cafe", "café", "bar", "parrilla", "pizza", "gastronomia", "degustación", "fast food", "burger", "comedor", "cafetería", "cafeteria", "snack", "merienda", "tapas", "pub", "cerveza", "vino", "cocktail", "coctel", "drinks", "bebidas", "drink", "beverage", "cena romántica", "romantic dinner"]],
  ["camera", ["visita", "museo", "tour", "turismo", "paseo", "recorrido", "monumento", "catedral", "iglesia", "plaza", "galeria", "shopping", "compras", "tienda", "exposición", "mirador", "foto", "histórico", "ruinas", "arquitectura", "cultural", "artístico", "arte", "fotografía", "photography", "sightseeing", "landmark", "attraction", "city tour", "walking tour", "parque", "jardín", "zoológico", "acuario", "planetario", "observatorio", "cultural center", "cultural centre", "cultural site", "guiada", "guiado", "guía", "guide", "guided tour", "tour guide", "excursión guiada", "visita guiada"]],
  ["ticket", ["show", "teatro", "concierto", "evento", "espectaculo", "espectáculo", "partido", "cancha", "cine", "festival", "obra", "entrada", "recital", "ópera", "musical", "danza", "ballet", "performance", "ticket", "tickets", "entradas", "boletos", "boleto", "admisión", "admission", "pass", "passes", "conferencia", "charla", "workshop", "seminario", "exposición", "exhibition", "expo", "feria", "convention", "convención", "convocatoria"]],
  [ICONO_POR_DEFECTO, PALABRAS_DE_TRASLADOS],
  ["person-hiking", ["excursion", "excursión", "senderismo", "trekking", "hiking", "caminata", "montaña", "playa", "trek", "aventura", "naturaleza", "escalada", "ski", "buceo", "surf", "nadar", "rafting", "kayak", "bosque", "snorkel", "yoga"]],
];

export function detectIcon(nombre) {
  if (!nombre.trim()) return ICONO_POR_DEFECTO;
  const lower = nombre.toLowerCase();
  for (const [icon, keywords] of ICON_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return icon;
  }
  return ICONO_POR_DEFECTO;
}
