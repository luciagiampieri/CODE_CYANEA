import { Platform } from "react-native";
import { act, renderHook } from "@testing-library/react-native";

import useScrollACampo from "../hooks/useScrollACampo";
import { activarTecladoUnificado } from "./helpers/tecladoWeb";

// Nueva actividad y Nuevo traslado: el campo enfocado se lleva a 80 px del borde superior.
// En web con la técnica B del teclado, lo hace mostrarCampoEnfocado (solo si quedó tapado).

describe("useScrollACampo", () => {
  const osOriginal = Platform.OS;
  let desactivar;

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    desactivar?.();
    desactivar = undefined;
    jest.useRealTimers();
    Platform.OS = osOriginal;
  });

  async function montar() {
    const utils = await renderHook(() => useScrollACampo());
    const scrollTo = jest.fn();
    utils.result.current.scrollRef.current = { scrollTo };
    utils.result.current.fieldY.current.nombre = 300;
    return { ...utils, scrollTo };
  }

  async function enfocar(result) {
    await act(async () => {
      result.current.scrollToField("nombre");
      jest.advanceTimersByTime(350);
    });
  }

  it("en Android/iOS lleva el campo a 80 px del borde superior, como siempre", async () => {
    const { result, scrollTo } = await montar();

    await enfocar(result);

    expect(scrollTo).toHaveBeenCalledWith({ y: 220, animated: true });
  });

  it("en iOS con el modo del teclado activo no cambia nada", async () => {
    Platform.OS = "ios";
    desactivar = activarTecladoUnificado();
    const { result, scrollTo } = await montar();

    await enfocar(result);

    expect(scrollTo).toHaveBeenCalledWith({ y: 220, animated: true });
  });

  it("en web con la técnica B no desplaza: no suma un segundo movimiento", async () => {
    Platform.OS = "web";
    desactivar = activarTecladoUnificado();
    const { result, scrollTo } = await montar();

    await enfocar(result);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("en web sin la técnica B (?teclado=0) desplaza como antes", async () => {
    Platform.OS = "web";
    const { result, scrollTo } = await montar();

    await enfocar(result);

    expect(scrollTo).toHaveBeenCalledWith({ y: 220, animated: true });
  });
});
