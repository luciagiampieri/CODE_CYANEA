// Recomendación de entradas y reservas de una actividad.
//
// El backend decide si hay recomendación (lugar turístico o restaurante, sitio
// oficial, evidencia verificada y si el lugar cambió respecto del último análisis).
// El frontend solo la presenta: no analiza sitios ni compara nombres por su cuenta.
//
// Llega en dos lugares:
// - `RecomendacionEntradas` en la actividad creada/modificada (ActividadRead).
// - `recomendacionEntradas` en la advertencia de horario, junto con
//   `googlePlaceIdEntradas`, que se reenvía al confirmar "Registrar igual".

export const TIPOS_RECOMENDACION = [
  "RESERVA",
  "ENTRADAS_ANTICIPADAS",
  "ENTRADAS_PRESENCIALES",
  // El sitio oficial permite reservar, sin decir que haga falta.
  "RESERVA_DISPONIBLE",
];

const TITULOS = {
  RESERVA: "Reservá antes de ir",
  ENTRADAS_ANTICIPADAS: "Comprá las entradas antes",
  ENTRADAS_PRESENCIALES: "Entradas en boletería",
  RESERVA_DISPONIBLE: "Podés reservar",
};

const ICONOS = {
  RESERVA: "calendar-check",
  ENTRADAS_ANTICIPADAS: "ticket",
  ENTRADAS_PRESENCIALES: "clock",
  RESERVA_DISPONIBLE: "calendar-plus",
};

const ES_RESERVA = new Set(["RESERVA", "RESERVA_DISPONIBLE"]);

export const AVISO_SIN_ENLACE = "No fue posible obtener el enlace oficial.";

// Solo se abren enlaces web: nunca otros esquemas (javascript:, intent:, etc.).
export function urlSegura(url) {
  if (typeof url !== "string") return null;
  const limpia = url.trim();
  return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(limpia) ? limpia : null;
}

export function dominioDe(url) {
  const segura = urlSegura(url);
  if (!segura) return null;
  const match = segura.match(/^https?:\/\/([^/?#:]+)/i);
  return match ? match[1].replace(/^www\./i, "") : null;
}

export function normalizarRecomendacion(datos) {
  if (!datos || typeof datos !== "object") return null;
  if (!TIPOS_RECOMENDACION.includes(datos.tipo)) return null;
  // Solo recomendaciones respaldadas por el sitio oficial.
  if (datos.verificada !== true) return null;
  const urlSitioOficial = urlSegura(datos.urlSitioOficial);
  const urlAccion = urlSegura(datos.urlAccion);
  // Plataforma de terceros (OpenTable, Resy...) enlazada desde el sitio oficial.
  const urlReservaExterna = urlSegura(datos.urlReservaExterna);
  const plataformaReserva = urlReservaExterna ? datos.plataformaReserva || "la plataforma de reservas" : null;
  const evidencia = (datos.evidenciaEs || datos.evidencia || "").trim() || null;
  return {
    tipo: datos.tipo,
    mensaje: datos.mensaje || "",
    nombreLugar: datos.nombreLugar || null,
    urlSitioOficial,
    urlAccion,
    urlReservaExterna,
    plataformaReserva,
    evidencia,
    dominioFuente: dominioDe(datos.fuenteEvidencia) || dominioDe(urlSitioOficial),
    avisoEnlace: urlAccion || urlSitioOficial || urlReservaExterna ? null : datos.avisoEnlace || AVISO_SIN_ENLACE,
  };
}

// Recomendación de la respuesta del backend (actividad o advertencia de horario).
export function recomendacionDeRespuesta(resultado) {
  if (!resultado || typeof resultado !== "object") return null;
  return normalizarRecomendacion(resultado.RecomendacionEntradas ?? resultado.recomendacionEntradas);
}

export function tituloRecomendacion(tipo) {
  return TITULOS[tipo] || "Antes de tu visita";
}

export function iconoRecomendacion(tipo) {
  return ICONOS[tipo] || "circle-info";
}

// La acción que más le sirve al viajero: reservar o comprar. Comprar en boletería no
// tiene acción en línea, así que ahí no hay botón principal.
// Devuelve { texto, url, externa, aclaracion } o null.
export function accionPrincipal(recomendacion) {
  if (!recomendacion || recomendacion.tipo === "ENTRADAS_PRESENCIALES") return null;
  const esReserva = ES_RESERVA.has(recomendacion.tipo);
  if (esReserva && recomendacion.urlReservaExterna && !recomendacion.urlAccion) {
    return {
      texto: `Reservar en ${recomendacion.plataformaReserva}`,
      url: recomendacion.urlReservaExterna,
      externa: true,
      aclaracion: "Plataforma externa enlazada desde el sitio oficial",
    };
  }
  if (recomendacion.urlAccion) {
    return { texto: esReserva ? "Reservar" : "Comprar entradas", url: recomendacion.urlAccion, externa: false };
  }
  if (recomendacion.urlSitioOficial) {
    return { texto: "Ir al sitio oficial", url: recomendacion.urlSitioOficial, externa: false };
  }
  return null;
}

// El sitio oficial como enlace secundario, si no es ya la acción principal.
export function enlaceSitioOficial(recomendacion) {
  const url = recomendacion?.urlSitioOficial;
  if (!url) return null;
  const principal = accionPrincipal(recomendacion);
  if (principal && principal.url === url) return null;
  return { texto: "Ver sitio oficial", url };
}

// Texto breve para la tarjeta de la actividad (el título ya dice qué hacer).
const DESCRIPCIONES = {
  RESERVA: "El sitio oficial indica que conviene reservar con anticipación.",
  ENTRADAS_ANTICIPADAS: "El sitio oficial recomienda comprar las entradas con anticipación.",
  ENTRADAS_PRESENCIALES: "Se compran en el lugar. Llegá con tiempo para conseguirlas antes de tu visita.",
  RESERVA_DISPONIBLE: "El lugar acepta reservas desde su sitio oficial.",
};

export function descripcionCorta(recomendacion) {
  return DESCRIPCIONES[recomendacion?.tipo] || recomendacion?.mensaje || "";
}
