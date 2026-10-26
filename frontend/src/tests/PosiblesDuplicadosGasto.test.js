import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

import AddGastoScreen from "../screens/AddGastoScreen";
import PossibleDuplicateExpenseModal from "../components/trip/PossibleDuplicateExpenseModal";
import {
  createExpense,
  getCurrencies,
  getExchangeRate,
  getExpenseCategories,
  getPossibleDuplicateExpenses,
  getTripParticipants,
  attachReceiptToExpense,
} from "../services/api";
import { guardarGastoOffline } from "../database/gastosLocal";
import { toYMD } from "../utils/dates";
import {
  avisoPosiblesDuplicados,
  criteriosDuplicado,
  formatFechaCarga,
} from "../utils/duplicadosGasto";

jest.mock("../services/api", () => ({
  getExpenseCategories: jest.fn(),
  getTripParticipants: jest.fn(),
  getCurrencies: jest.fn(),
  getExchangeRate: jest.fn(),
  createExpense: jest.fn(),
  getPossibleDuplicateExpenses: jest.fn(),
  attachReceiptToExpense: jest.fn(),
}));

jest.mock("../database/gastosLocal", () => ({
  guardarGastoOffline: jest.fn(),
  guardarCategoriasEnCache: jest.fn(),
  obtenerCategoriasCache: jest.fn(() => []),
  guardarParticipantesEnCache: jest.fn(),
  obtenerParticipantesCache: jest.fn(() => []),
}));

const mockEliminarArchivo = jest.fn();
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation(() => ({ exists: true, delete: mockEliminarArchivo })),
}));

let mockDatosEscaneo = null;
jest.mock("../components/trip/ReceiptScanButton", () => {
  const { Text: MockText, TouchableOpacity: MockTouchable } = require("react-native");
  return function MockReceiptScanButton({ onScanned }) {
    return (
      <MockTouchable onPress={() => onScanned(mockDatosEscaneo, { uri: "file:///cache/c.jpg" })}>
        <MockText>Simular escaneo</MockText>
      </MockTouchable>
    );
  };
});

const HOY = toYMD(new Date());

const PARTICIPANTES = [
  { IdParticipanteViaje: 1, Nombre: "Juan", Apellido: "Pérez", NombreUsuario: "jperez", EsUsuarioActual: false },
  { IdParticipanteViaje: 2, Nombre: "Bruno", Apellido: "Díaz", NombreUsuario: "bdiaz", EsUsuarioActual: true },
];

// Mismos campos que el detalle de un gasto (GastoPosibleDuplicadoRead).
const GASTO_EXISTENTE = {
  IdGasto: 7,
  Nombre: "Parrilla Don Julio",
  Monto: "50000.00",
  MontoOriginal: "50000.00",
  MonedaOriginal: "ARS",
  MonedaViaje: "ARS",
  FechaGasto: HOY,
  IdCategoria: 1,
  NombreCategoria: "Comida y Bebida",
  IdPagador: 2,
  IdUsuarioPagador: 20,
  NombrePagador: "Bruno Díaz",
  NombreCreador: "Juan Pérez",
  // Cargado hoy a las 18:20 (hora local).
  FechaCreacion: new Date(new Date().setHours(18, 20, 0, 0)).toISOString(),
  EsCompartido: true,
  TipoDivision: "igualitaria",
  Participantes: [
    { IdParticipanteViaje: 1, IdUsuario: 10, Nombre: "Juan", Apellido: "Pérez", NombreUsuario: "jperez", MontoAsignado: "25000.00" },
    { IdParticipanteViaje: 2, IdUsuario: 20, Nombre: "Bruno", Apellido: "Díaz", NombreUsuario: "bdiaz", MontoAsignado: "25000.00" },
  ],
};

async function renderFormulario() {
  const onClose = jest.fn();
  const onGastoCreado = jest.fn();
  const utils = await render(
    <AddGastoScreen
      visible
      IdViaje={10}
      Moneda="ARS"
      onClose={onClose}
      onGastoCreado={onGastoCreado}
    />
  );
  await waitFor(() => expect(utils.getByText("Peso argentino")).toBeTruthy());
  await waitFor(() => expect(getExpenseCategories).toHaveBeenCalled());
  return { ...utils, onClose, onGastoCreado };
}

async function presionar(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}

async function presionarTestId(utils, testId) {
  await act(async () => {
    fireEvent.press(utils.getByTestId(testId));
  });
}

