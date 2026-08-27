import { act, renderHook } from "@testing-library/react-native";

import useItinerarioViewPreference from "../hooks/useItinerarioViewPreference";


describe("useItinerarioViewPreference", () => {
  it("arranca con 'timeline' como vista por defecto", async () => {
    const { result } = await renderHook(() => useItinerarioViewPreference());
    const [vista] = result.current;
    expect(vista).toBe("timeline");
  });

  it("actualiza la vista cuando se llama a setVista", async () => {
    const { result } = await renderHook(() => useItinerarioViewPreference());

    await act(async () => {
      const [, setVista] = result.current;
      setVista("lista");
    });

    const [vista] = result.current;
    expect(vista).toBe("lista");
  });

  it("comparte la preferencia entre distintas instancias del hook (es un singleton de módulo)", async () => {
    const nuevaInstancia = await renderHook(() => useItinerarioViewPreference());
    const [vista] = nuevaInstancia.result.current;
    expect(vista).toBe("lista");

    await act(async () => {
      const [, setVista] = nuevaInstancia.result.current;
      setVista("timeline");
    });

    expect(nuevaInstancia.result.current[0]).toBe("timeline");
  });
});