import { Platform } from "react-native";
import { File, UploadType } from "expo-file-system";

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

export async function getStoredToken() {
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

function resolveWsBaseUrl() {
  return API_BASE_URL.replace(/^http/, "ws").replace(/\/api\/v1$/, "");
}

export async function getItinerarySocketUrl(tripId) {
  const token = await getStoredToken();
  const wsBase = resolveWsBaseUrl();
  return `${wsBase}/ws/trips/${tripId}/itinerary?token=${encodeURIComponent(token ?? "")}`;
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

export async function loginWithGoogle(idToken) {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  return parseResponse(response, "No se pudo iniciar sesión con Google");
}

export async function loginWithFacebook(accessToken) {
  const response = await fetch(`${API_BASE_URL}/auth/facebook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  return parseResponse(response, "No se pudo iniciar sesión con Facebook");
}

export async function registerWithFacebook(accessToken, aceptaTerminos) {
  const response = await fetch(`${API_BASE_URL}/auth/register/facebook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken,
      aceptaTerminos,
    }),
  });

  return parseResponse(
    response,
    "No se pudo completar el registro con Facebook"
  );
}

export async function registerWithGoogle(idToken, aceptaTerminos) {
  const response = await fetch(`${API_BASE_URL}/auth/register/google`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idToken,
      aceptaTerminos,
    }),
  });

  return parseResponse(
    response,
    "No se pudo completar el registro con Google"
  );
}

export async function getTrips() {
  const response = await fetch(`${API_BASE_URL}/trips`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudieron obtener los viajes");
}

export async function getTripDetail(tripId) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudo obtener el detalle del viaje");
}

export async function getTripPlaces(tripId) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/places`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudieron obtener los lugares de interés");
}

export async function searchTripPlaces(tripId, query) {
  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/places/search?q=${encodeURIComponent(query)}`,
    {
      headers: await authHeaders(),
    }
  );
  return parseResponse(response, "No se pudieron buscar lugares");
}

export async function getTripPopularPlaces(tripId, lat, lng, limit = 6) {
  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/places/popular?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&limit=${encodeURIComponent(limit)}`,
    {
      headers: await authHeaders(),
    }
  );
  return parseResponse(response, "No se pudieron obtener los lugares populares");
}

export async function getNearbyPlaces(tripId, lat, lng, category, radius = 2000, limit = 20) {
  const params = new URLSearchParams();
  params.set("lat", String(lat));
  params.set("lng", String(lng));
  if (category) {
    params.set("category", category);
  }
  params.set("radius", String(radius));
  params.set("limit", String(limit));

  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/places/nearby?${params.toString()}`,
    {
      headers: await authHeaders(),
    }
  );
  return parseResponse(response, "No se pudieron obtener los puntos de interés cercanos");
}

export async function getTripPlaceDetail(tripId, tripPlaceId) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/places/${tripPlaceId}`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudo obtener el detalle del lugar");
}

export async function getPlaceDetails(tripId, placeId) {
  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/places/details?placeId=${encodeURIComponent(placeId)}`,
    {
      headers: await authHeaders(),
    }
  );
  return parseResponse(response, "No se pudieron obtener las reseñas del lugar");
}

export async function saveTripPlace(tripId, payload) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/places`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "No se pudo guardar el lugar en el viaje");
}

export async function scheduleTripPlace(tripId, tripPlaceId, payload) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/places/${tripPlaceId}/schedule`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "No se pudo agregar el lugar al itinerario");
}

export async function updateTrip(tripId, payload) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}`, {
    method: "PUT",
    headers: {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "No se pudieron guardar los cambios del viaje");
}

export async function addTripParticipant(tripId, payload) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/participants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "No se pudo agregar el participante");
}

export async function removeTripParticipant(tripId, userId) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/participants/${userId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudo quitar el participante");
}

export async function removeTripExternalInvitation(tripId, email) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/external-invitations`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify({ email }),
  });
  return parseResponse(response, "No se pudo quitar la invitación externa");
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

export async function getTripSettlement(tripId) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/settlement`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudo obtener la liquidación del viaje");
}

export async function rebuildTripSettlement(tripId) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/settlement/rebuild`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
  });
  return parseResponse(response, "No se pudo recalcular la liquidación");
}

export async function markSettlementTransferPaid(tripId, transferId, realizada = true) {
  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/settlement/transfers/${transferId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify({ Realizada: realizada }),
    }
  );
  return parseResponse(response, "No se pudo actualizar la transferencia");
}

export async function getCurrencies() {
  const response = await fetch(`${API_BASE_URL}/monedas`, {
    headers: await authHeaders(),
  });

  return parseResponse(
    response,
    "No se pudieron obtener las monedas"
  );
}

export async function searchCurrencies(search = "") {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.set("q", search.trim());
  }

  const response = await fetch(
    `${API_BASE_URL}/monedas/search?${params.toString()}`,
    {
      headers: await authHeaders(),
    }
  );

  return parseResponse(response, "No se pudieron obtener las monedas");
}

