import {
  CLAVE_MODO_TECLADO,
  activarModoTeclado,
  instalarEnfoqueSinDesplazar,
  leerModoTeclado,
  mostrarIndicadorModo,
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

function crearWin(search = "", guardado = {}) {
  return { location: { search }, sessionStorage: crearSessionStorage(guardado) };
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
  it("sin parámetro ni nada guardado no activa nada", () => {
    expect(leerModoTeclado(crearWin())).toEqual({ a: false, b: false, valor: null });
  });

  it.each([
    ["a", { a: true, b: false }],
    ["b", { a: false, b: true }],
    ["ab", { a: true, b: true }],
  ])("?teclado=%s activa las técnicas que corresponden y lo guarda", (valor, esperado) => {
    const win = crearWin(`?teclado=${valor}`);

    expect(leerModoTeclado(win)).toEqual({ ...esperado, valor });
    expect(win.sessionStorage.datos[CLAVE_MODO_TECLADO]).toBe(valor);
  });

  it("al navegar sin el parámetro sigue activo lo guardado en sessionStorage", () => {
    const win = crearWin("", { [CLAVE_MODO_TECLADO]: "b" });
    expect(leerModoTeclado(win)).toEqual({ a: false, b: true, valor: "b" });
  });

  it("un valor que no es a, b ni ab (por ejemplo ?teclado=0) lo apaga", () => {
    const win = crearWin("?teclado=0", { [CLAVE_MODO_TECLADO]: "ab" });

    expect(leerModoTeclado(win).valor).toBeNull();
    expect(win.sessionStorage.datos[CLAVE_MODO_TECLADO]).toBeUndefined();
  });

  it("sin sessionStorage disponible no falla", () => {
    const win = {
      location: { search: "?teclado=a" },
      get sessionStorage() {
        throw new Error("bloqueado");
      },
    };
    expect(leerModoTeclado(win)).toEqual({ a: true, b: false, valor: "a" });
  });
});

describe("activarModoTeclado", () => {
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
