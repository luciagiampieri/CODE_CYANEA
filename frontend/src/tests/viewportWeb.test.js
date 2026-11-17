import {
  calcularAreaRoot,
  instalarAjusteViewport,
  mostrarCampoEnfocado,
  tecladoAbierto,
} from "../utils/viewportWeb";
import { colors } from "../theme/tokens";

function crearEntorno({ innerHeight = 800, vvHeight = 800, offsetTop = 0, scale = 1 } = {}) {
  const oyentes = {};
  const vv = {
    height: vvHeight,
    offsetTop,
    scale,
    addEventListener: (tipo, fn) => ((oyentes[`vv:${tipo}`] ||= []).push(fn)),
    removeEventListener: jest.fn(),
  };
  const win = {
    innerHeight,
    scrollY: 0,
    visualViewport: vv,
    scrollTo: jest.fn(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    addEventListener: (tipo, fn) => ((oyentes[`win:${tipo}`] ||= []).push(fn)),
    removeEventListener: jest.fn(),
  };
  const body = { style: {} };
  const root = { style: {}, parentElement: body };
  const modales = [];
  const doc = {
    activeElement: null,
    documentElement: { style: {} },
    body,
    modales,
    querySelectorAll: (selector) => (selector === '[aria-modal="true"]' ? modales : []),
    getElementById: () => root,
    addEventListener: (tipo, fn) => ((oyentes[`doc:${tipo}`] ||= []).push(fn)),
    removeEventListener: jest.fn(),
  };
  const emitir = (clave) => (oyentes[clave] || []).forEach((fn) => fn());
  return { win, vv, doc, root, emitir };
}

describe("ajuste del área visible en la web", () => {
  afterEach(() => jest.useRealTimers());

  it("con el teclado abierto la app toma el área visible", () => {
    const { win } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
    expect(tecladoAbierto(win)).toBe(true);
    expect(calcularAreaRoot(win)).toEqual({ top: 260, height: 420 });
  });

  it("sin teclado ocupa toda la pantalla aunque Safari informe un desplazamiento viejo", () => {
    const { win } = crearEntorno({ vvHeight: 790, offsetTop: 260 });
    expect(calcularAreaRoot(win)).toEqual({ top: 0, height: 800 });
  });

  it("un zoom no se toma como teclado", () => {
    const { win } = crearEntorno({ vvHeight: 400, offsetTop: 200, scale: 2 });
    expect(tecladoAbierto(win)).toBe(false);
    expect(calcularAreaRoot(win)).toEqual({ top: 0, height: 800 });
  });

  it("al salir de un campo se reacomoda aunque Safari no avise que se cerró el teclado", () => {
    jest.useFakeTimers();
    const { win, vv, doc, root, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
    instalarAjusteViewport(win, doc);
    expect(root.style).toMatchObject({ top: "260px", height: "420px" });

    // Se cierra el teclado pero no llega ningún evento del visualViewport.
    vv.height = 800;
    win.scrollY = 120;
    emitir("doc:focusout");
    jest.runAllTimers();

    expect(root.style).toMatchObject({ top: "0px", height: "800px" });
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("si el foco pasa a otro campo no se reacomoda", () => {
    jest.useFakeTimers();
    const { win, doc, root, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
    instalarAjusteViewport(win, doc);
    doc.activeElement = { tagName: "INPUT" };

    emitir("doc:focusout");
    jest.runAllTimers();

    expect(root.style).toMatchObject({ top: "260px", height: "420px" });
  });

  describe("modales (react-native-web los monta fuera de #root)", () => {
    // Igual que react-native-web: div en <body> > animación > contenido con aria-modal.
    function agregarModal(doc) {
      const portal = { style: {}, parentElement: doc.body };
      const animacion = { style: {}, parentElement: portal };
      const contenido = { style: {}, parentElement: animacion };
      doc.modales.push(contenido);
      return portal;
    }

    const ESTILOS_PORTAL = ["position", "left", "right", "top", "height", "transform"];
    const sinEstilosInline = (portal) =>
      ESTILOS_PORTAL.every((prop) => !portal.style[prop]);

    it("con el teclado abierto el modal toma el área visible", () => {
      const { win, doc } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
      const portal = agregarModal(doc);

      instalarAjusteViewport(win, doc);

      expect(portal.style).toEqual({
        position: "fixed",
        left: "0",
        right: "0",
        top: "260px",
        height: "420px",
        transform: "translateZ(0)",
      });
    });

    it("sin teclado el modal queda como hoy, sin estilos inline", () => {
      const { win, doc } = crearEntorno();
      const portal = agregarModal(doc);

      instalarAjusteViewport(win, doc);

      expect(portal.style).toEqual({});
    });

    it("al cerrar el teclado se quitan por completo los estilos del modal", () => {
      const { win, vv, doc, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
      const portal = agregarModal(doc);
      instalarAjusteViewport(win, doc);
      expect(portal.style.top).toBe("260px");

      vv.height = 800;
      vv.offsetTop = 0;
      emitir("vv:resize");

      expect(sinEstilosInline(portal)).toBe(true);
    });

    it("no toca #root como modal ni lo que no tiene aria-modal", () => {
      const { win, doc, root } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
      // Algo con aria-modal dentro de #root y un div de <body> sin aria-modal.
      doc.modales.push({ style: {}, parentElement: root });
      const otroDiv = { style: {}, parentElement: doc.body };

      instalarAjusteViewport(win, doc);

      expect(root.style.transform).toBeUndefined();
      expect(root.style).toMatchObject({ position: "fixed", top: "260px", height: "420px" });
      expect(otroDiv.style).toEqual({});
    });

    it("un modal que se abre con el teclado ya abierto se ajusta al enfocar su campo", () => {
      const { win, doc, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
      instalarAjusteViewport(win, doc);
      const portal = agregarModal(doc);
      expect(portal.style).toEqual({});

      emitir("doc:focusin");

      expect(portal.style).toMatchObject({ top: "260px", height: "420px" });
    });

    it("en la compu enfocar un campo no cambia nada: ni #root ni los modales", () => {
      const { win, doc, root, emitir } = crearEntorno();
      const portal = agregarModal(doc);
      instalarAjusteViewport(win, doc);
      const rootAntes = { ...root.style };
      win.scrollTo.mockClear();

      doc.activeElement = { tagName: "INPUT" };
      emitir("doc:focusin");

      expect(root.style).toEqual(rootAntes);
      expect(portal.style).toEqual({});
      expect(win.scrollTo).not.toHaveBeenCalled();
    });

    it("al desinstalar el ajuste los modales vuelven a quedar sin estilos", () => {
      const { win, doc } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
      const portal = agregarModal(doc);
      const desinstalar = instalarAjusteViewport(win, doc);

      desinstalar();

      expect(sinEstilosInline(portal)).toBe(true);
    });
  });
});

// Modo experimental, técnica B (?teclado=b): se deshace el desplazamiento propio de Safari.
describe("técnica B: anular el desplazamiento de Safari", () => {
  afterEach(() => jest.useRealTimers());

  function agregarModal(doc) {
    const portal = { style: {}, parentElement: doc.body };
    doc.modales.push({ style: {}, parentElement: portal });
    return portal;
  }

  it("sin la opción (sin parámetro) queda como siempre: sigue el desplazamiento de Safari", () => {
    const { win, doc, root } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
    instalarAjusteViewport(win, doc);

    expect(win.scrollTo).not.toHaveBeenCalled();
    expect(root.style).toMatchObject({ top: "260px", height: "420px" });
  });

  it("con anularPan vuelve la página a 0 y deja #root y los modales arriba de todo", () => {
    const { win, doc, root } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
    const portal = agregarModal(doc);

    instalarAjusteViewport(win, doc, { anularPan: true });

    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(root.style).toMatchObject({ top: "0px", height: "420px" });
    expect(portal.style).toMatchObject({ top: "0px", height: "420px" });
  });

  it("con anularPan y sin teclado no hace nada distinto", () => {
    const { win, doc, root } = crearEntorno();
    instalarAjusteViewport(win, doc, { anularPan: true });

    expect(win.scrollTo).not.toHaveBeenCalled();
    expect(root.style).toMatchObject({ top: "0px", height: "800px" });
  });

  it("con anularPan, después de abrirse el teclado lleva el campo a la vista una sola vez", () => {
    jest.useFakeTimers();
    const { win, doc, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 0 });
    const contenedor = { scrollHeight: 2000, clientHeight: 400, scrollBy: jest.fn(), parentElement: doc.body };
    win.getComputedStyle = (nodo) => ({ overflowY: nodo === contenedor ? "auto" : "visible" });
    doc.activeElement = {
      tagName: "INPUT",
      parentElement: contenedor,
      ownerDocument: doc,
      getBoundingClientRect: () => ({ top: 450, bottom: 500 }),
    };

    instalarAjusteViewport(win, doc, { anularPan: true });
    emitir("vv:resize");
    emitir("vv:resize");
    jest.advanceTimersByTime(200);

    // abajo (500) + margen (20) - visible (420)
    expect(contenedor.scrollBy).toHaveBeenCalledTimes(1);
    expect(contenedor.scrollBy).toHaveBeenCalledWith({ top: 100, behavior: "smooth" });
  });
});

describe("mostrarCampoEnfocado", () => {
  function entornoConCampo({ top, bottom, vvHeight = 420 }) {
    const { win, doc } = crearEntorno({ vvHeight });
    const contenedor = { scrollHeight: 2000, clientHeight: 400, scrollBy: jest.fn(), parentElement: doc.body };
    win.getComputedStyle = (nodo) => ({ overflowY: nodo === contenedor ? "auto" : "visible" });
    doc.activeElement = {
      tagName: "TEXTAREA",
      parentElement: contenedor,
      ownerDocument: doc,
      getBoundingClientRect: () => ({ top, bottom }),
    };
    return { win, doc, contenedor };
  }

  it("si el campo ya se ve no desplaza", () => {
    const { win, doc, contenedor } = entornoConCampo({ top: 100, bottom: 150 });

    expect(mostrarCampoEnfocado(win, doc)).toBe(0);
    expect(contenedor.scrollBy).not.toHaveBeenCalled();
  });

  it("si quedó tapado desplaza lo justo, no al medio de la pantalla", () => {
    const { win, doc, contenedor } = entornoConCampo({ top: 440, bottom: 480 });

    expect(mostrarCampoEnfocado(win, doc)).toBe(80);
    expect(contenedor.scrollBy).toHaveBeenCalledWith({ top: 80, behavior: "smooth" });
  });

  it("sin campo enfocado no hace nada", () => {
    const { win, doc } = crearEntorno({ vvHeight: 420 });
    expect(mostrarCampoEnfocado(win, doc)).toBe(0);
  });
});

// Modo b, cierre: al tocar afuera la pantalla se veía un instante corrida hacia abajo, con
// una franja arriba y la barra de Safari en el medio. Ahora se cierra en el acto.
describe("técnica B: cierre del teclado en el acto", () => {
  afterEach(() => jest.useRealTimers());

  function agregarModal(doc) {
    const portal = { style: {}, parentElement: doc.body };
    doc.modales.push({ style: {}, parentElement: portal });
    return portal;
  }

  const salir = (doc, emitirFocusout, relatedTarget = null) => {
    doc.activeElement = null;
    emitirFocusout({ relatedTarget });
  };

  // emitir del entorno no pasa el evento: se usa el oyente guardado.
  function oyente(doc, tipo) {
    return doc.addEventListener.mock
      ? doc.addEventListener.mock.calls.filter(([t]) => t === tipo).map(([, fn]) => fn).pop()
      : null;
  }

  function entorno(opciones) {
    const env = crearEntorno(opciones);
    const original = env.doc.addEventListener;
    env.doc.addEventListener = jest.fn(original);
    return env;
  }

  it("al salir del campo pasa #root a pantalla completa y la página a 0 enseguida", () => {
    const { win, doc, root } = entorno({ vvHeight: 420, offsetTop: 0 });
    const portal = agregarModal(doc);
    instalarAjusteViewport(win, doc, { anularPan: true });
    expect(root.style).toMatchObject({ top: "0px", height: "420px" });
    win.scrollTo.mockClear();

    salir(doc, oyente(doc, "focusout"));

    expect(root.style).toMatchObject({ top: "0px", height: "800px" });
    expect(win.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(["position", "top", "height", "transform"].every((prop) => !portal.style[prop])).toBe(true);
  });

  it("ignora los avisos intermedios del cierre mientras no haya un campo enfocado", () => {
    const { win, vv, doc, root, emitir } = entorno({ vvHeight: 420, offsetTop: 0 });
    instalarAjusteViewport(win, doc, { anularPan: true });
    salir(doc, oyente(doc, "focusout"));

    vv.height = 560;
    vv.offsetTop = 120;
    emitir("vv:resize");
    emitir("vv:scroll");

    expect(root.style).toMatchObject({ top: "0px", height: "800px" });

    // Llega el aviso final (sin teclado): queda igual.
    vv.height = 800;
    vv.offsetTop = 0;
    emitir("vv:resize");
    expect(root.style).toMatchObject({ top: "0px", height: "800px" });
  });

  it("si el foco pasa a otro campo no cierra", () => {
    const { win, doc, root } = entorno({ vvHeight: 420, offsetTop: 0 });
    instalarAjusteViewport(win, doc, { anularPan: true });

    oyente(doc, "focusout")({ relatedTarget: { tagName: "INPUT" } });

    expect(root.style).toMatchObject({ top: "0px", height: "420px" });
  });

  it("si se enfoca otro campo mientras se cerraba, vuelve a seguir al teclado", () => {
    const { win, doc, root } = entorno({ vvHeight: 420, offsetTop: 0 });
    instalarAjusteViewport(win, doc, { anularPan: true });
    salir(doc, oyente(doc, "focusout"));

    doc.activeElement = { tagName: "INPUT" };
    oyente(doc, "focusin")();

    expect(root.style).toMatchObject({ top: "0px", height: "420px" });
  });

  it("sin la opción (sin parámetro) salir del campo no cierra en el acto", () => {
    const { win, doc, root } = entorno({ vvHeight: 420, offsetTop: 260 });
    instalarAjusteViewport(win, doc);

    salir(doc, oyente(doc, "focusout"));

    expect(root.style).toMatchObject({ top: "260px", height: "420px" });
  });
});

describe("fondo", () => {
  it("<html> y <body> tienen el fondo de la app, también sin el modo experimental", () => {
    const { win, doc } = crearEntorno();
    instalarAjusteViewport(win, doc);

    expect(doc.documentElement.style.backgroundColor).toBe(colors.background);
    expect(doc.body.style.backgroundColor).toBe(colors.background);
  });
});
