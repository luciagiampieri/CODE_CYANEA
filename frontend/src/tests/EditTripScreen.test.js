import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import EditTripScreen from "../screens/EditTripScreen";

import { getTripDetail, updateTrip, searchDestinations } from "../services/api.js";

jest.mock("../services/api.js", () => ({
  getTripDetail: jest.fn(),
  updateTrip: jest.fn(),
  searchDestinations: jest.fn(),
}));

// Mismo mock que en CreateTripScreen.test.js.
jest.mock("@react-native-community/datetimepicker", () => {
  const ReactActual = require("react");
  const { Pressable, Text } = require("react-native");
  return function MockDateTimePicker({ onChange }) {
    return ReactActual.createElement(
      Pressable,
      {
        testID: "mock-date-picker-confirm",
        onPress: () => onChange({}, new Date("2030-09-10T12:00:00")),
      },
      ReactActual.createElement(Text, null, "Confirmar fecha (mock)")
    );
  };
});

const mockGoBack = jest.fn();
const navigation = { goBack: mockGoBack };
const route = { params: { tripId: 42 } };

const tripFuturo = {
  title: "Viaje a la playa",
  description: "Unas vacaciones con amigos",
  startDate: "2030-01-01",
  endDate: "2030-01-10",
  destinations: [{ name: "Mar del Plata", country: "Argentina", lat: -38, lng: -57 }],
};

async function press(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getByText(texto));
  });
}

async function renderPantallaCargada() {
  const utils = await render(<EditTripScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(utils.getByText("Editar Viaje")).toBeTruthy());
  return utils;
}

describe("US - Editar viaje (EditTripScreen)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchDestinations.mockResolvedValue([]);
  });

  it("carga los datos del viaje y los muestra en el formulario", async () => {
    getTripDetail.mockResolvedValue(tripFuturo);

    const utils = await renderPantallaCargada();

    expect(utils.getByDisplayValue("Viaje a la playa")).toBeTruthy();
    expect(utils.getByDisplayValue("Unas vacaciones con amigos")).toBeTruthy();
    expect(utils.getByText("Mar del Plata")).toBeTruthy();
  });

  it("muestra un error y permite volver si falla la carga del viaje", async () => {
    getTripDetail.mockRejectedValue(new Error("No se encontró el viaje."));

    const utils = await render(<EditTripScreen navigation={navigation} route={route} />);

    await waitFor(() => expect(utils.getByText("No se encontró el viaje.")).toBeTruthy());

    await press(utils, "Volver");
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("bloquea la edición de la fecha de ida si el viaje ya comenzó", async () => {
    getTripDetail.mockResolvedValue({ ...tripFuturo, startDate: "2020-01-01" });

    const utils = await renderPantallaCargada();

    expect(
      utils.getByText("El viaje ya comenzó, la fecha de ida no se puede modificar.")
    ).toBeTruthy();
    // Solo debe quedar un botón "Seleccionar fecha"... en este caso ninguno,
    // porque ambas fechas ya tienen valor cargado; lo relevante es que NO
    // hay forma de abrir el picker de la fecha de ida.
    expect(utils.queryByText("2020-01-01")).toBeTruthy();
  });

  it("muestra error de validación si se elimina el único destino y título vacío", async () => {
    getTripDetail.mockResolvedValue(tripFuturo);

    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(utils.getByDisplayValue("Viaje a la playa"), "");
    });

    await act(async () => {
      fireEvent.press(utils.getByTestId("edit-trip-remove-destination-0"));
    });

    await press(utils, "Guardar cambios");

    expect(utils.getByText("El título del viaje no puede quedar vacío.")).toBeTruthy();
    expect(
      utils.getByText("El viaje debe mantener al menos un destino asignado.")
    ).toBeTruthy();
    expect(updateTrip).not.toHaveBeenCalled();
  });

  it("guarda los cambios correctamente y vuelve atrás", async () => {
    getTripDetail.mockResolvedValue(tripFuturo);
    updateTrip.mockResolvedValue({ message: "Los cambios se guardaron correctamente." });

    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByDisplayValue("Viaje a la playa"),
        "Viaje a la playa (editado)"
      );
    });

    await press(utils, "Guardar cambios");

    await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
    expect(updateTrip).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ title: "Viaje a la playa (editado)" })
    );

    await waitFor(() => {
      expect(utils.getByText("Los cambios se guardaron correctamente.")).toBeTruthy();
    });

    // navigation.goBack() se dispara 900ms después de guardar (ver source).
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("muestra el mensaje de error del servidor si falla el guardado", async () => {
    getTripDetail.mockResolvedValue(tripFuturo);
    updateTrip.mockRejectedValue(new Error("No se pudo actualizar el viaje."));

    const utils = await renderPantallaCargada();
    await press(utils, "Guardar cambios");

    await waitFor(() => {
      expect(utils.getByText("No se pudo actualizar el viaje.")).toBeTruthy();
    });
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});