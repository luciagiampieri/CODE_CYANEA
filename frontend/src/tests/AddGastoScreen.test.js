import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddGastoScreen, { montosEnMonedaDelGasto } from "../screens/AddGastoScreen";
import { EDICION_GASTO, useEdicionGasto } from "../hooks/useEdicionGasto";
import {
  createExpense,
  getCurrencies,
  getExpenseCategories,
  getPossibleDuplicateExpenses,
  getTripParticipants,
  updateExpense,
} from "../services/api";

jest.mock("../services/api", () => ({
  getExpenseCategories: jest.fn(),
  getTripParticipants: jest.fn(),
  getCurrencies: jest.fn(),
  createExpense: jest.fn(),
  getPossibleDuplicateExpenses: jest.fn(),
  updateExpense: jest.fn(),
}));

jest.mock("../database/gastosLocal", () => ({
  guardarGastoOffline: jest.fn(),
  guardarCategoriasEnCache: jest.fn(),
  obtenerCategoriasCache: jest.fn(() => []),
  guardarParticipantesEnCache: jest.fn(),
  obtenerParticipantesCache: jest.fn(() => []),
}));

// El WebSocket de la edición se prueba en useEdicionGasto.test.js: acá se
// controla directamente el estado que devuelve el hook.
jest.mock("../hooks/useEdicionGasto", () => {
  const real = jest.requireActual("../hooks/useEdicionGasto");
  return { ...real, useEdicionGasto: jest.fn() };
});

jest.mock("../components/trip/ReceiptScanButton", () => {
  const { Text: MockText } = require("react-native");
  return function MockReceiptScanButton() {
    return <MockText>Escanear comprobante</MockText>;
  };
});

const categorias = [
  { IdCategoria: 1, Nombre: "Comida y Bebida" },
  { IdCategoria: 2, Nombre: "Transporte" },
];

const participantes = [
  { IdParticipanteViaje: 6, Nombre: "Ana", Apellido: "Test", NombreUsuario: "ana", EsUsuarioActual: false },
  { IdParticipanteViaje: 8, Nombre: "Carla", Apellido: "Test", NombreUsuario: "carla", EsUsuarioActual: true },
  { IdParticipanteViaje: 9, Nombre: "Dario", Apellido: "Test", NombreUsuario: "dario", EsUsuarioActual: false },
];

const AYER = (() => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
})();

function detalle(overrides = {}) {
  return {
    IdGasto: 15,
    IdViaje: 10,
    Nombre: "Cena",
    Monto: "900.00",
    MontoOriginal: "900.00",
    MonedaOriginal: "ARS",
    MonedaViaje: "ARS",
    FechaGasto: AYER,
    IdCategoria: 1,
    NombreCategoria: "Comida y Bebida",
    IdPagador: 8,
    EsCompartido: true,
    TipoDivision: "igualitaria",
    DividirEntreTodos: true,
    Participantes: [
      { IdParticipanteViaje: 6, MontoAsignado: "300.00" },
      { IdParticipanteViaje: 8, MontoAsignado: "300.00" },
      { IdParticipanteViaje: 9, MontoAsignado: "300.00" },
    ],
    PuedeEditar: true,
    ...overrides,
  };
}

function estadoEdicion(estado, extra = {}) {
  return {
    estado,
    mensaje: null,
    codigo: null,
    puedeGuardar: estado === EDICION_GASTO.CONCEDIDA || estado === EDICION_GASTO.DESCONECTADA,
    liberar: jest.fn(),
    ...extra,
  };
}

const onClose = jest.fn();
const onGastoCreado = jest.fn();

async function renderEdicion(gasto = detalle()) {
  const utils = await render(
    <AddGastoScreen
      visible
      IdViaje={10}
      Moneda="ARS"
      gastoAEditar={gasto}
      onClose={onClose}
      onGastoCreado={onGastoCreado}
    />
  );
  await waitFor(() => expect(utils.getByText("Editar gasto")).toBeTruthy());
  await waitFor(() => expect(utils.getByDisplayValue("Cena")).toBeTruthy());
  return utils;
}

async function guardar(utils) {
  await act(async () => {
    fireEvent.press(utils.getByTestId("add-gasto-guardar"));
  });
}

