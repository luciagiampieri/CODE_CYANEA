import { Platform } from "react-native";

const AUTH_TOKEN_KEY = "auth_token";

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

async function getStoredToken() {
  try {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    }
    const SecureStore = await import("expo-secure-store");
    return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function authHeaders() {
  const token = await getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(response, fallbackMessage) {
  if (response.ok) {
    return response.json();
  }

  let message = fallbackMessage;
  try {
    const data = await response.json();
    if (Array.isArray(data.detail)) {
      message = data.detail
        .map((item) => item.msg ?? item.message ?? JSON.stringify(item))
        .join(". ");
    } else if (typeof data.detail === "string") {
      message = data.detail;
    }
  } catch {
    message = fallbackMessage;
  }

  throw new Error(message);
}

export async function loginUser(email, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseResponse(response, "No se pudo iniciar sesión");
}

export async function getTrips() {
  const response = await fetch(`${API_BASE_URL}/trips`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudieron obtener los viajes");
}

export async function getUsers(search = "", limit = 8) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  params.set("limit", String(limit));

  const response = await fetch(`${API_BASE_URL}/users?${params.toString()}`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudieron obtener los usuarios");
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/users/me`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudo obtener el usuario actual");
}

export async function createTrip(payload) {
  const response = await fetch(`${API_BASE_URL}/trips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "No se pudo crear el viaje");
}

export async function getPendingInvitations() {
  const response = await fetch(`${API_BASE_URL}/trips/invitations/pending`, {
    headers: await authHeaders(), 
  });
  return parseResponse(response, "No se pudieron obtener las invitaciones pendientes");
}

export async function respondToInvitation(tripId, decision) {
  const response = await fetch(`${API_BASE_URL}/trips/invitations/${tripId}/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()), 
    },
    body: JSON.stringify({ decision }),
  });
  return parseResponse(response, "No se pudo procesar la respuesta a la invitación");
}

export async function getExpenseCategories() {
  const response = await fetch(`${API_BASE_URL}/gastos/categories`, {
    headers: await authHeaders(),
  });

  return parseResponse(
    response,
    "No se pudieron obtener las categorías"
  );
}

export async function getTripParticipants(tripId) {
  const response = await fetch(
    `${API_BASE_URL}/gastos/trips/${tripId}/participants`,
    {
      headers: await authHeaders(),
    }
  );

  return parseResponse(
    response,
    "No se pudieron obtener los participantes"
  );
}

export async function createExpense(payload) {
  const response = await fetch(`${API_BASE_URL}/gastos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(
    response,
    "No se pudo crear el gasto"
  );
}