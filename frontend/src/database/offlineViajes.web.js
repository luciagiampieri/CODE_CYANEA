const PREFIJO_ITINERARIO = "cyanea:offline:itinerario:";
const CLAVE_INDICE_DOCS = "cyanea:offline:documentos";
const PREFIJO_ARCHIVO = "cyanea:offline:archivo:";
const TAMANIO_MAXIMO = 4 * 1024 * 1024;

function storage() {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function errorConCodigo(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function leerJSON(clave, porDefecto) {
  try {
    const valor = storage()?.getItem(clave);
    return valor ? JSON.parse(valor) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function offlineDisponible() {
  return storage() !== null;
}

export function esErrorDeRed(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error) return false;
  if (error instanceof TypeError) return true;  
  const mensaje = String(error.message ?? "").toLowerCase();
  return error.status == null && /network|failed to fetch|load failed|conexi/.test(mensaje);
}


export function guardarItinerarioOffline(detalle) {
  const id = detalle?.id ?? detalle?.IdViaje;
  if (!id || !storage()) return null;
  const sincronizadoEn = new Date().toISOString();
  try {
    storage().setItem(PREFIJO_ITINERARIO + id, JSON.stringify({ detalle, sincronizadoEn }));
    return sincronizadoEn;
  } catch {
    return null;
  }
}

export function obtenerItinerarioOffline(idViaje) {
  return leerJSON(PREFIJO_ITINERARIO + idViaje, null);
}


function leerIndice() {
  return leerJSON(CLAVE_INDICE_DOCS, {});
}

function escribirIndice(indice) {
  storage()?.setItem(CLAVE_INDICE_DOCS, JSON.stringify(indice));
}

export function listarDocumentosOffline(idViaje) {
  if (!storage()) return [];
  return Object.values(leerIndice())
    .filter((item) => String(item.idViaje) === String(idViaje))
    .map((item) => ({
      idDocumento: item.idDocumento,
      documento: item.documento,
      uri: storage().getItem(PREFIJO_ARCHIVO + item.idDocumento),
    }))
    .filter((item) => item.uri);
}

function blobADataUrl(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

export async function guardarDocumentoOffline(documento, idViaje) {
  if (!storage()) {
    throw errorConCodigo("NO_DISPONIBLE", "Este navegador no permite guardar documentos sin conexión.");
  }
  const idDoc = documento.IdDocumento;
  const viaje = idViaje ?? documento.IdViaje ?? documento.idViaje;

  let blob;
  try {
    const respuesta = await fetch(documento.UrlArchivo);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    blob = await respuesta.blob();
  } catch (error) {
    if (navigator.onLine === false) throw error;
    throw errorConCodigo(
      "NO_DISPONIBLE",
      "No se pudo descargar el archivo para guardarlo. Intentá nuevamente."
    );
  }

  if (blob.size > TAMANIO_MAXIMO) {
    throw errorConCodigo(
      "ESPACIO_INSUFICIENTE",
      "El archivo es demasiado grande para guardarlo sin conexión en el navegador (máx. 4 MB)."
    );
  }

  const dataUrl = await blobADataUrl(blob);
  try {
    storage().setItem(PREFIJO_ARCHIVO + idDoc, dataUrl);
    const indice = leerIndice();
    indice[idDoc] = { idDocumento: idDoc, idViaje: viaje, documento, guardadoEn: new Date().toISOString() };
    escribirIndice(indice);
  } catch {
    storage().removeItem(PREFIJO_ARCHIVO + idDoc);
    throw errorConCodigo(
      "ESPACIO_INSUFICIENTE",
      "No hay espacio suficiente en el navegador. Quitá otros documentos guardados e intentá de nuevo."
    );
  }
}

export function quitarDocumentoOffline(idDocumento) {
  if (!storage()) return;
  storage().removeItem(PREFIJO_ARCHIVO + idDocumento);
  const indice = leerIndice();
  delete indice[idDocumento];
  escribirIndice(indice);
}

export async function sincronizarOffline() {
  return null;
}