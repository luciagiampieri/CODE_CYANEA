import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("viajes_offline.db");

const CREATE_GASTOS_PENDIENTES = `
  CREATE TABLE IF NOT EXISTS gastos_pendientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_viaje INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    monto_original REAL NOT NULL,
    moneda_original TEXT NOT NULL,
    id_categoria INTEGER NOT NULL,
    id_pagador INTEGER,
    fecha_gasto TEXT NOT NULL,
    es_compartido INTEGER NOT NULL,
    dividir_entre_todos INTEGER NOT NULL,
    tipo_division TEXT,
    ids_participantes TEXT,
    detalle_montos TEXT,
    creado_en TEXT
  );
`;

// Columnas que DEBE tener la tabla con el esquema actual
const COLUMNAS_ESPERADAS = [
  "id",
  "id_viaje",
  "nombre",
  "monto_original",
  "moneda_original",
  "id_categoria",
  "id_pagador",
  "fecha_gasto",
  "es_compartido",
  "dividir_entre_todos",
  "tipo_division",
  "ids_participantes",
  "detalle_montos",
  "creado_en",
];

function migrarGastosPendientes() {
  const info = db.getAllSync(`PRAGMA table_info(gastos_pendientes)`);

  // Tabla inexistente: se crea limpia y listo
  if (info.length === 0) {
    db.execSync(CREATE_GASTOS_PENDIENTES);
    return;
  }

  const columnas = info.map((c) => c.name);

  // Si hay columnas viejas (como "monto") o faltan columnas nuevas,
  // se reconstruye la tabla conservando lo que se pueda.
  const hayColumnasViejas = columnas.some((c) => !COLUMNAS_ESPERADAS.includes(c));
  const faltanColumnas = COLUMNAS_ESPERADAS.some((c) => !columnas.includes(c));

  if (!hayColumnasViejas && !faltanColumnas) return;

  db.execSync(`BEGIN TRANSACTION;`);
  try {
    db.execSync(`ALTER TABLE gastos_pendientes RENAME TO gastos_pendientes_old;`);
    db.execSync(CREATE_GASTOS_PENDIENTES);

    const tiene = (c) => columnas.includes(c);

    // El monto puede venir de "monto_original" (nuevo) o de "monto" (viejo)
    const origenMonto = tiene("monto_original") && tiene("monto")
      ? "COALESCE(monto_original, monto)"
      : tiene("monto_original")
      ? "monto_original"
      : tiene("monto")
      ? "monto"
      : "0";

    const origenMoneda = tiene("moneda_original")
      ? "COALESCE(moneda_original, 'ARS')"
      : "'ARS'";

    const col = (nombre, porDefecto) => (tiene(nombre) ? nombre : porDefecto);

    db.execSync(`
      INSERT INTO gastos_pendientes
        (id_viaje, nombre, monto_original, moneda_original, id_categoria, id_pagador,
         fecha_gasto, es_compartido, dividir_entre_todos, tipo_division,
         ids_participantes, detalle_montos, creado_en)
      SELECT
        ${col("id_viaje", "0")},
        ${col("nombre", "''")},
        ${origenMonto},
        ${origenMoneda},
        ${col("id_categoria", "0")},
        ${col("id_pagador", "NULL")},
        ${col("fecha_gasto", "''")},
        ${col("es_compartido", "0")},
        ${col("dividir_entre_todos", "0")},
        ${col("tipo_division", "NULL")},
        ${col("ids_participantes", "'[]'")},
        ${col("detalle_montos", "'[]'")},
        ${col("creado_en", "NULL")}
      FROM gastos_pendientes_old;
    `);

    db.execSync(`DROP TABLE gastos_pendientes_old;`);
    db.execSync(`COMMIT;`);
  } catch (e) {
    db.execSync(`ROLLBACK;`);
    // Último recurso: si la migración falla, se descarta la tabla vieja
    console.error("Migración fallida, recreando tabla gastos_pendientes:", e);
    db.execSync(`DROP TABLE IF EXISTS gastos_pendientes_old;`);
    db.execSync(`DROP TABLE IF EXISTS gastos_pendientes;`);
    db.execSync(CREATE_GASTOS_PENDIENTES);
  }
}

export function inicializarBaseDeDatos() {
  try {
    migrarGastosPendientes();

    db.execSync(`
      CREATE TABLE IF NOT EXISTS cache_categorias (
        id_categoria INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL
      );
    `);

    db.execSync(`
      CREATE TABLE IF NOT EXISTS cache_participantes (
        id_participante_viaje INTEGER PRIMARY KEY,
        id_viaje INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        apellido TEXT,
        nombre_usuario TEXT NOT NULL
      );
    `);
  } catch (error) {
    console.error("Error SQLite:", error);
  }
}

export default db;