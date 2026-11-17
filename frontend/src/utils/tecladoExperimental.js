// Teclado en la web: cómo evitar el desplazamiento propio de Safari al enfocar un campo.
//
// - A (preventScroll): al tocar un campo que no tiene el foco, se evita el foco por
//   defecto y se enfoca con focus({ preventScroll: true }), así Safari no desplaza. Solo
//   con toques (touchstart/touchend): un clic con mouse no pasa por acá.
// - B (anular el pan): lo aplica instalarAjusteViewport con `anularPan` (viewportWeb.js).
//   Con B, el único desplazamiento al enfocar es el de mostrarCampoEnfocado: los de cada
//   pantalla no hacen nada en web (tecladoUnificado()).
//
// Por defecto: "ab" en iOS (Safari y cualquier navegador del iPhone/iPad, que usan WebKit);
// en Android y en la compu queda apagado, porque Chrome maneja el teclado distinto y no se
// probó. Para comparar: ?teclado=a, ?teclado=b, ?teclado=ab (en cualquier dispositivo) o
// ?teclado=0 (apagado). Queda en sessionStorage al navegar. El indicador "teclado: <modo>"
// aparece solo si el parámetro vino en la URL.

import { Platform } from "react-native";

export const CLAVE_MODO_TECLADO = "cyanea_teclado_experimental";
const MODOS_VALIDOS = ["a", "b", "ab"];
const APAGADO = "0";
const MODO_POR_DEFECTO_IOS = "ab";
const MOVIMIENTO_MAXIMO_PX = 10;

const SIN_MODO = { a: false, b: false, valor: null, desdeUrl: false };

function crearModo(valor, desdeUrl = false) {
  if (valor === APAGADO) return { ...SIN_MODO, valor: APAGADO, desdeUrl };
  if (!MODOS_VALIDOS.includes(valor)) return { ...SIN_MODO, desdeUrl };
  return { a: valor.includes("a"), b: valor.includes("b"), valor, desdeUrl };
}

function guardar(win, valor) {
  try {
    win.sessionStorage?.setItem(CLAVE_MODO_TECLADO, valor);
  } catch {
    // Sin sessionStorage (navegación privada): rige solo mientras la URL lo tenga.
  }
}

/** iPhone, iPod o iPad (también el iPad con iPadOS, que se presenta como Mac). */
export function esIOS(win) {
  const nav = win?.navigator;
  if (!nav) return false;
  if (/iPhone|iPad|iPod/i.test(nav.userAgent || "")) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1;
}

/**
 * Lee el modo de la URL (y lo guarda); si no está, el guardado en sessionStorage; si no
 * hay nada, el de por defecto ("ab" en iOS, apagado en el resto).
 */
export function leerModoTeclado(win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return SIN_MODO;
  let parametro = null;
  try {
    parametro = new URLSearchParams(win.location?.search || "").get("teclado");
  } catch {
    parametro = null;
  }
  if (parametro != null) {
    const valor = parametro.toLowerCase();
    if (valor === APAGADO || MODOS_VALIDOS.includes(valor)) {
      guardar(win, valor);
      return crearModo(valor, true);
    }
  }
  let guardado = null;
  try {
    guardado = win.sessionStorage?.getItem(CLAVE_MODO_TECLADO) ?? null;
  } catch {
    guardado = null;
  }
  if (guardado === APAGADO || MODOS_VALIDOS.includes(guardado)) return crearModo(guardado);
  return esIOS(win) ? crearModo(MODO_POR_DEFECTO_IOS) : SIN_MODO;
}

// Modo activo, lo fija activarModoTeclado (App.js).
let modoActivo = SIN_MODO;

/**
 * En web con la técnica B activa, el único desplazamiento al enfocar un campo es el de
 * mostrarCampoEnfocado (viewportWeb.js): los de cada pantalla (useScrollAlCampo,
 * useScrollACampo, centerInScroll de los buscadores) no hacen nada. En Android/iOS
 * siempre es false.
 */
export function tecladoUnificado() {
  return Platform.OS === "web" && modoActivo.b;
}

function esCampo(el) {
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea") return false;
  if (el.disabled || el.readOnly) return false;
  const tipo = (el.type || "").toLowerCase();
  return !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes(tipo);
}

function campoDe(objetivo) {
  let nodo = objetivo;
  while (nodo) {
    if (esCampo(nodo)) return nodo;
    nodo = nodo.parentElement;
  }
  return null;
}

/**
 * Técnica A. Al terminar un toque (sin arrastre) sobre un campo que no tiene el foco, evita
 * el foco por defecto y lo enfoca con preventScroll. En un campo que ya tiene el foco no hace
 * nada, así la selección y el cursor funcionan como siempre. Devuelve la función que lo quita.
 */
export function instalarEnfoqueSinDesplazar(doc = document) {
  let inicio = null;

  const alEmpezar = (e) => {
    const toque = e.touches?.[0];
    inicio = toque ? { x: toque.clientX, y: toque.clientY } : null;
  };

  const alTerminar = (e) => {
    const campo = campoDe(e.target);
    if (!campo || doc.activeElement === campo) return;
    const toque = e.changedTouches?.[0];
    if (inicio && toque) {
      const movio =
        Math.abs(toque.clientX - inicio.x) > MOVIMIENTO_MAXIMO_PX ||
        Math.abs(toque.clientY - inicio.y) > MOVIMIENTO_MAXIMO_PX;
      // Fue un desplazamiento, no un toque.
      if (movio) return;
    }
    e.preventDefault();
    try {
      campo.focus({ preventScroll: true });
    } catch {
      campo.focus();
    }
  };

  doc.addEventListener("touchstart", alEmpezar, { capture: true, passive: true });
  doc.addEventListener("touchend", alTerminar, { capture: true, passive: false });

  return () => {
    doc.removeEventListener("touchstart", alEmpezar, { capture: true });
    doc.removeEventListener("touchend", alTerminar, { capture: true });
  };
}

/** Indicador chico ("teclado: ab") cuando el modo vino en la URL. */
export function mostrarIndicadorModo(doc, modo) {
  if (!modo?.valor || !modo.desdeUrl || !doc?.body) return () => {};
  const indicador = doc.createElement("div");
  indicador.textContent = `teclado: ${modo.valor}`;
  indicador.setAttribute("data-testid", "indicador-teclado-experimental");
  indicador.setAttribute("aria-hidden", "true");
  Object.assign(indicador.style, {
    position: "fixed",
    top: "4px",
    left: "4px",
    zIndex: "2147483647",
    padding: "2px 6px",
    borderRadius: "6px",
    background: "rgba(0, 0, 0, 0.6)",
    color: "#fff",
    font: "11px sans-serif",
    pointerEvents: "none",
  });
  doc.body.appendChild(indicador);
  return () => indicador.remove?.();
}

/**
 * Activa el modo que corresponda (ver arriba). Devuelve { modo, desinstalar }. Apagado no
 * instala nada (solo el indicador, si vino ?teclado=0 en la URL).
 */
export function activarModoTeclado(win = window, doc = document) {
  const modo = leerModoTeclado(win);
  modoActivo = modo;
  const quitarA = modo.a ? instalarEnfoqueSinDesplazar(doc) : () => {};
  const quitarIndicador = mostrarIndicadorModo(doc, modo);
  return {
    modo,
    desinstalar: () => {
      quitarA();
      quitarIndicador();
      if (modoActivo === modo) modoActivo = SIN_MODO;
    },
  };
}
