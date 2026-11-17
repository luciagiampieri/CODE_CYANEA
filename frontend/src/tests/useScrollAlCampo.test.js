import { Platform } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

import useScrollAlCampo from "../hooks/useScrollAlCampo";

// El hook reemplaza las copias que tenían CreateTripScreen (con base) y AddGastoScreen
// (sin base): el cálculo tiene que dar el mismo resultado que antes.

const layout = (y, height = 0) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height } } });
const scroll = (y) => ({ nativeEvent: { contentOffset: { x: 0, y } } });

async function montar(opciones) {
  const utils = await renderHook(() => useScrollAlCampo(opciones));
  const scrollTo = jest.fn();
  utils.result.current.ref.current = { scrollTo };
  return { ...utils, scrollTo };
}

// En RNTL v14 act es asíncrono: siempre con await, si no se pisan y result.current queda en null.
async function verVisible(result, alto) {
  await act(async () => {
    result.current.scrollProps.onLayout(layout(0, alto));
  });
}

async function enfocarYEsperar(result, key, opciones) {
  await act(async () => {
    result.current.enfocar(key, opciones);
    jest.advanceTimersByTime(400);
  });
}

async function medir(fn) {
  await act(async () => {
    fn();
  });
}

describe("useScrollAlCampo", () => {
  const osOriginal = Platform.OS;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    Platform.OS = osOriginal;
  });

  it("sin base (AddGastoScreen): si el campo queda tapado lo sube lo justo", async () => {
    const { result, scrollTo } = await montar();
    await verVisible(result, 300);
    await medir(() => result.current.registrar("nombre")(layout(400, 50)));

    await enfocarYEsperar(result, "nombre");

    // abajo (450) + margen (20) - alto visible (300)
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 170, animated: true });
  });

  it("si el campo ya se ve no mueve nada", async () => {
    const { result, scrollTo } = await montar();
    await verVisible(result, 600);
    await medir(() => result.current.registrar("monto")(layout(100, 50)));

    await enfocarYEsperar(result, "monto");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("con base (CreateTripScreen): suma la posición de la tarjeta, igual que antes", async () => {
    const { result, scrollTo } = await montar();
    await verVisible(result, 300);
    await medir(() => {
      result.current.registrarBase(layout(200));
      result.current.registrar("title")(layout(150, 40));
    });

    await enfocarYEsperar(result, "title");

    // base (200) + campo (150) + alto (40) + margen (20) - visible (300)
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 110, animated: true });
  });

  it("si el campo quedó arriba del área visible lo baja hasta verlo", async () => {
    const { result, scrollTo } = await montar();
    await verVisible(result, 300);
    await medir(() => {
      result.current.scrollProps.onScroll(scroll(500));
      result.current.registrar("nombre")(layout(400, 50));
    });

    await enfocarYEsperar(result, "nombre");

    expect(scrollTo).toHaveBeenLastCalledWith({ y: 380, animated: true });
  });

  it("suma la cadena de contenedores de un campo anidado", async () => {
    const { result, scrollTo } = await montar();
    await verVisible(result, 300);
    await medir(() => {
      result.current.registrarContenedor("body")(layout(250));
      result.current.registrarContenedor("form", "body")(layout(60));
      result.current.registrar("password", "form")(layout(100, 40));
    });

    await enfocarYEsperar(result, "password");

    // 250 + 60 + 100 + 40 + 20 - 300
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 170, animated: true });
  });

  it("con soloWeb en Android/iOS no agrega props ni desplaza", async () => {
    Platform.OS = "ios";
    const { result, scrollTo } = await montar({ soloWeb: true });

    expect(result.current.scrollProps).toEqual({});
    expect(result.current.registrar("email", "form")).toBeUndefined();
    expect(result.current.registrarContenedor("form")).toBeUndefined();

    await enfocarYEsperar(result, "email");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("con soloWeb en la web desplaza como siempre", async () => {
    Platform.OS = "web";
    const { result, scrollTo } = await montar({ soloWeb: true });
    await verVisible(result, 300);
    await medir(() => result.current.registrar("nombre")(layout(400, 50)));

    await enfocarYEsperar(result, "nombre");

    expect(scrollTo).toHaveBeenLastCalledWith({ y: 170, animated: true });
  });

  it("enfocar con soloWeb no desplaza en Android/iOS", async () => {
    Platform.OS = "android";
    const { result, scrollTo } = await montar();
    await verVisible(result, 300);
    await medir(() => result.current.registrar("participantes")(layout(400, 50)));

    await enfocarYEsperar(result, "participantes", { soloWeb: true });

    expect(scrollTo).not.toHaveBeenCalled();
  });

  // En la web onLayout solo avisa cambios de tamaño: si lo de arriba del campo cambia después
  // (barra de espacio, tarjeta del archivo en Subir documento), la posición guardada queda vieja.
  describe("registrarNodo: medir el campo al enfocarlo", () => {
    function conNodo(result, key, medir) {
      const contenido = {};
      result.current.ref.current.getInnerViewRef = () => contenido;
      const nodo = { measureLayout: jest.fn((relativoA, ok, error) => medir(relativoA, ok, error)) };
      result.current.registrarNodo(key)(nodo);
      return { nodo, contenido };
    }

    it("usa la posición medida aunque la de onLayout haya quedado vieja", async () => {
      Platform.OS = "web";
      const { result, scrollTo } = await montar({ soloWeb: true });
      await verVisible(result, 300);
      // onLayout dijo 100 (se ve), pero lo de arriba creció y el campo ahora está en 400.
      await medir(() => result.current.registrar("nombre")(layout(100, 50)));
      const { nodo, contenido } = conNodo(result, "nombre", (_rel, ok) => ok(0, 400, 300, 50));

      await enfocarYEsperar(result, "nombre");

      expect(nodo.measureLayout).toHaveBeenCalledWith(contenido, expect.any(Function), expect.any(Function));
      expect(scrollTo).toHaveBeenLastCalledWith({ y: 170, animated: true });
    });

    it("si la medición falla usa la posición de onLayout", async () => {
      Platform.OS = "web";
      const { result, scrollTo } = await montar({ soloWeb: true });
      await verVisible(result, 300);
      await medir(() => result.current.registrar("nombre")(layout(400, 50)));
      conNodo(result, "nombre", (_rel, _ok, error) => error());

      await enfocarYEsperar(result, "nombre");

      expect(scrollTo).toHaveBeenLastCalledWith({ y: 170, animated: true });
    });

    it("el ref es el mismo en cada render, así no se registra de nuevo", async () => {
      const { result } = await montar();
      expect(result.current.registrarNodo("nombre")).toBe(result.current.registrarNodo("nombre"));
    });

    it("con soloWeb en Android/iOS no devuelve ref", async () => {
      Platform.OS = "ios";
      const { result } = await montar({ soloWeb: true });
      expect(result.current.registrarNodo("nombre")).toBeUndefined();
    });
  });
});
