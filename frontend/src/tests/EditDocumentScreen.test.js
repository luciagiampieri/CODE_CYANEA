import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import EditDocumentScreen from "../screens/EditDocumentScreen";

import {
  getDocumentCategories,
  updateTripDocument,
} from "../services/api";

const mockGoBack = jest.fn();
const mockGetDocumentAsync = jest.fn();

jest.mock("../services/api", () => ({
  getDocumentCategories: jest.fn(),
  updateTripDocument: jest.fn(),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args) => mockGetDocumentAsync(...args),
}));

jest.mock("../components/layout/ScreenContainer", () => {
  const React = require("react");
  const { View } = require("react-native");

  return function ScreenContainer({ children }) {
    return <View>{children}</View>;
  };
});

jest.mock("../components/ui/IconCircleButton", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");

  return function IconCircleButton({ onPress }) {
    return (
      <Pressable testID="back-button" onPress={onPress}>
        <Text>Volver</Text>
      </Pressable>
    );
  };
});

jest.mock("../components/ui/PrimaryButton", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");

  return function PrimaryButton({
    label,
    onPress,
    loading,
  }) {
    return (
      <Pressable
        testID={`button-${label}`}
        onPress={onPress}
        disabled={loading}
      >
        <Text>{label}</Text>
      </Pressable>
    );
  };
});

