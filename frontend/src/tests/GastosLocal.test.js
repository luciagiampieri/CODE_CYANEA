import { Platform } from "react-native";

import db from "../database/database";
import { createExpense } from "../services/api";
import {
  guardarGastoOffline,
  obtenerGastosPendientes,
  sincronizarGastosOffline,
  guardarCategoriasEnCache,
  obtenerCategoriasCache,
} from "../database/gastosLocal";

jest.mock("../database/database", () => ({
  __esModule: true,
  default: {
    runSync: jest.fn(),
    getAllSync: jest.fn(),
    execSync: jest.fn(),
  },
}));

jest.mock("../services/api", () => ({
  createExpense: jest.fn(),
}));

const gastoBase = {
  IdViaje: 10,
  Nombre: "Almuerzo",
  Monto: 1500,
  IdCategoria: 1,
  IdPagador: null,
  FechaGasto: "2026-08-20",
  EsCompartido: false,
  DividirEntreTodos: false,
  TipoDivision: null,
  IdParticipantes: [],
  DetalleMontosPersonalizados: [],
};

describe("gastosLocal - cola offline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = "ios";
  });

  describe("guardarGastoOffline", () => {
    it("en web no guarda nada y devuelve false", () => {
      Platform.OS = "web";

      const resultado = guardarGastoOffline(gastoBase);

      expect(resultado).toBe(false);
      expect(db.runSync).not.toHaveBeenCalled();
    });

    it("en nativo inserta el gasto y devuelve true", () => {
      const resultado = guardarGastoOffline(gastoBase);

      expect(resultado).toBe(true);
      expect(db.runSync).toHaveBeenCalledTimes(1);
      const [, params] = db.runSync.mock.calls[0];
      expect(params[0]).toBe(10); // id_viaje
      expect(params[1]).toBe("Almuerzo"); // nombre
      expect(params[2]).toBe(1500); // monto
    });

    it("si el insert falla, captura el error y devuelve false", () => {
      db.runSync.mockImplementation(() => {
        throw new Error("disk full");
      });

      const resultado = guardarGastoOffline(gastoBase);

      expect(resultado).toBe(false);
    });
  });

  describe("obtenerGastosPendientes", () => {
    it("en web devuelve un array vacío", () => {
      Platform.OS = "web";

      expect(obtenerGastosPendientes()).toEqual([]);
      expect(db.getAllSync).not.toHaveBeenCalled();
    });

    it("en nativo devuelve las filas guardadas", () => {
      db.getAllSync.mockReturnValue([{ id: 1, nombre: "Almuerzo" }]);

      expect(obtenerGastosPendientes()).toEqual([{ id: 1, nombre: "Almuerzo" }]);
    });

    it("si la consulta falla, devuelve un array vacío", () => {
      db.getAllSync.mockImplementation(() => {
        throw new Error("db locked");
      });

      expect(obtenerGastosPendientes()).toEqual([]);
    });
  });

  describe("sincronizarGastosOffline", () => {
    const filaPendiente = {
      id: 1,
      id_viaje: 10,
      nombre: "Almuerzo",
      monto: 1500,
      id_categoria: 1,
      id_pagador: null,
      fecha_gasto: "2026-08-20",
      es_compartido: 0,
      dividir_entre_todos: 0,
      tipo_division: null,
      ids_participantes: "[]",
      detalle_montos: "[]",
    };

    it("en web no hace nada", async () => {
      Platform.OS = "web";

      await sincronizarGastosOffline();

      expect(db.getAllSync).not.toHaveBeenCalled();
      expect(createExpense).not.toHaveBeenCalled();
    });

    it("sincroniza cada gasto pendiente y lo borra de la cola", async () => {
      db.getAllSync.mockReturnValue([filaPendiente]);
      createExpense.mockResolvedValue({ IdGasto: 99 });

      await sincronizarGastosOffline();

      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ IdViaje: 10, Nombre: "Almuerzo", Monto: 1500 })
      );
      expect(db.runSync).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM gastos_pendientes"),
        [1]
      );
    });

    it("si falla la sincronización de un gasto, lo deja en la cola y corta", async () => {
      db.getAllSync.mockReturnValue([filaPendiente, { ...filaPendiente, id: 2 }]);
      createExpense.mockRejectedValue(new Error("sin conexión"));

      await sincronizarGastosOffline();

      expect(createExpense).toHaveBeenCalledTimes(1); // no sigue con el segundo
      expect(db.runSync).not.toHaveBeenCalledWith(
        expect.stringContaining("DELETE"),
        expect.anything()
      );
    });

    it("evita dos sincronizaciones simultáneas", async () => {
      db.getAllSync.mockReturnValue([filaPendiente]);
      createExpense.mockResolvedValue({ IdGasto: 99 });

      await Promise.all([sincronizarGastosOffline(), sincronizarGastosOffline()]);

      expect(createExpense).toHaveBeenCalledTimes(1);
    });
  });

  describe("caché de categorías", () => {
    it("en web no guarda y devuelve [] al leer", () => {
      Platform.OS = "web";

      guardarCategoriasEnCache([{ IdCategoria: 1, Nombre: "Comida" }]);

      expect(db.execSync).not.toHaveBeenCalled();
      expect(obtenerCategoriasCache()).toEqual([]);
    });

    it("en nativo reemplaza el caché completo", () => {
      guardarCategoriasEnCache([{ IdCategoria: 1, Nombre: "Comida" }]);

      expect(db.execSync).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM cache_categorias")
      );
      expect(db.runSync).toHaveBeenCalledWith(expect.any(String), [1, "Comida"]);
    });

    it("en nativo lee el caché guardado", () => {
      db.getAllSync.mockReturnValue([{ IdCategoria: 1, Nombre: "Comida" }]);

      expect(obtenerCategoriasCache()).toEqual([{ IdCategoria: 1, Nombre: "Comida" }]);
    });
  });
});