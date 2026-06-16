import { Platform } from "react-native";
import db from "./database";
import { createExpense } from "../services/api";

// Guardar cuando no hay internet
export function guardarGastoOffline(gasto) {
  if (Platform.OS === "web") {
    console.log("🌐 Guardado offline no disponible en Web.");
    return false;
  }

  try {
    const dividir = gasto.DividirEntreTodos ? 1 : 0;

    db.runSync(
      `
      INSERT INTO gastos_pendientes 
      (id_viaje, nombre, monto, id_categoria, id_pagador, fecha_gasto, dividir_entre_todos, ids_participantes, creado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        gasto.IdViaje,
        gasto.Nombre,
        gasto.Monto,
        gasto.IdCategoria,
        gasto.IdPagador,
        gasto.FechaGasto,
        dividir,
        JSON.stringify(gasto.IdParticipantes || []),
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

  return db.getAllSync(
    `
    SELECT * FROM gastos_pendientes 
    ORDER BY id ASC
    `
  );
}

// Sincronizar cuando vuelve internet
export async function sincronizarGastosOffline() {
  if (Platform.OS === "web") return;

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
        DividirEntreTodos: gasto.dividir_entre_todos === 1,
        IdParticipantes: JSON.parse(gasto.ids_participantes || "[]")
      };

      await createExpense(payload);

      db.runSync(
        `DELETE FROM gastos_pendientes WHERE id = ?`,
        [gasto.id]
      );

      console.log("Gasto sincronizado y eliminado de SQLite:", gasto.id);
    } catch (error) {
      console.log("No se pudo sincronizar el gasto, reintento suspendido:", gasto.id);
      break;
    }
  }
}