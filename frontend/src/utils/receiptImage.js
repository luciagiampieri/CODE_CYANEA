/**
 * Validación y compresión de la imagen de un comprobante (US 93).
 *
 * - AC3: solo JPG, JPEG o PNG y hasta 10 MB. El tamaño se valida sobre la
 *   imagen ORIGINAL, antes de comprimir. El backend vuelve a validar formato
 *   (por la firma real del archivo) y tamaño como red de seguridad.
 * - Las fotos HEIC/HEIF del iPhone se aceptan en el celular porque la
 *   compresión las convierte a JPEG antes del envío: lo que llega al servicio
 *   siempre es JPEG. En web se rechazan porque los navegadores no las leen.
 * - AC4 / RNF-02: se reduce a 1600 px en el lado mayor y se guarda como JPEG
 *   con calidad 0,7 para ahorrar datos móviles. Más resolución no mejora la
 *   lectura del ticket.
 */
import { Platform } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_MAX_DIMENSION = 1600;
export const RECEIPT_JPEG_QUALITY = 0.7;

const MIME_PERMITIDOS = new Set(["image/jpeg", "image/jpg", "image/png"]);
const EXTENSIONES_PERMITIDAS = new Set(["jpg", "jpeg", "png"]);
// Formato por defecto de las fotos de iPhone; se convierten a JPEG en el dispositivo.
const MIME_CONVERTIBLES = new Set(["image/heic", "image/heif"]);
const EXTENSIONES_CONVERTIBLES = new Set(["heic", "heif"]);

export const MENSAJE_FORMATO_INVALIDO =
  "Formato no soportado. Solo se permiten imágenes JPG, JPEG o PNG.";
export const MENSAJE_TAMANIO_EXCEDIDO = "La imagen supera el tamaño máximo de 10 MB.";

function extensionDe(nombre) {
  if (!nombre) return null;
  const limpio = String(nombre).split(/[?#]/)[0];
  const punto = limpio.lastIndexOf(".");
  if (punto < 0) return null;
  return limpio.slice(punto + 1).toLowerCase();
}

function mimeDeDataUri(uri) {
  const match = /^data:([^;,]+)[;,]/i.exec(String(uri || ""));
  return match ? match[1].toLowerCase() : null;
}

/** Tipo MIME del asset según lo que informe el picker, un data URI o la extensión. */
export function resolverMime(asset) {
  const declarado = (asset?.mimeType || asset?.type || asset?.file?.type || "").toLowerCase();
  if (declarado.includes("/")) return declarado;

  const deDataUri = mimeDeDataUri(asset?.uri);
  if (deDataUri) return deDataUri;

  const extension = extensionDe(asset?.fileName) || extensionDe(asset?.file?.name) || extensionDe(asset?.uri);
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (EXTENSIONES_CONVERTIBLES.has(extension)) return `image/${extension}`;
  return extension ? `image/${extension}` : null;
}

/** Tamaño en bytes si el picker lo informa; null si no se conoce. */
export function resolverTamanio(asset) {
  const tamanio = asset?.fileSize ?? asset?.file?.size;
  return typeof tamanio === "number" && tamanio >= 0 ? tamanio : null;
}

/**
 * Valida formato y tamaño del asset elegido (AC3).
 * @param plataforma permite probar el comportamiento de web y de mobile.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validarImagenComprobante(asset, plataforma = Platform.OS) {
  if (!asset?.uri) {
    return { ok: false, message: MENSAJE_FORMATO_INVALIDO };
  }

  const mime = resolverMime(asset);
  const extension = extensionDe(asset.fileName) || extensionDe(asset.file?.name);
  const aceptaConvertibles = plataforma !== "web";
  const formatoValido = mime
    ? MIME_PERMITIDOS.has(mime) || (aceptaConvertibles && MIME_CONVERTIBLES.has(mime))
    : extension !== null &&
      (EXTENSIONES_PERMITIDAS.has(extension) ||
        (aceptaConvertibles && EXTENSIONES_CONVERTIBLES.has(extension)));
  if (!formatoValido) {
    return { ok: false, message: MENSAJE_FORMATO_INVALIDO };
  }

  const tamanio = resolverTamanio(asset);
  if (tamanio !== null && tamanio > RECEIPT_MAX_BYTES) {
    return { ok: false, message: MENSAJE_TAMANIO_EXCEDIDO };
  }

  return { ok: true };
}

/** Nuevas dimensiones para que el lado mayor no supere el máximo; null si no hace falta achicar. */
export function calcularRedimension(ancho, alto, maximo = RECEIPT_MAX_DIMENSION) {
  if (!ancho || !alto) return { width: maximo };
  if (Math.max(ancho, alto) <= maximo) return null;
  return ancho >= alto ? { width: maximo } : { height: maximo };
}

/**
 * Comprime la imagen del comprobante antes de enviarla (AC4).
 * Siempre devuelve un JPEG, aunque el original fuera PNG.
 */
export async function comprimirImagenComprobante(asset) {
  const contexto = ImageManipulator.manipulate(asset.uri);
  const redimension = calcularRedimension(asset.width, asset.height);
  if (redimension) {
    contexto.resize(redimension);
  }

  const imagen = await contexto.renderAsync();
  const resultado = await imagen.saveAsync({
    compress: RECEIPT_JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  return {
    uri: resultado.uri,
    width: resultado.width,
    height: resultado.height,
    mimeType: "image/jpeg",
    // En web el manipulador devuelve un data URI o blob URI; api.js lo convierte en Blob.
    fileName: "comprobante.jpg",
  };
}