async function cargarManual(utils, { nombre = "Cena", monto = "50000" } = {}) {
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("Cena"), nombre);
    fireEvent.changeText(utils.getAllByPlaceholderText("0")[0], monto);
  });
  await act(async () => {
    fireEvent.press(utils.getAllByText("Elegir")[0]); // abre el selector de categoría
  });
  await presionar(utils, "Comida y Bebida");
}

/** Toca "Registrar gasto" sin esperar a que se resuelva la advertencia. */
async function registrar(utils) {
  await presionarTestId(utils, "add-gasto-guardar");
  await waitFor(() => expect(getPossibleDuplicateExpenses).toHaveBeenCalled());
}

describe("US 95 - Advertencia de posible gasto duplicado", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});

    getExpenseCategories.mockResolvedValue([
      { IdCategoria: 1, Nombre: "Comida y Bebida" },
      { IdCategoria: 2, Nombre: "Transporte" },
    ]);
    getTripParticipants.mockResolvedValue(PARTICIPANTES);
    getCurrencies.mockResolvedValue([
      { Codigo: "ARS", Nombre: "Peso argentino" },
      { Codigo: "USD", Nombre: "Dólar estadounidense" },
    ]);
    getExchangeRate.mockResolvedValue({ MontoConvertido: "0", Fecha: HOY });
    createExpense.mockResolvedValue({ IdGasto: 99 });
    attachReceiptToExpense.mockResolvedValue({ message: "OK" });
    getPossibleDuplicateExpenses.mockResolvedValue([]);
  });

  afterEach(() => jest.restoreAllMocks());

  it("consulta los criterios del gasto antes de registrarlo", async () => {
    const utils = await renderFormulario();
    await cargarManual(utils);

    await presionar(utils, "Registrar gasto");

    expect(getPossibleDuplicateExpenses).toHaveBeenCalledWith(10, {
      FechaGasto: HOY,
      MontoOriginal: 50000,
      MonedaOriginal: "ARS",
      EsCompartido: false,
      IdPagador: null,
    });
    const ordenConsulta = getPossibleDuplicateExpenses.mock.invocationCallOrder[0];
    const ordenAlta = createExpense.mock.invocationCallOrder[0];
    expect(ordenConsulta).toBeLessThan(ordenAlta);
  });

  it("sin posibles duplicados registra sin mostrar la advertencia", async () => {
    const utils = await renderFormulario();
    await cargarManual(utils);

    await presionar(utils, "Registrar gasto");

    expect(utils.queryByTestId("possible-duplicate")).toBeNull();
    expect(createExpense).toHaveBeenCalledTimes(1);
    expect(utils.onClose).toHaveBeenCalled();
  });

  it("CP1/AC5: muestra el gasto existente como el detalle de un gasto", async () => {
    getPossibleDuplicateExpenses.mockResolvedValue([GASTO_EXISTENTE]);
    const utils = await renderFormulario();
    await cargarManual(utils);

    await registrar(utils);

    const advertencia = await utils.findByTestId("possible-duplicate");
    const detalle = within(advertencia);
    expect(detalle.getByText("Posible gasto duplicado")).toBeTruthy();
    expect(detalle.getByTestId("expense-detail-nombre")).toHaveTextContent("Parrilla Don Julio");
    expect(detalle.getByText("Fecha")).toBeTruthy();
    expect(detalle.getByText("Categoría")).toBeTruthy();
    // Bruno es el usuario actual: igual que en el detalle, se marca "(vos)".
    expect(detalle.getByTestId("expense-detail-pagador")).toHaveTextContent(/Bruno Díaz \(vos\)/);
    // Recuadro "Ya registrado" y cuándo se cargó, junto a quién lo registró.
    expect(detalle.getByText("Ya registrado")).toBeTruthy();
    expect(detalle.getByTestId("expense-detail-registro")).toHaveTextContent(/Juan Pérez · hoy 18:20/);
    // Sin la pregunta repetida: el aviso y los botones alcanzan.
    expect(detalle.queryByText(/¿Querés registrar/)).toBeNull();
    expect(detalle.getByText("Compartido · división igualitaria")).toBeTruthy();
    const participantes = within(detalle.getByTestId("expense-detail-participantes"));
    expect(participantes.getByText("Juan Pérez")).toBeTruthy();
    expect(participantes.getByText("Bruno Díaz")).toBeTruthy();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("muestra todos los posibles duplicados si hay más de uno", async () => {
    getPossibleDuplicateExpenses.mockResolvedValue([
      GASTO_EXISTENTE,
      { ...GASTO_EXISTENTE, IdGasto: 8, Nombre: "Cena grupal" },
    ]);
    const utils = await renderFormulario();
    await cargarManual(utils);

    await registrar(utils);

    expect(await utils.findByTestId("possible-duplicate-7")).toBeTruthy();
    expect(utils.getByTestId("possible-duplicate-8")).toBeTruthy();
    expect(utils.getByText(avisoPosiblesDuplicados(2))).toBeTruthy();
  });

  it("CP10/AC6: al confirmar ante la advertencia, el gasto se registra", async () => {
    getPossibleDuplicateExpenses.mockResolvedValue([GASTO_EXISTENTE]);
    const utils = await renderFormulario();
    await cargarManual(utils);
    await registrar(utils);
    await utils.findByTestId("possible-duplicate");

    await presionarTestId(utils, "possible-duplicate-confirm");

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    expect(utils.onGastoCreado).toHaveBeenCalled();
    expect(utils.onClose).toHaveBeenCalled();
  });

  it("CP11/AC6: \"Volver y revisar\" no registra el gasto y deja el formulario abierto", async () => {
    getPossibleDuplicateExpenses.mockResolvedValue([GASTO_EXISTENTE]);
    const utils = await renderFormulario();
    await cargarManual(utils);
    await registrar(utils);
    await utils.findByTestId("possible-duplicate");

    await presionarTestId(utils, "possible-duplicate-back");

    expect(utils.queryByTestId("possible-duplicate")).toBeNull();
    expect(createExpense).not.toHaveBeenCalled();
    expect(utils.onClose).not.toHaveBeenCalled();
    expect(utils.getByDisplayValue("Cena")).toBeTruthy();
  });

  it("cerrar la advertencia con la cruz equivale a cancelar", async () => {
    getPossibleDuplicateExpenses.mockResolvedValue([GASTO_EXISTENTE]);
    const utils = await renderFormulario();
    await cargarManual(utils);
    await registrar(utils);
    await utils.findByTestId("possible-duplicate");

    await presionarTestId(utils, "possible-duplicate-close");

    expect(createExpense).not.toHaveBeenCalled();
    expect(utils.onClose).not.toHaveBeenCalled();
  });

  it("CP11: \"Descartar gasto nuevo\" no registra y cierra el formulario", async () => {
    getPossibleDuplicateExpenses.mockResolvedValue([GASTO_EXISTENTE]);
    const utils = await renderFormulario();
    await cargarManual(utils);
    await registrar(utils);
    await utils.findByTestId("possible-duplicate");

    await presionarTestId(utils, "possible-duplicate-discard");

    expect(createExpense).not.toHaveBeenCalled();
    expect(utils.onClose).toHaveBeenCalled();
    expect(utils.onGastoCreado).not.toHaveBeenCalled();
  });

  it("al descartar un gasto de comprobante, también borra la imagen", async () => {
    getPossibleDuplicateExpenses.mockResolvedValue([GASTO_EXISTENTE]);
    mockDatosEscaneo = {
      Nombre: "Hotel Orlando",
      MontoOriginal: "50000",
      MonedaOriginal: "ARS",
      FechaGasto: HOY,
      IdCategoria: 1,
      CamposBajaConfianza: [],
    };
    const utils = await renderFormulario();
    await presionar(utils, "Simular escaneo");
    await registrar(utils);
    await utils.findByTestId("possible-duplicate");

    await presionarTestId(utils, "possible-duplicate-discard");

    expect(createExpense).not.toHaveBeenCalled();
    expect(mockEliminarArchivo).toHaveBeenCalled();
    expect(utils.onClose).toHaveBeenCalled();
  });

  it("muestra registrar igual y volver en una fila (principal a la derecha) y descartar debajo", async () => {
    const utils = await render(
      <PossibleDuplicateExpenseModal
        visible
        gastos={[GASTO_EXISTENTE]}
        onBack={jest.fn()}
        onConfirm={jest.fn()}
        onDiscard={jest.fn()}
      />
    );
    const botones = utils.getAllByTestId(/^possible-duplicate-(back|confirm|discard)$/);
    expect(botones.map((b) => b.props.testID)).toEqual([
      "possible-duplicate-confirm",
      "possible-duplicate-back",
      "possible-duplicate-discard",
    ]);
  });

  it("CP2: en un gasto compartido envía el pagador elegido", async () => {
    mockDatosEscaneo = {
      Nombre: "Cena",
      MontoOriginal: "50000",
      MonedaOriginal: "ARS",
      FechaGasto: HOY,
      IdCategoria: 1,
      CamposBajaConfianza: [],
    };
    const utils = await renderFormulario();
    await presionar(utils, "Simular escaneo"); // precarga a Bruno como pagador
    await presionar(utils, "Compartido");
    await presionar(utils, "Bruno Díaz"); // abre el selector de pagador
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400)); // paso guiado
    });
    await presionar(utils, "Juan Pérez");
    await presionarTestId(utils, "abrir-division");
    await presionar(utils, "Seleccionar Todos");
    await presionar(utils, "Listo");

    await presionar(utils, "Registrar gasto");

    expect(getPossibleDuplicateExpenses).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ EsCompartido: true, IdPagador: 1 })
    );
  });

  it("CP8/AC1: también advierte al confirmar un gasto cargado desde un comprobante", async () => {
    getPossibleDuplicateExpenses.mockResolvedValue([GASTO_EXISTENTE]);
    mockDatosEscaneo = {
      Nombre: "DIA SUC 123",
      MontoOriginal: "50000",
      MonedaOriginal: "ARS",
      FechaGasto: HOY,
      IdCategoria: 1,
      CamposBajaConfianza: [],
    };
    const utils = await renderFormulario();
    await presionar(utils, "Simular escaneo");

    await registrar(utils);

    expect(await utils.findByTestId("possible-duplicate")).toBeTruthy();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("AC7: si no se puede verificar (sin conexión), no bloquea y sigue el flujo offline", async () => {
    getPossibleDuplicateExpenses.mockRejectedValue(new TypeError("Network request failed"));
    createExpense.mockRejectedValue(new TypeError("Network request failed"));
    guardarGastoOffline.mockReturnValue(true);
    const utils = await renderFormulario();
    await cargarManual(utils);

    await presionar(utils, "Registrar gasto");

    expect(utils.queryByTestId("possible-duplicate")).toBeNull();
    expect(guardarGastoOffline).toHaveBeenCalled();
  });
});

