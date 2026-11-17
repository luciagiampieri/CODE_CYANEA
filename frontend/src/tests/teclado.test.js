import fs from "fs";
import path from "path";
import { Platform } from "react-native";

// En la web, react-native-web cierra el teclado con "on-drag" ante CUALQUIER scroll,
// incluido el que hace la pantalla para mostrar el campo enfocado: el teclado se abría
// y se cerraba al primer toque. Toda lista o formulario usa MODO_CIERRE_TECLADO.

// MODO_CIERRE_TECLADO y SIN_AUTORRELLENO se calculan al cargar el módulo: se carga aparte
// con la plataforma pedida. jest.isolateModules usa su propia copia de react-native, así que la plataforma se
// cambia en esa copia (y también en la de afuera, por si el entorno la comparte).
function autorrellenoEn(os) {
  const original = Platform.OS;
  let valor;
  try {
    Platform.OS = os;
    jest.isolateModules(() => {
      require("react-native").Platform.OS = os;
      valor = require("../utils/teclado").SIN_AUTORRELLENO;
    });
  } finally {
    Platform.OS = original;
  }
  return valor;
}

function modoEn(os) {
  const original = Platform.OS;
  let modo;
  try {
    Platform.OS = os;
    jest.isolateModules(() => {
      require("react-native").Platform.OS = os;
      modo = require("../utils/teclado").MODO_CIERRE_TECLADO;
    });
  } finally {
    Platform.OS = original;
  }
  return modo;
}

function archivosJs(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosJs(ruta);
    return entrada.name.endsWith(".js") ? [ruta] : [];
  });
}

describe("MODO_CIERRE_TECLADO", () => {
  it("en la web no cierra el teclado al desplazar", () => {
    expect(modoEn("web")).toBe("none");
  });

  it("en Android e iOS sigue cerrándolo al arrastrar", () => {
    expect(modoEn("android")).toBe("on-drag");
    expect(modoEn("ios")).toBe("on-drag");
  });

  it("ninguna pantalla ni componente usa keyboardDismissMode=\"on-drag\" directo", () => {
    const src = path.join(__dirname, "..");
    const conOnDrag = [path.join(src, "screens"), path.join(src, "components")]
      .flatMap(archivosJs)
      .filter((archivo) => /keyboardDismissMode=["']on-drag["']/.test(fs.readFileSync(archivo, "utf8")))
      .map((archivo) => path.relative(src, archivo));

    expect(conOnDrag).toEqual([]);
  });
});

describe("ocultarConTeclado", () => {
  const osOriginal = Platform.OS;
  afterEach(() => {
    Platform.OS = osOriginal;
  });

  it("en Android/iOS oculta lo que se saca con el teclado abierto", () => {
    const { ocultarConTeclado } = require("../utils/teclado");
    Platform.OS = "ios";
    expect(ocultarConTeclado(true)).toBe(true);
    expect(ocultarConTeclado(false)).toBe(false);
  });

  it("en la web nunca oculta: sacarlo y volverlo a poner hacía saltar la pantalla", () => {
    const { ocultarConTeclado } = require("../utils/teclado");
    Platform.OS = "web";
    expect(ocultarConTeclado(true)).toBe(false);
  });
});

describe("SIN_AUTORRELLENO", () => {
  it("en la web apaga el autorrelleno para que Safari no ofrezca contactos", () => {
    expect(autorrellenoEn("web")).toEqual({ autoComplete: "off" });
  });

  it("en Android/iOS no agrega nada", () => {
    expect(autorrellenoEn("android")).toEqual({});
    expect(autorrellenoEn("ios")).toEqual({});
  });
});
