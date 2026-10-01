import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddGastoScreen from "../screens/AddGastoScreen";
import { toYMD } from "../utils/dates";

import {
  getExpenseCategories,
  getTripParticipants,
  getCurrencies,
  createExpense,
} from "../services/api";

import {
  guardarGastoOffline,
  obtenerCategoriasCache,
  obtenerParticipantesCache,
} from "../database/gastosLocal";

jest.mock("../services/api", () => ({
  getExpenseCategories: jest.fn(),
  getTripParticipants: jest.fn(),
  getCurrencies: jest.fn(),
  createExpense: jest.fn(),
}));

jest.mock("../database/gastosLocal", () => ({
  guardarGastoOffline: jest.fn(),
  guardarCategoriasEnCache: jest.fn(),
  obtenerCategoriasCache: jest.fn(),
  guardarParticipantesEnCache: jest.fn(),
  obtenerParticipantesCache: jest.fn(),
}));

// Atajo para poner una fecha pasada en el formulario sin manejar el calendario: un botón falso
// que entrega datos ya "escaneados". El flujo real del botón se prueba en ReceiptScanButton.test.js.
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

const mockOnClose = jest.fn();

const categorias = [
  { IdCategoria: 1, Nombre: "Comida y Bebida" },
  { IdCategoria: 2, Nombre: "Transporte" },
];

const participantes = [
  { IdParticipanteViaje: 1, Nombre: "Juan", Apellido: "Pérez", NombreUsuario: "jperez" },
  { IdParticipanteViaje: 2, Nombre: "Ana", Apellido: "Gómez", NombreUsuario: "agomez" },
];

// La moneda base del viaje en estos tests es USD
const monedas = [
  { Codigo: "USD", Nombre: "Dólar estadounidense" },
  { Codigo: "EUR", Nombre: "Euro" },
  { Codigo: "ARS", Nombre: "Peso argentino" },
];

const NOMBRE_MONEDA_BASE = "Dólar estadounidense";
const AVISO_CONVERSION = /se convertirá automáticamente/;

const MENSAJE_OFFLINE =
  "El gasto quedó guardado localmente con su moneda original. Se convertirá y sincronizará cuando vuelva la conexión.";

const HOY = toYMD(new Date());
const HACE_5_DIAS = (() => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 5);
  return toYMD(fecha);
})();

// Gasto en euros (la base es USD) fechado 5 días atrás
const GASTO_EN_EUR_PASADO = {
  Nombre: "Museo del Louvre",
  MontoOriginal: "100",
  MonedaOriginal: "EUR",
  FechaGasto: HACE_5_DIAS,
  IdCategoria: 1,
  CamposBajaConfianza: [],
};

async function press(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getByText(texto));
  });
}

async function escribir(getters, placeholder, texto) {
  await act(async () => {
    fireEvent.changeText(getters.getByPlaceholderText(placeholder), texto);
  });
}

// Espera a que termine de cargar el formulario y, salvo que se indique lo contrario,
// también la lista de monedas (se carga en paralelo, de forma independiente).
async function renderPantallaCargada({ esperarMonedas = true } = {}) {
  const utils = await render(
    <AddGastoScreen visible={true} IdViaje={10} Moneda="USD" onClose={mockOnClose} />
  );
  await waitFor(() => expect(utils.getByText("Nuevo gasto")).toBeTruthy());

  if (esperarMonedas) {
    await waitFor(() => expect(utils.getByText(NOMBRE_MONEDA_BASE)).toBeTruthy());
  }
  return utils;
}

async function completarNombreYMonto(utils, nombre, monto) {
  await escribir(utils, "Cena", nombre);
  await escribir(utils, "0", monto);
}

async function seleccionarCategoria(utils, nombreCategoria) {
  await press(utils, "Seleccioná una categoría");
  await press(utils, nombreCategoria);
}

// Abre el selector de moneda (el botón muestra la moneda base) y elige otra.
async function seleccionarMoneda(utils, nombreMoneda) {
  await press(utils, NOMBRE_MONEDA_BASE);
  await press(utils, nombreMoneda);
}

