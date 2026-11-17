import { Keyboard, Platform } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

import useTecladoVisible from "../hooks/useTecladoVisible";

// Lo que se oculta con el teclado abierto (por ejemplo el pie de Nuevo gasto) necesita
// saber si está abierto también en la web, donde no hay eventos de Keyboard.

describe("useTecladoVisible", () => {
  const osOriginal = Platform.OS;
  const vvOriginal = window.visualViewport;
  const altoOriginal = window.innerHeight;

  afterEach(() => {
    Platform.OS = osOriginal;
    window.visualViewport = vvOriginal;
    window.innerHeight = altoOriginal;
    jest.restoreAllMocks();
  });

  function simularVisualViewport({ height, scale = 1 }) {
    const oyentes = [];
    window.innerHeight = 800;
    window.visualViewport = {
      height,
      scale,
      offsetTop: 0,
      addEventListener: jest.fn((_tipo, fn) => oyentes.push(fn)),
      removeEventListener: jest.fn(),
    };
    return {
      cambiar: (alto) => {
        window.visualViewport.height = alto;
        oyentes.forEach((fn) => fn());
      },
    };
  }

  it("en la web sigue al visualViewport: se abre y se cierra el teclado", async () => {
    Platform.OS = "web";
    const vv = simularVisualViewport({ height: 800 });
    const { result } = await renderHook(() => useTecladoVisible());
    expect(result.current).toBe(false);

    await act(async () => vv.cambiar(420));
    expect(result.current).toBe(true);

    await act(async () => vv.cambiar(800));
    expect(result.current).toBe(false);
  });

  it("en la web un zoom (pellizco) no cuenta como teclado", async () => {
    Platform.OS = "web";
    simularVisualViewport({ height: 400, scale: 2 });
    const { result } = await renderHook(() => useTecladoVisible());
    expect(result.current).toBe(false);
  });

  it("en iOS sigue con los eventos de Keyboard", async () => {
    Platform.OS = "ios";
    const oyentes = {};
    jest.spyOn(Keyboard, "addListener").mockImplementation((evento, fn) => {
      oyentes[evento] = fn;
      return { remove: jest.fn() };
    });
    const { result } = await renderHook(() => useTecladoVisible());

    await act(async () => oyentes.keyboardWillShow());
    expect(result.current).toBe(true);

    await act(async () => oyentes.keyboardWillHide());
    expect(result.current).toBe(false);
  });
});
