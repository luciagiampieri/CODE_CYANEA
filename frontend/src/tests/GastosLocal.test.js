import { Platform } from "react-native";

import db from "../database/database";
import { createExpense } from "../services/api";
import {
  guardarGastoOffline,
  obtenerGastosPendientes,
  sincronizarGastosOffline,
  guardarCategoriasEnCache,
  obtenerCategoriasCache,
  guardarParticipantesEnCache,
  obtenerParticipantesCache,
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

// Gasto tal como lo arma AddGastoScreen: el importe va en MontoOriginal / MonedaOriginal
// y el servidor se encarga de la conversión a la moneda base del viaje.
const gastoBase = {
  IdViaje: 10,
  Nombre: "Almuerzo",
  Monto: 1500,
  MontoOriginal: 1500,
  MonedaOriginal: "USD",
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
    // mockReset (y no solo clear) para que un mockImplementation de un test no contamine al siguiente
    db.runSync.mockReset();
    db.getAllSync.mockReset();
    db.execSync.mockReset();
    createExpense.mockReset();
    Platform.OS = "ios";
  });

  describe("guardarGastoOffline", () => {
    it("en web no guarda nada y devuelve false", () => {
      Platform.OS = "web";
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      const resultado = guardarGastoOffline(gastoBase);

      expect(resultado).toBe(false);
      expect(db.runSync).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it("en nativo inserta el gasto en gastos_pendientes y devuelve true", () => {
      const resultado = guardarGastoOffline(gastoBase);

      expect(resultado).toBe(true);
      expect(db.runSync).toHaveBeenCalledTimes(1);

      const [sql] = db.runSync.mock.calls[0];
      expect(sql).toContain("INSERT INTO gastos_pendientes");
      expect(sql).toContain("monto_original");
      expect(sql).toContain("moneda_original");
    });

    it("guarda el importe original y la moneda original con la que se registró el gasto", () => {
      guardarGastoOffline({ ...gastoBase, MontoOriginal: 100, MonedaOriginal: "EUR" });

      const [, params] = db.runSync.mock.calls[0];
      expect(params[0]).toBe(10); // id_viaje
      expect(params[1]).toBe("Almuerzo"); // nombre
      expect(params[2]).toBe(100); // monto_original
      expect(params[3]).toBe("EUR"); // moneda_original
      expect(params[4]).toBe(1); // id_categoria
      expect(params[5]).toBeNull(); // id_pagador
      expect(params[6]).toBe("2026-08-20"); // fecha_gasto
    });

    it("serializa un gasto personal con los flags en 0 y listas vacías", () => {
      guardarGastoOffline(gastoBase);

      const [, params] = db.runSync.mock.calls[0];
      expect(params[7]).toBe(0); // es_compartido
      expect(params[8]).toBe(0); // dividir_entre_todos
      expect(params[9]).toBeNull(); // tipo_division
      expect(params[10]).toBe("[]"); // ids_participantes
      expect(params[11]).toBe("[]"); // detalle_montos
      expect(typeof params[12]).toBe("string"); // creado_en (ISO)
      expect(Number.isNaN(Date.parse(params[12]))).toBe(false);
    });

    it("serializa un gasto compartido con división personalizada", () => {
      guardarGastoOffline({
        ...gastoBase,
        IdPagador: 1,
        EsCompartido: true,
        DividirEntreTodos: true,
        TipoDivision: "personalizada",
        IdParticipantes: [1, 2],
        DetalleMontosPersonalizados: [
          { IdParticipanteViaje: 1, MontoAsignado: 1000 },
          { IdParticipanteViaje: 2, MontoAsignado: 500 },
        ],
      });

      const [, params] = db.runSync.mock.calls[0];
      expect(params[5]).toBe(1); // id_pagador
      expect(params[7]).toBe(1); // es_compartido
      expect(params[8]).toBe(1); // dividir_entre_todos
      expect(params[9]).toBe("personalizada"); // tipo_division
      expect(JSON.parse(params[10])).toEqual([1, 2]);
      expect(JSON.parse(params[11])).toEqual([
        { IdParticipanteViaje: 1, MontoAsignado: 1000 },
        { IdParticipanteViaje: 2, MontoAsignado: 500 },
      ]);
    });

    it("si faltan las listas de participantes, guarda arreglos vacíos", () => {
      const { IdParticipantes, DetalleMontosPersonalizados, ...sinListas } = gastoBase;

      guardarGastoOffline(sinListas);

      const [, params] = db.runSync.mock.calls[0];
      expect(params[10]).toBe("[]");
      expect(params[11]).toBe("[]");
    });

    it("si el insert falla, captura el error y devuelve false", () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      db.runSync.mockImplementation(() => {
        throw new Error("disk full");
      });

      const resultado = guardarGastoOffline(gastoBase);

      expect(resultado).toBe(false);
      errorSpy.mockRestore();
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

    it("las pide ordenadas por id para sincronizarlas en el orden en que se cargaron", () => {
      db.getAllSync.mockReturnValue([]);

      obtenerGastosPendientes();

      const [sql] = db.getAllSync.mock.calls[0];
      expect(sql).toContain("FROM gastos_pendientes");
      expect(sql).toContain("ORDER BY id ASC");
    });

    it("si la consulta falla, devuelve un array vacío", () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      db.getAllSync.mockImplementation(() => {
        throw new Error("db locked");
      });

      expect(obtenerGastosPendientes()).toEqual([]);
      errorSpy.mockRestore();
    });
  });

  describe("sincronizarGastosOffline", () => {
    let logSpy;

    const filaPendiente = {
      id: 1,
      id_viaje: 10,
      nombre: "Almuerzo",
      monto_original: 1500,
      moneda_original: "USD",
      id_categoria: 1,
      id_pagador: null,
      fecha_gasto: "2026-08-20",
      es_compartido: 0,
      dividir_entre_todos: 0,
      tipo_division: null,
      ids_participantes: "[]",
      detalle_montos: "[]",
    };

    beforeEach(() => {
      logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it("en web no hace nada", async () => {
      Platform.OS = "web";

      await sincronizarGastosOffline();

      expect(db.getAllSync).not.toHaveBeenCalled();
      expect(createExpense).not.toHaveBeenCalled();
    });

    it("si no hay gastos pendientes no llama al servidor", async () => {
      db.getAllSync.mockReturnValue([]);

      await sincronizarGastosOffline();

      expect(createExpense).not.toHaveBeenCalled();
    });

    it("sincroniza cada gasto pendiente con su importe y moneda original, y lo borra de la cola", async () => {
      db.getAllSync.mockReturnValue([{ ...filaPendiente, moneda_original: "EUR", monto_original: 100 }]);
      createExpense.mockResolvedValue({ IdGasto: 99 });

      await sincronizarGastosOffline();

      expect(createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          IdViaje: 10,
          Nombre: "Almuerzo",
          MontoOriginal: 100,
          MonedaOriginal: "EUR",
        })
      );
      expect(db.runSync).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM gastos_pendientes"),
        [1]
      );
    });

    it("reconstruye el payload completo a partir de la fila guardada", async () => {
      db.getAllSync.mockReturnValue([
        {
          ...filaPendiente,
          id_pagador: 1,
          es_compartido: 1,
          dividir_entre_todos: 1,
          tipo_division: "personalizada",
          ids_participantes: "[1,2]",
          detalle_montos: JSON.stringify([
            { IdParticipanteViaje: 1, MontoAsignado: 1000 },
            { IdParticipanteViaje: 2, MontoAsignado: 500 },
          ]),
        },
      ]);
      createExpense.mockResolvedValue({ IdGasto: 99 });

      await sincronizarGastosOffline();

      expect(createExpense).toHaveBeenCalledWith({
        IdViaje: 10,
        Nombre: "Almuerzo",
        MontoOriginal: 1500,
        MonedaOriginal: "USD",
        IdCategoria: 1,
        IdPagador: 1,
        FechaGasto: "2026-08-20",
        EsCompartido: true,
        DividirEntreTodos: true,
        TipoDivision: "personalizada",
        IdParticipantes: [1, 2],
        DetalleMontosPersonalizados: [
          { IdParticipanteViaje: 1, MontoAsignado: 1000 },
          { IdParticipanteViaje: 2, MontoAsignado: 500 },
        ],
      });
    });

    it("sincroniza varios gastos en orden y borra cada uno al confirmarse", async () => {
      db.getAllSync.mockReturnValue([
        filaPendiente,
        { ...filaPendiente, id: 2, nombre: "Cena" },
      ]);
      createExpense.mockResolvedValue({ IdGasto: 99 });

      await sincronizarGastosOffline();

      expect(createExpense).toHaveBeenCalledTimes(2);
      expect(createExpense.mock.calls[0][0].Nombre).toBe("Almuerzo");
      expect(createExpense.mock.calls[1][0].Nombre).toBe("Cena");
      expect(db.runSync).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [1]);
      expect(db.runSync).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [2]);
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

    it("si el primero se sincroniza y el segundo falla, solo borra el primero", async () => {
      db.getAllSync.mockReturnValue([filaPendiente, { ...filaPendiente, id: 2 }]);
      createExpense
        .mockResolvedValueOnce({ IdGasto: 99 })
        .mockRejectedValueOnce(new Error("sin conexión"));

      await sincronizarGastosOffline();

      expect(createExpense).toHaveBeenCalledTimes(2);
      expect(db.runSync).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [1]);
      expect(db.runSync).not.toHaveBeenCalledWith(expect.stringContaining("DELETE"), [2]);
    });

    it("evita dos sincronizaciones simultáneas", async () => {
      db.getAllSync.mockReturnValue([filaPendiente]);
      createExpense.mockResolvedValue({ IdGasto: 99 });

      await Promise.all([sincronizarGastosOffline(), sincronizarGastosOffline()]);

      expect(createExpense).toHaveBeenCalledTimes(1);
    });

    it("después de un fallo se puede volver a sincronizar (libera el bloqueo)", async () => {
      db.getAllSync.mockReturnValue([filaPendiente]);
      createExpense.mockRejectedValueOnce(new Error("sin conexión"));
      await sincronizarGastosOffline();

      createExpense.mockResolvedValueOnce({ IdGasto: 99 });
      await sincronizarGastosOffline();

      expect(createExpense).toHaveBeenCalledTimes(2);
      expect(db.runSync).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [1]);
    });
  });

  describe("caché de categorías", () => {
    it("en web no guarda y devuelve [] al leer", () => {
      Platform.OS = "web";
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      guardarCategoriasEnCache([{ IdCategoria: 1, Nombre: "Comida" }]);

      expect(db.execSync).not.toHaveBeenCalled();
      expect(obtenerCategoriasCache()).toEqual([]);
      logSpy.mockRestore();
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

  describe("caché de participantes", () => {
    const participante = {
      IdParticipanteViaje: 5,
      Nombre: "Juan",
      Apellido: "Pérez",
      NombreUsuario: "jperez",
    };

    it("en web no guarda y devuelve [] al leer", () => {
      Platform.OS = "web";
      const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

      guardarParticipantesEnCache(10, [participante]);

      expect(db.runSync).not.toHaveBeenCalled();
      expect(obtenerParticipantesCache(10)).toEqual([]);
      logSpy.mockRestore();
    });

    it("en nativo reemplaza solo los participantes del viaje indicado", () => {
      guardarParticipantesEnCache(10, [participante]);

      expect(db.runSync).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM cache_participantes WHERE id_viaje = ?"),
        [10]
      );
      expect(db.runSync).toHaveBeenCalledWith(expect.any(String), [
        5,
        10,
        "Juan",
        "Pérez",
        "jperez",
      ]);
    });

    it("en nativo lee los participantes cacheados del viaje", () => {
      db.getAllSync.mockReturnValue([{ IdParticipanteViaje: 5, IdViaje: 10, Nombre: "Juan" }]);

      const resultado = obtenerParticipantesCache(10);

      expect(resultado).toEqual([{ IdParticipanteViaje: 5, IdViaje: 10, Nombre: "Juan" }]);
      expect(db.getAllSync).toHaveBeenCalledWith(expect.stringContaining("WHERE id_viaje = ?"), [10]);
    });
  });
});