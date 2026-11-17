import {
  calcularAreaRoot,
  instalarAjusteViewport,
  mostrarCampoEnfocado,
  mostrarElemento,
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

describe("mostrarCampoEnfocado con contenedores anidados", () => {
  it("si el más cercano ya está al final, el resto lo desplaza el de afuera", () => {
    const { win, doc } = crearEntorno({ vvHeight: 420 });
    const afuera = { scrollHeight: 3000, clientHeight: 800, scrollTop: 0, scrollBy: jest.fn(), parentElement: doc.body };
    const lista = { scrollHeight: 600, clientHeight: 400, scrollTop: 170, scrollBy: jest.fn(), parentElement: afuera };
    win.getComputedStyle = () => ({ overflowY: "auto" });
    doc.activeElement = {
      tagName: "INPUT",
      parentElement: lista,
      ownerDocument: doc,
      getBoundingClientRect: () => ({ top: 450, bottom: 500 }),
    };

    // Hace falta 100: la lista solo puede 30 (máximo 200, está en 170) y el resto, afuera.
    expect(mostrarCampoEnfocado(win, doc)).toBe(100);
    expect(lista.scrollBy).toHaveBeenCalledWith({ top: 30, behavior: "smooth" });
    expect(afuera.scrollBy).toHaveBeenCalledWith({ top: 70, behavior: "smooth" });
  });
});

describe("técnica B: pasar de un campo a otro con el teclado abierto", () => {
  function conCampoTapado(doc, win) {
    const contenedor = { scrollHeight: 2000, clientHeight: 400, scrollTop: 0, scrollBy: jest.fn(), parentElement: doc.body };
    win.getComputedStyle = (nodo) => ({ overflowY: nodo === contenedor ? "auto" : "visible" });
    doc.activeElement = {
      tagName: "INPUT",
      parentElement: contenedor,
      ownerDocument: doc,
      getBoundingClientRect: () => ({ top: 450, bottom: 500 }),
    };
    return contenedor;
  }

  it("con las flechas de Safari (sin toque) el campo nuevo se lleva a la vista en el acto", () => {
    jest.useFakeTimers();
    const { win, doc, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 0 });
    instalarAjusteViewport(win, doc, { anularPan: true });
    const contenedor = conCampoTapado(doc, win);

    emitir("doc:focusin");

    expect(contenedor.scrollBy).toHaveBeenCalledTimes(1);
    expect(contenedor.scrollBy).toHaveBeenCalledWith({ top: 100, behavior: "auto" });
    jest.useRealTimers();
  });

  it("sin la técnica B, enfocar otro campo no desplaza", () => {
    const { win, doc, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 0 });
    instalarAjusteViewport(win, doc);
    const contenedor = conCampoTapado(doc, win);

    emitir("doc:focusin");

    expect(contenedor.scrollBy).not.toHaveBeenCalled();
  });
});

// Nuevo gasto: el pie con los botones queda fuera del ScrollView, arriba del teclado. El
// campo podía estar por arriba del teclado pero recortado por el borde del ScrollView.
describe("mostrarCampoEnfocado contra el borde visible del contenedor", () => {
  function entorno({ marco, campo, scrollTop = 0 }) {
    const { win, doc } = crearEntorno({ vvHeight: 420 });
    const contenedor = {
      scrollHeight: 2000,
      clientHeight: 150,
      scrollTop,
      scrollBy: jest.fn(),
      parentElement: doc.body,
      getBoundingClientRect: () => marco,
    };
    win.getComputedStyle = (nodo) => ({ overflowY: nodo === contenedor ? "auto" : "visible" });
    doc.activeElement = {
      tagName: "INPUT",
      parentElement: contenedor,
      ownerDocument: doc,
      getBoundingClientRect: () => campo,
    };
    return { win, doc, contenedor };
  }

  it("un campo arriba del teclado pero debajo del borde del ScrollView (pie fijo) se lleva a la vista", () => {
    // El ScrollView se ve de 100 a 250; el pie ocupa de 250 a 420, justo arriba del teclado.
    const { win, doc, contenedor } = entorno({ marco: { top: 100, bottom: 250 }, campo: { top: 260, bottom: 300 } });

    expect(mostrarCampoEnfocado(win, doc)).toBe(70);
    expect(contenedor.scrollBy).toHaveBeenCalledWith({ top: 70, behavior: "smooth" });
  });

  it("un campo que se ve dentro del ScrollView no se mueve", () => {
    const { win, doc, contenedor } = entorno({ marco: { top: 100, bottom: 250 }, campo: { top: 150, bottom: 200 } });

    expect(mostrarCampoEnfocado(win, doc)).toBe(0);
    expect(contenedor.scrollBy).not.toHaveBeenCalled();
  });

  it("un campo tapado por un encabezado fijo (arriba del ScrollView) baja lo justo", () => {
    const { win, doc, contenedor } = entorno({
      marco: { top: 100, bottom: 400 },
      campo: { top: 90, bottom: 130 },
      scrollTop: 200,
    });

    expect(mostrarCampoEnfocado(win, doc)).toBe(-30);
    expect(contenedor.scrollBy).toHaveBeenCalledWith({ top: -30, behavior: "smooth" });
  });
});

