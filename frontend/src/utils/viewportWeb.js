// Web en el celular: la app se ajusta al área visible para que el teclado no
// tape los campos (el contenedor #root es fijo y toma el alto del visualViewport).
//
// Con el teclado abierto, #root se acomoda al área visible (alto y desplazamiento
// del visualViewport). Al cerrarlo vuelve a ocupar toda la pantalla. Safari del
// iPhone a veces no avisa ese cierre (o informa un desplazamiento viejo) y la app
// quedaba chica y corrida hacia abajo, con un espacio en blanco arriba: por eso
// también se reajusta cuando un campo pierde el foco.
//
// Al cerrar el teclado, Safari manda varios eventos con alturas intermedias: si la app
// se reacomodaba con cada uno, crecía en varios pasos. Al pasar a "sin teclado" se espera
// a que el área visible quede quieta y se reacomoda una sola vez (esperarViewportQuieto).
// Al abrirlo se aplica enseguida, para que el campo quede sobre el teclado.

import { colors } from "../theme/tokens";

const DIFERENCIA_TECLADO_PX = 120;
const INTERVALO_QUIETO_MS = 80;
const ESPERA_MAXIMA_QUIETO_MS = 600;

/**
 * Llama a `alTerminar` cuando el visualViewport deja de cambiar: dos lecturas seguidas
 * iguales (alto y desplazamiento) cada `intervalo` ms, o al llegar a `maximo` ms.
 * Devuelve una función para cancelar la espera.
 */
export function esperarViewportQuieto(
  win,
  alTerminar,
  { intervalo = INTERVALO_QUIETO_MS, maximo = ESPERA_MAXIMA_QUIETO_MS } = {}
) {
  const leer = () => {
    const vv = win.visualViewport;
    return vv ? `${vv.height}|${vv.offsetTop}|${win.innerHeight}` : `${win.innerHeight}`;
  };
  let anterior = leer();
  let transcurrido = 0;
  let id = null;
  const revisar = () => {
    transcurrido += intervalo;
    const actual = leer();
    if (actual === anterior || transcurrido >= maximo) {
      id = null;
      alTerminar();
      return;
    }
    anterior = actual;
    id = win.setTimeout(revisar, intervalo);
  };
  id = win.setTimeout(revisar, intervalo);
  return () => {
    if (id != null) win.clearTimeout(id);
    id = null;
  };
}

export function tecladoAbierto(win) {
  const vv = win.visualViewport;
  if (!vv) return false;
  // Con zoom (pellizco) el área visible también se achica, pero no es el teclado.
  if (vv.scale && vv.scale > 1.01) return false;
  return win.innerHeight - vv.height > DIFERENCIA_TECLADO_PX;
}

export function calcularAreaRoot(win) {
  const vv = win.visualViewport;
  if (vv && tecladoAbierto(win)) {
    return { top: Math.max(0, vv.offsetTop), height: vv.height };
  }
  return { top: 0, height: win.innerHeight };
}

