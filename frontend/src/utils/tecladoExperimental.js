// Modo experimental para probar en el iPhone cómo evitar el desplazamiento propio de Safari
// al enfocar un campo. Solo se activa con ?teclado=a, ?teclado=b o ?teclado=ab en la URL
// (queda en sessionStorage para que siga activo al navegar; ?teclado=0 lo apaga). Sin el
// parámetro no hace nada y la app funciona como siempre.
//
// - A (preventScroll): al tocar un campo que no tiene el foco, se evita el foco por
//   defecto y se enfoca con focus({ preventScroll: true }), así Safari no desplaza.
// - B (anular el pan): lo aplica instalarAjusteViewport con `anularPan` (viewportWeb.js).

export const CLAVE_MODO_TECLADO = "cyanea_teclado_experimental";
const MODOS_VALIDOS = ["a", "b", "ab"];
const MOVIMIENTO_MAXIMO_PX = 10;

const SIN_MODO = { a: false, b: false, valor: null };

function crearModo(valor) {
  if (!MODOS_VALIDOS.includes(valor)) return SIN_MODO;
  return { a: valor.includes("a"), b: valor.includes("b"), valor };
}

function guardar(win, valor) {
  try {
    if (valor) win.sessionStorage?.setItem(CLAVE_MODO_TECLADO, valor);
    else win.sessionStorage?.removeItem(CLAVE_MODO_TECLADO);
  } catch {
    // Sin sessionStorage (navegación privada): rige solo mientras la URL lo tenga.
  }
}

/** Lee el modo de la URL (y lo guarda) o, si no está, de sessionStorage. */
export function leerModoTeclado(win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return SIN_MODO;
  let parametro = null;
  try {
    parametro = new URLSearchParams(win.location?.search || "").get("teclado");
  } catch {
    parametro = null;
  }
  if (parametro != null) {
    const modo = crearModo(parametro.toLowerCase());
    guardar(win, modo.valor);
    return modo;
  }
  try {
    return crearModo(win.sessionStorage?.getItem(CLAVE_MODO_TECLADO) || "");
  } catch {
    return SIN_MODO;
  }
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

/** Indicador chico ("teclado: ab") para saber que el modo experimental está activo. */
export function mostrarIndicadorModo(doc, modo) {
  if (!modo?.valor || !doc?.body) return () => {};
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
 * Activa el modo experimental si corresponde. Devuelve { modo, desinstalar }. Sin modo
 * no instala nada.
 */
export function activarModoTeclado(win = window, doc = document) {
  const modo = leerModoTeclado(win);
  if (!modo.valor) return { modo, desinstalar: () => {} };
  const quitarA = modo.a ? instalarEnfoqueSinDesplazar(doc) : () => {};
  const quitarIndicador = mostrarIndicadorModo(doc, modo);
  return {
    modo,
    desinstalar: () => {
      quitarA();
      quitarIndicador();
    },
  };
}
