import { Platform } from "react-native";

import {
  CLAVE_MODO_TECLADO,
  activarModoTeclado,
  esIOS,
  instalarEnfoqueSinDesplazar,
  leerModoTeclado,
  mostrarIndicadorModo,
  tecladoUnificado,
} from "../utils/tecladoExperimental";

// Modo experimental del teclado: solo con ?teclado=a|b|ab. Sin el parámetro no cambia nada.

function crearSessionStorage(inicial = {}) {
  const datos = { ...inicial };
  return {
    getItem: (clave) => (clave in datos ? datos[clave] : null),
    setItem: (clave, valor) => {
      datos[clave] = String(valor);
    },
    removeItem: (clave) => {
      delete datos[clave];
    },
    datos,
  };
}

const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
const UA_ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile";
const UA_COMPU = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0";

function crearWin(search = "", guardado = {}, navigator = undefined) {
  return { location: { search }, sessionStorage: crearSessionStorage(guardado), navigator };
}

function crearDoc() {
  const oyentes = {};
  const body = { appendChild: jest.fn() };
  return {
    body,
    activeElement: null,
    oyentes,
    addEventListener: jest.fn((tipo, fn) => {
      oyentes[tipo] = fn;
    }),
    removeEventListener: jest.fn(),
    createElement: jest.fn(() => ({
      style: {},
      setAttribute: jest.fn(),
      remove: jest.fn(),
    })),
  };
}

function crearInput(extra = {}) {
  return { tagName: "INPUT", type: "text", focus: jest.fn(), parentElement: null, ...extra };
}

function toque(objetivo, { desde = [10, 10], hasta = [10, 10] } = {}) {
  return {
    inicio: { touches: [{ clientX: desde[0], clientY: desde[1] }] },
    fin: {
      target: objetivo,
      changedTouches: [{ clientX: hasta[0], clientY: hasta[1] }],
      preventDefault: jest.fn(),
    },
  };
}

describe("leerModoTeclado", () => {
  it("sin parámetro, en la compu queda apagado", () => {
    const win = crearWin("", {}, { userAgent: UA_COMPU, platform: "Win32", maxTouchPoints: 0 });
    expect(leerModoTeclado(win)).toMatchObject({ a: false, b: false, valor: null });
  });

  it("sin parámetro, en Android (Chrome) queda apagado: maneja el teclado distinto", () => {
    const win = crearWin("", {}, { userAgent: UA_ANDROID, platform: "Linux armv8l", maxTouchPoints: 5 });
    expect(leerModoTeclado(win)).toMatchObject({ a: false, b: false, valor: null });
  });

  it("sin parámetro, en el iPhone es 'ab' por defecto", () => {
    const win = crearWin("", {}, { userAgent: UA_IPHONE, platform: "iPhone", maxTouchPoints: 5 });
    expect(leerModoTeclado(win)).toEqual({ a: true, b: true, valor: "ab", desdeUrl: false });
  });

  it("sin parámetro, en el iPad con iPadOS (se presenta como Mac) también es 'ab'", () => {
    const win = crearWin("", {}, { userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 });
    expect(leerModoTeclado(win).valor).toBe("ab");
  });

  it("una Mac sin pantalla táctil no se toma como iPad", () => {
    expect(esIOS({ navigator: { userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 } })).toBe(false);
  });

  it.each([
    ["a", { a: true, b: false }],
    ["b", { a: false, b: true }],
    ["ab", { a: true, b: true }],
  ])("?teclado=%s activa las técnicas que corresponden y lo guarda", (valor, esperado) => {
    const win = crearWin(`?teclado=${valor}`);

    expect(leerModoTeclado(win)).toEqual({ ...esperado, valor, desdeUrl: true });
    expect(win.sessionStorage.datos[CLAVE_MODO_TECLADO]).toBe(valor);
  });

  it("al navegar sin el parámetro sigue activo lo guardado en sessionStorage", () => {
    const win = crearWin("", { [CLAVE_MODO_TECLADO]: "b" });
    expect(leerModoTeclado(win)).toEqual({ a: false, b: true, valor: "b", desdeUrl: false });
  });

  it("?teclado=0 lo apaga también en el iPhone y sigue apagado al navegar", () => {
    const iphone = { userAgent: UA_IPHONE, platform: "iPhone", maxTouchPoints: 5 };
    const win = crearWin("?teclado=0", { [CLAVE_MODO_TECLADO]: "ab" }, iphone);

    expect(leerModoTeclado(win)).toMatchObject({ a: false, b: false, valor: "0", desdeUrl: true });
    expect(win.sessionStorage.datos[CLAVE_MODO_TECLADO]).toBe("0");

    win.location.search = "";
    expect(leerModoTeclado(win)).toMatchObject({ a: false, b: false, valor: "0", desdeUrl: false });
  });

  it("un valor desconocido no se toma en cuenta: sigue lo de por defecto", () => {
    const win = crearWin("?teclado=xyz", {}, { userAgent: UA_IPHONE, platform: "iPhone", maxTouchPoints: 5 });
    expect(leerModoTeclado(win).valor).toBe("ab");
  });

  it("sin sessionStorage disponible no falla", () => {
    const win = {
      location: { search: "?teclado=a" },
      get sessionStorage() {
        throw new Error("bloqueado");
      },
    };
    expect(leerModoTeclado(win)).toEqual({ a: true, b: false, valor: "a", desdeUrl: true });
  });
});