describe("US 67 - Reemplazar documento", () => {
  const documento = {
    IdDocumento: 1,
    IdViaje: 10,
    IdCategoriaDocumento: 1,
    IdUsuarioSubida: 5,
    NombreArchivo: "Pasaje Mendoza.pdf",
    UrlArchivo: "viajes/10/Pasajes/Pasaje Mendoza.pdf",
    EsPublico: true,
  };

  const categorias = [
    {
      IdCategoriaDocumento: 1,
      Nombre: "Pasajes",
    },
    {
      IdCategoriaDocumento: 2,
      Nombre: "Reservas",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    getDocumentCategories.mockResolvedValue(categorias);
    updateTripDocument.mockResolvedValue({
      message: "Documento actualizado correctamente.",
      IdDocumento: 1,
    });
  });

  it("muestra los datos del documento existente", async () => {
    const { getByText, getByDisplayValue } = await render(
      <EditDocumentScreen
        visible={true}
        tripId={10}
        documento={documento}
        onClose={mockGoBack}
      />
    );

    await waitFor(() => {
      expect(getByText("Pasaje Mendoza.pdf")).toBeTruthy();
      expect(getByDisplayValue("Pasaje Mendoza")).toBeTruthy();
      expect(getByText("Pasajes")).toBeTruthy();
    });
  });

  it("selecciona un nuevo archivo para reemplazar el documento", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          name: "Nuevo Pasaje.pdf",
          uri: "file:///nuevo-pasaje.pdf",
          size: 2000,
          mimeType: "application/pdf",
        },
      ],
    });

    const { getByText } = await render(
      <EditDocumentScreen
        visible={true}
        tripId={10}
        documento={documento}
        onClose={mockGoBack}
      />
    );

    await waitFor(() => {
      expect(getByText("Pasaje Mendoza.pdf")).toBeTruthy();
    });

    fireEvent.press(
      getByText("Archivo actual (Tocá para reemplazarlo)")
    );

    await waitFor(() => {
      expect(getByText("Nuevo Pasaje.pdf")).toBeTruthy();
    });

    expect(mockGetDocumentAsync).toHaveBeenCalledWith({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
      multiple: false,
    });
  });

  it("reemplaza correctamente el documento con un archivo válido", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          name: "Nuevo Pasaje.pdf",
          uri: "file:///nuevo-pasaje.pdf",
          size: 2000,
          mimeType: "application/pdf",
        },
      ],
    });

    const alertMock = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        const acceptButton = buttons?.find(
          (button) => button.text === "Aceptar"
        );

        acceptButton?.onPress?.();
      });

    const { getByText } = await render(
      <EditDocumentScreen
        visible={true}
        tripId={10}
        documento={documento}
        onClose={mockGoBack}
      />
    );

    await waitFor(() => {
      expect(getByText("Pasaje Mendoza.pdf")).toBeTruthy();
    });

    fireEvent.press(
      getByText("Archivo actual (Tocá para reemplazarlo)")
    );

    await waitFor(() => {
      expect(getByText("Nuevo Pasaje.pdf")).toBeTruthy();
    });

    fireEvent.press(getByText("Guardar cambios"));

    await waitFor(() => {
      expect(updateTripDocument).toHaveBeenCalledTimes(1);
    });

    expect(updateTripDocument).toHaveBeenCalledWith(
      10,
      1,
      expect.objectContaining({
        name: "Nuevo Pasaje.pdf",
        uri: "file:///nuevo-pasaje.pdf",
      }),
      1,
      "Pasaje Mendoza.pdf",
      true
    );

    expect(alertMock).toHaveBeenCalledWith(
        "Éxito",
        "Documento actualizado correctamente.",
        expect.arrayContaining([
            expect.objectContaining({
            text: "Aceptar",
            onPress: expect.any(Function),
            }),
        ])
        );

    expect(mockGoBack).toHaveBeenCalledTimes(1);

    alertMock.mockRestore();
  });

  it("conserva el nombre y la categoría originales al reemplazar el archivo", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          name: "otro-nombre.pdf",
          uri: "file:///otro-nombre.pdf",
          size: 3000,
          mimeType: "application/pdf",
        },
      ],
    });

    const { getByText } = await render(
      <EditDocumentScreen
        visible={true}
        tripId={10}
        documento={documento}
        onClose={mockGoBack}
      />
    );

    await waitFor(() => {
      expect(getByText("Pasaje Mendoza.pdf")).toBeTruthy();
    });

    fireEvent.press(
      getByText("Archivo actual (Tocá para reemplazarlo)")
    );

    await waitFor(() => {
      expect(getByText("otro-nombre.pdf")).toBeTruthy();
    });

    fireEvent.press(getByText("Guardar cambios"));

    await waitFor(() => {
      expect(updateTripDocument).toHaveBeenCalled();
    });

    expect(updateTripDocument).toHaveBeenCalledWith(
      10,
      1,
      expect.anything(),
      1,
      "Pasaje Mendoza.pdf",
      true
    );
  });

  it("muestra un mensaje de error cuando falla la actualización", async () => {
    updateTripDocument.mockRejectedValue(
      new Error("No se pudo actualizar el documento.")
    );

    const alertMock = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => {});

    const { getByText } = await render(
      <EditDocumentScreen
        visible={true}
        tripId={10}
        documento={documento}
        onClose={mockGoBack}
      />
    );

    await waitFor(() => {
      expect(getByText("Pasaje Mendoza.pdf")).toBeTruthy();
    });

    fireEvent.press(getByText("Guardar cambios"));

    await waitFor(() => {
      expect(updateTripDocument).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        "Error",
        "No se pudo actualizar el documento.",
        undefined
      );
    });

    expect(mockGoBack).not.toHaveBeenCalled();

    alertMock.mockRestore();
  });

  it("permite cancelar la selección del nuevo archivo", async () => {
    mockGetDocumentAsync.mockResolvedValue({
      canceled: true,
    });

    const { getByText } = await render(
      <EditDocumentScreen
        visible={true}
        tripId={10}
        documento={documento}
        onClose={mockGoBack}
      />
    );

    await waitFor(() => {
      expect(getByText("Pasaje Mendoza.pdf")).toBeTruthy();
    });

    fireEvent.press(
      getByText("Archivo actual (Tocá para reemplazarlo)")
    );

    await waitFor(() => {
      expect(mockGetDocumentAsync).toHaveBeenCalled();
    });

    expect(getByText("Pasaje Mendoza.pdf")).toBeTruthy();
    expect(
      getByText("Archivo actual (Tocá para reemplazarlo)")
    ).toBeTruthy();
  });


  it("rechaza un archivo con extensión inválida", async () => {
    mockGetDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [
        {
            name: "documento.exe",
            uri: "file:///documento.exe",
            size: 2000,
            mimeType: "application/octet-stream",
        },
        ],
    });

    const alertMock = jest
        .spyOn(Alert, "alert")
        .mockImplementation(() => {});

    const { getByText, queryByText } = await render(
      <EditDocumentScreen
        visible={true}
        tripId={10}
        documento={documento}
        onClose={mockGoBack}
      />
    );

    await waitFor(() => {
        expect(getByText("Pasaje Mendoza.pdf")).toBeTruthy();
    });

    fireEvent.press(
        getByText("Archivo actual (Tocá para reemplazarlo)")
    );

    await waitFor(() => {
        expect(alertMock).toHaveBeenCalledWith(
        "Archivo inválido",
        "Solo se permiten archivos PDF, JPG, JPEG o PNG.",
        undefined
        );
    });

    expect(queryByText("documento.exe")).toBeNull();

    alertMock.mockRestore();
    });
});