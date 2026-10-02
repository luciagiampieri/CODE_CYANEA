import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import DocumentsScreen from "../screens/DocumentsScreen";
import {
  getDocumentCategories,
  uploadTripDocument,
  getExpenseCategories,
  getTripParticipants,
  getCurrencies,
  createExpense,
} from "../services/api";
import { toYMD } from "../utils/dates";

const mockGoBack = jest.fn();
const mockGetDocumentAsync = jest.fn();
const mockOnDocumentoSubido = jest.fn();

jest.mock("../services/api", () => ({
  getDocumentCategories: jest.fn(),
  uploadTripDocument: jest.fn(),
  // Las usa el AddGastoScreen real que se abre al aceptar la sugerencia de gasto (US 84)
  getExpenseCategories: jest.fn(),
  getTripParticipants: jest.fn(),
  getCurrencies: jest.fn(),
  createExpense: jest.fn(),
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
  const utils = await render(
    <DocumentsScreen 
        visible={true} 
        tripId={10} 
        onClose={mockGoBack} 
        onDocumentoSubido={mockOnDocumentoSubido} 
    />
  );
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
  await press(utils, "Selecciona una categoría");
  await waitFor(() => expect(utils.getByText(nombre)).toBeTruthy());
  await press(utils, nombre);
}

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  })),
}));

// ---------------------------------------------------------------------------
// US 84 - Detectar gastos asociados a documentos
// ---------------------------------------------------------------------------
const categoriasGasto = [
  { IdCategoria: 1, Nombre: "Comida y Bebida" },
  { IdCategoria: 2, Nombre: "Transporte" },
];

const participantesViaje = [
  { IdParticipanteViaje: 1, Nombre: "Juan", Apellido: "Pérez", NombreUsuario: "jperez" },
  { IdParticipanteViaje: 2, Nombre: "Ana", Apellido: "Gómez", NombreUsuario: "agomez" },
];

const monedas = [
  { Codigo: "USD", Nombre: "Dólar estadounidense" },
  { Codigo: "EUR", Nombre: "Euro" },
  { Codigo: "ARS", Nombre: "Peso argentino" },
];

const HACE_5_DIAS = (() => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 5);
  return toYMD(fecha);
})();

// Respuesta del backend cuando el análisis detectó un gasto con todos sus datos
const SUGERENCIA_GASTO = {
  Nombre: "Pasaje de micro Córdoba - Mendoza",
  MontoOriginal: "45000",
  MonedaOriginal: "ARS",
  FechaGasto: HACE_5_DIAS,
  IdCategoria: 2,
  CamposBajaConfianza: [],
};

const TITULO_GASTO_DETECTADO = "¡Gasto detectado!";
const MENSAJE_DOCUMENTO_SUBIDO = "Documento subido correctamente.";
const MENSAJE_DOCUMENTO_Y_GASTO = "El documento y el gasto se registraron correctamente.";

// Completa el formulario de subida y lo envía; uploadTripDocument responde con `respuesta`.
async function subirDocumentoConRespuesta(utils, respuesta) {
  uploadTripDocument.mockResolvedValue(respuesta);

  await seleccionarArchivoValido(utils);
  await waitFor(() => expect(utils.getByText("Seguro.pdf")).toBeTruthy());
  await elegirCategoria(utils, "Pasajes");

  await pressSubmit(utils);
}

// El Alert está mockeado sin ejecutar botones, así que cada test decide cuál pulsar
// (buscándolo por texto: en el Alert de detección el índice 0 es "No").
async function pulsarBotonDelAlert(alertMock, titulo, textoBoton) {
  const llamada = [...alertMock.mock.calls].reverse().find(([tituloAlert]) => tituloAlert === titulo);
  const boton = llamada[2].find((b) => b.text === textoBoton);
  await act(async () => {
    boton.onPress();
  });
}

async function esperarAlertGastoDetectado(alertMock) {
  await waitFor(() =>
    expect(alertMock).toHaveBeenCalledWith(
      TITULO_GASTO_DETECTADO,
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: "No" }),
        expect.objectContaining({ text: "Sí, registrar" }),
      ])
    )
  );
}

