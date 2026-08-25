import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import CreateTripScreen from "../screens/CreateTripScreen";

import {
  createTrip,
  getCurrentUser,
  getUsers,
  getCurrencies,
  searchDestinations,
} from "../services/api.js";

jest.mock("../services/api.js", () => ({
  createTrip: jest.fn(),
  getCurrentUser: jest.fn(),
  getUsers: jest.fn(),
  getCurrencies: jest.fn(),
  searchDestinations: jest.fn(),
}));


jest.mock("@react-native-community/datetimepicker", () => {
  const ReactActual = require("react");
  const { Pressable, Text } = require("react-native");
  return function MockDateTimePicker({ onChange }) {
    return ReactActual.createElement(
      Pressable,
      {
        testID: "mock-date-picker-confirm",
        onPress: () => onChange({}, new Date("2026-09-10T12:00:00")),
      },
      ReactActual.createElement(Text, null, "Confirmar fecha (mock)")
    );
  };
});

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const navigation = { goBack: mockGoBack, navigate: mockNavigate };

const currentUser = {
  id: 1,
  nombreCompleto: "Ada Lovelace",
  nombreUsuario: "adalovelace",
  email: "ada@mail.com",
};


async function press(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getByText(texto));
  });
}

async function renderPantallaCargada() {
  const utils = await render(<CreateTripScreen navigation={navigation} />);
  await waitFor(() => expect(utils.getByText("Ada Lovelace")).toBeTruthy());
  return utils;
}


async function completarFechas(utils) {

  await act(async () => {
    fireEvent.press(utils.getAllByText("Seleccionar fecha")[0]);
  });
  await press(utils, "Confirmar fecha (mock)");

  await press(utils, "Seleccionar fecha");
  await press(utils, "Confirmar fecha (mock)");
}

describe("US - Crear viaje (CreateTripScreen)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue(currentUser);
    getUsers.mockResolvedValue([]);
    getCurrencies.mockResolvedValue([
      { Codigo: "ARS", Nombre: "Peso argentino" },
      { Codigo: "USD", Nombre: "Dólar estadounidense" },
    ]);
    searchDestinations.mockResolvedValue([]);
    createTrip.mockResolvedValue({ id: 99 });
  });

  it("carga y muestra los datos del administrador (usuario actual)", async () => {
    const utils = await renderPantallaCargada();

    expect(utils.getByText("Ada Lovelace")).toBeTruthy();
    expect(utils.getByText("@adalovelace · ada@mail.com")).toBeTruthy();
  });

  it("muestra los errores de validación si se envía el formulario vacío", async () => {
    const utils = await renderPantallaCargada();

    await press(utils, "Crear viaje");

    expect(utils.getByText("El título del viaje no puede quedar vacío.")).toBeTruthy();
    expect(utils.getByText("Al menos un destino es requerido.")).toBeTruthy();
    expect(utils.getByText("La fecha de inicio es obligatoria.")).toBeTruthy();
    expect(utils.getByText("La fecha de finalización es obligatoria.")).toBeTruthy();
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("permite buscar y agregar un destino a la lista", async () => {
    searchDestinations.mockResolvedValue([
      { name: "Bariloche", country: "Argentina" },
    ]);

    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Ej: Córdoba, Bariloche, Chile..."),
        "Bariloche"
      );
    });

    await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
    await press(utils, "Bariloche");

    expect(utils.getByText("Destinos seleccionados (1)")).toBeTruthy();
  });

  it("crea el viaje correctamente con datos válidos y navega al inicio", async () => {
    searchDestinations.mockResolvedValue([
      { name: "Bariloche", country: "Argentina" },
    ]);

    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Córdoba"),
        "Viaje de egresados"
      );
    });

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Ej: Córdoba, Bariloche, Chile..."),
        "Bariloche"
      );
    });
    await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
    await press(utils, "Bariloche");

    await completarFechas(utils);

    await press(utils, "Crear viaje");

    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));

    expect(createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Viaje de egresados",
        currency: "ARS",
        destinations: [{ name: "Bariloche", country: "Argentina" }],
      })
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("Tabs", { screen: "Inicio" });
    });
  });

  it("muestra el mensaje de error si el servidor rechaza la creación", async () => {
    searchDestinations.mockResolvedValue([
      { name: "Bariloche", country: "Argentina" },
    ]);
    createTrip.mockRejectedValue(new Error("No se pudo crear el viaje."));

    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Córdoba"),
        "Viaje de egresados"
      );
    });
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Ej: Córdoba, Bariloche, Chile..."),
        "Bariloche"
      );
    });
    await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
    await press(utils, "Bariloche");
    await completarFechas(utils);

    await press(utils, "Crear viaje");

    await waitFor(() => {
      expect(utils.getByText("No se pudo crear el viaje.")).toBeTruthy();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("vuelve atrás al tocar 'Cancelar'", async () => {
    const utils = await renderPantallaCargada();

    await press(utils, "Cancelar");

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});