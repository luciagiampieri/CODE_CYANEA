import { getStoredToken, resolveApiBaseUrl } from "./api";

async function pedir(ruta, { method = "GET" } = {}, mensajeError) {
  const token = await getStoredToken();
  const response = await fetch(`${resolveApiBaseUrl()}/legal/terms${ruta}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (response.ok) {
    return response.json();
  }

  let message = mensajeError;
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") message = data.detail;
  } catch {
  }
  const error = new Error(message);
  error.status = response.status;
  throw error;
}


export function getTermsAcceptance() {
  return pedir("/acceptance", {}, "No se pudo verificar la aceptación de los términos");
}

export function acceptTerms() {
  return pedir("/accept", { method: "POST" }, "No se pudo registrar tu aceptación");
}