import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddGastoScreen from "../screens/AddGastoScreen";
import { createExpense, getCurrencies, getExpenseCategories, getTripParticipants } from "../services/api";
import { toYMD } from "../utils/dates";

jest.mock("../services/api", () => ({
  getExpenseCategories: jest.fn(),
  getTripParticipants: jest.fn(),
  getCurrencies: jest.fn(),
  createExpense: jest.fn(),
}));

jest.mock("../database/gastosLocal", () => ({
  guardarGastoOffline: jest.fn(),
  guardarCategoriasEnCache: jest.fn(),
  obtenerCategoriasCache: jest.fn(() => []),
  guardarParticipantesEnCache: jest.fn(),
  obtenerParticipantesCache: jest.fn(() => []),
}));

// El flujo del botón se prueba en ReceiptScanButton.test.js; acá solo importa
// qué hace el formulario con los datos escaneados.
let mockDatosEscaneo = null;
jest.mock("../components/trip/ReceiptScanButton", () => {
  const { Text: MockText, TouchableOpacity: MockTouchable } = require("react-native");
  return function MockReceiptScanButton({ onScanned }) {
    return (
      <MockTouchable onPress={() => onScanned(mockDatosEscaneo)}>
        <MockText>Simular escaneo</MockText>
      </MockTouchable>
    );
  };
});

const AYER = (() => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 1);
  return toYMD(fecha);
})();

const DATOS_COMPLETOS = {
  Nombre: "Café Martínez",
  MontoOriginal: "15230.50",
  MonedaOriginal: "ARS",
  FechaGasto: AYER,
  IdCategoria: 1,
  CamposBajaConfianza: [],
};

async function renderCargada(props = {}) {
  const utils = await render(
    <AddGastoScreen visible IdViaje={10} Moneda="USD" onClose={jest.fn()} {...props} />
  );
  await waitFor(() => expect(utils.getByText("Nuevo gasto")).toBeTruthy());
  await waitFor(() => expect(utils.getByText("Dólar estadounidense")).toBeTruthy());
  return utils;
}

async function presionar(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}

async function escanear(utils, datos) {
  mockDatosEscaneo = datos;
  await presionar(utils, "Simular escaneo");
}

describe("US 93 - precarga del formulario con el comprobante escaneado", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    getExpenseCategories.mockResolvedValue([
      { IdCategoria: 1, Nombre: "Comida y Bebida" },
      { IdCategoria: 2, Nombre: "Transporte" },
    ]);
    getTripParticipants.mockResolvedValue([
      { IdParticipanteViaje: 1, Nombre: "Juan", Apellido: "Pérez", NombreUsuario: "jperez" },
    ]);
    getCurrencies.mockResolvedValue([
      { Codigo: "USD", Nombre: "Dólar estadounidense" },
      { Codigo: "ARS", Nombre: "Peso argentino" },
    ]);
    createExpense.mockResolvedValue({ IdGasto: 99 });
  });

  afterEach(() => jest.restoreAllMocks());

  it("CP1/AC11: precarga monto, fecha, comercio como concepto, moneda y categoría", async () => {
    const utils = await renderCargada();

    await escanear(utils, DATOS_COMPLETOS);

    expect(utils.getByDisplayValue("Café Martínez")).toBeTruthy();
    expect(utils.getByDisplayValue("15230.5")).toBeTruthy();
    expect(utils.getByText("Peso argentino")).toBeTruthy();
    expect(utils.getByText("Comida y Bebida")).toBeTruthy();
    expect(utils.getByTestId("receipt-scan-applied")).toBeTruthy();
    expect(utils.queryByText(/Revisá/)).toBeNull();
  });

  it("CP10/AC12: escanear no registra el gasto; se registra recién al confirmar", async () => {
    const utils = await renderCargada();

    await escanear(utils, DATOS_COMPLETOS);
    expect(createExpense).not.toHaveBeenCalled();

    await presionar(utils, "Registrar gasto");

    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        IdViaje: 10,
        Nombre: "Café Martínez",
        MontoOriginal: 15230.5,
        MonedaOriginal: "ARS",
        FechaGasto: AYER,
        IdCategoria: 1,
      })
    );
  });

  it("CP8/AC9: sin fecha visible el campo queda vacío y no se puede registrar sin completarla", async () => {
    const utils = await renderCargada();

    await escanear(utils, { ...DATOS_COMPLETOS, FechaGasto: null });

    expect(utils.getByText("Seleccionar fecha")).toBeTruthy();
    await presionar(utils, "Registrar gasto");
    expect(utils.getByText("La fecha es obligatoria")).toBeTruthy();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("AC9: los campos no identificados quedan vacíos", async () => {
    const utils = await renderCargada();

    await escanear(utils, {
      Nombre: null,
      MontoOriginal: null,
      MonedaOriginal: "ARS",
      FechaGasto: AYER,
      IdCategoria: null,
      CamposBajaConfianza: [],
    });

    expect(utils.getByPlaceholderText("Cena").props.value).toBe("");
    expect(utils.getByPlaceholderText("0").props.value).toBe("");
    expect(utils.getByText("Seleccioná una categoría")).toBeTruthy();
  });

  it("AC10: resalta los campos de baja confianza hasta que el usuario los edita", async () => {
    const utils = await renderCargada();

    await escanear(utils, { ...DATOS_COMPLETOS, CamposBajaConfianza: ["MontoOriginal", "IdCategoria"] });

    expect(utils.getAllByText("Revisá este dato")).toHaveLength(1);
    expect(utils.getByText("Revisá la categoría sugerida")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(utils.getByDisplayValue("15230.5"), "15300");
    });
    expect(utils.queryByText("Revisá este dato")).toBeNull();
    expect(utils.getByText("Revisá la categoría sugerida")).toBeTruthy();
  });

  it("si no se detectó la moneda deja la del viaje y pide revisarla", async () => {
    const utils = await renderCargada();

    await escanear(utils, { ...DATOS_COMPLETOS, MonedaOriginal: null });

    expect(utils.getByText("Dólar estadounidense")).toBeTruthy();
    expect(utils.getByText("Revisá la moneda del comprobante")).toBeTruthy();
  });

  it("ignora una categoría que no está entre las disponibles", async () => {
    const utils = await renderCargada();

    await escanear(utils, { ...DATOS_COMPLETOS, IdCategoria: 999 });

    expect(utils.getByText("Seleccioná una categoría")).toBeTruthy();
  });

  it("AC1: en un viaje finalizado no se ofrece el escaneo", async () => {
    const utils = await renderCargada({ puedeEscanear: false });

    expect(utils.queryByText("Simular escaneo")).toBeNull();
    // La carga manual sigue disponible.
    expect(utils.getByText("Registrar gasto")).toBeTruthy();
  });
});
