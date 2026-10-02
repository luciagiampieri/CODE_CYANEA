/**
 * US 94 - Confirmar gasto precargado desde un comprobante.
 *
 * El escaneo en sí se prueba en ReceiptScanButton.test.js; acá se simula su
 * resultado y se prueba la revisión y confirmación del formulario.
 */
import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddGastoScreen from "../screens/AddGastoScreen";
import {
  createExpense,
  getCurrencies,
  getExchangeRate,
  getExpenseCategories,
  getTripParticipants,
} from "../services/api";
import { guardarGastoOffline } from "../database/gastosLocal";
import { toYMD } from "../utils/dates";
import {
  fechaFueraDelViaje,
  mensajeFechaFueraDelViaje,
  parsearMonto,
  requiereConversionARS,
} from "../utils/comprobanteGasto";

jest.mock("../services/api", () => ({
  getExpenseCategories: jest.fn(),
  getTripParticipants: jest.fn(),
  getCurrencies: jest.fn(),
  getExchangeRate: jest.fn(),
  createExpense: jest.fn(),
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
const mockImagen = { uri: "file:///cache/comprobante.jpg" };
jest.mock("../components/trip/ReceiptScanButton", () => {
  const { Text: MockText, TouchableOpacity: MockTouchable } = require("react-native");
  return function MockReceiptScanButton({ onScanned }) {
    return (
      <MockTouchable onPress={() => onScanned(mockDatosEscaneo, mockImagen)}>
        <MockText>Simular escaneo</MockText>
      </MockTouchable>
    );
  };
});

function diasDesdeHoy(dias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return toYMD(fecha);
}

const AYER = diasDesdeHoy(-1);

// Viaje en curso: empezó hace 3 días y termina en 5.
const VIAJE = { FechaInicioViaje: diasDesdeHoy(-3), FechaFinViaje: diasDesdeHoy(5) };

const COMPROBANTE = {
  Nombre: "Café Martínez",
  MontoOriginal: "15230.50",
  MonedaOriginal: "ARS",
  FechaGasto: AYER,
  IdCategoria: 1,
  CamposBajaConfianza: [],
};

// El usuario que escanea es Bruno (no el primero de la lista).
const PARTICIPANTES = [
  { IdParticipanteViaje: 1, Nombre: "Juan", Apellido: "Pérez", NombreUsuario: "jperez", EsUsuarioActual: false },
  { IdParticipanteViaje: 2, Nombre: "Bruno", Apellido: "Díaz", NombreUsuario: "bdiaz", EsUsuarioActual: true },
];

async function renderFormulario(props = {}) {
  const onClose = jest.fn();
  const onGastoCreado = jest.fn();
  const utils = await render(
    <AddGastoScreen
      visible
      IdViaje={10}
      Moneda="ARS"
      onClose={onClose}
      onGastoCreado={onGastoCreado}
      {...VIAJE}
      {...props}
    />
  );
  await waitFor(() => expect(utils.getByText("Simular escaneo")).toBeTruthy());
  await waitFor(() => expect(utils.getByText("Peso argentino")).toBeTruthy());
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

async function escribir(utils, testIdOValor, texto, { porValor = false } = {}) {
  const input = porValor ? utils.getByDisplayValue(testIdOValor) : utils.getByTestId(testIdOValor);
  await act(async () => {
    fireEvent.changeText(input, texto);
  });
}

async function escanear(utils, datos = COMPROBANTE) {
  mockDatosEscaneo = datos;
  await presionar(utils, "Simular escaneo");
}

/** Hace que el próximo Alert con botones elija el botón indicado. */
function responderAlerta(textoBoton) {
  Alert.alert.mockImplementationOnce((titulo, mensaje, botones) => {
    botones?.find((b) => b.text === textoBoton)?.onPress?.();
  });
}

describe("US 94 - Confirmar gasto precargado desde un comprobante", () => {
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
    createExpense.mockResolvedValue({ IdGasto: 99 });
    // Cotización automática (US-85): 1 USD = 1200 ARS
    getExchangeRate.mockImplementation(async ({ monto }) => ({
      MontoConvertido: String(Number(monto) * 1200),
      Fecha: AYER,
    }));
  });

  afterEach(() => jest.restoreAllMocks());

  it("AC1: muestra los datos extraídos junto a la vista previa del comprobante", async () => {
    const utils = await renderFormulario();

    await escanear(utils);

    expect(utils.getByDisplayValue("Café Martínez")).toBeTruthy();
    expect(utils.getByTestId("receipt-preview")).toBeTruthy();
    expect(utils.getByText("Comprobante escaneado")).toBeTruthy();

    await presionarTestId(utils, "receipt-preview");
    expect(utils.queryByText("Comprobante escaneado")).toBeNull(); // ampliada
  });

  it("CP1/AC10: confirma el gasto precargado sin modificar y muestra la confirmación", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    await presionar(utils, "Registrar gasto");

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        Nombre: "Café Martínez",
        MontoOriginal: 15230.5,
        MonedaOriginal: "ARS",
        FechaGasto: AYER,
        IdCategoria: 1,
        DesdeComprobante: true,
        MontoConvertidoARS: null,
      })
    );
    expect(Alert.alert).toHaveBeenCalledWith("Éxito", "Gasto registrado correctamente en el servidor.");
    expect(utils.onGastoCreado).toHaveBeenCalled();
    expect(utils.onClose).toHaveBeenCalled();
  });

  it("CP2/AC2: registra el monto corregido", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    await escribir(utils, "15230.5", "14000,75", { porValor: true });
    await presionar(utils, "Registrar gasto");

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ Monto: 14000.75, MontoOriginal: 14000.75 })
    );
  });

  it("AC2: permite modificar el resto de los campos precargados", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    await escribir(utils, "Café Martínez", "Desayuno", { porValor: true });
    await presionar(utils, "Comida y Bebida");
    await presionar(utils, "Transporte");
    await presionar(utils, "Registrar gasto");

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ Nombre: "Desayuno", IdCategoria: 2 })
    );
  });

  it("CP3/RN-21: no confirma con el monto vacío", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    await escribir(utils, "15230.5", "", { porValor: true });
    await presionar(utils, "Registrar gasto");

    expect(utils.getByText("El monto es obligatorio")).toBeTruthy();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("RN-21: no confirma con un monto no numérico o igual a cero", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    await escribir(utils, "15230.5", "12a", { porValor: true });
    await presionar(utils, "Registrar gasto");
    expect(utils.getByText("El monto debe ser un número válido")).toBeTruthy();

    await escribir(utils, "12a", "0", { porValor: true });
    await presionar(utils, "Registrar gasto");
    expect(utils.getByText("El monto debe ser mayor a cero")).toBeTruthy();

    expect(createExpense).not.toHaveBeenCalled();
  });

  it("CP4: no confirma sin categoría", async () => {
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, IdCategoria: null });

    await presionar(utils, "Registrar gasto");

    // El texto aparece en el placeholder del selector y en el mensaje de error.
    expect(utils.getAllByText("Seleccioná una categoría")).toHaveLength(2);
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("CP5/AC4: el pagador se completa con el usuario que escaneó", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    expect(utils.getByTestId("pagador-personal").props.children.join("")).toContain("Bruno Díaz");

    await presionar(utils, "Compartido");
    expect(utils.getByText("Bruno Díaz")).toBeTruthy();
  });

  it("AC4: permite cambiar el pagador precargado", async () => {
    const utils = await renderFormulario();
    await escanear(utils);
    await presionar(utils, "Compartido");

    await presionar(utils, "Bruno Díaz"); // abre el selector de pagador
    await presionar(utils, "Juan Pérez");
    // El nuevo pagador se suma a la división junto con quien escaneó.
    expect(utils.getByText("Todos los integrantes")).toBeTruthy();
    await presionar(utils, "Registrar gasto");

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ EsCompartido: true, IdPagador: 1, TipoDivision: "igualitaria" })
    );
  });

  it("CP7/AC6: comprobante en dólares: convierte automáticamente a ARS y registra", async () => {
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "50", MonedaOriginal: "USD" });

    expect(utils.getByText(/El comprobante está en USD/)).toBeTruthy();
    await waitFor(() => expect(utils.getByDisplayValue("60000")).toBeTruthy());
    expect(getExchangeRate).toHaveBeenCalledWith({ origen: "USD", destino: "ARS", monto: 50, fecha: AYER });
    // Con la conversión automática no se muestra texto de estado (en particular,
    // no se pide ingresar un monto que ya está cargado).
    await waitFor(() => expect(utils.queryByTestId("conversion-ars-estado")).toBeNull());

    await presionar(utils, "Registrar gasto");

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        MontoOriginal: 50,
        MonedaOriginal: "USD",
        MontoConvertidoARS: 60000,
        DesdeComprobante: true,
      })
    );
  });

  it("AC6: si se corrige el monto en dólares, recalcula la conversión", async () => {
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "50", MonedaOriginal: "USD" });
    await waitFor(() => expect(utils.getByDisplayValue("60000")).toBeTruthy());

    await escribir(utils, "50", "10", { porValor: true });

    await waitFor(() => expect(utils.getByDisplayValue("12000")).toBeTruthy());
  });

  it("AC6: permite corregir el monto convertido y registra el valor corregido", async () => {
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "50", MonedaOriginal: "USD" });
    await waitFor(() => expect(utils.getByDisplayValue("60000")).toBeTruthy());

    await escribir(utils, "monto-ars-input", "61500");
    expect(utils.getByText("Monto ingresado manualmente.")).toBeTruthy();
    await presionar(utils, "Registrar gasto");

    expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({ MontoConvertidoARS: 61500 }));
  });

  it("AC6: puede volver a la cotización automática después de corregir", async () => {
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "50", MonedaOriginal: "USD" });
    await waitFor(() => expect(utils.getByDisplayValue("60000")).toBeTruthy());
    await escribir(utils, "monto-ars-input", "1");

    await presionarTestId(utils, "usar-cotizacion-automatica");

    await waitFor(() => expect(utils.getByDisplayValue("60000")).toBeTruthy());
  });

  it("CP6/AC7/RN-39: sin cotización disponible, no confirma hasta ingresar el monto en ARS", async () => {
    getExchangeRate.mockRejectedValue(Object.assign(new Error("caído"), { status: 503 }));
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "50", MonedaOriginal: "USD" });

    await waitFor(() =>
      expect(
        utils.getByText("No pudimos obtener la cotización. Ingresá el monto convertido manualmente.")
      ).toBeTruthy()
    );
    await presionar(utils, "Registrar gasto");

    expect(
      utils.getByText("Ingresá el monto convertido a pesos argentinos (ARS) para continuar")
    ).toBeTruthy();
    expect(createExpense).not.toHaveBeenCalled();

    await escribir(utils, "monto-ars-input", "60000");
    await presionar(utils, "Registrar gasto");
    expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({ MontoConvertidoARS: 60000 }));
  });

  it("AC7: no confirma mientras se calcula la conversión", async () => {
    getExchangeRate.mockReturnValue(new Promise(() => {})); // nunca responde
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "50", MonedaOriginal: "USD" });

    await presionar(utils, "Registrar gasto");

    expect(utils.getByText("Esperá a que termine de calcularse la conversión a ARS")).toBeTruthy();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("RN-39: sin conexión, la cola offline conserva el monto convertido a ARS", async () => {
    createExpense.mockRejectedValue(new TypeError("Network request failed"));
    guardarGastoOffline.mockReturnValue(true);
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "50", MonedaOriginal: "USD" });

    await escribir(utils, "monto-ars-input", "60000");
    await presionar(utils, "Registrar gasto");

    expect(guardarGastoOffline).toHaveBeenCalledWith(
      expect.objectContaining({ MonedaOriginal: "USD", DesdeComprobante: true, MontoConvertidoARS: 60000 })
    );
  });

  it("AC6: si el usuario cambia la moneda a ARS ya no pide la conversión", async () => {
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MonedaOriginal: "USD" });
    expect(utils.getByTestId("conversion-ars-warning")).toBeTruthy();

    await presionar(utils, "Dólar estadounidense");
    await presionar(utils, "Peso argentino");

    expect(utils.queryByTestId("conversion-ars-warning")).toBeNull();
  });

  it("CP8/AC8: fecha anterior al inicio del viaje: informa y registra sin frenar", async () => {
    const antesDelViaje = diasDesdeHoy(-10);
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, FechaGasto: antesDelViaje });

    expect(utils.getByTestId("fecha-fuera-viaje-warning")).toBeTruthy();
    expect(utils.getByText(/La fecha es anterior al inicio del viaje \(\d{2}\/\d{2}\/\d{4}\)/)).toBeTruthy();

    await presionar(utils, "Registrar gasto");

    expect(Alert.alert).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.any(Array), expect.anything()
    );
    expect(createExpense).toHaveBeenCalledWith(expect.objectContaining({ FechaGasto: antesDelViaje }));
  });

  it("AC8: con la fecha dentro del viaje no muestra advertencia", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    expect(utils.queryByTestId("fecha-fuera-viaje-warning")).toBeNull();
  });

  it("CP9/AC9: cancelar no registra el gasto y descarta la imagen", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    responderAlerta("Descartar");
    await presionarTestId(utils, "add-gasto-cancel");

    expect(createExpense).not.toHaveBeenCalled();
    expect(mockEliminarArchivo).toHaveBeenCalled();
    expect(utils.onClose).toHaveBeenCalled();
  });

  it("AC9: cerrar con la cruz también pide confirmación y se puede seguir editando", async () => {
    const utils = await renderFormulario();
    await escanear(utils);

    responderAlerta("Seguir editando");
    await presionarTestId(utils, "add-gasto-close");

    expect(utils.onClose).not.toHaveBeenCalled();
    expect(mockEliminarArchivo).not.toHaveBeenCalled();
    expect(utils.getByDisplayValue("Café Martínez")).toBeTruthy();
  });

  it("CP10/AC5: no confirma una división personalizada que no suma el total", async () => {
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "1000" });

    await presionar(utils, "Compartido");
    await presionar(utils, "1 participantes");
    await presionar(utils, "Seleccionar Todos");
    await presionar(utils, "Listo");
    await presionar(utils, "Personalizada");
    await escribir(utils, "monto-personalizado-1", "600");
    await escribir(utils, "monto-personalizado-2", "300");
    await presionar(utils, "Registrar gasto");

    expect(
      utils.getByText("La suma de los montos individuales debe ser igual al monto total (1000 ARS)")
    ).toBeTruthy();
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("AC5: con un comprobante en dólares la división se hace sobre el monto en ARS", async () => {
    const utils = await renderFormulario();
    await escanear(utils, { ...COMPROBANTE, MontoOriginal: "50", MonedaOriginal: "USD" });
    await escribir(utils, "monto-ars-input", "60000");

    await presionar(utils, "Compartido");
    await presionar(utils, "1 participantes");
    await presionar(utils, "Seleccionar Todos");
    await presionar(utils, "Listo");
    await presionar(utils, "Personalizada");
    await escribir(utils, "monto-personalizado-1", "40000");
    await escribir(utils, "monto-personalizado-2", "20000");
    await presionar(utils, "Registrar gasto");

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        TipoDivision: "personalizada",
        MontoConvertidoARS: 60000,
        DetalleMontosPersonalizados: [
          { IdParticipanteViaje: 1, MontoAsignado: 40000 },
          { IdParticipanteViaje: 2, MontoAsignado: 20000 },
        ],
      })
    );
  });

  it("la carga manual no aplica las reglas del comprobante", async () => {
    const utils = await renderFormulario();

    expect(utils.queryByTestId("receipt-preview")).toBeNull();
    expect(utils.queryByTestId("add-gasto-cancel")).toBeNull();

    await presionarTestId(utils, "add-gasto-close");
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(utils.onClose).toHaveBeenCalled();
  });
});

