import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { StyleSheet } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

import SearchPickerHeader, { SEARCH_PICKER_EDGES } from "../components/ui/SearchPickerHeader";
import { spacing } from "../theme/tokens";

describe("SearchPickerHeader", () => {
  const props = {
    title: "Agregar destino",
    onBack: jest.fn(),
    value: "",
    onChangeText: jest.fn(),
    placeholder: "Buscar...",
  };

  beforeEach(() => jest.clearAllMocks());

  it("muestra el título y la caja de búsqueda", async () => {
    const utils = await render(<SearchPickerHeader {...props} />);

    expect(utils.getByText("Agregar destino")).toBeTruthy();
    expect(utils.getByPlaceholderText("Buscar...")).toBeTruthy();
  });

  it("'Volver' llama a onBack", async () => {
    const utils = await render(<SearchPickerHeader {...props} />);

    await act(async () => fireEvent.press(utils.getByLabelText("Volver")));

    expect(props.onBack).toHaveBeenCalled();
  });

  it("con texto muestra 'Borrar búsqueda' y lo vacía", async () => {
    const utils = await render(<SearchPickerHeader {...props} value="Roma" />);

    await act(async () => fireEvent.press(utils.getByLabelText("Borrar búsqueda")));

    expect(props.onChangeText).toHaveBeenCalledWith("");
  });

  it("mientras busca no muestra el botón de borrar", async () => {
    const utils = await render(<SearchPickerHeader {...props} value="Roma" loading />);

    expect(utils.queryByLabelText("Borrar búsqueda")).toBeNull();
  });

  it("deja el margen de la barra de estado una sola vez", async () => {
    const utils = await render(
      <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: 0, left: 0, right: 0 }}>
        <SearchPickerHeader {...props} testID="header" />
      </SafeAreaInsetsContext.Provider>
    );

    const estilo = StyleSheet.flatten(utils.getByTestId("header").props.style);
    expect(estilo.paddingTop).toBe(47 + spacing.xs);
  });

  it("el contenedor del buscador no vuelve a dejar el margen de arriba", () => {
    expect(SEARCH_PICKER_EDGES).not.toContain("top");
  });
});