function hayCampoEnfocado(doc) {
  const activo = doc.activeElement;
  if (!activo) return false;
  const tag = (activo.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || activo.isContentEditable === true;
}

const PROPIEDADES_PORTAL = ["position", "left", "right", "top", "height", "transform"];

// Contenedor (hijo directo de <body>, que no sea #root) de cada modal con aria-modal.
export function portalesDeModales(doc, root) {
  const modales = Array.from(doc.querySelectorAll?.('[aria-modal="true"]') ?? []);
  const portales = new Set();
  modales.forEach((modal) => {
    let nodo = modal;
    while (nodo && nodo.parentElement && nodo.parentElement !== doc.body) {
      nodo = nodo.parentElement;
    }
    if (nodo && nodo.parentElement === doc.body && nodo !== root) portales.add(nodo);
  });
  return Array.from(portales);
}

export function instalarAjusteViewport(win = window, doc = document) {
  const root = doc.getElementById("root");
  if (!root) return () => {};
  const vv = win.visualViewport;

  doc.documentElement.style.height = "100%";
  doc.body.style.height = "100%";
  doc.body.style.overflow = "hidden";
  // Mientras el área cambia de tamaño se ve el fondo de <body>: con el de la app no
  // aparece una franja blanca donde estaba el teclado.
  doc.body.style.backgroundColor = colors.background;
  root.style.position = "fixed";
  root.style.left = "0";
  root.style.right = "0";

  // Modales: react-native-web los monta en un div agregado a <body>, fuera de #root, con
  // `position: fixed` a pantalla completa, así que no se achicaban con el teclado y la hoja
  // quedaba detrás. Solo MIENTRAS el teclado está abierto, el portal toma el área visible
  // (el `transform` hace que sus hijos `fixed` se ubiquen respecto de él). Al cerrarlo se
  // restauran los valores inline originales (vacíos): sin teclado nada cambia.
  const portalesAjustados = new Map();

  const restaurarPortales = () => {
    portalesAjustados.forEach((originales, portal) => {
      PROPIEDADES_PORTAL.forEach((prop) => {
        portal.style[prop] = originales[prop];
      });
    });
    portalesAjustados.clear();
  };

  const ajustarPortales = () => {
    if (!tecladoAbierto(win)) {
      restaurarPortales();
      return;
    }
    const { top, height } = calcularAreaRoot(win);
    portalesDeModales(doc, root).forEach((portal) => {
      if (!portalesAjustados.has(portal)) {
        const originales = {};
        PROPIEDADES_PORTAL.forEach((prop) => {
          originales[prop] = portal.style[prop] ?? "";
        });
        portalesAjustados.set(portal, originales);
      }
      portal.style.position = "fixed";
      portal.style.left = "0";
      portal.style.right = "0";
      portal.style.top = `${top}px`;
      portal.style.height = `${height}px`;
      portal.style.transform = "translateZ(0)";
    });
  };

  // Aplica el área visible actual a #root y a los modales.
  let conTeclado = false;
  let altoAplicado = null;
  const aplicar = () => {
    const { top, height } = calcularAreaRoot(win);
    conTeclado = tecladoAbierto(win);
    altoAplicado = height;
    root.style.top = `${top}px`;
    root.style.height = `${height}px`;
    // Sin teclado, la página no tiene que quedar desplazada.
    if (top === 0 && win.scrollY) win.scrollTo(0, 0);
    ajustarPortales();
  };

  // Cierre en un solo paso: se espera a que el área quede quieta y se aplica una vez.
  // `soloSinCampoEnfocado`: al salir de un campo, si el foco pasó a otro, el teclado sigue
  // abierto y no se reacomoda (los avisos del visualViewport se aplican siempre).
  let cancelarCierre = null;
  let cierreSoloSinCampo = false;
  const esperarCierre = (soloSinCampoEnfocado) => {
    if (cancelarCierre) {
      // Si llega un aviso del visualViewport, ese manda.
      if (!soloSinCampoEnfocado) cierreSoloSinCampo = false;
      return;
    }
    cierreSoloSinCampo = soloSinCampoEnfocado;
    cancelarCierre = esperarViewportQuieto(win, () => {
      cancelarCierre = null;
      if (cierreSoloSinCampo && !tecladoAbierto(win) && hayCampoEnfocado(doc)) return;
      aplicar();
    });
  };
  const cancelarEsperaDeCierre = () => {
    cancelarCierre?.();
    cancelarCierre = null;
  };

  // Si el área se achica (se abre el teclado) o solo se desplaza, se aplica enseguida.
  // Si crece (se está cerrando, con alturas intermedias), se espera a que quede quieta.
  const ajustarAhora = () => {
    const { height } = calcularAreaRoot(win);
    const crece = altoAplicado != null && height > altoAplicado + 1;
    if (tecladoAbierto(win) && !crece) {
      cancelarEsperaDeCierre();
      aplicar();
    } else if (conTeclado) {
      esperarCierre(false);
    } else {
      aplicar();
    }
  };

  // Los eventos de un mismo cuadro se juntan en uno.
  let cuadroPendiente = null;
  const ajustar = () => {
    if (typeof win.requestAnimationFrame !== "function") {
      ajustarAhora();
      return;
    }
    if (cuadroPendiente != null) return;
    cuadroPendiente = win.requestAnimationFrame(() => {
      cuadroPendiente = null;
      ajustarAhora();
    });
  };

  // Un modal que se abre con el teclado ya abierto no dispara un resize: se ajusta al
  // enfocar su campo. No toca #root ni hace nada sin teclado (en la compu queda igual).
  const alEntrarAUnCampo = () => {
    if (tecladoAbierto(win)) ajustarPortales();
  };

  // Safari a veces no avisa que se cerró el teclado: al salir de un campo se espera a que
  // el área quede quieta y se reacomoda una vez (si el foco no pasó a otro campo).
  const alSalirDeUnCampo = () => {
    esperarCierre(true);
  };

  aplicar();
  vv?.addEventListener("resize", ajustar);
  vv?.addEventListener("scroll", ajustar);
  win.addEventListener("resize", ajustar);
  doc.addEventListener("focusout", alSalirDeUnCampo);
  doc.addEventListener("focusin", alEntrarAUnCampo);

  return () => {
    vv?.removeEventListener("resize", ajustar);
    vv?.removeEventListener("scroll", ajustar);
    win.removeEventListener("resize", ajustar);
    doc.removeEventListener("focusout", alSalirDeUnCampo);
    doc.removeEventListener("focusin", alEntrarAUnCampo);
    cancelarEsperaDeCierre();
    if (cuadroPendiente != null) win.cancelAnimationFrame?.(cuadroPendiente);
    restaurarPortales();
  };
}
