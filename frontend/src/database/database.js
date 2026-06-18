import { Platform } from "react-native";
import * as SQLite from "expo-sqlite";

let db = null;

// Solo abrimos la conexión física si NO estamos en un navegador web
if (Platform.OS !== "web") {
  db = SQLite.openDatabaseSync("viajes_offline.db");
}

export function inicializarBaseDeDatos() {
  // En la web no inicializamos tablas nativas
  if (Platform.OS === "web") {
    console.log("Entorno Web detectado: Omitiendo inicialización nativa de SQLite.");
    return;
  }

  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS gastos_pendientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_viaje INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        monto REAL NOT NULL,
        id_categoria INTEGER NOT NULL,
        id_pagador INTEGER NOT NULL,
        fecha_gasto TEXT NOT NULL,
        dividir_entre_todos INTEGER NOT NULL,
        ids_participantes TEXT,
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

    console.log("SQLite inicializado correctamente con tablas de caché.");
  } catch (error) {
    console.error("Error SQLite:", error);
  }
}

export default db;