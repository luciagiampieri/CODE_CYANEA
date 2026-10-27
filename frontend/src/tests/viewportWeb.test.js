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
  const root = { style: {} };
  const doc = {
    activeElement: null,
    documentElement: { style: {} },
    body: { style: {} },
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
});
