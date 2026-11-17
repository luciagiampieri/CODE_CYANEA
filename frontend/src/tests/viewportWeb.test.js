import {
  calcularAreaRoot,
  esperarViewportQuieto,
  instalarAjusteViewport,
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
      jest.useFakeTimers();
      const { win, vv, doc, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
      const portal = agregarModal(doc);
      instalarAjusteViewport(win, doc);
      expect(portal.style.top).toBe("260px");

      vv.height = 800;
      vv.offsetTop = 0;
      emitir("vv:resize");
      // Se reacomoda cuando el área quedó quieta (cierre en un solo paso).
      jest.runAllTimers();

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

  describe("cierre del teclado en un solo paso", () => {
    it("mientras Safari informa alturas intermedias no se reacomoda; al quedar quieta, una sola vez", () => {
      jest.useFakeTimers();
      const { win, vv, doc, root, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
      instalarAjusteViewport(win, doc);
      const alturas = [];
      let alto = root.style.height;
      Object.defineProperty(root.style, "height", {
        get: () => alto,
        set: (valor) => {
          alto = valor;
          alturas.push(valor);
        },
      });

      // Se cierra el teclado: Safari avisa alturas intermedias.
      [[560, 120], [690, 40], [800, 0]].forEach(([altura, desplazamiento]) => {
        vv.height = altura;
        vv.offsetTop = desplazamiento;
        emitir("vv:resize");
        jest.advanceTimersByTime(40);
      });
      expect(alturas).toEqual([]);

      jest.runAllTimers();

      expect(alturas).toEqual(["800px"]);
      expect(root.style.top).toBe("0px");
    });

    it("al abrir el teclado se aplica enseguida", () => {
      jest.useFakeTimers();
      const { win, vv, doc, root, emitir } = crearEntorno();
      instalarAjusteViewport(win, doc);

      vv.height = 420;
      vv.offsetTop = 260;
      emitir("vv:resize");

      expect(root.style).toMatchObject({ top: "260px", height: "420px" });
    });

    it("si el teclado se vuelve a abrir antes de quedar quieta, no se agranda", () => {
      jest.useFakeTimers();
      const { win, vv, doc, root, emitir } = crearEntorno({ vvHeight: 420, offsetTop: 260 });
      instalarAjusteViewport(win, doc);

      vv.height = 800;
      vv.offsetTop = 0;
      emitir("vv:resize");
      vv.height = 420;
      vv.offsetTop = 260;
      emitir("vv:resize");
      jest.runAllTimers();

      expect(root.style).toMatchObject({ top: "260px", height: "420px" });
    });

    it("sin teclado (en la compu) un resize de la ventana se aplica enseguida", () => {
      const { win, doc, root, emitir } = crearEntorno();
      instalarAjusteViewport(win, doc);

      win.innerHeight = 700;
      win.visualViewport.height = 700;
      emitir("win:resize");

      expect(root.style).toMatchObject({ top: "0px", height: "700px" });
    });

    it("el fondo de <body> es el de la app, para que no se vea una franja blanca", () => {
      const { win, doc } = crearEntorno();
      instalarAjusteViewport(win, doc);

      expect(doc.body.style.backgroundColor).toBe(colors.background);
    });
  });

  describe("esperarViewportQuieto", () => {
    it("avisa cuando dos lecturas seguidas son iguales", () => {
      jest.useFakeTimers();
      const { win, vv } = crearEntorno();
      const alTerminar = jest.fn();

      esperarViewportQuieto(win, alTerminar);
      vv.height = 700;
      jest.advanceTimersByTime(80);
      expect(alTerminar).not.toHaveBeenCalled();

      jest.advanceTimersByTime(80);
      expect(alTerminar).toHaveBeenCalledTimes(1);
    });

    it("no espera más del máximo aunque siga cambiando", () => {
      jest.useFakeTimers();
      const { win, vv } = crearEntorno();
      const alTerminar = jest.fn();

      esperarViewportQuieto(win, alTerminar, { intervalo: 80, maximo: 240 });
      [700, 600, 500, 400].forEach((altura) => {
        vv.height = altura;
        jest.advanceTimersByTime(80);
      });

      expect(alTerminar).toHaveBeenCalledTimes(1);
    });

    it("se puede cancelar", () => {
      jest.useFakeTimers();
      const { win } = crearEntorno();
      const alTerminar = jest.fn();

      const cancelar = esperarViewportQuieto(win, alTerminar);
      cancelar();
      jest.runAllTimers();

      expect(alTerminar).not.toHaveBeenCalled();
    });
  });
});
