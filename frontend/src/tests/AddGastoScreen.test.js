import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddGastoScreen from "../screens/AddGastoScreen";

import {
  getExpenseCategories,
  getTripParticipants,
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
  createExpense: jest.fn(),
}));

jest.mock("../database/gastosLocal", () => ({
  guardarGastoOffline: jest.fn(),
  guardarCategoriasEnCache: jest.fn(),
  obtenerCategoriasCache: jest.fn(),
  guardarParticipantesEnCache: jest.fn(),
  obtenerParticipantesCache: jest.fn(),
}));

const mockGoBack = jest.fn();

const categorias = [
  { IdCategoria: 1, Nombre: "Comida y Bebida" },
  { IdCategoria: 2, Nombre: "Transporte" },
];

const participantes = [
  { IdParticipanteViaje: 1, Nombre: "Juan", Apellido: "Pérez", NombreUsuario: "jperez" },
  { IdParticipanteViaje: 2, Nombre: "Ana", Apellido: "Gómez", NombreUsuario: "agomez" },
];

const route = { params: { IdViaje: 10, Moneda: "USD" } };
const navigation = { goBack: mockGoBack };


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

async function renderPantallaCargada() {
  const utils = await render(
    <AddGastoScreen route={route} navigation={navigation} />
  );
  await waitFor(() => expect(utils.getByText("Nuevo gasto")).toBeTruthy());
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

describe("US - Registrar gasto (AddGastoScreen)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getExpenseCategories.mockResolvedValue(categorias);
    getTripParticipants.mockResolvedValue(participantes);
    createExpense.mockResolvedValue({ IdGasto: 1 });
    obtenerCategoriasCache.mockReturnValue([]);
    obtenerParticipantesCache.mockReturnValue([]);
  });

  it("carga categorías y participantes del viaje al montar la pantalla", async () => {
    await renderPantallaCargada();

    expect(getExpenseCategories).toHaveBeenCalledTimes(1);
    expect(getTripParticipants).toHaveBeenCalledWith(10);
  });

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

  it("registra un gasto personal exitosamente y vuelve a la pantalla anterior", async () => {
    const alertMock = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const utils = await renderPantallaCargada();

    await completarNombreYMonto(utils, "Almuerzo", "1500");
    await seleccionarCategoria(utils, "Comida y Bebida");
    await press(utils, "Registrar gasto");

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));

    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        IdViaje: 10,
        Nombre: "Almuerzo",
        Monto: 1500,
        IdCategoria: 1,
        EsCompartido: false,
        IdPagador: null,
      })
    );

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        "Éxito",
        "Gasto registrado correctamente en el servidor."
      );
    });
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    alertMock.mockRestore();
  });

  it("si falla el guardado en el servidor, lo guarda offline y avisa al usuario", async () => {
    createExpense.mockRejectedValue(new Error("Sin conexión"));
    guardarGastoOffline.mockReturnValue(true);

    const alertMock = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        const entendido = buttons?.find((b) => b.text === "Entendido");
        entendido?.onPress?.();
      });

    const utils = await renderPantallaCargada();

    await completarNombreYMonto(utils, "Almuerzo", "1500");
    await seleccionarCategoria(utils, "Comida y Bebida");
    await press(utils, "Registrar gasto");

    await waitFor(() => expect(guardarGastoOffline).toHaveBeenCalledTimes(1));

    expect(alertMock).toHaveBeenCalledWith(
      "Modo Offline",
      "El gasto quedó guardado localmente. Se sincronizará cuando vuelva la conexión.",
      expect.arrayContaining([
        expect.objectContaining({ text: "Entendido" }),
      ])
    );
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    alertMock.mockRestore();
  });

  it("si no hay conexión al cargar y tampoco hay caché local, avisa y vuelve atrás", async () => {
    getExpenseCategories.mockRejectedValue(new Error("Network Error"));
    getTripParticipants.mockRejectedValue(new Error("Network Error"));
    obtenerCategoriasCache.mockReturnValue([]);
    obtenerParticipantesCache.mockReturnValue([]);

    const alertMock = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await render(<AddGastoScreen route={route} navigation={navigation} />);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        "Sin conexión",
        "No hay datos locales guardados para este viaje todavía."
      );
    });
    expect(mockGoBack).toHaveBeenCalledTimes(1);

    alertMock.mockRestore();
  });

  it("si no hay conexión pero hay caché local, carga el formulario con esos datos", async () => {
    getExpenseCategories.mockRejectedValue(new Error("Network Error"));
    getTripParticipants.mockRejectedValue(new Error("Network Error"));
    obtenerCategoriasCache.mockReturnValue(categorias);
    obtenerParticipantesCache.mockReturnValue(participantes);

    const utils = await renderPantallaCargada();

    expect(mockGoBack).not.toHaveBeenCalled();
    await press(utils, "Seleccioná una categoría");
    expect(utils.getByText("Comida y Bebida")).toBeTruthy();
  });
});