// Íconos de las categorías de gastos, documentos y tareas del checklist (US 110).
//
// Desde la US 110 cada categoría trae su ícono (nombre de FontAwesome 6) en
// `Icono` / `IconoCategoria`. Los mapas por nombre quedan como respaldo para
// datos sin ícono (caché offline o respuestas anteriores a la migración).

export const ICONO_POR_DEFECTO = "tags";

export const TIPOS_CATEGORIA = {
  GASTOS: "gastos",
  DOCUMENTOS: "documentos",
  CHECKLIST: "checklist",
};

export function normalizarNombreCategoria(nombre) {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const ICONOS_POR_NOMBRE = {
  [TIPOS_CATEGORIA.GASTOS]: {
    "comida y bebida": "utensils",
    transporte: "car",
    alojamiento: "hotel",
    entretenimiento: "ticket-simple",
    compras: "bag-shopping",
    servicios: "file-invoice-dollar",
    otros: "ellipsis",
  },
  [TIPOS_CATEGORIA.DOCUMENTOS]: {
    vuelos: "plane",
    alojamiento: "hotel",
    excursiones: "map-location-dot",
    seguros: "shield-halved",
    documentacion: "id-card",
    comprobantes: "receipt",
    otros: "ellipsis",
  },
  [TIPOS_CATEGORIA.CHECKLIST]: {
    documentacion: "passport",
    transporte: "car",
    alojamiento: "hotel",
    equipamiento: "suitcase",
    salud: "kit-medical",
    seguros: "shield-halved",
    finanzas: "money-bill-transfer",
    comida: "utensils",
    "reservas y entradas": "ticket",
    otros: "list-check",
  },
};

// Categorías que se muestran como secciones vacías cuando todavía no se
// recibieron las categorías activas del backend.
export const NOMBRES_CATEGORIAS_BASE = {
  [TIPOS_CATEGORIA.DOCUMENTOS]: [
    "Vuelos",
    "Alojamiento",
    "Excursiones",
    "Seguros",
    "Documentación",
    "Comprobantes",
    "Otros",
  ],
  [TIPOS_CATEGORIA.CHECKLIST]: [
    "Documentación",
    "Transporte",
    "Alojamiento",
    "Equipamiento",
    "Salud",
    "Seguros",
    "Finanzas",
    "Comida",
    "Reservas y entradas",
    "Otros",
  ],
};

export function iconoDeCategoria(tipo, nombre, icono) {
  if (typeof icono === "string" && icono.trim()) return icono.trim();
  return ICONOS_POR_NOMBRE[tipo]?.[normalizarNombreCategoria(nombre)] ?? ICONO_POR_DEFECTO;
}

// Íconos que el backoffice ofrece al crear o editar una categoría.
export const ICONOS_DISPONIBLES = [
  "utensils",
  "mug-hot",
  "burger",
  "wine-glass",
  "cart-shopping",
  "bag-shopping",
  "gift",
  "car",
  "bus",
  "train",
  "plane",
  "ship",
  "taxi",
  "gas-pump",
  "hotel",
  "bed",
  "house",
  "campground",
  "ticket",
  "ticket-simple",
  "masks-theater",
  "music",
  "camera",
  "umbrella-beach",
  "person-hiking",
  "map-location-dot",
  "landmark",
  "passport",
  "id-card",
  "file-lines",
  "receipt",
  "file-invoice-dollar",
  "money-bill-transfer",
  "credit-card",
  "hand-holding-dollar",
  "shield-halved",
  "kit-medical",
  "pills",
  "suitcase",
  "shirt",
  "paw",
  "baby",
  "wifi",
  "phone",
  "bell-concierge",
  "list-check",
  "star",
  "ellipsis",
  "tags",
];
