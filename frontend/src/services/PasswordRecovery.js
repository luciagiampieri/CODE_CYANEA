import { Platform } from "react-native";

function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;
  }
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000/api/v1";
  }
  return "http://127.0.0.1:8000/api/v1";
}

const API_BASE_URL = resolveApiBaseUrl();

async function postJson(path, body, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return response.json();
  }

  let message = fallbackMessage;
  try {
    const data = await response.json();
    if (Array.isArray(data.detail)) {
      message = data.detail.map((item) => item.msg ?? item.message ?? JSON.stringify(item)).join(". ");
    } else if (typeof data.detail === "string") {
      message = data.detail;
    }
  } catch {
    message = fallbackMessage;
  }

  const error = new Error(message);
  error.status = response.status;
  throw error;
}

export async function requestPasswordReset(email) {
  return postJson("/auth/forgot-password", { email }, "No se pudo enviar el enlace de recuperación");
}

export async function validateResetToken(token) {
  return postJson("/auth/reset-password/validate", { token }, "El enlace de recuperación no es válido");
}

export async function resetPassword(token, password, confirmPassword) {
  return postJson(
    "/auth/reset-password",
    { token, password, confirmPassword },
    "No se pudo restablecer la contraseña"
  );
}