describe("activarModoTeclado", () => {
  it("en el iPhone, sin parámetro, intercepta los toques pero no muestra el indicador", () => {
    const doc = crearDoc();

    const { modo, desinstalar } = activarModoTeclado(
      crearWin("", {}, { userAgent: UA_IPHONE, platform: "iPhone", maxTouchPoints: 5 }),
      doc
    );

    expect(modo.valor).toBe("ab");
    expect(doc.oyentes.touchend).toEqual(expect.any(Function));
    expect(doc.body.appendChild).not.toHaveBeenCalled();
    desinstalar();
  });

  it("con ?teclado=0 muestra el indicador 'teclado: 0' y no intercepta nada", () => {
    const doc = crearDoc();

    activarModoTeclado(crearWin("?teclado=0"), doc);

    expect(doc.addEventListener).not.toHaveBeenCalled();
    expect(doc.body.appendChild.mock.calls[0][0].textContent).toBe("teclado: 0");
  });

  it("sin parámetro no instala oyentes ni muestra el indicador", () => {
    const doc = crearDoc();

    const { modo } = activarModoTeclado(crearWin(), doc);

    expect(modo.valor).toBeNull();
    expect(doc.addEventListener).not.toHaveBeenCalled();
    expect(doc.body.appendChild).not.toHaveBeenCalled();
  });

  it("con ?teclado=b muestra el indicador pero no intercepta los toques", () => {
    const doc = crearDoc();

    activarModoTeclado(crearWin("?teclado=b"), doc);

    expect(doc.body.appendChild).toHaveBeenCalledTimes(1);
    expect(doc.addEventListener).not.toHaveBeenCalled();
  });

  it("con ?teclado=ab intercepta los toques y muestra 'teclado: ab'", () => {
    const doc = crearDoc();

    activarModoTeclado(crearWin("?teclado=ab"), doc);

    expect(doc.oyentes.touchend).toEqual(expect.any(Function));
    expect(doc.body.appendChild.mock.calls[0][0].textContent).toBe("teclado: ab");
  });
});