async function registrarGastoPersonal(utils, { nombre = "Almuerzo", monto = "1500" } = {}) {
  await completarNombreYMonto(utils, nombre, monto);
  await seleccionarCategoria(utils, "Comida y Bebida");
  await press(utils, "Registrar gasto");
}

function errorDelServidor(status, message) {
  return Object.assign(new Error(message), { status });
}

// Completa el formulario con un gasto en euros de hace 5 días y lo registra.
async function registrarGastoEnEurosConFechaPasada(utils) {
  mockDatosEscaneo = GASTO_EN_EUR_PASADO;
  await press(utils, "Simular escaneo");
  await press(utils, "Registrar gasto");
}

describe("US - Registrar gasto (AddGastoScreen)", () => {
  let alertSpy;
  let logSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    getExpenseCategories.mockResolvedValue(categorias);
    getTripParticipants.mockResolvedValue(participantes);
    getCurrencies.mockResolvedValue(monedas);
    createExpense.mockResolvedValue({ IdGasto: 1 });
    guardarGastoOffline.mockReturnValue(true);
    obtenerCategoriasCache.mockReturnValue([]);
    obtenerParticipantesCache.mockReturnValue([]);

    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    // El componente loguea errores a propósito; evitamos ensuciar la salida de los tests
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    logSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Carga inicial
  // ---------------------------------------------------------------------------
  describe("carga inicial", () => {
    it("carga categorías, participantes y monedas del viaje al montar la pantalla", async () => {
      await renderPantallaCargada();

      expect(getExpenseCategories).toHaveBeenCalledTimes(1);
      expect(getTripParticipants).toHaveBeenCalledWith(10);
      expect(getCurrencies).toHaveBeenCalledTimes(1);
    });

    it("si no hay conexión al cargar y tampoco hay caché local, avisa y cierra el modal", async () => {
      getExpenseCategories.mockRejectedValue(new Error("Network Error"));
      getTripParticipants.mockRejectedValue(new Error("Network Error"));

      await render(
        <AddGastoScreen visible={true} IdViaje={10} Moneda="USD" onClose={mockOnClose} />
      );

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          "Sin conexión",
          "No hay datos locales guardados para este viaje todavía."
        );
      });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("si no hay conexión pero hay caché local, carga el formulario con esos datos", async () => {
      getExpenseCategories.mockRejectedValue(new Error("Network Error"));
      getTripParticipants.mockRejectedValue(new Error("Network Error"));
      getCurrencies.mockRejectedValue(new Error("Network Error"));
      obtenerCategoriasCache.mockReturnValue(categorias);
      obtenerParticipantesCache.mockReturnValue(participantes);

      const utils = await renderPantallaCargada({ esperarMonedas: false });

      expect(mockOnClose).not.toHaveBeenCalled();
      await press(utils, "Seleccioná una categoría");
      expect(utils.getByText("Comida y Bebida")).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Monedas
  // ---------------------------------------------------------------------------
  describe("selector de moneda", () => {
    it("muestra la moneda base del viaje seleccionada por defecto", async () => {
      const utils = await renderPantallaCargada();

      expect(utils.getByText("Monto (USD)")).toBeTruthy();
      expect(utils.queryByText(AVISO_CONVERSION)).toBeNull();
    });

    it("permite elegir otra moneda de la lista y avisa que se convertirá a la moneda base", async () => {
      const utils = await renderPantallaCargada();

      await seleccionarMoneda(utils, "Euro");

      expect(utils.getByText("Monto (EUR)")).toBeTruthy();
      expect(utils.getByText(AVISO_CONVERSION)).toBeTruthy();
    });

    it("deja de mostrar el aviso de conversión al volver a la moneda base", async () => {
      const utils = await renderPantallaCargada();

      await seleccionarMoneda(utils, "Euro");
      expect(utils.getByText(AVISO_CONVERSION)).toBeTruthy();

      // Ahora el botón muestra "Euro"; elegimos nuevamente el dólar
      await press(utils, "Euro");
      await press(utils, NOMBRE_MONEDA_BASE);

      expect(utils.getByText("Monto (USD)")).toBeTruthy();
      expect(utils.queryByText(AVISO_CONVERSION)).toBeNull();
    });

    it("si falla la carga de monedas, el formulario sigue disponible con la moneda base", async () => {
      getCurrencies.mockRejectedValue(new Error("Fallo al traer monedas"));

      const utils = await renderPantallaCargada({ esperarMonedas: false });

      // No cierra el modal ni avisa "Sin conexión": categorías y participantes cargaron bien
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      await waitFor(() => expect(utils.getByText("Moneda base")).toBeTruthy());
      expect(utils.getByText("Monto (USD)")).toBeTruthy();

      await registrarGastoPersonal(utils);

      await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ MonedaOriginal: "USD" })
      );
    });

    it("si la API devuelve una lista vacía de monedas, usa solo la moneda base", async () => {
      getCurrencies.mockResolvedValue([]);

      const utils = await renderPantallaCargada({ esperarMonedas: false });

      await waitFor(() => expect(utils.getByText("Moneda base")).toBeTruthy());
      expect(utils.getByText("Monto (USD)")).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Validaciones
  // ---------------------------------------------------------------------------
  describe("validaciones", () => {
    it("muestra errores de validación si se intenta guardar sin completar los campos obligatorios", async () => {
      const utils = await renderPantallaCargada();

      await press(utils, "Registrar gasto");

      expect(utils.getByText("El concepto es obligatorio")).toBeTruthy();
      expect(utils.getByText("El monto es obligatorio")).toBeTruthy();
      expect(utils.getAllByText("Seleccioná una categoría")).toHaveLength(2);
      expect(createExpense).not.toHaveBeenCalled();
    });

    it("rechaza un monto menor o igual a cero", async () => {
      const utils = await renderPantallaCargada();

      await completarNombreYMonto(utils, "Almuerzo", "0");
      await press(utils, "Registrar gasto");

      expect(utils.getByText("El monto debe ser mayor a cero")).toBeTruthy();
      expect(createExpense).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Registro online
  // ---------------------------------------------------------------------------
  describe("registro online", () => {
    it("registra un gasto personal exitosamente y cierra el modal", async () => {
      const utils = await renderPantallaCargada();

      await registrarGastoPersonal(utils);

      await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));

      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          IdViaje: 10,
          Nombre: "Almuerzo",
          Monto: 1500,
          MontoOriginal: 1500,
          MonedaOriginal: "USD",
          IdCategoria: 1,
          EsCompartido: false,
          IdPagador: null,
        })
      );

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          "Éxito",
          "Gasto registrado correctamente en el servidor."
        );
      });
      expect(guardarGastoOffline).not.toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("registra el gasto con la moneda original elegida cuando es distinta a la base", async () => {
      const utils = await renderPantallaCargada();

      await seleccionarMoneda(utils, "Euro");
      await registrarGastoPersonal(utils, { nombre: "Museo", monto: "100" });

      await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));

      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          IdViaje: 10,
          Nombre: "Museo",
          MontoOriginal: 100,
          MonedaOriginal: "EUR",
        })
      );
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("envía la fecha del gasto (no la de hoy) junto con el importe y la moneda originales", async () => {
      const utils = await renderPantallaCargada();

      await registrarGastoEnEurosConFechaPasada(utils);

      await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
      const enviado = createExpense.mock.calls[0][0];
      expect(enviado).toEqual(
        expect.objectContaining({ MontoOriginal: 100, MonedaOriginal: "EUR", FechaGasto: HACE_5_DIAS })
      );
      expect(enviado.FechaGasto).not.toBe(HOY);
    });
  });

  // ---------------------------------------------------------------------------
  // Registro offline y errores del servidor
  // ---------------------------------------------------------------------------
  describe("registro offline y errores del servidor", () => {
    it.each([
      ["TypeError (fetch en React Native)", new TypeError("Network request failed")],
      ["Failed to fetch", new Error("Failed to fetch")],
      ["Network Error (axios)", new Error("Network Error")],
      ["timeout", new Error("timeout of 10000ms exceeded")],
    ])(
      "si falla por conexión (%s), lo guarda offline y avisa al usuario",
      async (_descripcion, errorDeRed) => {
        createExpense.mockRejectedValue(errorDeRed);
        alertSpy.mockImplementation((title, message, buttons) => {
          const entendido = buttons?.find((b) => b.text === "Entendido");
          entendido?.onPress?.();
        });

        const utils = await renderPantallaCargada();

        await registrarGastoPersonal(utils);

        await waitFor(() => expect(guardarGastoOffline).toHaveBeenCalledTimes(1));

        expect(alertSpy).toHaveBeenCalledWith(
          "Modo Offline",
          MENSAJE_OFFLINE,
          expect.arrayContaining([expect.objectContaining({ text: "Entendido" })])
        );
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      }
    );

    it("al guardar offline conserva el monto y la moneda original elegidos", async () => {
      createExpense.mockRejectedValue(new TypeError("Network request failed"));

      const utils = await renderPantallaCargada();

      await seleccionarMoneda(utils, "Euro");
      await registrarGastoPersonal(utils, { nombre: "Museo", monto: "100" });

      await waitFor(() => expect(guardarGastoOffline).toHaveBeenCalledTimes(1));

      expect(guardarGastoOffline).toHaveBeenCalledWith(
        expect.objectContaining({
          IdViaje: 10,
          Nombre: "Museo",
          MontoOriginal: 100,
          MonedaOriginal: "EUR",
        })
      );
    });

    it("si el servidor rechaza el gasto (error con status), muestra el motivo y NO lo guarda offline", async () => {
      createExpense.mockRejectedValue(errorDelServidor(400, "La moneda no está soportada"));

      const utils = await renderPantallaCargada();

      await registrarGastoPersonal(utils);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          "No se pudo registrar el gasto",
          "La moneda no está soportada"
        );
      });
      expect(guardarGastoOffline).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it("si el servidor rechaza el gasto sin mensaje, muestra un texto genérico", async () => {
      createExpense.mockRejectedValue(errorDelServidor(500, ""));

      const utils = await renderPantallaCargada();

      await registrarGastoPersonal(utils);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          "No se pudo registrar el gasto",
          "El servidor rechazó el gasto."
        );
      });
      expect(guardarGastoOffline).not.toHaveBeenCalled();
    });

    it("un error desconocido que no es de red tampoco se guarda offline", async () => {
      createExpense.mockRejectedValue(new Error("Algo inesperado"));

      const utils = await renderPantallaCargada();

      await registrarGastoPersonal(utils);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          "No se pudo registrar el gasto",
          "Algo inesperado"
        );
      });
      expect(guardarGastoOffline).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it("si el servicio de cotización no está disponible (503), lo guarda offline y avisa al usuario", async () => {
      createExpense.mockRejectedValue(errorDelServidor(503, "Service Unavailable"));
      alertSpy.mockImplementation((title, message, buttons) => {
        const entendido = buttons?.find((b) => b.text === "Entendido");
        entendido?.onPress?.();
      });

      const utils = await renderPantallaCargada();

      await seleccionarMoneda(utils, "Euro");
      await registrarGastoPersonal(utils, { monto: "100" });

      await waitFor(() => expect(guardarGastoOffline).toHaveBeenCalledTimes(1));

      expect(alertSpy).toHaveBeenCalledWith(
        "Servicio no disponible",
        "El servicio de cotización no se encuentra disponible en este momento.",
        expect.arrayContaining([expect.objectContaining({ text: "Entendido" })])
      );
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("si el error menciona la cotización, también lo guarda offline y avisa al usuario", async () => {
      createExpense.mockRejectedValue(new Error("Error al obtener la cotización"));
      alertSpy.mockImplementation((title, message, buttons) => {
        const entendido = buttons?.find((b) => b.text === "Entendido");
        entendido?.onPress?.();
      });

      const utils = await renderPantallaCargada();

      await registrarGastoPersonal(utils);

      await waitFor(() => expect(guardarGastoOffline).toHaveBeenCalledTimes(1));

      expect(alertSpy).toHaveBeenCalledWith(
        "Servicio no disponible",
        "El servicio de cotización no se encuentra disponible en este momento.",
        expect.arrayContaining([expect.objectContaining({ text: "Entendido" })])
      );
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("si falla la conexión y tampoco se puede guardar offline, muestra el error", async () => {
      createExpense.mockRejectedValue(new TypeError("Network request failed"));
      guardarGastoOffline.mockReturnValue(false);

      const utils = await renderPantallaCargada();

      await registrarGastoPersonal(utils);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("Error", "No se pudo guardar el gasto offline");
      });
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it("al guardar offline conserva también la fecha del gasto y no guarda ninguna conversión", async () => {
      createExpense.mockRejectedValue(new TypeError("Network request failed"));
      alertSpy.mockImplementation((titulo, mensaje, botones) => {
        botones?.find((b) => b.text === "Entendido")?.onPress?.();
      });

      const utils = await renderPantallaCargada();

      await registrarGastoEnEurosConFechaPasada(utils);

      await waitFor(() => expect(guardarGastoOffline).toHaveBeenCalledTimes(1));
      const guardado = guardarGastoOffline.mock.calls[0][0];
      expect(guardado).toEqual(
        expect.objectContaining({
          IdViaje: 10,
          Nombre: "Museo del Louvre",
          MontoOriginal: 100,
          MonedaOriginal: "EUR",
          FechaGasto: HACE_5_DIAS,
        })
      );
      // La conversión se hace al sincronizar, con la cotización de FechaGasto.
      expect(guardado).not.toHaveProperty("TipoCambio");
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    // Servicio de cotización caído: el gasto debe quedar pendiente, sin perder sus datos originales.
    // NOTA: estos tests fallan hoy: ante un 503 la pantalla solo muestra un alert y descarta el gasto.
    describe("servicio de cotización no disponible (503): el gasto queda pendiente", () => {
      it("lo deja guardado localmente con su importe, moneda y fecha originales", async () => {
        createExpense.mockRejectedValue(errorDelServidor(503, "Service Unavailable"));

        const utils = await renderPantallaCargada();

        await registrarGastoEnEurosConFechaPasada(utils);

        await waitFor(() => expect(guardarGastoOffline).toHaveBeenCalledTimes(1));
        expect(guardarGastoOffline).toHaveBeenCalledWith(
          expect.objectContaining({
            IdViaje: 10,
            Nombre: "Museo del Louvre",
            MontoOriginal: 100,
            MonedaOriginal: "EUR",
            FechaGasto: HACE_5_DIAS,
            IdCategoria: 1,
          })
        );
      });

      it("no informa un registro exitoso en el servidor", async () => {
        createExpense.mockRejectedValue(errorDelServidor(503, "Service Unavailable"));

        const utils = await renderPantallaCargada();

        await registrarGastoEnEurosConFechaPasada(utils);

        await waitFor(() => expect(guardarGastoOffline).toHaveBeenCalled());
        expect(alertSpy).not.toHaveBeenCalledWith(
          "Éxito",
          "Gasto registrado correctamente en el servidor."
        );
      });

      it("si tampoco se puede guardar localmente, avisa y no cierra el formulario para no perder los datos", async () => {
        createExpense.mockRejectedValue(errorDelServidor(503, "Service Unavailable"));
        guardarGastoOffline.mockReturnValue(false);

        const utils = await renderPantallaCargada();

        await registrarGastoEnEurosConFechaPasada(utils);

        await waitFor(() => {
          expect(alertSpy).toHaveBeenCalledWith("Error", "No se pudo guardar el gasto offline");
        });
        expect(mockOnClose).not.toHaveBeenCalled();
        expect(utils.getByDisplayValue("Museo del Louvre")).toBeTruthy();
      });
    });
  });
});