// Nueva actividad: la lista de guardados aparece debajo del campo "Nombre" y tiene que
// quedar arriba del teclado sin un segundo movimiento si ya se ve.
describe("mostrarElemento", () => {
  function entorno(rectLista) {
    const { win, doc } = crearEntorno({ vvHeight: 420 });
    const contenedor = {
      scrollHeight: 2000,
      clientHeight: 400,
      scrollTop: 0,
      scrollBy: jest.fn(),
      parentElement: doc.body,
      getBoundingClientRect: () => ({ top: 0, bottom: 420 }),
    };
    win.getComputedStyle = (nodo) => ({ overflowY: nodo === contenedor ? "auto" : "visible" });
    const lista = { parentElement: contenedor, ownerDocument: doc, getBoundingClientRect: () => rectLista };
    return { win, lista, contenedor };
  }

  it("si la lista quedó tapada por el teclado la sube lo justo", () => {
    const { win, lista, contenedor } = entorno({ top: 300, bottom: 470 });

    expect(mostrarElemento(win, lista)).toBe(70);
    expect(contenedor.scrollBy).toHaveBeenCalledWith({ top: 70, behavior: "smooth" });
  });

  it("si la lista ya se ve no se mueve nada", () => {
    const { win, lista, contenedor } = entorno({ top: 200, bottom: 350 });

    expect(mostrarElemento(win, lista)).toBe(0);
    expect(contenedor.scrollBy).not.toHaveBeenCalled();
  });

  it("sin elemento no hace nada", () => {
    const { win } = entorno({ top: 0, bottom: 0 });
    expect(mostrarElemento(win, null)).toBe(0);
  });
});

describe("Chrome de Android con resizes-content (la ventana se achica con el teclado)", () => {
  const UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
  const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1";

  function crearAndroid({ userAgent = UA_ANDROID, ancho = 412 } = {}) {
    const entorno = crearEntorno({ innerHeight: 800, vvHeight: 800 });
    entorno.win.navigator = { userAgent };
    entorno.win.innerWidth = ancho;
    // Abre o cierra el teclado como Chrome con resizes-content: bajan juntos la ventana y el
    // área visible, sin desplazamiento.
    entorno.achicar = (alto) => {
      entorno.win.innerHeight = alto;
      entorno.vv.height = alto;
      entorno.emitir("win:resize");
      entorno.emitir("vv:resize");
    };
    return entorno;
  }

  it("detecta el teclado aunque innerHeight y el área visible bajen juntos", () => {
    const { win, vv } = crearAndroid();
    expect(tecladoAbierto(win)).toBe(false);

    win.innerHeight = 430;
    vv.height = 430;
    expect(tecladoAbierto(win)).toBe(true);

    win.innerHeight = 800;
    vv.height = 800;
    expect(tecladoAbierto(win)).toBe(false);
  });

  it("la barra de direcciones de Chrome (cambio chico) no cuenta como teclado", () => {
    const { win, vv } = crearAndroid();
    tecladoAbierto(win);
    win.innerHeight = 744;
    vv.height = 744;
    expect(tecladoAbierto(win)).toBe(false);
  });

  it("al rotar (cambia el ancho) vuelve a medir el alto sin teclado", () => {
    const { win, vv } = crearAndroid();
    tecladoAbierto(win);

    // Horizontal: más ancha y más baja, sin teclado.
    win.innerWidth = 800;
    win.innerHeight = 412;
    vv.height = 412;
    expect(tecladoAbierto(win)).toBe(false);
  });

  it("#root toma el alto de la ventana achicada y queda arriba, sin desplazamientos", () => {
    const { win, doc, root, achicar } = crearAndroid();
    instalarAjusteViewport(win, doc);
    expect(root.style).toMatchObject({ top: "0px", height: "800px" });

    achicar(430);
    expect(root.style).toMatchObject({ top: "0px", height: "430px" });
    expect(win.scrollTo).not.toHaveBeenCalled();

    achicar(800);
    expect(root.style).toMatchObject({ top: "0px", height: "800px" });
  });

  it("los modales toman el área visible achicada y vuelven al cerrar el teclado", () => {
    const { win, doc, root, achicar } = crearAndroid();
    const portal = { style: {}, parentElement: doc.body };
    doc.modales.push({ parentElement: portal });
    instalarAjusteViewport(win, doc);

    achicar(430);
    expect(portal.style).toMatchObject({ top: "0px", height: "430px" });

    achicar(800);
    expect(portal.style.height).toBe("");
    expect(root.style.height).toBe("800px");
  });

  it("en el iPhone y en la compu se sigue comparando con la ventana (achicar la ventana no es teclado)", () => {
    const iphone = crearAndroid({ userAgent: UA_IPHONE });
    tecladoAbierto(iphone.win);
    iphone.win.innerHeight = 430;
    iphone.vv.height = 430;
    expect(tecladoAbierto(iphone.win)).toBe(false);

    const compu = crearAndroid({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0" });
    tecladoAbierto(compu.win);
    compu.win.innerHeight = 430;
    compu.vv.height = 430;
    expect(tecladoAbierto(compu.win)).toBe(false);

    // El caso de siempre en el iPhone: la ventana queda y el área visible baja.
    iphone.win.innerHeight = 800;
    iphone.vv.height = 420;
    expect(tecladoAbierto(iphone.win)).toBe(true);
  });
});
