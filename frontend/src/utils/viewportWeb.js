// Web en el celular: la app se ajusta al área visible para que el teclado no
// tape los campos (el contenedor #root es fijo y toma el alto del visualViewport).
//
// Con el teclado abierto, #root se acomoda al área visible (alto y desplazamiento
// del visualViewport). Al cerrarlo vuelve a ocupar toda la pantalla. Safari del
// iPhone a veces no avisa ese cierre (o informa un desplazamiento viejo) y la app
// quedaba chica y corrida hacia abajo, con un espacio en blanco arriba: por eso
// también se reajusta cuando un campo pierde el foco.

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

function hayCampoEnfocado(doc) {
  const activo = doc.activeElement;
  if (!activo) return false;
  const tag = (activo.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || activo.isContentEditable === true;
}

export function instalarAjusteViewport(win = window, doc = document) {
  const root = doc.getElementById("root");
  if (!root) return () => {};
  const vv = win.visualViewport;

  doc.documentElement.style.height = "100%";
  doc.body.style.height = "100%";
  doc.body.style.overflow = "hidden";
  root.style.position = "fixed";
  root.style.left = "0";
  root.style.right = "0";

  const ajustar = () => {
    const { top, height } = calcularAreaRoot(win);
    root.style.top = `${top}px`;
    root.style.height = `${height}px`;
    // Sin teclado, la página no tiene que quedar desplazada.
    if (top === 0 && win.scrollY) win.scrollTo(0, 0);
  };

  const timers = new Set();
  const alSalirDeUnCampo = () => {
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

  return () => {
    vv?.removeEventListener("resize", ajustar);
    vv?.removeEventListener("scroll", ajustar);
    win.removeEventListener("resize", ajustar);
    doc.removeEventListener("focusout", alSalirDeUnCampo);
    timers.forEach((id) => win.clearTimeout(id));
  };
}
