import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import DocumentsScreen from "../screens/DocumentsScreen";
import { getDocumentCategories, uploadTripDocument } from "../services/api";

const mockGoBack = jest.fn();
const mockGetDocumentAsync = jest.fn();

jest.mock("../services/api", () => ({
  getDocumentCategories: jest.fn(),
  uploadTripDocument: jest.fn(),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args) => mockGetDocumentAsync(...args),
}));

jest.mock("../components/layout/ScreenContainer", () => {
  const ReactActual = require("react");
  const { View } = require("react-native");

  return function ScreenContainer({ children }) {
    return ReactActual.createElement(View, null, children);
  };
});

jest.mock("../components/ui/IconCircleButton", () => {
  const ReactActual = require("react");
  const { Pressable, Text } = require("react-native");

  return function IconCircleButton({ onPress }) {
    return ReactActual.createElement(
      Pressable,
      { testID: "back-button", onPress },
      ReactActual.createElement(Text, null, "Volver")
    );
  };
});

const categorias = [
  { IdCategoriaDocumento: 1, Nombre: "Pasajes" },
  { IdCategoriaDocumento: 2, Nombre: "Reservas" },
];

const route = { params: { tripId: 10 } };
const navigation = { goBack: mockGoBack };

async function press(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}


async function pressSubmit(utils) {
  await act(async () => {
    const matches = utils.getAllByText("Subir documento");
    fireEvent.press(matches[matches.length - 1]);
  });
}

async function renderPantallaCargada() {
  const utils = await render(<DocumentsScreen route={route} navigation={navigation} />);
  await waitFor(() => expect(utils.getByText("Seleccionar archivo")).toBeTruthy());
  return utils;
}

async function seleccionarArchivoValido(utils, overrides = {}) {
  mockGetDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [
      {
        name: "Seguro.pdf",
        uri: "file:///seguro.pdf",
        size: 2048,
        mimeType: "application/pdf",
        ...overrides,
      },
    ],
  });

  await press(utils, "Seleccionar archivo");
}

async function elegirCategoria(utils, nombre) {
  await press(utils, "Seleccioná una categoría");
  await waitFor(() => expect(utils.getByText(nombre)).toBeTruthy());
  await press(utils, nombre);
}

describe("DocumentsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDocumentCategories.mockResolvedValue(categorias);
  });

  it("muestra un error de carga y permite volver si fallan las categorías", async () => {
    getDocumentCategories.mockRejectedValue(new Error("Sin conexión con el servidor."));

    const utils = await render(<DocumentsScreen route={route} navigation={navigation} />);

    await waitFor(() => expect(utils.getByText("Sin conexión con el servidor.")).toBeTruthy());

    await press(utils, "Volver");
    expect(mockGoBack).toHaveBeenCalled();
  });

  it("muestra los tres errores de validación al subir sin completar nada", async () => {
    const utils = await renderPantallaCargada();

    await pressSubmit(utils);

    expect(utils.getByText("Seleccioná un documento")).toBeTruthy();
    expect(utils.getByText("El nombre del documento es obligatorio")).toBeTruthy();
    expect(utils.getAllByText("Seleccioná una categoría")).toHaveLength(2);
    expect(uploadTripDocument).not.toHaveBeenCalled();
  });

  it("al seleccionar un archivo, precarga el nombre sin extensión y lo muestra", async () => {
    const utils = await renderPantallaCargada();

    await seleccionarArchivoValido(utils);

    await waitFor(() => expect(utils.getByText("Seguro.pdf")).toBeTruthy());
    expect(utils.getByDisplayValue("Seguro")).toBeTruthy();
  });

  it("permite quitar el archivo seleccionado", async () => {
    const utils = await renderPantallaCargada();

    await seleccionarArchivoValido(utils);
    await waitFor(() => expect(utils.getByText("Seguro.pdf")).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByTestId("documentos-eliminar-archivo"));
    });

    expect(utils.queryByText("Seguro.pdf")).toBeNull();
    expect(utils.getByText("Seleccionar archivo")).toBeTruthy();
  });

  it("permite elegir una categoría desde el modal", async () => {
    const utils = await renderPantallaCargada();

    await elegirCategoria(utils, "Pasajes");

    expect(utils.getByText("Pasajes")).toBeTruthy();
    expect(utils.queryByText("Seleccioná una categoría")).toBeNull();
  });

  it("camino feliz: sube el documento y confirma con Alert antes de volver", async () => {
    uploadTripDocument.mockResolvedValue({ message: "ok" });
    const alertMock = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        buttons?.[0]?.onPress?.();
      });

    const utils = await renderPantallaCargada();

    await seleccionarArchivoValido(utils);
    await waitFor(() => expect(utils.getByText("Seguro.pdf")).toBeTruthy());

    await elegirCategoria(utils, "Pasajes");

    await pressSubmit(utils);

    await waitFor(() => expect(uploadTripDocument).toHaveBeenCalled());
    expect(uploadTripDocument).toHaveBeenCalledWith(10, expect.objectContaining({ name: "Seguro.pdf" }), 1, "Seguro.pdf");

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith(
      "Éxito",
      "Documento subido correctamente.",
      expect.any(Array)
    ));
    expect(mockGoBack).toHaveBeenCalled();

    alertMock.mockRestore();
  });

  it("muestra error de nombre duplicado en el campo si el backend lo rechaza", async () => {
    uploadTripDocument.mockRejectedValue(new Error("resource already exists"));

    const utils = await renderPantallaCargada();

    await seleccionarArchivoValido(utils);
    await waitFor(() => expect(utils.getByText("Seguro.pdf")).toBeTruthy());
    await elegirCategoria(utils, "Pasajes");

    await pressSubmit(utils);

    await waitFor(() =>
      expect(utils.getByText("Ya existe un documento con ese nombre. Elegí otro.")).toBeTruthy()
    );
  });

  it("muestra un Alert de error genérico si falla la subida por otro motivo", async () => {
    uploadTripDocument.mockRejectedValue(new Error("El servidor no responde."));
    const alertMock = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const utils = await renderPantallaCargada();

    await seleccionarArchivoValido(utils);
    await waitFor(() => expect(utils.getByText("Seguro.pdf")).toBeTruthy());
    await elegirCategoria(utils, "Pasajes");

    await pressSubmit(utils);

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith("Error", "El servidor no responde.", undefined)
    );

    alertMock.mockRestore();
  });

  it("el botón Cancelar vuelve atrás sin subir nada", async () => {
    const utils = await renderPantallaCargada();

    await press(utils, "Cancelar");

    expect(mockGoBack).toHaveBeenCalled();
    expect(uploadTripDocument).not.toHaveBeenCalled();
  });
});