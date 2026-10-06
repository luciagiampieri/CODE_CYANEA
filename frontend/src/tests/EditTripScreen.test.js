import React from "react";
import { Image, Keyboard } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import EditTripScreen from "../screens/EditTripScreen";
import * as ImagePicker from "expo-image-picker";

import {
  getTripDetail,
  updateTrip,
  searchDestinations,
  resolveDestination,
  uploadTripCover,
  removeTripCover,
} from "../services/api.js";

jest.mock("../services/api.js", () => ({
  getTripDetail: jest.fn(),
  updateTrip: jest.fn(),
  searchDestinations: jest.fn(),
  resolveDestination: jest.fn(),
  uploadTripCover: jest.fn(),
  removeTripCover: jest.fn(),
  generateTripCoverAI: jest.fn(),
  acceptTripCoverAI: jest.fn(),
}));

// Mismo mock que en CreateTripScreen.test.js: el selector de fecha se reemplaza por un botón
// que "elige" la fecha guardada en mockPickerDate.
jest.mock("../components/ui/DatePickerModal", () => {
  const ReactActual = require("react");
  const { Pressable, Text } = require("react-native");

  return function MockDatePickerModal({ visible, title, onChange }) {
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

jest.mock("expo-image-picker", () => ({
  MediaTypeOptions: {
    Images: "Images",
  },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockGoBack = jest.fn();
const navigation = { goBack: mockGoBack };
const route = { params: { tripId: 42 } };
let mockPickerDate = new Date();

// Placeholder del campo de búsqueda dentro del buscador de destinos.
const PLACEHOLDER_BUSCADOR = "Ej: Bariloche, Roma, Chile...";

const MENSAJE_GUARDADO = "Los cambios se guardaron correctamente.";
const MENSAJE_CORREGIR = "Por favor, corrige los errores del formulario.";
const ERROR_TITULO_OBLIGATORIO = "El título del viaje es obligatorio.";
const ERROR_DESTINO_OBLIGATORIO = "Debes agregar al menos un destino.";
const ERROR_AL_AGREGAR = "No se pudo agregar ese destino, probá de nuevo.";

const URL_PORTADA_GOOGLE = "https://maps.test/default.jpg";
const URL_PORTADA_PROPIA = "https://storage.test/trip-covers/42/portada-vieja.jpg";

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

const tripFuturo = {
  title: "Viaje a la playa",
  description: "Unas vacaciones con amigos",
  startDate: "2030-01-01",
  endDate: "2030-01-10",
  destinations: [{ name: "Mar del Plata", country: "Argentina", lat: -38, lng: -57 }],
};

// Viaje con la portada de Google Maps (sin portada propia)
const tripConPortadaGoogle = {
  ...tripFuturo,
  hasCustomCover: false,
  image: URL_PORTADA_GOOGLE,
  defaultCoverImage: URL_PORTADA_GOOGLE,
};

// Viaje con una portada que el usuario subió antes
const tripConPortadaPropia = {
  ...tripFuturo,
  hasCustomCover: true,
  image: URL_PORTADA_PROPIA,
  defaultCoverImage: URL_PORTADA_GOOGLE,
};

const assetPng = {
  uri: "file:///nueva-portada.png",
  fileName: "nueva-portada.png",
  mimeType: "image/png",
};

async function press(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getByText(texto));
  });
}

// Presiona la primera coincidencia del texto. Se usa con "Cancelar", que aparece en la
// portada y en el pie: el de la portada es el primero en pantalla.
async function pressPrimero(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getAllByText(texto)[0]);
  });
}

async function pressPorEtiqueta(getters, etiqueta) {
  await act(async () => {
    fireEvent.press(getters.getByLabelText(etiqueta));
  });
}

async function escribir(getters, placeholder, texto) {
  await act(async () => {
    fireEvent.changeText(getters.getByPlaceholderText(placeholder), texto);
  });
}

// Cambia el texto de un campo identificándolo por el valor que tiene ahora.
async function reemplazarTexto(getters, valorActual, texto) {
  await act(async () => {
    fireEvent.changeText(getters.getByDisplayValue(valorActual), texto);
  });
}

// La pantalla se organiza en pestañas: Información, Destinos y Portada.
async function abrirPestania(getters, clave) {
  await act(async () => {
    fireEvent.press(getters.getByTestId(`edit-trip-tab-${clave}`));
  });
}

async function renderPantallaCargada() {
  const utils = await render(<EditTripScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(utils.getByText("Editar viaje")).toBeTruthy());
  return utils;
}

// URLs de todas las imágenes que hay en pantalla (miniaturas de destinos, por ejemplo).
function imagenes(utils) {
  if (typeof utils.UNSAFE_queryAllByType === "function") return utils.UNSAFE_queryAllByType(Image);
  const raiz = utils.UNSAFE_root || utils.root;
  if (raiz?.findAllByType) return raiz.findAllByType(Image);

  // Versiones nuevas de testing-library: se recorre el árbol buscando los elementos Image.
  const esImagen = (nodo) => nodo.type === "Image" || nodo.type === Image;
  if (typeof raiz?.queryAll === "function") return raiz.queryAll(esImagen);
  if (typeof raiz?.findAll === "function") return raiz.findAll(esImagen);

  const encontradas = [];
  const recorrer = (nodo) => {
    if (!nodo || typeof nodo === "string") return;
    if (esImagen(nodo)) encontradas.push(nodo);
    (nodo.children || []).forEach(recorrer);
  };
  recorrer(raiz);
  return encontradas;
}

function urisDeImagenes(utils) {
  return imagenes(utils).map((img) => img.props.source?.uri);
}

async function quitarDestino(utils, indice) {
  await act(async () => {
    fireEvent.press(utils.getByTestId(`edit-trip-remove-destination-${indice}`));
  });
}

async function guardar(utils) {
  await press(utils, "Guardar cambios");
}

// Abre el selector de una fecha tocando el valor que muestra y elige `fecha` en el calendario falso.
async function elegirFecha(utils, textoActual, tituloSelector, fecha) {
  mockPickerDate = fecha;
  await press(utils, textoActual);
  await press(utils, `Seleccionar ${tituloSelector} (mock)`);
}