describe("US 79 - Editar gasto (AddGastoScreen en modo edición)", () => {
  let alertSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    getExpenseCategories.mockResolvedValue([...categorias]);
    getTripParticipants.mockResolvedValue(participantes);
    getCurrencies.mockResolvedValue([
      { Codigo: "ARS", Nombre: "Peso argentino" },
      { Codigo: "USD", Nombre: "Dólar estadounidense" },
    ]);
    updateExpense.mockResolvedValue({
      message: "Los cambios del gasto se guardaron correctamente.",
      IdGasto: 15,
    });
    useEdicionGasto.mockReturnValue(estadoEdicion(EDICION_GASTO.CONCEDIDA));
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("muestra el título de edición, precarga los datos y oculta el escaneo", async () => {
    const utils = await renderEdicion();

    expect(utils.getByDisplayValue("Cena")).toBeTruthy();
    expect(utils.getByDisplayValue("900")).toBeTruthy();
    expect(utils.getByText("Comida y Bebida")).toBeTruthy();
    expect(utils.getByText("Guardar cambios")).toBeTruthy();
    expect(utils.queryByText("Escanear comprobante")).toBeNull();
    expect(utils.queryByText("Nuevo gasto")).toBeNull();
  });

  it("pide la edición activa del gasto mientras el formulario está abierto", async () => {
    await renderEdicion();

    expect(useEdicionGasto).toHaveBeenCalledWith(15, true);
  });

  it("guarda los cambios con updateExpense, confirma y cierra", async () => {
    const utils = await renderEdicion();

    await act(async () => {
      fireEvent.changeText(utils.getByDisplayValue("900"), "1200");
    });
    await guardar(utils);

    expect(createExpense).not.toHaveBeenCalled();
    // US 95: la advertencia de duplicados aplica al registro, no a la edición.
    expect(getPossibleDuplicateExpenses).not.toHaveBeenCalled();
    expect(updateExpense).toHaveBeenCalledWith(
      15,
      expect.objectContaining({
        Nombre: "Cena",
        MontoOriginal: 1200,
        MonedaOriginal: "ARS",
        IdCategoria: 1,
        IdPagador: 8,
        FechaGasto: AYER,
        EsCompartido: true,
        TipoDivision: "igualitaria",
        IdParticipantes: [6, 8, 9],
      })
    );
    expect(alertSpy).toHaveBeenCalledWith(
      "Cambios guardados",
      "Los cambios del gasto se guardaron correctamente."
    );
    expect(onGastoCreado).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("precarga una división personalizada con los montos de cada participante", async () => {
    const utils = await renderEdicion(
      detalle({
        TipoDivision: "personalizada",
        DividirEntreTodos: false,
        Participantes: [
          { IdParticipanteViaje: 6, MontoAsignado: "500.00" },
          { IdParticipanteViaje: 8, MontoAsignado: "400.00" },
        ],
      })
    );

    await guardar(utils);

    expect(updateExpense).toHaveBeenCalledWith(
      15,
      expect.objectContaining({
        TipoDivision: "personalizada",
        DetalleMontosPersonalizados: [
          { IdParticipanteViaje: 6, MontoAsignado: 500 },
          { IdParticipanteViaje: 8, MontoAsignado: 400 },
        ],
      })
    );
  });

  it("no guarda si el monto es cero", async () => {
    const utils = await renderEdicion();

    await act(async () => {
      fireEvent.changeText(utils.getByDisplayValue("900"), "0");
    });
    await guardar(utils);

    expect(updateExpense).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor y no cierra el formulario", async () => {
    updateExpense.mockRejectedValue(
      Object.assign(
        new Error("No se puede editar el gasto porque el viaje ya tiene pagos registrados en una liquidación."),
        { status: 409, code: "EXPENSE_EDIT_LOCKED_BY_PAID_SETTLEMENT" }
      )
    );
    const utils = await renderEdicion();

    await guardar(utils);

    expect(alertSpy).toHaveBeenCalledWith(
      "No se pudieron guardar los cambios",
      "No se puede editar el gasto porque el viaje ya tiene pagos registrados en una liquidación."
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("mientras verifica la edición activa, avisa y no deja guardar", async () => {
    useEdicionGasto.mockReturnValue(estadoEdicion(EDICION_GASTO.CONECTANDO));
    const utils = await renderEdicion();

    expect(utils.getByTestId("aviso-edicion-conectando")).toBeTruthy();
    await guardar(utils);
    expect(updateExpense).not.toHaveBeenCalled();
  });

  it("si otro usuario está editando, muestra el mensaje y no deja guardar", async () => {
    useEdicionGasto.mockReturnValue(
      estadoEdicion(EDICION_GASTO.RECHAZADA, {
        codigo: "EXPENSE_BEING_EDITED",
        mensaje: "El gasto está siendo editado por otro usuario (Bruno Test).",
      })
    );
    const utils = await renderEdicion();

    expect(utils.getByText("El gasto está siendo editado por otro usuario (Bruno Test).")).toBeTruthy();
    await guardar(utils);
    expect(updateExpense).not.toHaveBeenCalled();
  });

  it("en el alta no pide la edición activa ni muestra avisos", async () => {
    const utils = await render(
      <AddGastoScreen visible IdViaje={10} Moneda="ARS" onClose={onClose} />
    );
    await waitFor(() => expect(utils.getByText("Nuevo gasto")).toBeTruthy());

    expect(useEdicionGasto).toHaveBeenCalledWith(undefined, false);
    expect(utils.getByText("Escanear comprobante")).toBeTruthy();
    expect(utils.getByText("Registrar gasto")).toBeTruthy();
  });

  it("en el alta, un gasto personal avisa que solo lo ve quien lo registra", async () => {
    const utils = await render(
      <AddGastoScreen visible IdViaje={10} Moneda="ARS" onClose={onClose} />
    );
    await waitFor(() => expect(utils.getByText("Nuevo gasto")).toBeTruthy());

    expect(utils.getByTestId("aviso-gasto-personal")).toHaveTextContent(
      /Solo vos vas a ver este gasto\. No cuenta en los saldos del grupo\./
    );
  });

  it("al pasar un gasto compartido a personal avisa que el grupo deja de verlo", async () => {
    const utils = await renderEdicion();
    expect(utils.queryByTestId("aviso-gasto-personal")).toBeNull();

    await act(async () => {
      await fireEvent.press(utils.getByText("Personal"));
    });

    expect(utils.getByTestId("aviso-gasto-personal")).toHaveTextContent(
      /Si lo pasás a personal, el resto del grupo deja de verlo y no cuenta en los saldos\./
    );
  });

  it("precarga la división personalizada de un gasto en otra moneda en esa moneda", async () => {
    // USD 3 guardado como ARS 3000: Ana 2000 y Dario 1000 → se muestran como 2 y 1 dólares.
    const utils = await renderEdicion(
      detalle({
        Monto: "3000.00",
        MontoOriginal: "3.00",
        MonedaOriginal: "USD",
        TipoCambio: "1000",
        TipoDivision: "personalizada",
        DividirEntreTodos: false,
        IdPagador: 6,
        Participantes: [
          { IdParticipanteViaje: 6, MontoAsignado: "2000.00" },
          { IdParticipanteViaje: 9, MontoAsignado: "1000.00" },
        ],
      })
    );

    await guardar(utils);

    expect(updateExpense).toHaveBeenCalledWith(
      15,
      expect.objectContaining({
        MonedaOriginal: "USD",
        MontoOriginal: 3,
        DetalleMontosPersonalizados: [
          { IdParticipanteViaje: 6, MontoAsignado: 2 },
          { IdParticipanteViaje: 9, MontoAsignado: 1 },
        ],
      })
    );
  });
});

describe("montosEnMonedaDelGasto", () => {
  it("convierte cada parte a la moneda del gasto y cuadra el redondeo", () => {
    // USD 100 a 1.333333 → ARS 133.33, repartido 44.44 / 44.44 / 44.45
    const montos = montosEnMonedaDelGasto({ Monto: "133.33", MontoOriginal: "100.00" }, [
      { IdParticipanteViaje: 1, MontoAsignado: "44.44" },
      { IdParticipanteViaje: 2, MontoAsignado: "44.44" },
      { IdParticipanteViaje: 3, MontoAsignado: "44.45" },
    ]);

    const suma = Object.values(montos).reduce((acc, v) => acc + Number(v), 0);
    expect(Math.round(suma * 100) / 100).toBe(100);
  });

  it("si el gasto está en la moneda del viaje, deja los montos como están", () => {
    expect(
      montosEnMonedaDelGasto({ Monto: "900.00", MontoOriginal: "900.00" }, [
        { IdParticipanteViaje: 6, MontoAsignado: "500.00" },
        { IdParticipanteViaje: 8, MontoAsignado: "400.00" },
      ])
    ).toEqual({ 6: "500", 8: "400" });
  });
});