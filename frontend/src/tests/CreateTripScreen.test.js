import React from "react";
import { Keyboard, Platform, ScrollView, TextInput } from "react-native";
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

jest.mock("../components/ui/DatePickerModal", () => {
  const ReactActual = require("react");
  const { Pressable, Text } = require("react-native");

  return function MockDatePickerModal({
    visible,
    title,
    onChange,
  }) {
    if (!visible) return null;

    return ReactActual.createElement(
      Pressable,
      {
        testID: `mock-date-picker-${title}`,
        onPress: () => {
          const year = mockPickerDate.getFullYear();
          const month = String(mockPickerDate.getMonth() + 1).padStart(2, "0");
          const day = String(mockPickerDate.getDate()).padStart(2, "0");

          onChange(`${year}-${month}-${day}`);
        },
      },
      ReactActual.createElement(Text, null, `Seleccionar ${title} (mock)`)
    );
  };
});

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
        onPress: () => onChange({}, mockPickerDate),
      },
      ReactActual.createElement(Text, null, "Confirmar fecha (mock)")
    );
  };
});

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
const navigation = { goBack: mockGoBack, navigate: mockNavigate };
let mockPickerDate = new Date();

const currentUser = {
  id: 1,
  nombreCompleto: "Ada Lovelace",
  nombreUsuario: "adalovelace",
  email: "ada@mail.com",
};



// Placeholder del campo de búsqueda dentro del buscador de destinos (el botón de la pantalla
// que lo abre sigue diciendo "Buscar ciudad o país...").
const PLACEHOLDER_BUSCADOR = "Ej: Bariloche, Roma, Chile...";

const BARILOCHE_SUGERENCIA = {
  name: "Bariloche",
  country: "Argentina",
  placeId: "google:bariloche-id",
};

const BARILOCHE_RESUELTO = {
  name: "Bariloche",
  country: "Argentina",
  provinceState: "Río Negro",
  lat: -41.1335,
  lng: -71.3103,
  placeId: "google:bariloche-id",
  imageUrl: "https://example.com/bariloche.jpg",
};

async function press(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getByText(texto));
  });
}

async function renderPantallaCargada() {
  const utils = await render(<CreateTripScreen navigation={navigation} />);

  await waitFor(() =>
    expect(utils.getByText("Información Básica")).toBeTruthy()
  );

  return utils;
}

async function completarFechas(utils) {
  // Fecha de ida
  await act(async () => {
    fireEvent.press(utils.getAllByText("Seleccionar fecha")[0]);
  });

  await press(utils, "Seleccionar Fecha de ida (mock)");

  // Fecha de vuelta
  await press(utils, "Seleccionar fecha");

  await press(utils, "Seleccionar Fecha de vuelta (mock)");
}

async function irAlPaso2(utils) {
  await press(utils, "Siguiente");
  await waitFor(() =>
    expect(utils.getByText("Tus destinos")).toBeTruthy()
  );
}

async function irAlPaso3(utils) {
  await press(utils, "Siguiente");
  await waitFor(() =>
    expect(utils.getByText("Invitar participantes (Opcional)")).toBeTruthy()
  );
}


// Completa el paso 1, pasa al paso 2 y abre el buscador de destinos.
async function abrirBuscadorDeDestinos() {
  const utils = await renderPantallaCargada();

  await act(async () => {
    fireEvent.changeText(
      utils.getByPlaceholderText("Escapada a Bariloche"),
      "Viaje de prueba"
    );
  });

  await completarFechas(utils);
  await irAlPaso2(utils);
  await press(utils, "Buscar ciudad o país...");

  return utils;
}

async function buscarDestino(utils, texto) {
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR), texto);
  });
}

// Busca "Bariloche" y toca el resultado: queda agregado a la ruta.
async function agregarBariloche(utils) {
  await buscarDestino(utils, "Bariloche");
  await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
  await press(utils, "Bariloche");
  await waitFor(() =>
    expect(resolveDestination).toHaveBeenCalledWith(
      "google:bariloche-id",
      expect.any(String)
    )
  );
}