describe("US 95 - PossibleDuplicateExpenseModal", () => {
  it("muestra el monto registrado cuando el gasto está en otra moneda, como el detalle", async () => {
    const utils = await render(
      <PossibleDuplicateExpenseModal
        visible
        gastos={[
          { ...GASTO_EXISTENTE, Monto: "60000.00", MontoOriginal: "50.00", MonedaOriginal: "USD", EsCompartido: false, TipoDivision: null },
        ]}
        onBack={jest.fn()}
        onConfirm={jest.fn()}
        onDiscard={jest.fn()}
      />
    );

    expect(utils.getByTestId("expense-detail-original")).toHaveTextContent(/Registrado:.*50/);
    expect(utils.getByText("Gasto personal")).toBeTruthy();
    expect(utils.queryByTestId("expense-detail-participantes")).toBeNull();
    // Sin idParticipanteActual no se marca "(vos)".
    expect(utils.getByTestId("expense-detail-pagador")).toHaveTextContent(/Bruno Díaz/);
    expect(utils.getByTestId("expense-detail-pagador")).not.toHaveTextContent("(vos)");
  });
});

describe("US 95 - criterios y texto de la advertencia", () => {
  it("criteriosDuplicado solo envía el pagador en un gasto compartido", () => {
    const base = { FechaGasto: HOY, MontoOriginal: 10, MonedaOriginal: "USD", IdPagador: 3 };
    expect(criteriosDuplicado({ ...base, EsCompartido: true }).IdPagador).toBe(3);
    expect(criteriosDuplicado({ ...base, EsCompartido: false }).IdPagador).toBeNull();
  });

  it("formatFechaCarga muestra hoy, ayer o la fecha, en hora local", () => {
    const ahora = new Date(2026, 9, 13, 20, 0);
    expect(formatFechaCarga(new Date(2026, 9, 13, 18, 20).toISOString(), ahora)).toBe("hoy 18:20");
    expect(formatFechaCarga(new Date(2026, 9, 12, 9, 5).toISOString(), ahora)).toBe("ayer 9:05");
    expect(formatFechaCarga(new Date(2026, 9, 2, 18, 20).toISOString(), ahora)).toBe("2 oct 18:20");
    expect(formatFechaCarga(new Date(2025, 11, 30, 7, 0).toISOString(), ahora)).toBe("30 dic 2025 7:00");
    expect(formatFechaCarga(null, ahora)).toBe("");
  });

  it("avisoPosiblesDuplicados distingue uno o varios gastos", () => {
    expect(avisoPosiblesDuplicados(1)).toMatch(/^Ya hay un gasto registrado/);
    expect(avisoPosiblesDuplicados(2)).toMatch(/^Ya hay 2 gastos/);
  });
});