describe("DocumentsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDocumentCategories.mockResolvedValue(categorias);
  });


  it("muestra un error de carga y permite cerrar el modal si fallan las categorías", async () => {
    getDocumentCategories.mockRejectedValue(new Error("Sin conexión con el servidor."));

    const utils = await render(
        <DocumentsScreen visible={true} tripId={10} onClose={mockGoBack} />
    );

    await waitFor(() => expect(utils.getByText("Sin conexión con el servidor.")).toBeTruthy());

    await act(async () => {
        fireEvent.press(utils.getByText("")); 
    });
    expect(mockGoBack).toHaveBeenCalled();
  });


  it("muestra los tres errores de validación al subir sin completar nada", async () => {
    const utils = await renderPantallaCargada();

    await pressSubmit(utils);

    expect(utils.getByText("Selecciona un documento")).toBeTruthy();
    expect(utils.getByText("El nombre del documento es obligatorio")).toBeTruthy();
    expect(utils.getAllByText("Selecciona una categoría")).toHaveLength(2);
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
    expect(utils.queryByText("Selecciona una categoría")).toBeNull();
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
    expect(uploadTripDocument).toHaveBeenCalledWith(10, expect.objectContaining({ name: "Seguro.pdf" }), 1, "Seguro.pdf", true);

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith(
      "Éxito",
      "Documento subido correctamente.",
      expect.any(Array)
    ));
    
    expect(mockOnDocumentoSubido).toHaveBeenCalled();
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

  it("el botón de cerrar (X) cierra el modal sin subir nada", async () => {
    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.press(utils.getByText(""));
    });

    expect(mockGoBack).toHaveBeenCalled();
    expect(uploadTripDocument).not.toHaveBeenCalled();
  });
});