export async function searchDestinations(query) {
  const response = await fetch(
    `${API_BASE_URL}/trips/search?q=${encodeURIComponent(query)}`,
    {
      headers: await authHeaders(),
    }
  );
  return parseResponse(response, "No se pudieron buscar destinos");
}

export async function createVotacion(payload) {
  const response = await fetch(`${API_BASE_URL}/votaciones/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "No se pudo crear la votación");
}

export async function getVotaciones(idViaje) {
  const response = await fetch(`${API_BASE_URL}/votaciones?idViaje=${idViaje}`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudieron obtener las votaciones");
}

export async function getResultadosVotacion(idVotacion) {
  const response = await fetch(`${API_BASE_URL}/votaciones/${idVotacion}/resultados`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudieron obtener los resultados");
}

export async function getProgresoVotacion(idVotacion) {
  const response = await fetch(`${API_BASE_URL}/votaciones/${idVotacion}/progreso`, {
    headers: await authHeaders(),
  });
  return parseResponse(response, "No se pudo obtener el progreso de la votación");
}

export async function emitirVoto(idVotacion, idPropuestas) {
  const response = await fetch(`${API_BASE_URL}/votaciones/${idVotacion}/votar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify({ idPropuestas }),
  });
  return parseResponse(response, "No se pudo registrar el voto");
}

export async function cancelarVotacion(idVotacion) {
  const response = await fetch(`${API_BASE_URL}/votaciones/${idVotacion}/cancelar`, {
    method: "POST",
    headers: {
      ...(await authHeaders()),
    },
    body: JSON.stringify({}),
  });
  return parseResponse(response, "No se pudo cancelar la votación");
}

export async function createActivity(tripId, dayId, payload) {
  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/days/${dayId}/activities`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify(payload),
    }
  );
  return parseResponse(response, "No se pudo crear la actividad");
}

export async function updateActivity(tripId, dayId, activityId, payload) {
  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/days/${dayId}/activities/${activityId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeaders()),
      },
      body: JSON.stringify(payload),
    }
  );

  return parseResponse(response, "No se pudo actualizar la actividad");
}


export async function deleteActivity(tripId, dayId, activityId) {
  const response = await fetch(
    `${API_BASE_URL}/trips/${tripId}/days/${dayId}/activities/${activityId}`,
    {
      method: "DELETE",
      headers: await authHeaders(),
    }
  );
  return parseResponse(response, "No se pudo eliminar la actividad");
}


export async function deleteTrip(tripId) {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
  });

if (response.ok) {
    return true; 
  }

  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.detail || "No se pudo dar de baja el viaje.");
}

export async function getDocumentCategories() {
  const response = await fetch(
    `${API_BASE_URL}/trips/documents/categories`,
    {
      headers: await authHeaders(),
    }
  );

  return parseResponse(
    response,
    "No se pudieron obtener las categorías de documentos"
  );
}

export async function uploadTripDocument(
  tripId,
  archivo,
  idCategoriaDocumento,
  nombreArchivo
) {
  const token = await getStoredToken();
  const fileType = archivo.mimeType || archivo.type || "application/octet-stream";

  if (Platform.OS === "web") {
    const formData = new FormData();
    const safeName = nombreArchivo || archivo.name || "documento.pdf";

    if (archivo.file instanceof Blob || archivo.file instanceof File) {
      formData.append("archivo", archivo.file, safeName);
    } else if (archivo.uri && archivo.uri.startsWith("blob:")) {
      const response = await fetch(archivo.uri);
      const blob = await response.blob();
      formData.append("archivo", blob, safeName);
    } else {
      formData.append("archivo", archivo, safeName);
    }
    formData.append("IdCategoriaDocumento", String(idCategoriaDocumento));
    if (nombreArchivo) formData.append("NombreArchivo", nombreArchivo);

    const response = await fetch(`${API_BASE_URL}/trips/${tripId}/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    return parseResponse(response, "No se pudo subir el documento");
  } else {
    // Nativo: API nueva de expo-file-system (SDK 54+)
    const file = new File(archivo.uri);

    const parameters = {
      IdCategoriaDocumento: String(idCategoriaDocumento),
    };
    if (nombreArchivo) {
      parameters.NombreArchivo = nombreArchivo;
    }

    const result = await file.upload(
      `${API_BASE_URL}/trips/${tripId}/documents`,
      {
        httpMethod: "POST",
        uploadType: UploadType.MULTIPART,
        fieldName: "archivo",
        mimeType: fileType,
        parameters,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // result: { status, headers, body } — no es un Response de fetch
    if (result.status < 200 || result.status >= 300) {
      let mensaje = "No se pudo subir el documento";
      try {
        const parsed = JSON.parse(result.body);
        mensaje = parsed.detail || parsed.message || mensaje;
      } catch (e) {}
      throw new Error(mensaje);
    }

    try {
      return JSON.parse(result.body);
    } catch (e) {
      return result.body;
    }
  }
}

export async function getTripDocuments(tripId) {
  const token = await getStoredToken();

  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/documents`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response, "No se pudieron cargar los documentos del viaje");
}