describe("US 94 - reglas del comprobante", () => {
  it("parsearMonto valida RN-21 y acepta coma decimal", () => {
    expect(parsearMonto("1500,50")).toEqual({ valor: 1500.5 });
    expect(parsearMonto(" 20 ")).toEqual({ valor: 20 });
    expect(parsearMonto("").error).toBe("El monto es obligatorio");
    expect(parsearMonto("abc").error).toBe("El monto debe ser un número válido");
    expect(parsearMonto("-5").error).toBe("El monto debe ser un número válido");
    expect(parsearMonto("0").error).toBe("El monto debe ser mayor a cero");
  });

  it("requiereConversionARS solo para monedas distintas de ARS", () => {
    expect(requiereConversionARS("USD")).toBe(true);
    expect(requiereConversionARS("ars")).toBe(false);
    expect(requiereConversionARS(null)).toBe(false);
  });

  it("mensajeFechaFueraDelViaje distingue antes y después del viaje", () => {
    expect(mensajeFechaFueraDelViaje("2026-11-30", "2026-12-01", "2026-12-10")).toBe(
      "La fecha es anterior al inicio del viaje (01/12/2026)"
    );
    expect(mensajeFechaFueraDelViaje("2026-12-11", "2026-12-01", "2026-12-10")).toBe(
      "La fecha es posterior al fin del viaje (10/12/2026)"
    );
    expect(mensajeFechaFueraDelViaje("2026-12-05", "2026-12-01", "2026-12-10")).toBeNull();
    expect(mensajeFechaFueraDelViaje("", "2026-12-01", "2026-12-10")).toBeNull();
  });

  it("fechaFueraDelViaje compara contra inicio y fin", () => {
    expect(fechaFueraDelViaje("2026-11-30", "2026-12-01", "2026-12-10")).toBe(true);
    expect(fechaFueraDelViaje("2026-12-11", "2026-12-01", "2026-12-10")).toBe(true);
    expect(fechaFueraDelViaje("2026-12-01", "2026-12-01", "2026-12-10")).toBe(false);
    expect(fechaFueraDelViaje("2026-12-10", "2026-12-01T00:00:00", "2026-12-10")).toBe(false);
    expect(fechaFueraDelViaje("2026-12-05", null, null)).toBe(false);
    expect(fechaFueraDelViaje("", "2026-12-01", "2026-12-10")).toBe(false);
  });
});