describe("US 84 - Detectar gastos asociados a documentos", () => {
  let alertMock;

  beforeEach(() => {
    jest.clearAllMocks();
    getDocumentCategories.mockResolvedValue(categorias);
    getExpenseCategories.mockResolvedValue(categoriasGasto);
    getTripParticipants.mockResolvedValue(participantesViaje);
    getCurrencies.mockResolvedValue(monedas);
    createExpense.mockResolvedValue({ IdGasto: 1 });
    alertMock = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertMock.mockRestore();
  });

  it("detecta un gasto, avisa sin registrar nada y, si el usuario elige 'No', conserva el documento", async () => {
    const utils = await renderPantallaCargada();

    await subirDocumentoConRespuesta(utils, { message: "ok", sugerencia_gasto: SUGERENCIA_GASTO });

    await esperarAlertGastoDetectado(alertMock);
    expect(mockOnDocumentoSubido).toHaveBeenCalledTimes(1);
    // Detectar el gasto no abre el formulario ni lo registra: espera la decisión del usuario.
    expect(utils.queryByText("Nuevo gasto")).toBeNull();
    expect(createExpense).not.toHaveBeenCalled();

    await pulsarBotonDelAlert(alertMock, TITULO_GASTO_DETECTADO, "No");

    expect(alertMock).toHaveBeenCalledWith(
      "Éxito",
      MENSAJE_DOCUMENTO_SUBIDO,
      expect.arrayContaining([expect.objectContaining({ text: "Aceptar" })])
    );
    await pulsarBotonDelAlert(alertMock, "Éxito", "Aceptar");

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(utils.queryByText("Nuevo gasto")).toBeNull();
    expect(getExpenseCategories).not.toHaveBeenCalled();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("si acepta, abre el formulario con los datos detectados y registra el gasto con un único aviso final", async () => {
    const utils = await renderPantallaCargada();

    await subirDocumentoConRespuesta(utils, { message: "ok", sugerencia_gasto: SUGERENCIA_GASTO });
    await esperarAlertGastoDetectado(alertMock);

    await pulsarBotonDelAlert(alertMock, TITULO_GASTO_DETECTADO, "Sí, registrar");

    await waitFor(() => expect(utils.getByText("Nuevo gasto")).toBeTruthy());
    await waitFor(() => expect(utils.getByDisplayValue(SUGERENCIA_GASTO.Nombre)).toBeTruthy());
    expect(utils.getByDisplayValue("45000")).toBeTruthy();
    expect(utils.getByText("Monto (ARS)")).toBeTruthy();
    // Aceptar solo abre el formulario: el gasto se crea recién al confirmar.
    expect(createExpense).not.toHaveBeenCalled();

    await press(utils, "Registrar gasto");

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        IdViaje: 10,
        Nombre: SUGERENCIA_GASTO.Nombre,
        Monto: 45000,
        MontoOriginal: 45000,
        MonedaOriginal: "ARS",
        IdCategoria: 2,
        FechaGasto: HACE_5_DIAS,
        EsCompartido: false,
      })
    );

    // Un único cartel final que confirma documento y gasto (sin el aviso propio del formulario).
    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith("Éxito", MENSAJE_DOCUMENTO_Y_GASTO, expect.any(Array))
    );
    expect(alertMock.mock.calls.filter(([titulo]) => titulo === "Éxito")).toHaveLength(1);
    expect(alertMock).not.toHaveBeenCalledWith("Éxito", MENSAJE_DOCUMENTO_SUBIDO, expect.anything());
    expect(alertMock).not.toHaveBeenCalledWith("Éxito", "Gasto registrado correctamente en el servidor.");

    await pulsarBotonDelAlert(alertMock, "Éxito", "Aceptar");
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("si cierra el formulario sin registrar, no se crea el gasto y el documento queda subido", async () => {
    const utils = await renderPantallaCargada();

    await subirDocumentoConRespuesta(utils, { message: "ok", sugerencia_gasto: SUGERENCIA_GASTO });
    await esperarAlertGastoDetectado(alertMock);
    await pulsarBotonDelAlert(alertMock, TITULO_GASTO_DETECTADO, "Sí, registrar");
    await waitFor(() => expect(utils.getByDisplayValue(SUGERENCIA_GASTO.Nombre)).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByTestId("add-gasto-close"));
    });
    // El formulario precargado pide confirmar antes de descartar los datos.
    await pulsarBotonDelAlert(alertMock, "Descartar gasto", "Descartar");

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith("Éxito", MENSAJE_DOCUMENTO_SUBIDO, expect.any(Array))
    );
    expect(alertMock).not.toHaveBeenCalledWith("Éxito", MENSAJE_DOCUMENTO_Y_GASTO, expect.anything());
    await waitFor(() => expect(utils.queryByText("Nuevo gasto")).toBeNull());
    expect(createExpense).not.toHaveBeenCalled();

    await pulsarBotonDelAlert(alertMock, "Éxito", "Aceptar");
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["sugerencia_gasto en null", { message: "ok", sugerencia_gasto: null }],
    ["respuesta sin sugerencia, también cuando el análisis no pudo completarse", { message: "ok" }],
  ])("sin gasto detectado (%s): conserva el documento sin mostrar ninguna sugerencia", async (_descripcion, respuesta) => {
    const utils = await renderPantallaCargada();

    await subirDocumentoConRespuesta(utils, respuesta);

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Éxito",
        MENSAJE_DOCUMENTO_SUBIDO,
        expect.arrayContaining([expect.objectContaining({ text: "Aceptar" })])
      )
    );
    expect(mockOnDocumentoSubido).toHaveBeenCalledTimes(1);
    expect(alertMock).not.toHaveBeenCalledWith(TITULO_GASTO_DETECTADO, expect.anything(), expect.anything());
    expect(utils.queryByText("Nuevo gasto")).toBeNull();
    expect(getExpenseCategories).not.toHaveBeenCalled();
    expect(createExpense).not.toHaveBeenCalled();

    await pulsarBotonDelAlert(alertMock, "Éxito", "Aceptar");
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});