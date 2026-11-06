/**
 * Piezas compartidas por AddActivityScreen y AddTrasladoScreen.
 */
import { Keyboard, Platform } from "react-native";
import { act, fireEvent, render, renderHook } from "@testing-library/react-native";

import HoraField from "../components/ui/HoraField";
import OptionSheet from "../components/ui/OptionSheet";
import SelectField from "../components/ui/SelectField";
import { useSelectorHora } from "../components/ui/SelectorHora";

const opciones = [
  { name: "plane", label: "Avión" },
  { name: "tramo-1", label: "Bariloche → Salta", icon: "route" },
];

afterEach(() => {
  Platform.OS = "web";
});

describe("OptionSheet", () => {
  it("no dibuja nada cerrado", async () => {
    const { toJSON } = await render(
      <OptionSheet visible={false} titulo="Elegir" opciones={opciones} onSelect={jest.fn()} />
    );

    expect(toJSON()).toBeNull();
  });

  it("muestra el título y las opciones, y avisa la elegida", async () => {
    const onSelect = jest.fn();
    const { getByText } = await render(
      <OptionSheet visible titulo="Elegir" opciones={opciones} onSelect={onSelect} />
    );

    expect(getByText("Elegir")).toBeTruthy();

    await fireEvent.press(getByText("Bariloche → Salta"));

    expect(onSelect).toHaveBeenCalledWith("tramo-1");
  });
});

describe("SelectField", () => {
  it("muestra el placeholder sin valor y el valor si lo hay", async () => {
    const props = { icono: "route", placeholder: "Seleccionar", onPress: jest.fn() };
    const { getByText, rerender, queryByText } = await render(<SelectField {...props} valor="" />);

    expect(getByText("Seleccionar")).toBeTruthy();

    await rerender(<SelectField {...props} valor="Micro" />);

    expect(getByText("Micro")).toBeTruthy();
    expect(queryByText("Seleccionar")).toBeNull();
  });

  it("cierra el teclado antes de abrir", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const onPress = jest.fn();
    const { getByText } = await render(<SelectField icono="route" valor="Micro" onPress={onPress} />);

    await fireEvent.press(getByText("Micro"));

    expect(dismiss).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });
});

describe("HoraField", () => {
  it("en web usa el selector del navegador", async () => {
    Platform.OS = "web";
    const onWebChange = jest.fn();
    const { getByLabelText, getByText } = await render(
      <HoraField label="Hora de salida" value="" onWebChange={onWebChange} />
    );

    expect(getByText("Seleccionar hora")).toBeTruthy();

    await act(async () => {
      fireEvent(getByLabelText("Hora de salida"), "change", { target: { value: "10:30" } });
    });

    expect(onWebChange).toHaveBeenCalledWith("10:30");
  });

  it("en el celular abre el reloj y admite otro placeholder", async () => {
    Platform.OS = "android";
    const onPress = jest.fn();
    const { getByLabelText, getByText } = await render(
      <HoraField label="Hora de salida" placeholder="Seleccionar" value="" onPress={onPress} />
    );

    expect(getByText("Seleccionar")).toBeTruthy();

    await fireEvent.press(getByLabelText("Hora de salida"));

    expect(onPress).toHaveBeenCalled();
  });
});

describe("useSelectorHora", () => {
  const fecha = new Date(2026, 10, 5, 22, 0);

  it("en Android confirma al elegir en el diálogo", async () => {
    Platform.OS = "android";
    const alConfirmar = jest.fn();
    const { result } = await renderHook(() => useSelectorHora(alConfirmar));

    await act(async () => result.current.abrir("salida", new Date()));
    await act(async () => result.current.alCambiar({ type: "set" }, fecha));

    expect(alConfirmar).toHaveBeenCalledWith("salida", fecha);
    expect(result.current.tipo).toBeNull();
  });

  it("en Android cancelar no confirma", async () => {
    Platform.OS = "android";
    const alConfirmar = jest.fn();
    const { result } = await renderHook(() => useSelectorHora(alConfirmar));

    await act(async () => result.current.abrir("salida", new Date()));
    await act(async () => result.current.alCambiar({ type: "dismissed" }));

    expect(alConfirmar).not.toHaveBeenCalled();
    expect(result.current.tipo).toBeNull();
  });

  it("en iOS confirma recién con Listo", async () => {
    Platform.OS = "ios";
    const alConfirmar = jest.fn();
    const { result } = await renderHook(() => useSelectorHora(alConfirmar));

    await act(async () => result.current.abrir("llegada", new Date()));
    await act(async () => result.current.alCambiar({ type: "set" }, fecha));

    expect(alConfirmar).not.toHaveBeenCalled();

    await act(async () => result.current.confirmar());

    expect(alConfirmar).toHaveBeenCalledWith("llegada", fecha);
  });
});

describe("HoraField compacto", () => {
  it("no dibuja la etiqueta pero la conserva para accesibilidad", async () => {
    Platform.OS = "android";
    const onPress = jest.fn();
    const { getByLabelText, getByText, queryByText } = await render(
      <HoraField compacto label="Hora de salida" placeholder="Hora" value="" onPress={onPress} />
    );

    expect(queryByText("Hora de salida")).toBeNull();
    expect(getByText("Hora")).toBeTruthy();

    await fireEvent.press(getByLabelText("Hora de salida"));

    expect(onPress).toHaveBeenCalled();
  });
});
