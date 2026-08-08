import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("viajes_offline.db");

export function inicializarBaseDeDatos() {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS gastos_pendientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_viaje INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        monto REAL NOT NULL,
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
    `);

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
