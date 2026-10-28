import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

import db from "./database";
import {
  getStoredToken,
  getTripDetail,
  getTripDocuments,
  resolveApiBaseUrl,
} from "../services/api";

const CARPETA_RAIZ = "viajes-offline";
const MARGEN_ESPACIO = 1.1;

let sincronizando = false;

function habilitado() {
  return Platform.OS !== "web" && Boolean(db);
}

export function offlineDisponible() {
  return habilitado();
}

function crearError(codigo, mensaje) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

export function esErrorDeRed(error) {
  if (!error || error?.status || error?.response?.status) return false;
  const mensaje = String(error?.message || "").toLowerCase();
  return (
    error instanceof TypeError ||
    mensaje.includes("network request failed") ||
    mensaje.includes("failed to fetch") ||
    mensaje.includes("network error") ||
    mensaje.includes("timeout") ||
    mensaje.includes("timed out") ||
    mensaje.includes("offline")
  );
}

export function viajeDisponibleOffline(detalle) {
  return (
    Boolean(detalle) &&
    !detalle.hasLeft &&
    String(detalle.status ?? "").toLowerCase() === "activo"
  );
}

export function versionDocumento(documento) {
  return String(documento?.FechaActualizacion ?? documento?.FechaSubida ?? "");
}

function nombreSeguro(nombre) {
  return String(nombre || "documento").replace(/[^\w.-]+/g, "_");
}

function espacioLibre() {
  try {
    const libre = Paths.availableDiskSpace;
    return typeof libre === "number" ? libre : null;
  } catch {
    return null;
  }
}

function borrarArchivo(uri) {
  if (!uri) return;
  try {
    const archivo = new File(uri);
    if (archivo.exists) archivo.delete();
  } catch (error) {
    console.log("No se pudo borrar el archivo offline:", error?.message);
  }
}

function carpetaViaje(idViaje) {
  const raiz = new Directory(Paths.document, CARPETA_RAIZ);
  if (!raiz.exists) raiz.create();
  const carpeta = new Directory(raiz, String(idViaje));
  if (!carpeta.exists) carpeta.create();
  return carpeta;
}

function mapearDocumento(fila) {
  if (!fila) return null;
  let documento = null;
  try {
    documento = JSON.parse(fila.datos);
  } catch {
    documento = null;
  }
  return {
    idDocumento: fila.id_documento,
    idViaje: fila.id_viaje,
    documento,
    uri: fila.uri,
    tamanoBytes: Number(fila.tamano_bytes ?? 0),
    version: fila.version ?? "",
    guardadoEn: fila.guardado_en,
  };
}

export function guardarItinerarioOffline(detalle) {
  if (!habilitado() || !detalle?.id) return null;

  if (!viajeDisponibleOffline(detalle)) {
    eliminarViajeOffline(detalle.id);
    return null;
  }

  const sincronizadoEn = new Date().toISOString();
  try {
    db.runSync(
      `INSERT OR REPLACE INTO itinerarios_offline (id_viaje, titulo, detalle, sincronizado_en) VALUES (?, ?, ?, ?)`,
      [detalle.id, detalle.title ?? "", JSON.stringify(detalle), sincronizadoEn]
    );
    return sincronizadoEn;
  } catch (error) {
    console.error("No se pudo guardar el itinerario offline:", error);
    return null;
  }
}

export function obtenerItinerarioOffline(idViaje) {
  if (!habilitado() || idViaje == null) return null;
  try {
    const fila = db.getFirstSync(
      `SELECT detalle, sincronizado_en FROM itinerarios_offline WHERE id_viaje = ?`,
      [idViaje]
    );
    if (!fila) return null;
    return { detalle: JSON.parse(fila.detalle), sincronizadoEn: fila.sincronizado_en };
  } catch (error) {
    console.error("No se pudo leer el itinerario offline:", error);
    return null;
  }
}

export function listarIdsViajesOffline() {
  if (!habilitado()) return [];
  try {
    const filas =
      db.getAllSync(
        `SELECT id_viaje FROM itinerarios_offline UNION SELECT id_viaje FROM documentos_offline`
      ) ?? [];
    return filas.map((fila) => fila.id_viaje);
  } catch (error) {
    console.error("No se pudieron listar los viajes offline:", error);
    return [];
  }
}

