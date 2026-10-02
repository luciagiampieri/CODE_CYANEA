/**
 * Migraciones del esquema SQLite offline. Las instalaciones existentes ya
 * tienen las tablas creadas, así que las columnas nuevas (US 94) tienen que
 * agregarse sin perder los datos.
 */
const mockDb = {
  getAllSync: jest.fn(),
  execSync: jest.fn(),
};

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => mockDb),
}));

const { inicializarBaseDeDatos } = require("../database/database.native");

const COLUMNAS_GASTOS_ANTERIORES = [
  "id", "id_viaje", "nombre", "monto_original", "moneda_original", "id_categoria",
  "id_pagador", "fecha_gasto", "es_compartido", "dividir_entre_todos", "tipo_division",
  "ids_participantes", "detalle_montos", "creado_en",
];

function tablas({ gastos, participantes }) {
  mockDb.getAllSync.mockImplementation((sql) => {
    if (sql.includes("gastos_pendientes")) return gastos.map((name) => ({ name }));
    if (sql.includes("cache_participantes")) return participantes.map((name) => ({ name }));
    return [];
  });
}

function sqlEjecutado() {
  return mockDb.execSync.mock.calls.map(([sql]) => sql).join("\n");
}

describe("inicializarBaseDeDatos - migraciones US 94", () => {
  beforeEach(() => {
    mockDb.getAllSync.mockReset();
    mockDb.execSync.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it("reconstruye gastos_pendientes conservando los pendientes y agrega las columnas del comprobante", () => {
    tablas({
      gastos: COLUMNAS_GASTOS_ANTERIORES,
      participantes: ["id_participante_viaje", "id_viaje", "nombre", "apellido", "nombre_usuario"],
    });

    inicializarBaseDeDatos();

    const sql = sqlEjecutado();
    expect(sql).toContain("RENAME TO gastos_pendientes_old");
    expect(sql).toMatch(/INSERT INTO gastos_pendientes[\s\S]*desde_comprobante, monto_convertido_ars\)/);
    expect(sql).toContain("COMMIT");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("agrega es_usuario_actual a un caché de participantes existente", () => {
    tablas({
      gastos: [...COLUMNAS_GASTOS_ANTERIORES, "desde_comprobante", "monto_convertido_ars"],
      participantes: ["id_participante_viaje", "id_viaje", "nombre", "apellido", "nombre_usuario"],
    });

    inicializarBaseDeDatos();

    expect(sqlEjecutado()).toContain(
      "ALTER TABLE cache_participantes ADD COLUMN es_usuario_actual INTEGER NOT NULL DEFAULT 0"
    );
  });

  it("con el esquema al día no migra nada", () => {
    tablas({
      gastos: [...COLUMNAS_GASTOS_ANTERIORES, "desde_comprobante", "monto_convertido_ars"],
      participantes: [
        "id_participante_viaje", "id_viaje", "nombre", "apellido", "nombre_usuario", "es_usuario_actual",
      ],
    });

    inicializarBaseDeDatos();

    const sql = sqlEjecutado();
    expect(sql).not.toContain("RENAME");
    expect(sql).not.toContain("ALTER TABLE cache_participantes");
  });
});
