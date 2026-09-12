import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import CreateTripScreen from "../screens/CreateTripScreen";
import * as ImagePicker from "expo-image-picker";

import {
  createTrip,
  getCurrentUser,
  getUsers,
  getCurrencies,
  searchDestinations,
  resolveDestination,
  uploadTripCover
} from "../services/api.js";

jest.mock("../services/api.js", () => ({
  createTrip: jest.fn(),
  getCurrentUser: jest.fn(),
  getUsers: jest.fn(),
  getCurrencies: jest.fn(),
  searchDestinations: jest.fn(),
  resolveDestination: jest.fn(),
  uploadTripCover: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: {
    Images: "Images",
  },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

resolveDestination.mockResolvedValue({
  name: "Bariloche",
  country: "Argentina",
  provinceState: "Río Negro",
  lat: -41.1335,
  lng: -71.3103,
  placeId: "google:bariloche-id",
  imageUrl: "https://example.com/bariloche.jpg",
});

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

    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      status: "granted",
      canAskAgain: true,
    });

    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });
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
      {
        name: "Bariloche",
        country: "Argentina",
        placeId: "google:bariloche-id",
      },
    ]);

    resolveDestination.mockResolvedValue({
      name: "Bariloche",
      country: "Argentina",
      provinceState: "Río Negro",
      lat: -41.1335,
      lng: -71.3103,
      placeId: "google:bariloche-id",
      imageUrl: "https://example.com/bariloche.jpg",
    });

    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Ej: Córdoba, Bariloche, Chile..."),
        "Bariloche"
      );
    });

    await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());

    await press(utils, "Bariloche");

    await waitFor(() => {
      expect(resolveDestination).toHaveBeenCalledWith(
        "google:bariloche-id",
        expect.any(String)
      );
    });

    expect(utils.getByText("Destinos seleccionados (1)")).toBeTruthy();
  });

  it("crea el viaje correctamente con datos válidos y navega al inicio", async () => {
    searchDestinations.mockResolvedValue([
      {
        name: "Bariloche",
        country: "Argentina",
        placeId: "google:bariloche-id",
      },
    ]);

    resolveDestination.mockResolvedValue({
      name: "Bariloche",
      country: "Argentina",
      provinceState: "Río Negro",
      lat: -41.1335,
      lng: -71.3103,
      placeId: "google:bariloche-id",
      imageUrl: "https://example.com/bariloche.jpg",
    });

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

    await waitFor(() => {
      expect(resolveDestination).toHaveBeenCalledWith(
        "google:bariloche-id",
        expect.any(String)
      );
    });

    await completarFechas(utils);

    await press(utils, "Crear viaje");

    await waitFor(() => {
      expect(createTrip).toHaveBeenCalledTimes(1);
    });

    expect(createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Viaje de egresados",
        currency: "ARS",
        destinations: [
          {
            name: "Bariloche",
            country: "Argentina",
            provinceState: "Río Negro",
            lat: -41.1335,
            lng: -71.3103,
            placeId: "google:bariloche-id",
            imageUrl: "https://example.com/bariloche.jpg",
          },
        ],
      })
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "Tabs",
        { screen: "Inicio" }
      );
    });
  });

  it("muestra el mensaje de error si el servidor rechaza la creación", async () => {
    searchDestinations.mockResolvedValue([
      {
        name: "Bariloche",
        country: "Argentina",
        placeId: "google:bariloche-id",
      },
    ]);

    resolveDestination.mockResolvedValue({
      name: "Bariloche",
      country: "Argentina",
      provinceState: "Río Negro",
      lat: -41.1335,
      lng: -71.3103,
      placeId: "google:bariloche-id",
      imageUrl: "https://example.com/bariloche.jpg",
    });

    createTrip.mockRejectedValue(
      new Error("No se pudo crear el viaje.")
    );

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
      expect(
        utils.getByText("No se pudo crear el viaje.")
      ).toBeTruthy();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("vuelve atrás al tocar 'Cancelar'", async () => {
    const utils = await renderPantallaCargada();

    await press(utils, "Cancelar");

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("muestra un error si no se puede resolver el destino", async () => {
    searchDestinations.mockResolvedValue([
      {
        name: "Bariloche",
        country: "Argentina",
        placeId: "google:bariloche-id",
      },
    ]);

    resolveDestination.mockRejectedValue(
      new Error("No se pudo resolver el destino")
    );

    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Ej: Córdoba, Bariloche, Chile..."),
        "Bariloche"
      );
    });

    await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());

    await press(utils, "Bariloche");

    await waitFor(() => {
      expect(
        utils.getByText(
          "No se pudo agregar ese destino, probá de nuevo."
        )
      ).toBeTruthy();
    });

    expect(utils.getByText("Destinos seleccionados (0)")).toBeTruthy();
  });

  it("crea el viaje y sube la portada JPG seleccionada", async () => {
    searchDestinations.mockResolvedValue([
      {
        name: "Bariloche",
        country: "Argentina",
        placeId: "google:bariloche-id",
      },
    ]);

    resolveDestination.mockResolvedValue({
      name: "Bariloche",
      country: "Argentina",
      provinceState: "Río Negro",
      lat: -41.1335,
      lng: -71.3103,
      placeId: "google:bariloche-id",
      imageUrl: "https://example.com/bariloche.jpg",
    });

    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///foto.jpg",
          fileName: "foto.jpg",
          mimeType: "image/jpeg",
        },
      ],
    });

    const utils = await renderPantallaCargada();

    await press(utils, "Elegir de la galería");

    await waitFor(() => {
      expect(utils.getByText("Imagen seleccionada")).toBeTruthy();
    });

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
      expect(createTrip).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(uploadTripCover).toHaveBeenCalledTimes(1);
    });

    expect(uploadTripCover).toHaveBeenCalledWith(
      99,
      expect.objectContaining({
        uri: "file:///foto.jpg",
        fileName: "foto.jpg",
        mimeType: "image/jpeg",
      })
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      "Tabs",
      { screen: "Inicio" }
    );
  });

  it("permite seleccionar una portada PNG", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///foto.png",
          fileName: "foto.png",
          mimeType: "image/png",
        },
      ],
    });

    const utils = await renderPantallaCargada();

    await press(utils, "Elegir de la galería");

    await waitFor(() => {
      expect(utils.getByText("Imagen seleccionada")).toBeTruthy();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    expect(utils.queryByText(/Tipo de archivo no permitido/)).toBeNull();
  });

  it("rechaza una portada con formato no permitido", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///foto.gif",
          fileName: "foto.gif",
          mimeType: "image/gif",
        },
      ],
    });

    const utils = await renderPantallaCargada();

    await press(utils, "Elegir de la galería");

    await waitFor(() => {
      expect(
        utils.getByText(
          "Tipo de archivo no permitido. Solo se permiten JPG, JPEG y PNG."
        )
      ).toBeTruthy();
    });

    expect(utils.queryByText("Imagen seleccionada")).toBeNull();
    expect(uploadTripCover).not.toHaveBeenCalled();
  });

  it("permite cancelar la selección de portada", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///foto.jpg",
          fileName: "foto.jpg",
          mimeType: "image/jpeg",
        },
      ],
    });

    const utils = await renderPantallaCargada();

    await press(utils, "Elegir de la galería");

    await waitFor(() => {
      expect(utils.getByText("Imagen seleccionada")).toBeTruthy();
    });

    await press(utils, "Cancelar selección");

    expect(utils.queryByText("Imagen seleccionada")).toBeNull();
    expect(utils.getByText("Se usará una portada predeterminada")).toBeTruthy();
  });

  it("informa si se deniega el permiso para acceder a la galería", async () => {
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      status: "denied",
      canAskAgain: true,
    });

    const utils = await renderPantallaCargada();

    await press(utils, "Elegir de la galería");

    await waitFor(() => {
      expect(
        utils.getByText(
          "Necesitamos tu permiso para acceder a las fotos y poder elegir una portada."
        )
      ).toBeTruthy();
    });

    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
});