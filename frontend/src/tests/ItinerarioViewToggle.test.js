import { render, fireEvent } from "@testing-library/react-native";

import ItinerarioViewToggle from "../components/trip/ItinerarioViewToggle";

describe("ItinerarioViewToggle", () => {
  it("renderiza las dos opciones (Timeline y Calendario)", async () => {
    const { getByText } = await render(
      <ItinerarioViewToggle value="timeline" onChange={jest.fn()} />
    );

    expect(getByText("Timeline")).toBeTruthy();
    expect(getByText("Calendario")).toBeTruthy();
  });

  it("marca como seleccionada la opción activa según `value`", async () => {
    const { getByText } = await render(
      <ItinerarioViewToggle value="calendario" onChange={jest.fn()} />
    );

    const botonCalendario = getByText("Calendario").parent;
    const botonTimeline = getByText("Timeline").parent;

    expect(botonCalendario.props.accessibilityState).toEqual({ selected: true });
    expect(botonTimeline.props.accessibilityState).toEqual({ selected: false });
  });

  it("llama a onChange con el id de la opción presionada", async () => {
    const onChange = jest.fn();
    const { getByText } = await render(
      <ItinerarioViewToggle value="timeline" onChange={onChange} />
    );

    fireEvent.press(getByText("Calendario"));

    expect(onChange).toHaveBeenCalledWith("calendario");
  });
});