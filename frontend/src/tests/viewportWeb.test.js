import { calcularAreaRoot, instalarAjusteViewport, tecladoAbierto } from "../utils/viewportWeb";

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
