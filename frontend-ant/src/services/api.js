const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

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
    } else {
      message = fallbackMessage;
    }
  } catch {
    message = fallbackMessage;
  }

  throw new Error(message);
}

export async function getTrips() {
  const response = await fetch(`${API_BASE_URL}/trips`);
  return parseResponse(response, "No se pudieron obtener los viajes");
}

export async function getUsers(search = "", limit = 8) {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set("q", search.trim());
  }
  params.set("limit", String(limit));

  const response = await fetch(`${API_BASE_URL}/users?${params.toString()}`);
  return parseResponse(response, "No se pudieron obtener los usuarios");
}

export async function getCurrentUser() {
  const response = await fetch(`${API_BASE_URL}/users/me`);
  return parseResponse(response, "No se pudo obtener el usuario actual");
}

export async function createTrip(payload) {
  const response = await fetch(`${API_BASE_URL}/trips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response, "No se pudo crear el viaje");
}