describe("US - Crear viaje (CreateTripScreen)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickerDate = new Date();
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

    // PASO 1
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await completarFechas(utils);

    // Ir al paso 2
    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // Agregar destino
    await press(utils, "Buscar ciudad o país...");

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR),
        "Bariloche"
      );
    });

    await waitFor(() =>
      expect(utils.getByText("Bariloche")).toBeTruthy()
    );

    await press(utils, "Bariloche");

    await waitFor(() =>
      expect(resolveDestination).toHaveBeenCalledWith(
        "google:bariloche-id",
        expect.any(String)
      )
    );

    // Ahora puede avanzar al paso 3
    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(
        utils.getByText("Invitar participantes (Opcional)")
      ).toBeTruthy()
    );

    expect(utils.getByText("Ada Lovelace")).toBeTruthy();

    expect(
      utils.getByText("@adalovelace · ada@mail.com")
    ).toBeTruthy();
  });

  it("muestra los errores de validación al avanzar con los datos obligatorios vacíos", async () => {
    const utils = await renderPantallaCargada();

    await press(utils, "Siguiente");

    expect(
      utils.getByText("El título del viaje no puede quedar vacío.")
    ).toBeTruthy();

    expect(
      utils.getByText("La fecha de inicio es obligatoria.")
    ).toBeTruthy();

    expect(
      utils.getByText("Primero elegí la fecha de ida.")
    ).toBeTruthy();

    expect(utils.queryByText("Tus destinos")).toBeNull();

    expect(createTrip).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    await press(utils, "Siguiente");

    expect(
      utils.getByText("Al menos un destino es requerido.")
    ).toBeTruthy();

    expect(
      utils.queryByText("Invitar participantes (Opcional)")
    ).toBeNull();

    expect(createTrip).not.toHaveBeenCalled();
  });

  it("informa que no se puede avanzar con una fecha de inicio pasada", async () => {
    mockPickerDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await act(async () => {
      fireEvent.press(utils.getAllByText("Seleccionar fecha")[0]);
    });

    await press(utils, "Seleccionar Fecha de ida (mock)");

    await press(utils, "Siguiente");

    expect(
      utils.getByText(
        "La fecha de inicio no puede ser anterior a la fecha actual."
      )
    ).toBeTruthy();

    expect(utils.getByText("Información Básica")).toBeTruthy();
    expect(utils.queryByText("Tus destinos")).toBeNull();
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

    // Completar paso 1 y avanzar al paso 2
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // Abrir el buscador de destinos
    await press(utils, "Buscar ciudad o país...");

    // Buscar Bariloche
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR),
        "Bariloche"
      );
    });

    await waitFor(() =>
      expect(utils.getByText("Bariloche")).toBeTruthy()
    );

    // Seleccionar el destino
    await press(utils, "Bariloche");

    await waitFor(() => {
      expect(resolveDestination).toHaveBeenCalledWith(
        "google:bariloche-id",
        expect.any(String)
      );
    });

    expect(
      utils.getAllByText("Tu ruta").length
    ).toBeGreaterThan(0);

    expect(utils.getAllByText("Bariloche").length).toBeGreaterThan(0);
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

    // PASO 1: información básica
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de egresados"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // PASO 2: agregar destino
    await press(utils, "Buscar ciudad o país...");

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR),
        "Bariloche"
      );
    });

    await waitFor(() =>
      expect(utils.getByText("Bariloche")).toBeTruthy()
    );

    await press(utils, "Bariloche");

    await waitFor(() => {
      expect(resolveDestination).toHaveBeenCalledWith(
        "google:bariloche-id",
        expect.any(String)
      );
    });

    // Avanzar al paso 3
    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(
        utils.getByText("Invitar participantes (Opcional)")
      ).toBeTruthy()
    );

    // PASO 3: crear viaje
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
            noches: null,
            nochesEnViaje: 0,
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

    // PASO 1: información básica
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de egresados"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // PASO 2: agregar destino
    await press(utils, "Buscar ciudad o país...");

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR),
        "Bariloche"
      );
    });

    await waitFor(() =>
      expect(utils.getByText("Bariloche")).toBeTruthy()
    );

    await press(utils, "Bariloche");

    await waitFor(() => {
      expect(resolveDestination).toHaveBeenCalledWith(
        "google:bariloche-id",
        expect.any(String)
      );
    });

    // Avanzar al paso 3
    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(
        utils.getByText("Invitar participantes (Opcional)")
      ).toBeTruthy()
    );

    // Intentar crear el viaje
    await press(utils, "Crear viaje");

    // Se muestra el error devuelto por el servidor
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

    // PASO 1: completar información básica
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // PASO 2: abrir buscador de destinos
    await press(utils, "Buscar ciudad o país...");

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR),
        "Bariloche"
      );
    });

    await waitFor(() =>
      expect(utils.getByText("Bariloche")).toBeTruthy()
    );

    // Intentar agregar el destino
    await press(utils, "Bariloche");

    await waitFor(() => {
      expect(
        utils.getByText(
          "No se pudo agregar ese destino, probá de nuevo."
        )
      ).toBeTruthy();
    });
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

    // PASO 1: información básica
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de egresados"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // PASO 2: agregar destino
    await press(utils, "Buscar ciudad o país...");

    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR),
        "Bariloche"
      );
    });

    await waitFor(() =>
      expect(utils.getByText("Bariloche")).toBeTruthy()
    );

    await press(utils, "Bariloche");

    await waitFor(() => {
      expect(resolveDestination).toHaveBeenCalledWith(
        "google:bariloche-id",
        expect.any(String)
      );
    });

    // Seleccionar portada
    await press(utils, "Galería"); // opción "Galería · Elegir foto" de la portada

    await waitFor(() => {
      expect(utils.getByText("Tu foto")).toBeTruthy(); // insignia de la portada elegida de la galería
    });

    // Avanzar al paso 3
    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(
        utils.getByText("Invitar participantes (Opcional)")
      ).toBeTruthy()
    );

    // Crear viaje
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

    // PASO 1: completar información básica
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // Seleccionar portada
    await press(utils, "Galería"); // opción "Galería · Elegir foto" de la portada

    await waitFor(() => {
      expect(utils.getByText("Tu foto")).toBeTruthy(); // insignia de la portada elegida de la galería
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    expect(
      utils.queryByText(/Tipo de archivo no permitido/)
    ).toBeNull();
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

    // PASO 1: completar información básica
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // Intentar seleccionar una portada GIF
    await press(utils, "Galería"); // opción "Galería · Elegir foto" de la portada

    await waitFor(() => {
      expect(
        utils.getByText(
          "Tipo de archivo no permitido. Solo se permiten JPG, JPEG y PNG."
        )
      ).toBeTruthy();
    });

    expect(utils.queryByText("Tu foto")).toBeNull();
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

    // PASO 1: completar información básica
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // Seleccionar portada JPG
    await press(utils, "Galería"); // opción "Galería · Elegir foto" de la portada

    await waitFor(() => {
      expect(utils.getByText("Tu foto")).toBeTruthy(); // insignia de la portada elegida de la galería
    });

    // Descartar la foto elegida: se vuelve a la portada automática del destino
    // (opción "Destino · Automática"; reemplaza al antiguo botón "Cancelar selección")
    await press(utils, "Automática");

    expect(utils.queryByText("Tu foto")).toBeNull();
    // Este test no agrega destinos, así que no hay foto de destino: queda la predeterminada
    expect(utils.getByText("Se usará una portada predeterminada")).toBeTruthy();
  });

  it("informa si se deniega el permiso para acceder a la galería", async () => {
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      status: "denied",
      canAskAgain: true,
    });

    const utils = await renderPantallaCargada();

    // PASO 1: completar información básica
    await act(async () => {
      fireEvent.changeText(
        utils.getByPlaceholderText("Escapada a Bariloche"),
        "Viaje de prueba"
      );
    });

    await completarFechas(utils);

    await press(utils, "Siguiente");

    await waitFor(() =>
      expect(utils.getByText("Tus destinos")).toBeTruthy()
    );

    // Intentar seleccionar una portada
    await press(utils, "Galería"); // opción "Galería · Elegir foto" de la portada

    await waitFor(() => {
      expect(
        utils.getByText(
          "Necesitamos tu permiso para acceder a las fotos y poder elegir una portada."
        )
      ).toBeTruthy();
    });

    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });
  describe("buscador de destinos", () => {
    beforeEach(() => {
      searchDestinations.mockResolvedValue([BARILOCHE_SUGERENCIA]);
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);
    });

    it("al abrirse muestra la guía inicial y el botón para cerrar", async () => {
      const utils = await abrirBuscadorDeDestinos();

      expect(utils.getByText("Agregar destino")).toBeTruthy();
      expect(utils.getByText("Elegí tu primer destino")).toBeTruthy();
      expect(
        utils.getByText("Escribí al menos 2 letras del nombre de una ciudad o país.")
      ).toBeTruthy();
      expect(utils.getByText("Cerrar")).toBeTruthy();
      // No hay sugerencias fijas: solo resultados de la búsqueda.
      expect(utils.queryByText("Sugerencias")).toBeNull();
    });

    it("no busca mientras haya menos de 2 letras", async () => {
      const utils = await abrirBuscadorDeDestinos();

      await buscarDestino(utils, "B");

      expect(searchDestinations).not.toHaveBeenCalled();
      expect(utils.getByText("Elegí tu primer destino")).toBeTruthy();
    });

    it("muestra 'Sin resultados' si la búsqueda no devuelve destinos", async () => {
      searchDestinations.mockResolvedValue([]);

      const utils = await abrirBuscadorDeDestinos();
      await buscarDestino(utils, "Zzzzz");

      await waitFor(() => expect(utils.getByText("Sin resultados")).toBeTruthy());
      expect(utils.getByText(/No encontramos destinos para "Zzzzz"/)).toBeTruthy();
    });

    it("al agregar un destino lo suma a 'Tu ruta' y muestra el aviso", async () => {
      const utils = await abrirBuscadorDeDestinos();

      await agregarBariloche(utils);

      await waitFor(() =>
        expect(utils.getByText("Bariloche agregado a tu ruta")).toBeTruthy()
      );
      expect(utils.getAllByText("Tu ruta").length).toBeGreaterThan(0);
      expect(utils.getAllByText("Bariloche").length).toBeGreaterThan(0);
      // Con un destino elegido el botón inferior lo cuenta.
      expect(utils.getByText("Listo · 1 destino")).toBeTruthy();
      // Al agregar se limpia la búsqueda y se vuelve a ver la ruta completa.
      expect(
        utils.getByText("Escribí al menos 2 letras para sumar otro destino.")
      ).toBeTruthy();
    });

    it("al buscar con destinos elegidos muestra 'Tu ruta (n)' y marca el ya elegido como 'Agregado'", async () => {
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);

      await buscarDestino(utils, "Bariloche");

      await waitFor(() => expect(utils.getByText("Agregado")).toBeTruthy());
      expect(utils.getByText("Tu ruta (1)")).toBeTruthy();
      expect(utils.getByText("Resultados · tocá para agregar")).toBeTruthy();
    });

    it("tocar un resultado 'Agregado' lo quita de la ruta", async () => {
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);

      await buscarDestino(utils, "Bariloche");
      await waitFor(() => expect(utils.getByText("Agregado")).toBeTruthy());

      await press(utils, "Agregado");

      await waitFor(() => expect(utils.queryByText("Agregado")).toBeNull());
      expect(utils.queryByText("Tu ruta (1)")).toBeNull();
    });

    it("permite quitar un destino desde la lista 'Tu ruta'", async () => {
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);

      // El botón de quitar existe en el buscador y en la pantalla de fondo: ambos hacen lo mismo.
      await act(async () => {
        fireEvent.press(utils.getAllByLabelText("Quitar Bariloche").pop());
      });

      await waitFor(() =>
        expect(utils.getByText("Elegí tu primer destino")).toBeTruthy()
      );
      expect(utils.getByText("Cerrar")).toBeTruthy();
    });

    it("no vuelve a agregar un destino que ya está elegido", async () => {
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);

      resolveDestination.mockClear();
      await buscarDestino(utils, "Bariloche");
      await waitFor(() => expect(utils.getByText("Agregado")).toBeTruthy());

      // Tocarlo lo quita (no lo duplica) y no se vuelve a consultar el destino.
      await press(utils, "Agregado");
      expect(resolveDestination).not.toHaveBeenCalled();
    });

    it("se cierra con 'Listo' y conserva los destinos elegidos", async () => {
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);

      await press(utils, "Listo · 1 destino");

      await waitFor(() =>
        expect(utils.queryByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeNull()
      );
      // El destino sigue en la pantalla y se puede volver a abrir el buscador para sumar otro.
      expect(utils.getAllByText("Bariloche").length).toBeGreaterThan(0);

      await press(utils, "Agregar otro destino");
      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeTruthy();
      expect(utils.getAllByText("Tu ruta").length).toBeGreaterThan(0);
    });

    it("se cierra con 'Cerrar' si no se eligió ningún destino", async () => {
      const utils = await abrirBuscadorDeDestinos();

      await press(utils, "Cerrar");

      await waitFor(() =>
        expect(utils.queryByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeNull()
      );
    });

    it("al reabrir el buscador la búsqueda anterior está vacía", async () => {
      const utils = await abrirBuscadorDeDestinos();

      await buscarDestino(utils, "Bari");
      await press(utils, "Cerrar");
      await waitFor(() =>
        expect(utils.queryByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeNull()
      );

      await press(utils, "Buscar ciudad o país...");

      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR).props.value).toBe("");
      expect(utils.getByText("Elegí tu primer destino")).toBeTruthy();
    });

    it("el destino elegido viaja con su foto de Google al crear el viaje", async () => {
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);
      await press(utils, "Listo · 1 destino");

      await press(utils, "Siguiente");
      await waitFor(() =>
        expect(utils.getByText("Invitar participantes (Opcional)")).toBeTruthy()
      );
      await press(utils, "Crear viaje");

      await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
      expect(createTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          destinations: [
            expect.objectContaining({
              name: "Bariloche",
              placeId: "google:bariloche-id",
              imageUrl: "https://example.com/bariloche.jpg",
            }),
          ],
        })
      );
    });
  });

  // En web, TouchableWithoutFeedback + Keyboard.dismiss alrededor del buscador le quitaba el
  // foco al campo al tocarlo: solo se podía agregar el primer destino (el del autoFocus).
  describe("buscador de destinos: agregar dos destinos seguidos", () => {
    const SALTA = { name: "Salta", country: "Argentina", placeId: "google:salta-id" };
    const CAFAYATE = { name: "Cafayate", country: "Argentina", placeId: "google:cafayate-id" };
    const osOriginal = Platform.OS;
    let dismissSpy;
    let focusSpy;

    beforeEach(() => {
      resolveDestination.mockImplementation(async (placeId) =>
        [SALTA, CAFAYATE].find((d) => d.placeId === placeId)
      );
      dismissSpy = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
      focusSpy = jest.spyOn(TextInput.prototype, "focus").mockImplementation(() => {});
    });

    afterEach(() => {
      Platform.OS = osOriginal;
      dismissSpy.mockRestore();
      focusSpy.mockRestore();
    });

    // Toca el buscador (como para volver a escribir) y agrega el destino.
    async function tocarBuscadorYAgregar(utils, destino, cantidad) {
      await act(async () => {
        fireEvent.press(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR));
      });
      searchDestinations.mockResolvedValue([destino]);
      await buscarDestino(utils, destino.name);
      await waitFor(() => expect(utils.getByLabelText(`Agregar ${destino.name}`)).toBeTruthy());
      await act(async () => {
        fireEvent.press(utils.getByLabelText(`Agregar ${destino.name}`));
      });
      await waitFor(() =>
        expect(utils.getByText(`Listo · ${cantidad} ${cantidad === 1 ? "destino" : "destinos"}`)).toBeTruthy()
      );
    }

    async function abrirPaso2() {
      const utils = await renderPantallaCargada();
      await act(async () => {
        fireEvent.changeText(utils.getByPlaceholderText("Escapada a Bariloche"), "Norte");
      });
      await completarFechas(utils);
      await irAlPaso2(utils);
      return utils;
    }

    it("CP1 en web tocar el buscador no le quita el foco y se agregan dos destinos seguidos", async () => {
      const utils = await abrirPaso2();
      Platform.OS = "web";
      await press(utils, "Buscar ciudad o país...");
      dismissSpy.mockClear(); // al abrir se cierra el teclado de la pantalla de fondo

      await tocarBuscadorYAgregar(utils, SALTA, 1);
      // Después de agregar, el buscador vuelve a quedar listo para escribir.
      expect(focusSpy).toHaveBeenCalledTimes(1);
      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR).props.value).toBe("");

      await tocarBuscadorYAgregar(utils, CAFAYATE, 2);
      expect(focusSpy).toHaveBeenCalledTimes(2);

      expect(dismissSpy).not.toHaveBeenCalled();
      expect(utils.getAllByText("Salta").length).toBeGreaterThan(0);
      expect(utils.getAllByText("Cafayate").length).toBeGreaterThan(0);
    });

    it("CP2 en Android/iOS tocar el buscador sigue cerrando el teclado y no fuerza el foco", async () => {
      const utils = await abrirPaso2();
      await press(utils, "Buscar ciudad o país...");
      dismissSpy.mockClear();

      await tocarBuscadorYAgregar(utils, SALTA, 1);
      expect(dismissSpy).toHaveBeenCalled();

      await tocarBuscadorYAgregar(utils, CAFAYATE, 2);
      expect(focusSpy).not.toHaveBeenCalled();
    });
  });

  // CP2: en la web el teclado tapaba el buscador de participantes del paso 3. Al enfocarlo
  // se lo lleva por encima del teclado. En Android/iOS no cambia nada.
  describe("paso 3: el buscador de participantes queda a la vista", () => {
    const osOriginal = Platform.OS;
    let scrollToSpy;

    beforeEach(() => {
      searchDestinations.mockResolvedValue([BARILOCHE_SUGERENCIA]);
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);
      scrollToSpy = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => {});
    });

    afterEach(() => {
      Platform.OS = osOriginal;
      scrollToSpy.mockRestore();
    });

    const layout = (y, height) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height } } });

    async function irAlPaso3ConDestino() {
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);
      await press(utils, "Listo · 1 destino");
      await irAlPaso3(utils);
      return utils;
    }

    async function enfocarBuscador(utils) {
      scrollToSpy.mockClear();
      const input = utils.getByPlaceholderText("Busca por usuario o correo");
      await act(async () => {
        fireEvent(utils.getByTestId("create-trip-scroll"), "layout", layout(0, 300));
        // Input > caja del buscador (la View registrada).
        fireEvent(input.parent, "layout", layout(600, 50));
        fireEvent(input, "focus");
      });
    }

    it("CP2 en la web enfocar el buscador lo lleva por encima del teclado", async () => {
      const utils = await irAlPaso3ConDestino();
      Platform.OS = "web";

      await enfocarBuscador(utils);

      await waitFor(() => expect(scrollToSpy).toHaveBeenCalled());
      // abajo (650) + margen (20) - visible (300)
      expect(scrollToSpy).toHaveBeenLastCalledWith({ y: 370, animated: true });
    });

    it("en Android/iOS enfocar el buscador no desplaza nada", async () => {
      const utils = await irAlPaso3ConDestino();

      await enfocarBuscador(utils);
      await new Promise((resolve) => setTimeout(resolve, 450));

      expect(scrollToSpy).not.toHaveBeenCalled();
    });
  });

  describe("US A - recorrido en el paso Destinos", () => {
    const SALTA = { name: "Salta", country: "Argentina", placeId: "google:salta-id" };
    const CAFAYATE = { name: "Cafayate", country: "Argentina", placeId: "google:cafayate-id" };

    const textoListo = (cantidad) => `Listo · ${cantidad} ${cantidad === 1 ? "destino" : "destinos"}`;

    // Completa los datos de un viaje de `noches` noches y llega al paso 2.
    async function irAlPaso2ConNoches(noches) {
      const utils = await renderPantallaCargada();
      await act(async () => {
        fireEvent.changeText(utils.getByPlaceholderText("Escapada a Bariloche"), "Norte");
      });
      await act(async () => {
        fireEvent.press(utils.getAllByText("Seleccionar fecha")[0]);
      });
      await press(utils, "Seleccionar Fecha de ida (mock)");
      mockPickerDate = new Date(Date.now() + noches * 24 * 60 * 60 * 1000);
      await press(utils, "Seleccionar fecha");
      await press(utils, "Seleccionar Fecha de vuelta (mock)");
      await irAlPaso2(utils);
      return utils;
    }

    async function agregarDestinos(utils, destinos) {
      resolveDestination.mockImplementation(async (placeId) =>
        destinos.find((d) => d.placeId === placeId)
      );
      await press(utils, "Buscar ciudad o país...");
      for (const [indice, destino] of destinos.entries()) {
        searchDestinations.mockResolvedValue([destino]);
        await buscarDestino(utils, destino.name);
        await waitFor(() => expect(utils.getByText(destino.name)).toBeTruthy());
        await press(utils, destino.name);
        await waitFor(() => expect(utils.getByText(textoListo(indice + 1))).toBeTruthy());
      }
      await press(utils, textoListo(destinos.length));
      await waitFor(() =>
        expect(utils.queryByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeNull()
      );
    }

    it("con un solo destino muestra 'Todo el viaje' y deja avanzar", async () => {
      const utils = await irAlPaso2ConNoches(9);
      await agregarDestinos(utils, [SALTA]);

      expect(utils.getByText("Todo el viaje")).toBeTruthy();
      expect(utils.queryByLabelText("Sumar una noche a Salta")).toBeNull();

      await irAlPaso3(utils);
    });

    it("no deja avanzar con un destino en 0 noches hasta repartir, y guarda el recorrido", async () => {
      const utils = await irAlPaso2ConNoches(9);
      await agregarDestinos(utils, [SALTA, CAFAYATE]);

      expect(
        utils.getByText("Indicá cuántas noches pasan en cada destino. Tenés 9 noches para repartir.")
      ).toBeTruthy();

      await press(utils, "Siguiente");
      expect(utils.queryByText("Invitar participantes (Opcional)")).toBeNull();

      await press(utils, "Repartir automáticamente");
      await irAlPaso3(utils);
      await press(utils, "Crear viaje");

      await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
      expect(createTrip.mock.calls[0][0].destinations).toEqual([
        expect.objectContaining({ name: "Salta", noches: 5, nochesEnViaje: 0 }),
        expect.objectContaining({ name: "Cafayate", noches: 4, nochesEnViaje: 0 }),
      ]);
    });

    it("no deja avanzar con noches de más", async () => {
      const utils = await irAlPaso2ConNoches(9);
      await agregarDestinos(utils, [SALTA, CAFAYATE]);
      await press(utils, "Repartir automáticamente");
      await act(async () => {
        fireEvent.press(utils.getByLabelText("Sumar una noche a Cafayate"));
      });

      expect(utils.getByText("Hay 1 noche de más. Sacá noches para poder seguir.")).toBeTruthy();

      await press(utils, "Siguiente");
      expect(utils.queryByText("Invitar participantes (Opcional)")).toBeNull();
    });

    it("quita con el tacho sin confirmar y deshacer lo devuelve con sus noches", async () => {
      const utils = await irAlPaso2ConNoches(9);
      await agregarDestinos(utils, [SALTA, CAFAYATE]);
      await press(utils, "Repartir automáticamente");

      await act(async () => {
        fireEvent.press(utils.getByLabelText("Quitar Salta del viaje"));
      });

      expect(utils.queryByLabelText("Quitar Salta del viaje")).toBeNull();
      expect(utils.getByText("Quitaste Salta de tu viaje")).toBeTruthy();

      await press(utils, "Deshacer");

      expect(utils.queryByText("Quitaste Salta de tu viaje")).toBeNull();

      await irAlPaso3(utils);
      await press(utils, "Crear viaje");

      await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
      expect(createTrip.mock.calls[0][0].destinations).toEqual([
        expect.objectContaining({ name: "Salta", noches: 5 }),
        expect.objectContaining({ name: "Cafayate", noches: 4 }),
      ]);
    });

    it("el aviso de deshacer se cierra al cambiar de paso", async () => {
      const utils = await irAlPaso2ConNoches(9);
      await agregarDestinos(utils, [SALTA, CAFAYATE]);
      await act(async () => {
        fireEvent.press(utils.getByLabelText("Quitar Cafayate del viaje"));
      });
      expect(utils.getByText("Quitaste Cafayate de tu viaje")).toBeTruthy();

      await irAlPaso3(utils);

      expect(utils.queryByText("Quitaste Cafayate de tu viaje")).toBeNull();
    });

    it("con menos noches que destinos no pide noches y guarda sin recorrido", async () => {
      const utils = await irAlPaso2ConNoches(1);
      await agregarDestinos(utils, [SALTA, CAFAYATE]);

      expect(utils.queryByLabelText("Sumar una noche a Salta")).toBeNull();

      await irAlPaso3(utils);
      await press(utils, "Crear viaje");

      await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
      expect(createTrip.mock.calls[0][0].destinations).toEqual([
        expect.objectContaining({ name: "Salta", noches: null, nochesEnViaje: 0 }),
        expect.objectContaining({ name: "Cafayate", noches: null, nochesEnViaje: 0 }),
      ]);
    });
  });
  describe("detalles de interfaz (QA)", () => {
    // Sube por los padres hasta el Pressable de la opción de portada.
    function opcionPortada(utils, etiqueta) {
      let nodo = utils.getByText(etiqueta);
      while (nodo && nodo.props.accessibilityState === undefined) nodo = nodo.parent;
      return nodo;
    }

    it("el buscador de destinos no muestra el error del paso anterior", async () => {
      const utils = await renderPantallaCargada();
      await act(async () => {
        fireEvent.changeText(utils.getByPlaceholderText("Escapada a Bariloche"), "Viaje de prueba");
      });
      await completarFechas(utils);
      await irAlPaso2(utils);

      await press(utils, "Siguiente");
      expect(utils.getByText("Al menos un destino es requerido.")).toBeTruthy();

      await press(utils, "Buscar ciudad o país...");

      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeTruthy();
      expect(utils.queryByText("Al menos un destino es requerido.")).toBeNull();
    });

    it("solo una opción de portada queda marcada al abrir el generador con IA", async () => {
      searchDestinations.mockResolvedValue([BARILOCHE_SUGERENCIA]);
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);

      expect(opcionPortada(utils, "Destino").props.accessibilityState.selected).toBe(true);

      await press(utils, "Con IA");

      const seleccionadas = ["Destino", "Galería", "Con IA"].filter(
        (etiqueta) => opcionPortada(utils, etiqueta).props.accessibilityState.selected
      );
      expect(seleccionadas).toEqual(["Con IA"]);
    });

    it("el botón Crear viaje informa que está subiendo la portada", async () => {
      searchDestinations.mockResolvedValue([BARILOCHE_SUGERENCIA]);
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);
      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: "file:///foto.jpg", fileName: "foto.jpg", mimeType: "image/jpeg" }],
      });
      let terminarSubida;
      uploadTripCover.mockReturnValue(
        new Promise((resolve) => {
          terminarSubida = resolve;
        })
      );
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);
      await press(utils, "Galería");
      await waitFor(() => expect(utils.getByText("Tu foto")).toBeTruthy());
      await irAlPaso3(utils);

      await press(utils, "Crear viaje");

      await waitFor(() => expect(utils.getByText("Subiendo portada…")).toBeTruthy());

      await act(async () => {
        terminarSubida();
      });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("Tabs", { screen: "Inicio" }));
    });

    it("mientras crea el viaje sin portada propia muestra 'Creando viaje…'", async () => {
      searchDestinations.mockResolvedValue([BARILOCHE_SUGERENCIA]);
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);
      createTrip.mockReturnValue(new Promise(() => {}));
      const utils = await abrirBuscadorDeDestinos();
      await agregarBariloche(utils);
      await irAlPaso3(utils);

      await press(utils, "Crear viaje");

      await waitFor(() => expect(utils.getByText("Creando viaje…")).toBeTruthy());
    });
  });
});