export function obtenerDocumentoOffline(idDocumento) {
  if (!habilitado() || idDocumento == null) return null;
  try {
    return mapearDocumento(
      db.getFirstSync(`SELECT * FROM documentos_offline WHERE id_documento = ?`, [idDocumento])
    );
  } catch (error) {
    console.error("No se pudo leer el documento offline:", error);
    return null;
  }
}

export function listarDocumentosOffline(idViaje = null) {
  if (!habilitado()) return [];
  try {
    const filas =
      (idViaje == null
        ? db.getAllSync(`SELECT * FROM documentos_offline ORDER BY id_viaje, id_documento`)
        : db.getAllSync(`SELECT * FROM documentos_offline WHERE id_viaje = ? ORDER BY id_documento`, [
            idViaje,
          ])) ?? [];
    return filas.map(mapearDocumento).filter(Boolean);
  } catch (error) {
    console.error("No se pudieron listar los documentos offline:", error);
    return [];
  }
}

export async function guardarDocumentoOffline(documento) {
  if (!habilitado()) {
    throw crearError(
      "NO_DISPONIBLE",
      "Los documentos sin conexión solo están disponibles en la app del celular."
    );
  }

  const tamano = Number(documento?.TamanoBytes ?? 0);
  const libre = espacioLibre();
  if (libre != null && tamano > 0 && libre < tamano * MARGEN_ESPACIO) {
    throw crearError(
      "ESPACIO_INSUFICIENTE",
      "No hay espacio suficiente en el dispositivo para guardar este documento."
    );
  }

  const token = await getStoredToken();
  const carpeta = carpetaViaje(documento.IdViaje);
  const destino = new File(
    carpeta,
    `${documento.IdDocumento}-${nombreSeguro(documento.NombreArchivo)}`
  );
  const anterior = obtenerDocumentoOffline(documento.IdDocumento);
  const url = `${resolveApiBaseUrl()}/trips/${documento.IdViaje}/documents/${documento.IdDocumento}/download`;

  const archivo = await File.downloadFileAsync(url, destino, {
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
  });

  if (anterior && anterior.uri !== archivo.uri) borrarArchivo(anterior.uri);

  const tamanoFinal = Number(archivo?.size ?? tamano) || 0;
  db.runSync(
    `INSERT OR REPLACE INTO documentos_offline (id_documento, id_viaje, datos, uri, tamano_bytes, version, guardado_en) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      documento.IdDocumento,
      documento.IdViaje,
      JSON.stringify(documento),
      archivo.uri,
      tamanoFinal,
      versionDocumento(documento),
      new Date().toISOString(),
    ]
  );

  return obtenerDocumentoOffline(documento.IdDocumento);
}

function actualizarDatosDocumentoOffline(documento) {
  try {
    db.runSync(`UPDATE documentos_offline SET datos = ? WHERE id_documento = ?`, [
      JSON.stringify(documento),
      documento.IdDocumento,
    ]);
  } catch (error) {
    console.error("No se pudieron actualizar los datos del documento offline:", error);
  }
}

export function quitarDocumentoOffline(idDocumento) {
  if (!habilitado()) return;
  const guardado = obtenerDocumentoOffline(idDocumento);
  if (guardado) borrarArchivo(guardado.uri);
  try {
    db.runSync(`DELETE FROM documentos_offline WHERE id_documento = ?`, [idDocumento]);
  } catch (error) {
    console.error("No se pudo quitar el documento offline:", error);
  }
}

export function eliminarViajeOffline(idViaje) {
  if (!habilitado() || idViaje == null) return;

  listarDocumentosOffline(idViaje).forEach((guardado) => borrarArchivo(guardado.uri));

  try {
    db.runSync(`DELETE FROM documentos_offline WHERE id_viaje = ?`, [idViaje]);
    db.runSync(`DELETE FROM itinerarios_offline WHERE id_viaje = ?`, [idViaje]);
  } catch (error) {
    console.error("No se pudieron eliminar los datos offline del viaje:", error);
  }

  try {
    const carpeta = new Directory(Paths.document, CARPETA_RAIZ, String(idViaje));
    if (carpeta.exists) carpeta.delete();
  } catch (error) {
    console.log("No se pudo borrar la carpeta offline del viaje:", error?.message);
  }
}

export function eliminarTodoOffline() {
  if (!habilitado()) return;

  try {
    db.execSync(`DELETE FROM documentos_offline; DELETE FROM itinerarios_offline;`);
  } catch (error) {
    console.error("No se pudieron eliminar los datos offline:", error);
  }

  try {
    const raiz = new Directory(Paths.document, CARPETA_RAIZ);
    if (raiz.exists) raiz.delete();
  } catch (error) {
    console.log("No se pudo borrar la carpeta offline:", error?.message);
  }
}

export function resumenEspacioOffline() {
  if (!habilitado()) return { viajes: [], totalBytes: 0 };

  let titulos = new Map();
  try {
    const filas = db.getAllSync(`SELECT id_viaje, titulo FROM itinerarios_offline`) ?? [];
    titulos = new Map(filas.map((fila) => [fila.id_viaje, fila.titulo]));
  } catch (error) {
    console.error("No se pudieron leer los viajes offline:", error);
  }

  const porViaje = new Map();
  listarDocumentosOffline().forEach((guardado) => {
    if (!porViaje.has(guardado.idViaje)) {
      porViaje.set(guardado.idViaje, {
        idViaje: guardado.idViaje,
        titulo: titulos.get(guardado.idViaje) || "Viaje",
        documentos: [],
        tamanoBytes: 0,
      });
    }
    const viaje = porViaje.get(guardado.idViaje);
    viaje.documentos.push(guardado);
    viaje.tamanoBytes += guardado.tamanoBytes;
  });

  const viajes = Array.from(porViaje.values());
  return {
    viajes,
    totalBytes: viajes.reduce((total, viaje) => total + viaje.tamanoBytes, 0),
  };
}

export async function sincronizarViajeOffline(idViaje) {
  if (!habilitado()) return;

  let detalle;
  try {
    detalle = await getTripDetail(idViaje);
  } catch (error) {
    if (error?.status === 403 || error?.status === 404) {
      eliminarViajeOffline(idViaje);
      return;
    }
    throw error;
  }

  guardarItinerarioOffline(detalle);
  if (!viajeDisponibleOffline(detalle)) return;

  const locales = listarDocumentosOffline(idViaje);
  if (locales.length === 0) return;

  const remotos = await getTripDocuments(idViaje);
  const remotosPorId = new Map((Array.isArray(remotos) ? remotos : []).map((d) => [d.IdDocumento, d]));

  for (const local of locales) {
    const remoto = remotosPorId.get(local.idDocumento);
    if (!remoto) {
      quitarDocumentoOffline(local.idDocumento);
      continue;
    }
    if (versionDocumento(remoto) !== local.version) {
      try {
        await guardarDocumentoOffline(remoto);
      } catch (error) {
        console.log("No se pudo actualizar el documento offline:", error?.message);
      }
    } else {
      actualizarDatosDocumentoOffline(remoto);
    }
  }
}

async function obtenerAccesoOffline(token) {
  const response = await fetch(`${resolveApiBaseUrl()}/offline/access`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const error = new Error("No se pudo consultar el acceso offline");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function sincronizarOffline() {
  if (!habilitado() || sincronizando) return;

  const token = await getStoredToken();
  if (!token) return;

  sincronizando = true;
  try {
    const acceso = await obtenerAccesoOffline(token);
    const permitidos = new Set(acceso?.IdsViajes ?? []);

    for (const idViaje of listarIdsViajesOffline()) {
      if (!permitidos.has(idViaje)) {
        eliminarViajeOffline(idViaje);
        continue;
      }
      try {
        await sincronizarViajeOffline(idViaje);
      } catch (error) {
        if (esErrorDeRed(error)) break;
      }
    }
  } catch (error) {
    console.log("No se pudo sincronizar la información offline:", error?.message);
  } finally {
    sincronizando = false;
  }
}