const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const CLAVE_TOKEN = 'cyanea.backoffice.token';

let alExpirarSesion = null;

function almacenamiento() {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage;
  }
  return null;
}

export function obtenerToken() {
  return almacenamiento()?.getItem(CLAVE_TOKEN) ?? null;
}

function guardarToken(token) {
  almacenamiento()?.setItem(CLAVE_TOKEN, token);
}

function borrarToken() {
  almacenamiento()?.removeItem(CLAVE_TOKEN);
}

export function registrarExpiracionSesion(callback) {
  alExpirarSesion = callback;
}

async function solicitar(ruta, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = obtenerToken();
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let respuesta;
  try {
    respuesta = await fetch(`${BASE_URL}/backoffice${ruta}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }

  if (respuesta.status === 204) {
    return null;
  }

  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok) {
    if (auth && respuesta.status === 401) {
      borrarToken();
      alExpirarSesion?.();
    }
    const error = new Error(
      typeof datos?.detail === 'string' ? datos.detail : 'Ocurrió un error inesperado.'
    );
    error.status = respuesta.status;
    throw error;
  }

  return datos;
}

export async function iniciarSesion(email, password) {
  const datos = await solicitar('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  guardarToken(datos.access_token);
  return obtenerAdminActual();
}

export function obtenerAdminActual() {
  return solicitar('/auth/me');
}

export async function cerrarSesion() {
  try {
    await solicitar('/auth/logout', { method: 'POST' });
  } catch {
  } finally {
    borrarToken();
  }
}