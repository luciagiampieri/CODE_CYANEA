// Web en el celular: la app se ajusta al área visible para que el teclado no
// tape los campos (el contenedor #root es fijo y toma el alto del visualViewport).
//
// Con el teclado abierto, #root se acomoda al área visible (alto y desplazamiento
// del visualViewport). Al cerrarlo vuelve a ocupar toda la pantalla. Safari del
// iPhone a veces no avisa ese cierre (o informa un desplazamiento viejo) y la app
// quedaba chica y corrida hacia abajo, con un espacio en blanco arriba: por eso
// también se reajusta cuando un campo pierde el foco.

import { colors } from "../theme/tokens";

const DIFERENCIA_TECLADO_PX = 120;
const REAJUSTES_AL_SALIR_MS = [60, 250, 600];

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

function esCampoDeTexto(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable === true;
}

function hayCampoEnfocado(doc) {
  return esCampoDeTexto(doc.activeElement);
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

const MARGEN_CAMPO_PX = 20;
const ESPERA_MOSTRAR_CAMPO_MS = 150;

// Contenedor con scroll vertical más cercano a `el` (en web, el div de un ScrollView).
function contenedorConScroll(win, el) {
  let nodo = el?.parentElement;
  while (nodo && nodo !== el.ownerDocument?.body) {
    const estilo = win.getComputedStyle?.(nodo);
    const overflow = estilo ? estilo.overflowY : "";
    if ((overflow === "auto" || overflow === "scroll") && nodo.scrollHeight > nodo.clientHeight) {
      return nodo;
    }
    nodo = nodo.parentElement;
  }
  return null;
}

/**
 * Modo experimental (técnica B): con el área visible en top 0, lleva el campo enfocado a
 * la vista con un único desplazamiento de su contenedor, solo si queda tapado (o por
 * arriba del área visible). Devuelve cuánto desplazó (0 si no hizo nada).
 */
export function mostrarCampoEnfocado(win, doc, margen = MARGEN_CAMPO_PX) {
  const campo = doc.activeElement;
  if (!hayCampoEnfocado(doc) || typeof campo.getBoundingClientRect !== "function") return 0;
  const altoVisible = win.visualViewport ? win.visualViewport.height : win.innerHeight;
  const { top, bottom } = campo.getBoundingClientRect();

  let delta = 0;
  if (bottom + margen > altoVisible) delta = bottom + margen - altoVisible;
  else if (top - margen < 0) delta = top - margen;
  if (!delta) return 0;

  const contenedor = contenedorConScroll(win, campo);
  if (!contenedor) return 0;
  if (typeof contenedor.scrollBy === "function") {
    contenedor.scrollBy({ top: delta, behavior: "smooth" });
  } else {
    contenedor.scrollTop += delta;
  }
  return delta;
}

/**
 * `anularPan` (modo experimental, técnica B; apagado por defecto): con el teclado abierto,
 * si Safari desplazó la página para mostrar el campo (offsetTop o scrollY > 0) se vuelve
 * a 0, #root y los modales quedan arriba de todo con el alto del área visible y el campo
 * se lleva a la vista con un único desplazamiento de su contenedor, solo si queda tapado.
 */
export function instalarAjusteViewport(win = window, doc = document, { anularPan = false } = {}) {
  const root = doc.getElementById("root");
  if (!root) return () => {};
  const vv = win.visualViewport;

  // Área que toman #root y los modales. Con `anularPan` queda arriba de todo.
  const areaVisible = () => {
    const area = calcularAreaRoot(win);
    return anularPan && tecladoAbierto(win) ? { top: 0, height: area.height } : area;
  };

  // Técnica B: se espera a que lleguen los avisos del teclado y se muestra el campo una vez.
  let esperaCampo = null;
  const programarMostrarCampo = () => {
    if (!anularPan) return;
    if (esperaCampo != null) win.clearTimeout(esperaCampo);
    esperaCampo = win.setTimeout(() => {
      esperaCampo = null;
      if (tecladoAbierto(win)) mostrarCampoEnfocado(win, doc);
    }, ESPERA_MOSTRAR_CAMPO_MS);
  };

  doc.documentElement.style.height = "100%";
  doc.body.style.height = "100%";
  doc.body.style.overflow = "hidden";
  // Mientras el área cambia de tamaño puede verse una franja de <html>/<body>: con el fondo
  // de la app no aparece blanca.
  doc.documentElement.style.backgroundColor = colors.background;
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
    const { top, height } = areaVisible();
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

  // Técnica B, cierre: al salir del campo la app ya quedó a pantalla completa. Los avisos del
  // visualViewport que llegan después traen valores intermedios del cierre (la pantalla se
  // veía un instante corrida hacia abajo): se ignoran mientras no haya un campo enfocado.
  let cerrando = false;

  const ajustar = () => {
    if (cerrando) {
      if (hayCampoEnfocado(doc) || !tecladoAbierto(win)) cerrando = false;
      else return;
    }
    // Técnica B: se deshace el desplazamiento propio de Safari.
    const anularAhora = anularPan && tecladoAbierto(win) && ((vv?.offsetTop ?? 0) > 0 || win.scrollY > 0);
    if (anularAhora) win.scrollTo(0, 0);
    const { top, height } = areaVisible();
    root.style.top = `${top}px`;
    root.style.height = `${height}px`;
    // Sin teclado, la página no tiene que quedar desplazada.
    if (!anularAhora && top === 0 && win.scrollY) win.scrollTo(0, 0);
    ajustarPortales();
    if (tecladoAbierto(win)) programarMostrarCampo();
  };

  // Un modal que se abre con el teclado ya abierto no dispara un resize: se ajusta al
  // enfocar su campo. No toca #root ni hace nada sin teclado (en la compu queda igual).
  const alEntrarAUnCampo = () => {
    if (cerrando) {
      // Se enfocó otro campo mientras se cerraba: vuelve a seguir al teclado.
      cerrando = false;
      ajustar();
      return;
    }
    if (!tecladoAbierto(win)) return;
    ajustarPortales();
    programarMostrarCampo();
  };

  // Técnica B: al salir del campo (sin pasar a otro) se cierra en el acto, sin esperar los
  // avisos del visualViewport.
  const cerrarEnElActo = () => {
    cerrando = true;
    if (esperaCampo != null) win.clearTimeout(esperaCampo);
    esperaCampo = null;
    root.style.top = "0px";
    root.style.height = `${win.innerHeight}px`;
    restaurarPortales();
    win.scrollTo(0, 0);
  };

  const timers = new Set();
  const alSalirDeUnCampo = (e) => {
    if (anularPan) {
      if (!esCampoDeTexto(e?.relatedTarget) && !hayCampoEnfocado(doc)) cerrarEnElActo();
      return;
    }
    REAJUSTES_AL_SALIR_MS.forEach((ms) => {
      const id = win.setTimeout(() => {
        timers.delete(id);
        // Si el foco pasó a otro campo, el teclado sigue abierto.
        if (!hayCampoEnfocado(doc)) ajustar();
      }, ms);
      timers.add(id);
    });
  };

  ajustar();
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
    timers.forEach((id) => win.clearTimeout(id));
    if (esperaCampo != null) win.clearTimeout(esperaCampo);
    restaurarPortales();
  };
}