describe("técnica A: enfocar sin desplazar", () => {
  it("al tocar un campo sin foco evita el foco por defecto y enfoca con preventScroll", () => {
    const doc = crearDoc();
    instalarEnfoqueSinDesplazar(doc);
    const input = crearInput();
    const { inicio, fin } = toque(input);

    doc.oyentes.touchstart(inicio);
    doc.oyentes.touchend(fin);

    expect(fin.preventDefault).toHaveBeenCalled();
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("en un campo que ya tiene el foco no hace nada (cursor y selección como siempre)", () => {
    const doc = crearDoc();
    instalarEnfoqueSinDesplazar(doc);
    const input = crearInput();
    doc.activeElement = input;
    const { inicio, fin } = toque(input);

    doc.oyentes.touchstart(inicio);
    doc.oyentes.touchend(fin);

    expect(fin.preventDefault).not.toHaveBeenCalled();
    expect(input.focus).not.toHaveBeenCalled();
  });

  it("si el dedo se movió (desplazamiento) no enfoca", () => {
    const doc = crearDoc();
    instalarEnfoqueSinDesplazar(doc);
    const input = crearInput();
    const { inicio, fin } = toque(input, { desde: [10, 10], hasta: [10, 60] });

    doc.oyentes.touchstart(inicio);
    doc.oyentes.touchend(fin);

    expect(fin.preventDefault).not.toHaveBeenCalled();
  });

  it("no toca lo que no es un campo de texto", () => {
    const doc = crearDoc();
    instalarEnfoqueSinDesplazar(doc);
    const boton = { tagName: "DIV", parentElement: null };
    const casilla = crearInput({ type: "checkbox" });
    const soloLectura = crearInput({ readOnly: true });

    [boton, casilla, soloLectura].forEach((objetivo) => {
      const { inicio, fin } = toque(objetivo);
      doc.oyentes.touchstart(inicio);
      doc.oyentes.touchend(fin);
      expect(fin.preventDefault).not.toHaveBeenCalled();
    });
  });

  it("encuentra el campo aunque el toque caiga en un elemento de adentro", () => {
    const doc = crearDoc();
    instalarEnfoqueSinDesplazar(doc);
    const textarea = crearInput({ tagName: "TEXTAREA", type: "" });
    const interno = { tagName: "SPAN", parentElement: textarea };
    const { inicio, fin } = toque(interno);

    doc.oyentes.touchstart(inicio);
    doc.oyentes.touchend(fin);

    expect(textarea.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});

describe("indicador", () => {
  it("sin modo no agrega nada", () => {
    const doc = crearDoc();
    mostrarIndicadorModo(doc, { valor: null });
    expect(doc.body.appendChild).not.toHaveBeenCalled();
  });
});

describe("técnica A: solo con toques", () => {
  it("solo escucha touchstart y touchend: un clic con mouse no pasa por acá", () => {
    const doc = crearDoc();
    instalarEnfoqueSinDesplazar(doc);

    const tipos = doc.addEventListener.mock.calls.map(([tipo]) => tipo);
    expect(tipos.sort()).toEqual(["touchend", "touchstart"]);
    expect(tipos).not.toContain("pointerdown");
    expect(tipos).not.toContain("mousedown");
    expect(tipos).not.toContain("click");
  });
});

describe("tecladoUnificado", () => {
  const osOriginal = Platform.OS;
  afterEach(() => {
    Platform.OS = osOriginal;
  });

  const activar = (search) => activarModoTeclado(crearWin(search), crearDoc());

  it("en web con la técnica B activa es true", () => {
    Platform.OS = "web";
    const { desinstalar } = activar("?teclado=ab");
    expect(tecladoUnificado()).toBe(true);
    desinstalar();
    const soloB = activar("?teclado=b");
    expect(tecladoUnificado()).toBe(true);
    soloB.desinstalar();
  });

  it("es false con ?teclado=0, con solo la técnica A y sin activar", () => {
    Platform.OS = "web";
    expect(tecladoUnificado()).toBe(false);
    const apagado = activar("?teclado=0");
    expect(tecladoUnificado()).toBe(false);
    apagado.desinstalar();
    const soloA = activar("?teclado=a");
    expect(tecladoUnificado()).toBe(false);
    soloA.desinstalar();
  });

  it("en Android/iOS nativo siempre es false", () => {
    Platform.OS = "ios";
    const { desinstalar } = activar("?teclado=ab");
    expect(tecladoUnificado()).toBe(false);
    desinstalar();
  });
});