async function buscarDestino(utils, texto) {
  await escribir(utils, PLACEHOLDER_BUSCADOR, texto);
}

// Abre el buscador desde la pestaña Destinos (con o sin destinos cargados).
async function abrirBuscadorDeDestinos(utils, textoBoton) {
  await abrirPestania(utils, "destinations");
  await press(utils, textoBoton);
}

// Busca "Bariloche" y toca el resultado: queda agregado a la ruta.
async function agregarBariloche(utils) {
  await buscarDestino(utils, "Bariloche");
  await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
  await press(utils, "Bariloche");
  await waitFor(() =>
    expect(resolveDestination).toHaveBeenCalledWith("google:bariloche-id", expect.any(String))
  );
}

// Mismo flujo que un usuario: elige una imagen de la galería en la pestaña Portada.
async function elegirPortadaDeGaleria(utils, textoBoton, asset = assetPng) {
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset] });
  await abrirPestania(utils, "cover");
  await press(utils, textoBoton);
  await waitFor(() => expect(utils.getByText("Nueva imagen seleccionada")).toBeTruthy());
}

describe("US - Editar viaje (EditTripScreen)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickerDate = new Date();
    searchDestinations.mockResolvedValue([]);
    // Por defecto no hay foto para completar en destinos guardados sin imagen.
    resolveDestination.mockResolvedValue({});

    updateTrip.mockResolvedValue({ message: MENSAJE_GUARDADO });
    uploadTripCover.mockResolvedValue({});
    removeTripCover.mockResolvedValue({});

    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      status: "granted",
      canAskAgain: true,
    });

    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: true,
      assets: [],
    });
  });

  // ---------------------------------------------------------------------------
  // Carga inicial
  // ---------------------------------------------------------------------------
  describe("carga inicial", () => {
    it("pide el viaje que se está editando al montar la pantalla", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      await renderPantallaCargada();

      expect(getTripDetail).toHaveBeenCalledTimes(1);
      expect(getTripDetail).toHaveBeenCalledWith(42);
    });

    it("carga los datos del viaje y los muestra en el formulario", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      expect(utils.getByDisplayValue("Viaje a la playa")).toBeTruthy();
      expect(utils.getByDisplayValue("Unas vacaciones con amigos")).toBeTruthy();
      expect(utils.getByText("01/01/2030")).toBeTruthy();
      expect(utils.getByText("10/01/2030")).toBeTruthy();
      // La duración aparece en la métrica y en la etiqueta de las fechas.
      expect(utils.getAllByText("9 noches · 10 días").length).toBeGreaterThan(0);
      await abrirPestania(utils, "destinations"); // los destinos se ven en su pestaña
      expect(utils.getByText("Mar del Plata")).toBeTruthy();
    });

    it("muestra el país y la provincia del destino guardado", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [
          { name: "Bariloche", country: "Argentina", provinceState: "Río Negro", imageUrl: "https://maps.test/b.jpg" },
        ],
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      expect(utils.getByText("Bariloche")).toBeTruthy();
      expect(utils.getByText("Río Negro, Argentina")).toBeTruthy();
    });

    it("muestra un error y permite volver si falla la carga del viaje", async () => {
      getTripDetail.mockRejectedValue(new Error("No se encontró el viaje."));

      const utils = await render(<EditTripScreen navigation={navigation} route={route} />);

      await waitFor(() => expect(utils.getByText("No se encontró el viaje.")).toBeTruthy());

      await press(utils, "Volver");
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });

    it("si el error de carga no trae mensaje, muestra un texto genérico", async () => {
      getTripDetail.mockRejectedValue(new Error(""));

      const utils = await render(<EditTripScreen navigation={navigation} route={route} />);

      await waitFor(() =>
        expect(utils.getByText("No se pudo cargar la información del viaje.")).toBeTruthy()
      );
      expect(utils.queryByText("Guardar cambios")).toBeNull();
    });

    it("bloquea la edición de la fecha de ida si el viaje ya comenzó", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, startDate: "2020-01-01" });

      const utils = await renderPantallaCargada();

      expect(utils.getByText("El viaje ya comenzó, no se puede modificar.")).toBeTruthy();
      // La fecha de ida se muestra como texto fijo, sin selector.
      expect(utils.getByText("01/01/2020")).toBeTruthy();
    });

    it("si el viaje todavía no comenzó, la fecha de ida se puede cambiar", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      expect(utils.queryByText("El viaje ya comenzó, no se puede modificar.")).toBeNull();
    });

    it("conserva lo editado al cambiar de pestaña y volver", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();
      await reemplazarTexto(utils, "Viaje a la playa", "Viaje editado");

      await abrirPestania(utils, "destinations");
      await abrirPestania(utils, "cover");
      await abrirPestania(utils, "info");

      expect(utils.getByDisplayValue("Viaje editado")).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Validaciones: información básica
  // ---------------------------------------------------------------------------
  describe("validaciones del título", () => {
    beforeEach(() => {
      getTripDetail.mockResolvedValue(tripFuturo);
    });

    it("rechaza un título de menos de 3 caracteres", async () => {
      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "Ab");
      await guardar(utils);

      expect(utils.getByText("El título debe tener al menos 3 caracteres.")).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("rechaza un título vacío", async () => {
      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "");
      await guardar(utils);

      expect(utils.getByText(ERROR_TITULO_OBLIGATORIO)).toBeTruthy();
      expect(utils.getByText(MENSAJE_CORREGIR)).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("rechaza un título de solo espacios", async () => {
      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "     ");
      await guardar(utils);

      expect(utils.getByText(ERROR_TITULO_OBLIGATORIO)).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("rechaza un título de más de 100 caracteres", async () => {
      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "a".repeat(101));
      await guardar(utils);

      expect(utils.getByText("El título no puede superar los 100 caracteres.")).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("acepta un título de exactamente 3 caracteres", async () => {
      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "Mar");
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(42, expect.objectContaining({ title: "Mar" }));
    });

    it("el error del título desaparece al corregirlo", async () => {
      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "");
      await guardar(utils);
      expect(utils.getByText(ERROR_TITULO_OBLIGATORIO)).toBeTruthy();
      expect(utils.getByText(MENSAJE_CORREGIR)).toBeTruthy();

      await escribir(utils, "Escapada a Bariloche", "Viaje nuevo");

      expect(utils.queryByText(ERROR_TITULO_OBLIGATORIO)).toBeNull();
      // También se va el aviso general de "corrige los errores".
      expect(utils.queryByText(MENSAJE_CORREGIR)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Validaciones: fechas
  // ---------------------------------------------------------------------------
  describe("validaciones de las fechas", () => {
    it("rechaza una fecha de vuelta anterior a la de ida", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      // 31/12/2029, antes de la ida (01/01/2030)
      await elegirFecha(utils, "10/01/2030", "Fecha de vuelta", new Date(2029, 11, 31));
      expect(utils.getByText("31/12/2029")).toBeTruthy();

      await guardar(utils);

      expect(
        utils.getByText("La fecha de vuelta no puede ser anterior a la de ida.")
      ).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("acepta una vuelta en el mismo día de la ida", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      await elegirFecha(utils, "10/01/2030", "Fecha de vuelta", new Date(2030, 0, 1));
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ startDate: "2030-01-01", endDate: "2030-01-01" })
      );
    });

    it("rechaza una fecha de ida pasada si el viaje todavía no comenzó", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      await elegirFecha(utils, "01/01/2030", "Fecha de ida", new Date(2020, 4, 5)); // 05/05/2020
      await guardar(utils);

      expect(utils.getByText("La fecha de ida debe ser igual o posterior a hoy.")).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("el error de la fecha de ida desaparece al elegir una fecha válida", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      await elegirFecha(utils, "01/01/2030", "Fecha de ida", new Date(2020, 4, 5));
      await guardar(utils);
      expect(utils.getByText("La fecha de ida debe ser igual o posterior a hoy.")).toBeTruthy();

      await elegirFecha(utils, "05/05/2020", "Fecha de ida", new Date(2030, 0, 5));

      expect(utils.queryByText("La fecha de ida debe ser igual o posterior a hoy.")).toBeNull();
      expect(utils.queryByText(MENSAJE_CORREGIR)).toBeNull();
    });

    it("si la fecha de ida pasa a ser posterior a la de vuelta, la vuelta se vacía y es obligatoria", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      // 01/02/2030, después de la vuelta (10/01/2030)
      await elegirFecha(utils, "01/01/2030", "Fecha de ida", new Date(2030, 1, 1));

      expect(utils.getByText("01/02/2030")).toBeTruthy();
      expect(utils.queryByText("10/01/2030")).toBeNull();
      expect(utils.getByText("Seleccionar fecha")).toBeTruthy();

      await guardar(utils);

      expect(utils.getByText("La fecha de vuelta es obligatoria.")).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("exige fecha de ida y de vuelta si el viaje llega sin fechas", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, startDate: "", endDate: "" });

      const utils = await renderPantallaCargada();

      expect(utils.getByText("Sin fechas")).toBeTruthy();
      expect(utils.getByText("Elegí primero la fecha de ida")).toBeTruthy();

      await guardar(utils);

      expect(utils.getByText("La fecha de ida es obligatoria.")).toBeTruthy();
      expect(utils.getByText("La fecha de vuelta es obligatoria.")).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("no deja elegir la vuelta antes de tener la fecha de ida", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, startDate: "", endDate: "" });

      const utils = await renderPantallaCargada();

      await press(utils, "Elegí primero la fecha de ida");

      expect(utils.getByText("Primero elegí la fecha de ida.")).toBeTruthy();
      expect(utils.queryByText("Seleccionar Fecha de vuelta (mock)")).toBeNull();
    });

    it("rechaza una fecha de ida inexistente en el calendario", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, startDate: "2030-02-31", endDate: "2030-03-10" });

      const utils = await renderPantallaCargada();
      await guardar(utils);

      expect(utils.getByText("La fecha de ida no es válida.")).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("rechaza una fecha de vuelta inexistente en el calendario", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, startDate: "2030-01-01", endDate: "2030-02-31" });

      const utils = await renderPantallaCargada();
      await guardar(utils);

      expect(utils.getByText("La fecha de vuelta no es válida.")).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("un viaje ya comenzado se puede guardar aunque su fecha de ida sea pasada", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, startDate: "2020-01-01" });

      const utils = await renderPantallaCargada();
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ startDate: "2020-01-01", endDate: "2030-01-10" })
      );
    });

    it("un viaje ya terminado se puede guardar sin que las fechas pasadas den error", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, startDate: "2020-01-01", endDate: "2020-01-10" });

      const utils = await renderPantallaCargada();
      await reemplazarTexto(utils, "Viaje a la playa", "Viaje inolvidable");
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(utils.queryByText("La fecha de vuelta debe ser igual o posterior a hoy.")).toBeNull();
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ startDate: "2020-01-01", endDate: "2020-01-10" })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Validaciones: destinos
  // ---------------------------------------------------------------------------
  describe("validaciones de los destinos", () => {
    it("exige al menos un destino", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, destinations: [] });

      const utils = await renderPantallaCargada();
      await guardar(utils);

      // El único error está en Destinos: la pantalla va sola a esa pestaña.
      expect(utils.getByText(ERROR_DESTINO_OBLIGATORIO)).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("muestra errores de título y de destinos si se elimina el único destino y el título está vacío", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "");
      await abrirPestania(utils, "destinations");
      await quitarDestino(utils, 0);

      await guardar(utils);

      // Al fallar la validación, la pantalla vuelve a la primera pestaña con errores
      // (Información) aunque el usuario estuviera en Destinos.
      expect(utils.getByText(ERROR_TITULO_OBLIGATORIO)).toBeTruthy();

      await abrirPestania(utils, "destinations");
      expect(utils.getByText(ERROR_DESTINO_OBLIGATORIO)).toBeTruthy();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("si el único error está en Destinos, al guardar lleva a esa pestaña", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      await abrirPestania(utils, "destinations");
      await quitarDestino(utils, 0);
      await abrirPestania(utils, "info");

      await guardar(utils);

      // Sin tocar de pestaña, el error ya se ve: la pantalla fue sola a Destinos.
      expect(utils.getByText(ERROR_DESTINO_OBLIGATORIO)).toBeTruthy();
      expect(utils.queryByText("Información Básica")).toBeNull();
      expect(updateTrip).not.toHaveBeenCalled();
    });

    it("el error de destinos desaparece al agregar uno", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, destinations: [] });
      searchDestinations.mockResolvedValue([BARILOCHE_SUGERENCIA]);
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);

      const utils = await renderPantallaCargada();
      await guardar(utils);
      expect(utils.getByText(ERROR_DESTINO_OBLIGATORIO)).toBeTruthy();

      await press(utils, "Buscar ciudad o país...");
      await agregarBariloche(utils);
      await press(utils, "Listo · 1 destino");

      await waitFor(() => expect(utils.queryByText(ERROR_DESTINO_OBLIGATORIO)).toBeNull());
    });
  });

  // ---------------------------------------------------------------------------
  // Guardado
  // ---------------------------------------------------------------------------
  describe("guardado", () => {
    it("guarda los cambios correctamente y vuelve atrás", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "Viaje a la playa (editado)");
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ title: "Viaje a la playa (editado)" })
      );

      await waitFor(() => {
        expect(utils.getByText(MENSAJE_GUARDADO)).toBeTruthy();
      });

      // navigation.goBack() se dispara 900ms después de guardar (ver source).
      await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1), { timeout: 3000 });
    });

    it("envía todos los datos del viaje: título, descripción, fechas, moneda y destinos", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        currency: "USD",
        destinations: [
          {
            name: "Mar del Plata",
            country: "Argentina",
            lat: -38,
            lng: -57,
            placeId: "google:mdq-id",
            provinceState: "Buenos Aires",
            imageUrl: "https://maps.test/mdq.jpg",
          },
        ],
      });

      const utils = await renderPantallaCargada();
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(42, {
        title: "Viaje a la playa",
        description: "Unas vacaciones con amigos",
        startDate: "2030-01-01",
        endDate: "2030-01-10",
        currency: "USD",
        destinations: [
          {
            name: "Mar del Plata",
            country: "Argentina",
            lat: -38,
            lng: -57,
            placeId: "google:mdq-id",
            provinceState: "Buenos Aires",
            imageUrl: "https://maps.test/mdq.jpg",
          },
        ],
      });
    });

    it("si el viaje no trae moneda, guarda en pesos (ARS)", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(42, expect.objectContaining({ currency: "ARS" }));
    });

    it("guarda el título sin espacios sobrantes y la descripción vacía como null", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Viaje a la playa", "   Viaje con espacios   ");
      await reemplazarTexto(utils, "Unas vacaciones con amigos", "   ");

      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ title: "Viaje con espacios", description: null })
      );
    });

    it("guarda la descripción sin espacios sobrantes", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();

      await reemplazarTexto(utils, "Unas vacaciones con amigos", "  Con la familia  ");
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ description: "Con la familia" })
      );
    });

    it("si el servidor no manda mensaje, muestra uno por defecto", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);
      updateTrip.mockResolvedValue({});

      const utils = await renderPantallaCargada();
      await guardar(utils);

      await waitFor(() => expect(utils.getByText("Cambios guardados correctamente.")).toBeTruthy());
    });

    it("muestra el mensaje de error del servidor si falla el guardado", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);
      updateTrip.mockRejectedValue(new Error("No se pudo actualizar el viaje."));

      const utils = await renderPantallaCargada();
      await guardar(utils);

      await waitFor(() => {
        expect(utils.getByText("No se pudo actualizar el viaje.")).toBeTruthy();
      });
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it("el aviso de error del servidor se va al seguir editando", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);
      updateTrip.mockRejectedValue(new Error("No se pudo actualizar el viaje."));

      const utils = await renderPantallaCargada();
      await guardar(utils);
      await waitFor(() => expect(utils.getByText("No se pudo actualizar el viaje.")).toBeTruthy());

      await reemplazarTexto(utils, "Viaje a la playa", "Viaje a la playa 2");

      expect(utils.queryByText("No se pudo actualizar el viaje.")).toBeNull();
    });

    it("después de un error del servidor se puede reintentar y guardar", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);
      updateTrip
        .mockRejectedValueOnce(new Error("No se pudo actualizar el viaje."))
        .mockResolvedValueOnce({ message: MENSAJE_GUARDADO });

      const utils = await renderPantallaCargada();

      await guardar(utils);
      await waitFor(() => expect(utils.getByText("No se pudo actualizar el viaje.")).toBeTruthy());

      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(utils.getByText(MENSAJE_GUARDADO)).toBeTruthy());
    });

    it("no guarda nada ni vuelve atrás si no se toca 'Guardar cambios'", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();
      await reemplazarTexto(utils, "Viaje a la playa", "Otro título");

      expect(updateTrip).not.toHaveBeenCalled();
      expect(mockGoBack).not.toHaveBeenCalled();
    });

    it("vuelve atrás al tocar 'Cancelar' sin guardar", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();
      await press(utils, "Cancelar");

      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(updateTrip).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Fotos de los destinos ya guardados
  // ---------------------------------------------------------------------------
  describe("fotos de los destinos ya guardados", () => {
    it("muestra la foto del destino si el viaje ya la trae", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [
          { name: "Mar del Plata", country: "Argentina", imageUrl: "https://maps.test/mdq.jpg" },
        ],
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      expect(urisDeImagenes(utils)).toContain("https://maps.test/mdq.jpg");
      expect(resolveDestination).not.toHaveBeenCalled();
    });

    it("acepta la foto bajo otros nombres de campo (image, photoUrl...)", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [
          { name: "Mar del Plata", country: "Argentina", image: "https://maps.test/a.jpg" },
          { name: "Mendoza", country: "Argentina", photoUrl: "https://maps.test/b.jpg" },
        ],
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      expect(urisDeImagenes(utils)).toEqual(
        expect.arrayContaining(["https://maps.test/a.jpg", "https://maps.test/b.jpg"])
      );
    });

    it("completa la foto con Google usando el placeId cuando el destino viene sin imagen", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [{ name: "Bariloche", country: "Argentina", placeId: "google:bariloche-id" }],
      });
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      await waitFor(() =>
        expect(urisDeImagenes(utils)).toContain("https://example.com/bariloche.jpg")
      );
      expect(resolveDestination).toHaveBeenCalledWith("google:bariloche-id", expect.any(String));
      // Con placeId no hace falta buscar el destino por nombre.
      expect(searchDestinations).not.toHaveBeenCalled();
    });

    it("completa la foto de cada destino que viene sin imagen", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [
          { name: "Bariloche", country: "Argentina", placeId: "google:bariloche-id" },
          { name: "Mendoza", country: "Argentina", placeId: "google:mendoza-id" },
        ],
      });
      resolveDestination.mockImplementation(async (placeId) => ({
        placeId,
        imageUrl: `https://maps.test/${placeId}.jpg`,
      }));

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      await waitFor(() =>
        expect(urisDeImagenes(utils)).toEqual(
          expect.arrayContaining([
            "https://maps.test/google:bariloche-id.jpg",
            "https://maps.test/google:mendoza-id.jpg",
          ])
        )
      );
      expect(resolveDestination).toHaveBeenCalledTimes(2);
    });

    it("sin placeId busca el destino por nombre y país para obtener su foto", async () => {
      getTripDetail.mockResolvedValue(tripFuturo); // Mar del Plata, sin placeId ni imagen
      searchDestinations.mockResolvedValue([
        { name: "Mar del Plata", country: "Argentina", placeId: "google:mdq-id" },
      ]);
      resolveDestination.mockResolvedValue({
        name: "Mar del Plata",
        country: "Argentina",
        placeId: "google:mdq-id",
        imageUrl: "https://maps.test/mdq-google.jpg",
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      await waitFor(() =>
        expect(urisDeImagenes(utils)).toContain("https://maps.test/mdq-google.jpg")
      );
      expect(searchDestinations).toHaveBeenCalledWith("Mar del Plata, Argentina", expect.any(String));
      expect(resolveDestination).toHaveBeenCalledWith("google:mdq-id", expect.any(String));
    });

    it("no usa un resultado de otro lugar como foto del destino", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);
      searchDestinations.mockResolvedValue([
        { name: "Bariloche", country: "Argentina", placeId: "google:bariloche-id" },
      ]);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      await waitFor(() => expect(searchDestinations).toHaveBeenCalled());
      expect(resolveDestination).not.toHaveBeenCalled();
      expect(urisDeImagenes(utils)).not.toContain("https://example.com/bariloche.jpg");
      // El destino igual se muestra, con su ícono de ubicación en lugar de la foto.
      expect(utils.getByText("Mar del Plata")).toBeTruthy();
    });

    it("si Google no responde al pedir la foto, el destino sigue visible", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [{ name: "Bariloche", country: "Argentina", placeId: "google:bariloche-id" }],
      });
      resolveDestination.mockRejectedValue(new Error("Sin conexión"));

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      await waitFor(() => expect(resolveDestination).toHaveBeenCalledTimes(1));
      expect(utils.getByText("Bariloche")).toBeTruthy();
      expect(urisDeImagenes(utils)).not.toContain("https://example.com/bariloche.jpg");
    });

    it("el destino principal usa la portada de Google del viaje como respaldo", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaGoogle);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      expect(urisDeImagenes(utils)).toContain(URL_PORTADA_GOOGLE);
      // Ya tiene foto: no hace falta pedirla de nuevo.
      expect(resolveDestination).not.toHaveBeenCalled();
    });

    it("la portada de Google solo se usa como respaldo del primer destino", async () => {
      getTripDetail.mockResolvedValue({
        ...tripConPortadaGoogle,
        destinations: [
          { name: "Mar del Plata", country: "Argentina" },
          { name: "Mendoza", country: "Argentina" },
        ],
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      expect(urisDeImagenes(utils).filter((uri) => uri === URL_PORTADA_GOOGLE)).toHaveLength(1);
    });

    it("la portada personalizada del viaje no se usa como foto del destino", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        hasCustomCover: true,
        image: URL_PORTADA_PROPIA,
        // sin defaultCoverImage
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      expect(urisDeImagenes(utils)).not.toContain(URL_PORTADA_PROPIA);
    });

    it("si la foto no carga, el destino sigue visible con su ícono", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [
          { name: "Mar del Plata", country: "Argentina", imageUrl: "https://maps.test/rota.jpg" },
        ],
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      const imagen = imagenes(utils).find((img) => img.props.source?.uri === "https://maps.test/rota.jpg");
      expect(imagen).toBeTruthy();

      await act(async () => {
        fireEvent(imagen, "error");
      });

      await waitFor(() => expect(urisDeImagenes(utils)).not.toContain("https://maps.test/rota.jpg"));
      expect(utils.getByText("Mar del Plata")).toBeTruthy();
    });

    it("al guardar envía el destino con su foto", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [
          {
            name: "Mar del Plata",
            country: "Argentina",
            lat: -38,
            lng: -57,
            imageUrl: "https://maps.test/mdq.jpg",
          },
        ],
      });

      const utils = await renderPantallaCargada();
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          destinations: [
            expect.objectContaining({
              name: "Mar del Plata",
              country: "Argentina",
              imageUrl: "https://maps.test/mdq.jpg",
            }),
          ],
        })
      );
    });

    it("al guardar envía la foto que se completó con Google", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [{ name: "Bariloche", country: "Argentina", placeId: "google:bariloche-id" }],
      });
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");
      await waitFor(() =>
        expect(urisDeImagenes(utils)).toContain("https://example.com/bariloche.jpg")
      );

      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          destinations: [
            expect.objectContaining({ name: "Bariloche", imageUrl: "https://example.com/bariloche.jpg" }),
          ],
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Lista de destinos de la pestaña
  // ---------------------------------------------------------------------------
  describe("lista de destinos", () => {
    it("quita un destino y conserva los demás", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        destinations: [
          { name: "Mar del Plata", country: "Argentina", lat: -38, lng: -57 },
          { name: "Mendoza", country: "Argentina", lat: -32, lng: -68 },
        ],
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      await quitarDestino(utils, 0);

      expect(utils.queryByText("Mar del Plata")).toBeNull();
      expect(utils.getByText("Mendoza")).toBeTruthy();

      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      const enviados = updateTrip.mock.calls[0][1].destinations;
      expect(enviados.map((d) => d.name)).toEqual(["Mendoza"]);
    });

    it("al quitar el último destino ofrece buscar uno nuevo", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");

      await quitarDestino(utils, 0);

      expect(utils.getByText("Buscar ciudad o país...")).toBeTruthy();
      expect(utils.getByText("Podés agregar más de un destino.")).toBeTruthy();
      expect(utils.queryByText("Agregar otro destino")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Buscador de destinos
  // ---------------------------------------------------------------------------
  describe("buscador de destinos", () => {
    let dismissSpy;

    beforeEach(() => {
      getTripDetail.mockResolvedValue(tripFuturo);
      searchDestinations.mockResolvedValue([BARILOCHE_SUGERENCIA]);
      resolveDestination.mockResolvedValue(BARILOCHE_RESUELTO);
      dismissSpy = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    });

    afterEach(() => {
      dismissSpy.mockRestore();
    });

    it("sin destinos, la pestaña ofrece buscar uno y el buscador muestra la guía inicial", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, destinations: [] });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");
      expect(utils.getByText("Podés agregar más de un destino.")).toBeTruthy();

      await press(utils, "Buscar ciudad o país...");

      expect(utils.getByText("Agregar destino")).toBeTruthy();
      expect(utils.getByText("Elegí tu primer destino")).toBeTruthy();
      expect(
        utils.getByText("Escribí al menos 2 letras del nombre de una ciudad o país.")
      ).toBeTruthy();
      expect(utils.getByText("Cerrar")).toBeTruthy();
      expect(utils.queryByText("Sugerencias")).toBeNull();
    });

    it("con destinos cargados, 'Agregar otro destino' abre el buscador mostrando 'Tu ruta'", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeTruthy();
      expect(utils.getAllByText("Tu ruta").length).toBeGreaterThan(0);
      expect(utils.getAllByText("Mar del Plata").length).toBeGreaterThan(1); // pantalla + ruta
      expect(utils.getByText("Listo · 1 destino")).toBeTruthy();
      expect(utils.getByText("Escribí al menos 2 letras para sumar otro destino.")).toBeTruthy();
    });

    it("al abrirse cierra el teclado que hubiera quedado abierto", async () => {
      const utils = await renderPantallaCargada();

      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      expect(dismissSpy).toHaveBeenCalled();
    });

    it("no busca mientras haya menos de 2 letras", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");
      searchDestinations.mockClear(); // descarta la búsqueda de la foto al cargar

      await buscarDestino(utils, "B");

      expect(searchDestinations).not.toHaveBeenCalledWith("B", expect.anything());
    });

    it("busca sin los espacios sobrantes del texto escrito", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      await buscarDestino(utils, "  Bariloche ");

      await waitFor(() =>
        expect(searchDestinations).toHaveBeenCalledWith("Bariloche", expect.any(String))
      );
    });

    it("muestra 'Sin resultados' si la búsqueda no devuelve destinos", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");
      searchDestinations.mockResolvedValue([]);

      await buscarDestino(utils, "Zzzzz");

      await waitFor(() => expect(utils.getByText("Sin resultados")).toBeTruthy());
    });

    it("muestra 'Sin resultados' si falla la búsqueda", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");
      searchDestinations.mockRejectedValue(new Error("Network Error"));

      await buscarDestino(utils, "Bariloche");

      await waitFor(() => expect(utils.getByText("Sin resultados")).toBeTruthy());
    });

    it("'Borrar búsqueda' vacía el texto y vuelve a la lista de la ruta", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      await buscarDestino(utils, "Bari");
      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR).props.value).toBe("Bari");

      await pressPorEtiqueta(utils, "Borrar búsqueda");

      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR).props.value).toBe("");
      expect(utils.getByText("Escribí al menos 2 letras para sumar otro destino.")).toBeTruthy();
    });

    it("al agregar un destino lo suma a la ruta, avisa y lo guarda con su foto", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      await agregarBariloche(utils);

      await waitFor(() => expect(utils.getByText("Bariloche agregado a tu ruta")).toBeTruthy());
      expect(utils.getByText("Listo · 2 destinos")).toBeTruthy();
      expect(urisDeImagenes(utils)).toContain("https://example.com/bariloche.jpg");

      await press(utils, "Listo · 2 destinos");
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(updateTrip).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          destinations: [
            expect.objectContaining({ name: "Mar del Plata" }),
            expect.objectContaining({
              name: "Bariloche",
              placeId: "google:bariloche-id",
              provinceState: "Río Negro",
              imageUrl: "https://example.com/bariloche.jpg",
            }),
          ],
        })
      );
    });

    it("al elegir un destino limpia la búsqueda y usa la misma sesión de Google", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      await agregarBariloche(utils);

      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR).props.value).toBe("");
      const tokenDeBusqueda = searchDestinations.mock.calls.find(([texto]) => texto === "Bariloche")[1];
      const tokenAlResolver = resolveDestination.mock.calls.find(([id]) => id === "google:bariloche-id")[1];
      expect(tokenAlResolver).toBe(tokenDeBusqueda);
    });

    it("al buscar muestra 'Tu ruta (n)' y marca como 'Agregado' el destino ya elegido", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");
      await agregarBariloche(utils);

      await buscarDestino(utils, "Bariloche");

      await waitFor(() => expect(utils.getByText("Agregado")).toBeTruthy());
      expect(utils.getByText("Tu ruta (2)")).toBeTruthy();
      expect(utils.getByText("Resultados · tocá para agregar")).toBeTruthy();
    });

    it("tocar un resultado 'Agregado' lo quita de la ruta", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");
      await agregarBariloche(utils);

      await buscarDestino(utils, "Bariloche");
      await waitFor(() => expect(utils.getByText("Agregado")).toBeTruthy());

      await press(utils, "Agregado");

      await waitFor(() => expect(utils.queryByText("Agregado")).toBeNull());
      expect(utils.getByText("Tu ruta (1)")).toBeTruthy();
    });

    it("permite quitar un destino desde la lista 'Tu ruta' del buscador", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      // El botón existe en la pantalla y en el buscador: ambos hacen lo mismo.
      await act(async () => {
        fireEvent.press(utils.getAllByLabelText("Quitar Mar del Plata").pop());
      });

      await waitFor(() => expect(utils.getByText("Elegí tu primer destino")).toBeTruthy());
      expect(utils.getByText("Cerrar")).toBeTruthy();
    });

    it("se cierra con 'Listo' y deja los destinos como estaban", async () => {
      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      await press(utils, "Listo · 1 destino");

      await waitFor(() => expect(utils.queryByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeNull());
      expect(utils.getByText("Mar del Plata")).toBeTruthy();
    });

    it("se cierra con 'Cerrar' y al reabrirse la búsqueda anterior está vacía", async () => {
      getTripDetail.mockResolvedValue({ ...tripFuturo, destinations: [] });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "destinations");
      await press(utils, "Buscar ciudad o país...");

      await buscarDestino(utils, "Bari");
      await press(utils, "Cerrar");
      await waitFor(() => expect(utils.queryByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeNull());

      await press(utils, "Buscar ciudad o país...");
      expect(utils.getByPlaceholderText(PLACEHOLDER_BUSCADOR).props.value).toBe("");
      expect(utils.getByText("Elegí tu primer destino")).toBeTruthy();
    });

    it("muestra un error si no se puede resolver el destino elegido", async () => {
      resolveDestination.mockRejectedValue(new Error("No se pudo resolver el destino"));

      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      await buscarDestino(utils, "Bariloche");
      await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
      await press(utils, "Bariloche");

      await waitFor(() =>
        expect(utils.getAllByText(ERROR_AL_AGREGAR).length).toBeGreaterThan(0)
      );
      expect(utils.queryByText("Bariloche agregado a tu ruta")).toBeNull();
    });

    it("si no se pudo resolver el destino, no se agrega a la ruta ni se guarda", async () => {
      resolveDestination.mockRejectedValue(new Error("No se pudo resolver el destino"));

      const utils = await renderPantallaCargada();
      await abrirBuscadorDeDestinos(utils, "Agregar otro destino");

      await buscarDestino(utils, "Bariloche");
      await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
      await press(utils, "Bariloche");
      await waitFor(() =>
        expect(utils.getAllByText(ERROR_AL_AGREGAR).length).toBeGreaterThan(0)
      );

      await press(utils, "Listo · 1 destino");
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      const enviados = updateTrip.mock.calls[0][1].destinations;
      expect(enviados.map((d) => d.name)).toEqual(["Mar del Plata"]);
    });

    describe("con el teclado abierto", () => {
      let addListenerSpy;
      let manejadores;

      beforeEach(() => {
        manejadores = {};
        addListenerSpy = jest.spyOn(Keyboard, "addListener").mockImplementation((evento, fn) => {
          manejadores[evento] = fn;
          return { remove: jest.fn() };
        });
      });

      afterEach(() => {
        addListenerSpy.mockRestore();
      });

      async function mostrarTeclado() {
        const mostrar = manejadores.keyboardWillShow || manejadores.keyboardDidShow;
        await act(async () => {
          mostrar();
        });
      }

      it("oculta el botón del pie y ofrece 'Listo' junto a la ruta para no quedar tapado", async () => {
        const utils = await renderPantallaCargada();
        await abrirBuscadorDeDestinos(utils, "Agregar otro destino");
        await buscarDestino(utils, "Bari");
        await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
        expect(utils.getByText("Listo · 1 destino")).toBeTruthy();

        await mostrarTeclado();

        expect(utils.queryByText("Listo · 1 destino")).toBeNull();
        expect(utils.getByLabelText("Listo")).toBeTruthy();
        // Los resultados ganan lugar: se oculta el rótulo de la lista.
        expect(utils.queryByText("Resultados · tocá para agregar")).toBeNull();
        expect(utils.getByText("Bariloche")).toBeTruthy();
      });

      it("'Listo' cierra el buscador", async () => {
        const utils = await renderPantallaCargada();
        await abrirBuscadorDeDestinos(utils, "Agregar otro destino");
        await buscarDestino(utils, "Bari");
        await waitFor(() => expect(utils.getByText("Bariloche")).toBeTruthy());
        await mostrarTeclado();

        await pressPorEtiqueta(utils, "Listo");

        await waitFor(() => expect(utils.queryByPlaceholderText(PLACEHOLDER_BUSCADOR)).toBeNull());
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Portada
  // ---------------------------------------------------------------------------
  describe("portada del viaje", () => {
    it("muestra la portada según el destino cuando no hay una personalizada", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaGoogle);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      expect(utils.getByText("Portada según destino")).toBeTruthy();
    });

    it("muestra la portada personalizada actual", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      expect(utils.getByText("Portada personalizada actual")).toBeTruthy();
      expect(utils.getByText("Usar Google")).toBeTruthy();
    });

    it("si el viaje no tiene ninguna portada, avisa que se usará una predeterminada", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      expect(utils.getByText("Se usará una portada predeterminada")).toBeTruthy();
      expect(utils.getByText("Elegir de la galería")).toBeTruthy();
      expect(utils.queryByText("Usar Google")).toBeNull();
    });

    it("permite seleccionar una nueva portada PNG", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaGoogle);

      const utils = await renderPantallaCargada();

      await elegirPortadaDeGaleria(utils, "Elegir de la galería");

      expect(utils.getByText("Nueva imagen seleccionada")).toBeTruthy();
    });

    it("deduce el formato y el nombre de la imagen cuando la galería no los informa", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaGoogle);

      const utils = await renderPantallaCargada();
      await elegirPortadaDeGaleria(utils, "Elegir de la galería", { uri: "file:///foto.JPG" });

      await guardar(utils);

      await waitFor(() => expect(uploadTripCover).toHaveBeenCalledTimes(1));
      expect(uploadTripCover).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          uri: "file:///foto.JPG",
          fileName: "portada.jpg",
          mimeType: "image/jpeg",
        })
      );
    });

    it("sube la nueva portada al guardar los cambios", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await elegirPortadaDeGaleria(utils, "Cambiar imagen de galería");

      await guardar(utils);

      await waitFor(() => expect(uploadTripCover).toHaveBeenCalledTimes(1));
      expect(uploadTripCover).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          uri: "file:///nueva-portada.png",
          fileName: "nueva-portada.png",
          mimeType: "image/png",
        })
      );
      expect(removeTripCover).not.toHaveBeenCalled();
    });

    it("no sube ni elimina ninguna portada si no se tocó esa sección", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(uploadTripCover).not.toHaveBeenCalled();
      expect(removeTripCover).not.toHaveBeenCalled();
    });

    it("si falla la subida de la portada, igual guarda el viaje y lo avisa", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        hasCustomCover: false,
        defaultCoverImage: URL_PORTADA_GOOGLE,
      });
      uploadTripCover.mockRejectedValue(new Error("Archivo demasiado pesado"));

      const utils = await renderPantallaCargada();
      await elegirPortadaDeGaleria(utils, "Elegir de la galería");

      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          utils.getByText(/No se pudo actualizar la portada \(Archivo demasiado pesado\)/)
        ).toBeTruthy()
      );
    });

    it("rechaza una portada con formato no permitido", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      ImagePicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{ uri: "file:///portada.gif", fileName: "portada.gif", mimeType: "image/gif" }],
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      await press(utils, "Cambiar imagen de galería");

      await waitFor(() => {
        expect(utils.getByText("Solo se permiten archivos JPG, JPEG y PNG.")).toBeTruthy();
      });

      expect(utils.queryByText("Nueva imagen seleccionada")).toBeNull();
      expect(uploadTripCover).not.toHaveBeenCalled();
    });

    it("informa si se deniega el permiso para acceder a la galería", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);
      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
        status: "denied",
        canAskAgain: true,
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      await press(utils, "Elegir de la galería");

      await waitFor(() => {
        expect(utils.getByText("Necesitamos tu permiso para acceder a las fotos.")).toBeTruthy();
      });

      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    });

    it("explica cómo habilitar el permiso si quedó bloqueado desde los ajustes", async () => {
      getTripDetail.mockResolvedValue(tripFuturo);
      ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
        status: "denied",
        canAskAgain: false,
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      await press(utils, "Elegir de la galería");

      await waitFor(() => {
        expect(
          utils.getByText("El acceso a las fotos está bloqueado desde los ajustes.")
        ).toBeTruthy();
      });
      expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
    });

    it("si se cierra la galería sin elegir nada, la portada queda como estaba", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      await press(utils, "Cambiar imagen de galería");

      expect(utils.queryByText("Nueva imagen seleccionada")).toBeNull();
      expect(utils.getByText("Portada personalizada actual")).toBeTruthy();
    });

    it("permite cancelar la selección y conserva la portada actual", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await elegirPortadaDeGaleria(utils, "Cambiar imagen de galería");

      await pressPrimero(utils, "Cancelar"); // el de la portada, no el del pie

      expect(utils.queryByText("Nueva imagen seleccionada")).toBeNull();
      expect(utils.getByText("Portada personalizada actual")).toBeTruthy();
    });

    it("permite solicitar volver a la portada de Google", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      await press(utils, "Usar Google");

      expect(utils.getByText("Portada de Google Maps")).toBeTruthy();
    });

    it("si el viaje no tiene portada de Google, avisa que se usará una predeterminada", async () => {
      getTripDetail.mockResolvedValue({
        ...tripFuturo,
        hasCustomCover: true,
        image: URL_PORTADA_PROPIA,
        // sin defaultCoverImage
      });

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      await press(utils, "Usar Google");

      expect(utils.getByText("Se usará una portada predeterminada")).toBeTruthy();
    });

    it("permite arrepentirse de volver a la portada de Google", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");
      await press(utils, "Usar Google");

      await pressPrimero(utils, "Cancelar"); // el de la portada, no el del pie

      expect(utils.getByText("Portada personalizada actual")).toBeTruthy();
      expect(utils.queryByText("Portada de Google Maps")).toBeNull();

      await guardar(utils);
      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      expect(removeTripCover).not.toHaveBeenCalled();
    });

    it("elimina la portada personalizada al guardar y volver a Google", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      await press(utils, "Usar Google");
      await guardar(utils);

      await waitFor(() => expect(removeTripCover).toHaveBeenCalledWith(42));
      expect(uploadTripCover).not.toHaveBeenCalled();
    });

    it("si falla al quitar la portada personalizada, igual guarda el viaje y lo avisa", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);
      removeTripCover.mockRejectedValue(new Error("Sin permisos"));

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");

      await press(utils, "Usar Google");
      await guardar(utils);

      await waitFor(() => expect(updateTrip).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          utils.getByText(/No se pudo quitar la portada personalizada \(Sin permisos\)/)
        ).toBeTruthy()
      );
    });

    it("elegir una imagen después de pedir la de Google anula el pedido de quitar la portada", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await abrirPestania(utils, "cover");
      await press(utils, "Usar Google");
      expect(utils.getByText("Portada de Google Maps")).toBeTruthy();

      await elegirPortadaDeGaleria(utils, "Cambiar imagen de galería");
      await guardar(utils);

      await waitFor(() => expect(uploadTripCover).toHaveBeenCalledTimes(1));
      expect(removeTripCover).not.toHaveBeenCalled();
    });

    it("pedir la portada de Google descarta la imagen que se había elegido", async () => {
      getTripDetail.mockResolvedValue(tripConPortadaPropia);

      const utils = await renderPantallaCargada();
      await elegirPortadaDeGaleria(utils, "Cambiar imagen de galería");

      // Con una imagen nueva elegida no se ofrece "Usar Google": primero se cancela la elección.
      expect(utils.queryByText("Usar Google")).toBeNull();
      await pressPrimero(utils, "Cancelar");
      await press(utils, "Usar Google");
      await guardar(utils);

      await waitFor(() => expect(removeTripCover).toHaveBeenCalledWith(42));
      expect(uploadTripCover).not.toHaveBeenCalled();
    });
  });
});