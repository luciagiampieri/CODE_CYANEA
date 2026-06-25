import { Platform } from "react-native";
import db from "./database";
import { createExpense } from "../services/api";

// =========================================================================
// 1. COLA DE GASTOS (ESCRITURA OFFLINE)
// =========================================================================

let sincronizando = false; // Flag para evitar múltiples sincronizaciones simultáneas

// Guardar cuando no hay internet
export function guardarGastoOffline(gasto) {
  if (Platform.OS === "web") {
    console.log("Guardado offline no disponible en Web.");
    return false;
  }

  try {
    const dividir = gasto.DividirEntreTodos ? 1 : 0;
    const pagador = gasto.EsCompartido ? gasto.IdPagador : null;

    db.runSync(
      `
      INSERT INTO gastos_pendientes 
      (id_viaje, nombre, monto, id_categoria, id_pagador, fecha_gasto,es_compartido, dividir_entre_todos, tipo_division, ids_participantes,detalle_montos, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        gasto.IdViaje,
        gasto.Nombre,
        gasto.Monto,
        gasto.IdCategoria,
        gasto.IdPagador,
        gasto.FechaGasto,
        gasto.EsCompartido ? 1 : 0,
        gasto.DividirEntreTodos ? 1 : 0,
        gasto.TipoDivision || null,
        JSON.stringify(gasto.IdParticipantes || []),
        JSON.stringify(gasto.DetalleMontosPersonalizados || []),
        new Date().toISOString()
      ]
    );
    return true;
  } catch (error) {
    console.error("Error al guardar offline en SQLite:", error);
    return false;
  }
}

// Obtener pendientes
export function obtenerGastosPendientes() {
  if (Platform.OS === "web" || !db) {
    return [];
  }

  try {
    return db.getAllSync(
      `
      SELECT * FROM gastos_pendientes 
      ORDER BY id ASC
      `
    );
  } catch (error) {
    console.error("Error al obtener gastos pendientes de SQLite:", error);
    return [];
  }
}

// Sincronizar cuando vuelve internet
export async function sincronizarGastosOffline() {

  if (sincronizando) {
    return;
  }
  sincronizando = true;

  try {
    if (Platform.OS === "web" || !db) return;
    const pendientes = obtenerGastosPendientes();

    for (const gasto of pendientes) {
      try {
        const payload = {
          IdViaje: gasto.id_viaje,
          Nombre: gasto.nombre,
          Monto: gasto.monto,
          IdCategoria: gasto.id_categoria,
          IdPagador: gasto.id_pagador,
          FechaGasto: gasto.fecha_gasto,
          EsCompartido: gasto.es_compartido === 1,
          DividirEntreTodos: gasto.dividir_entre_todos === 1,
          TipoDivision: gasto.tipo_division || null,
          IdParticipantes: JSON.parse(gasto.ids_participantes || "[]"),
          DetalleMontosPersonalizados: JSON.parse(gasto.detalle_montos || "[]")
        };

        await createExpense(payload);

        db.runSync(
          `DELETE FROM gastos_pendientes WHERE id = ?`,
          [gasto.id]
        );

        console.log(
          "Gasto sincronizado y eliminado de SQLite:",
          gasto.id
        );
      } catch (error) {
        console.log(
          "No se pudo sincronizar el gasto:",
          gasto.id
        );
        break;
      }
    }
  } finally {
    sincronizando = false;
  }
}

// =========================================================================
// 2. FUNCIONES DE CACHÉ MAESTRO (LECTURA OFFLINE PROTEGIDA EN WEB)
// =========================================================================

export function guardarCategoriasEnCache(categorias) {
  // Verificación estricta para navegadores
  if (Platform.OS === "web" || !db) {
    console.log("🌐 Entorno Web: Omitiendo guardado de categorías en caché nativa SQLite.");
    return;
  }

  try {
    // Limpiamos caché viejo e insertamos lo más nuevo
    db.execSync(`DELETE FROM cache_categorias`);
    for (const cat of categorias) {
      db.runSync(
        `INSERT OR REPLACE INTO cache_categorias (id_categoria, nombre) VALUES (?, ?)`,
        [cat.IdCategoria, cat.Nombre]
      );
    }
  } catch (e) {
    console.error("Error guardando caché de categorías en SQLite:", e);
  }
}

export function obtenerCategoriasCache() {
  if (Platform.OS === "web" || !db) {
    return [];
  }

  try {
    const rows = db.getAllSync(`SELECT id_categoria AS IdCategoria, nombre AS Nombre FROM cache_categorias`);
    return rows;
  } catch (e) {
    console.error("Error leyendo caché de categorías de SQLite:", e);
    return [];
  }
}

export function guardarParticipantesEnCache(idViaje, participantes) {
  // Verificación estricta para navegadores
  if (Platform.OS === "web" || !db) {
    console.log("🌐 Entorno Web: Omitiendo guardado de participantes en caché nativa SQLite.");
    return;
  }

  try {
    // Limpiamos los participantes previos de ESTE viaje e insertamos los nuevos
    db.runSync(`DELETE FROM cache_participantes WHERE id_viaje = ?`, [idViaje]);
    for (const p of participantes) {
      db.runSync(
        `INSERT OR REPLACE INTO cache_participantes (id_participante_viaje, id_viaje, nombre, apellido, nombre_usuario) VALUES (?, ?, ?, ?, ?)`,
        [p.IdParticipanteViaje, idViaje, p.Nombre, p.Apellido, p.NombreUsuario]
      );
    }
  } catch (e) {
    console.error("Error guardando caché de participantes en SQLite:", e);
  }
}

export function obtenerParticipantesCache(idViaje) {
  if (Platform.OS === "web" || !db) {
    return [];
  }

  try {
    const rows = db.getAllSync(
      `SELECT id_participante_viaje AS IdParticipanteViaje, id_viaje AS IdViaje, nombre AS Nombre, apellido AS Apellido, nombre_usuario AS NombreUsuario 
       FROM cache_participantes WHERE id_viaje = ?`,
      [idViaje]
    );
    return rows;
  } catch (e) {
    console.error("Error leyendo caché de participantes de SQLite:", e);
    return [];
  }
}