import { Platform } from "react-native";

import * as api from "../services/api";

const TOKEN = "Bearer token-test";
const PLATAFORMA_ORIGINAL = Platform.OS;

function respuesta({ ok = true, status = 200, body = {}, headers = {} } = {}) {
  return {
    ok,
    status,
    headers: { get: (nombre) => headers[nombre] ?? null },
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
    blob: async () => "contenido-binario",
  };
}

function respuestaError(status, body, headers = {}) {
  return respuesta({ ok: false, status, body, headers });
}

beforeAll(() => {
  Platform.OS = "web";
});

afterAll(() => {
  Platform.OS = PLATAFORMA_ORIGINAL;
});

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve(respuesta()));
  global.localStorage = { getItem: jest.fn(() => "token-test") };
  global.URL.createObjectURL = jest.fn(() => "blob:foto");
});

const PUBLICAS = new Set([
  "resendConfirmation",
  "loginUser",
  "loginWithGoogle",
  "loginWithFacebook",
  "registerWithFacebook",
  "registerWithGoogle",
  "getTerms",
  "previewSharedInvitation",
]);

const DATOS = { campo: "valor" };

const CASOS = [
  ["resendConfirmation", "POST", "/auth/resend-confirmation", ["  ANA@Test.com "], { email: "ana@test.com" }],
  ["loginUser", "POST", "/auth/login", ["ana@test.com", "Clave123!"], { email: "ana@test.com", password: "Clave123!" }],
  ["loginWithGoogle", "POST", "/auth/google", ["id-token"], { idToken: "id-token" }],
  ["loginWithFacebook", "POST", "/auth/facebook", ["fb-token"], { accessToken: "fb-token" }],
  ["registerWithFacebook", "POST", "/auth/register/facebook", ["fb-token", true], { accessToken: "fb-token", aceptaTerminos: true }],
  ["registerWithGoogle", "POST", "/auth/register/google", ["id-token", true], { idToken: "id-token", aceptaTerminos: true }],
  ["getTerms", "GET", "/legal/terms", []],
  ["getTrips", "GET", "/trips", []],
  ["getTripDetail", "GET", "/trips/7", [7]],
  ["generateTripRoute", "POST", "/trips/7/days/3/route", [7, 3], { modo: "walking" }],
  ["getTripPlaces", "GET", "/trips/7/places", [7]],
  ["searchTripPlaces", "GET", "/trips/7/places/search?q=museo&sessionToken=s1", [7, "museo", "s1"]],
  ["resolveTripPlace", "GET", "/trips/7/places/resolve?placeId=p1", [7, "p1"]],
  ["getTripPopularPlaces", "GET", "/trips/7/places/popular?lat=-31.4&lng=-64.2&limit=6", [7, -31.4, -64.2]],
  ["getNearbyPlaces", "GET", "/trips/7/places/nearby?lat=1&lng=2&category=museum&radius=2000&limit=20", [7, 1, 2, "museum"]],
  ["getTripPlaceDetail", "GET", "/trips/7/places/9", [7, 9]],
  ["getPlaceDetails", "GET", "/trips/7/places/details?placeId=p%201", [7, "p 1"]],
  ["saveTripPlace", "POST", "/trips/7/places", [7, DATOS], DATOS],
  ["saveActivityLocation", "POST", "/trips/7/places/location", [7, DATOS], DATOS],
  ["scheduleTripPlace", "POST", "/trips/7/places/9/schedule?ignorar_advertencia=true", [7, 9, DATOS, { ignorarAdvertencia: true }], DATOS],
  ["updateTrip", "PUT", "/trips/7", [7, DATOS], DATOS],
  ["addTripParticipant", "POST", "/trips/7/participants", [7, { userId: 2 }], { userId: 2 }],
  ["removeTripParticipant", "DELETE", "/trips/7/participants/2", [7, 2]],
  ["removeTripExternalInvitation", "DELETE", "/trips/7/external-invitations", [7, "x@y.com"], { email: "x@y.com" }],
  ["getSentInvitations", "GET", "/trips/7/invitations/sent?estado=pendiente", [7, "pendiente"]],
  ["cancelSentInvitation", "POST", "/trips/7/invitations/2/cancel", [7, 2]],
  ["getUsers", "GET", "/users?q=ana&limit=5", [" ana ", 5]],
  ["getCurrentUser", "GET", "/users/me", []],
  ["getMyLimits", "GET", "/users/me/limites", []],
  ["changePassword", "PUT", "/users/me/password", [{ passwordActual: "a", passwordNueva: "b", confirmacion: "b" }], { passwordActual: "a", passwordNueva: "b", confirmacion: "b" }],
  ["getPrivacySettings", "GET", "/users/me/privacidad", []],
  ["updatePrivacySettings", "PUT", "/users/me/privacidad", [DATOS], DATOS],
  ["verifyPassword", "POST", "/users/me/verify-password", ["Clave123!"], { password: "Clave123!" }],
  ["getPaisesVisitados", "GET", "/users/me/paises-visitados", []],
  ["updateCurrentUser", "PUT", "/users/me", [DATOS], DATOS],
  ["registerPushToken", "POST", "/users/me/push-tokens", [DATOS], DATOS],
  ["revokePushToken", "POST", "/users/me/push-tokens/revoke", [DATOS], DATOS],
  ["createTrip", "POST", "/trips", [DATOS], DATOS],
  ["getPendingInvitations", "GET", "/trips/invitations/pending", []],
  ["respondToInvitation", "POST", "/trips/invitations/7/respond", [7, "aceptar"], { decision: "aceptar" }],
  ["getExpenseCategories", "GET", "/gastos/categories", []],
  ["getTripExpenses", "GET", "/gastos/trips/7?categoria=Comida", [7, "Comida"]],
  ["getTripParticipants", "GET", "/gastos/trips/7/participants", [7]],
  ["createExpense", "POST", "/gastos", [DATOS], DATOS],
  [
    "getPossibleDuplicateExpenses",
    "GET",
    "/gastos/trips/7/posibles-duplicados?fecha_gasto=2026-10-01&monto_original=100&moneda_original=ARS&es_compartido=true&id_pagador=3",
    [7, { FechaGasto: "2026-10-01", MontoOriginal: 100, MonedaOriginal: "ARS", EsCompartido: true, IdPagador: 3 }],
  ],
  ["deleteExpense", "DELETE", "/gastos/5?eliminar_comprobante=true", [5, { eliminarComprobante: true }]],
  ["getExpenseDetail", "GET", "/gastos/5", [5]],
  ["updateExpense", "PUT", "/gastos/5", [5, DATOS], DATOS],
  ["updateAiConsent", "PUT", "/users/me/consentimiento-ia", [true], { consiente: true }],
  ["getTripSettlement", "GET", "/trips/7/settlement", [7]],
  ["getMySettlementBalance", "GET", "/trips/7/settlement/mi-saldo", [7]],
  ["rebuildTripSettlement", "POST", "/trips/7/settlement/rebuild", [7]],
  ["reportSettlementTransfer", "POST", "/trips/7/settlement/transfers/4/informar", [7, 4]],
  ["rejectSettlementTransfer", "POST", "/trips/7/settlement/transfers/4/rechazar", [7, 4]],
  ["markSettlementTransferPaid", "PATCH", "/trips/7/settlement/transfers/4", [7, 4], { Realizada: true }],
  ["getCurrencies", "GET", "/monedas", []],
  ["getExchangeRate", "GET", "/monedas/cotizacion?origen=USD&destino=ARS&monto=10&fecha=2026-10-01", [{ origen: "USD", monto: 10, fecha: "2026-10-01" }]],
  ["searchCurrencies", "GET", "/monedas/search?q=dol", [" dol "]],
  ["searchDestinations", "GET", "/trips/search?q=C%C3%B3rdoba&sessionToken=s1", ["Córdoba", "s1"]],
  ["resolveDestination", "GET", "/trips/destinations/resolve?placeId=p1", ["p1"]],
  ["createVotacion", "POST", "/votaciones", [DATOS], DATOS],
  ["getVotaciones", "GET", "/votaciones?idViaje=7", [7]],
  ["getResultadosVotacion", "GET", "/votaciones/2/resultados", [2]],
  ["getProgresoVotacion", "GET", "/votaciones/2/progreso", [2]],
  ["emitirVoto", "POST", "/votaciones/2/votar", [2, [1, 3]], { idPropuestas: [1, 3] }],
  ["cancelarVotacion", "POST", "/votaciones/2/cancelar", [2], {}],
  ["createActivity", "POST", "/trips/7/days/3/activities?ignorar_advertencia=true", [7, 3, DATOS, { ignorarAdvertencia: true }], DATOS],
  ["updateActivity", "PUT", "/trips/7/days/3/activities/8", [7, 3, 8, DATOS], DATOS],
  ["deleteActivity", "DELETE", "/trips/7/days/3/activities/8?confirmar_eliminar_tareas=true", [7, 3, 8, { confirmarEliminarTareas: true }]],
  ["getDocumentCategories", "GET", "/trips/documents/categories", []],
  ["getTripDocuments", "GET", "/trips/7/documents", [7]],
  ["getTripStorage", "GET", "/trips/7/documents/almacenamiento", [7]],
  ["deleteTripDocument", "DELETE", "/trips/7/documents/5", [7, 5]],
  ["getRepositorioItems", "GET", "/trips/7/repositorio", [7]],
  ["createRepositorioItem", "POST", "/trips/7/repositorio", [7, DATOS], DATOS],
  ["updateRepositorioItem", "PUT", "/trips/7/repositorio/5", [7, 5, DATOS], DATOS],
  ["deleteRepositorioItem", "DELETE", "/trips/7/repositorio/5", [7, 5]],
  ["crearTareaEntradas", "POST", "/trips/7/activities/8/tarea-entradas", [7, 8, { tipo: "entradas" }], { tipo: "entradas", enlace: null, nombreLugar: null }],
  ["getChecklistCategories", "GET", "/trips/checklists/categorias", []],
  ["getChecklists", "GET", "/trips/7/checklists", [7]],
  ["createChecklist", "POST", "/trips/7/checklists", [7, DATOS], DATOS],
  ["updateChecklist", "PUT", "/trips/7/checklists/5", [7, 5, DATOS], DATOS],
  ["toggleChecklistCompletada", "PATCH", "/trips/7/checklists/5/completada", [7, 5, true], { Completada: true }],
  ["deleteChecklist", "DELETE", "/trips/7/checklists/5", [7, 5]],
  ["leaveTrip", "POST", "/trips/7/leave", [7, { confirmar: true }], { confirmar: true }],
  ["transferTripAdministration", "POST", "/trips/7/transferir-administracion", [7, 2], { nuevoAdministradorId: 2 }],
  ["getTripInvitationLink", "GET", "/trips/7/enlace-invitacion", [7]],
  ["createTripInvitationLink", "POST", "/trips/7/enlace-invitacion", [7, true], { renovar: true }],
  ["revokeTripInvitationLink", "DELETE", "/trips/7/enlace-invitacion", [7]],
  ["previewSharedInvitation", "GET", "/invitaciones/enlaces/a%20b", ["a b"]],
  ["joinTripByLink", "POST", "/invitaciones/enlaces/tok/unirse", ["tok"]],
  ["getNotifications", "GET", "/notificaciones", []],
  ["markNotificationAsRead", "PATCH", "/notificaciones/3/read", [3]],
  ["markAllNotificationsAsRead", "PATCH", "/notificaciones/read-all", []],
  ["removeTripCover", "DELETE", "/trips/7/cover", [7]],
  ["generateTripCoverAI", "POST", "/trips/7/cover/ai/generate", [7, "  playa  "], { prompt: "playa" }],
  ["generateCoverPreviewAI", "POST", "/trips/cover/ai/preview", [{ title: " Viaje ", destinations: ["Roma"], prompt: "" }], { title: "Viaje", destinations: ["Roma"], prompt: null }],
  ["acceptTripCoverAI", "POST", "/trips/7/cover/ai/accept", [7, "b64", "image/png"], { imageBase64: "b64", mimeType: "image/png" }],
  ["getPlanningPreferences", "GET", "/trips/7/preferencias-planificacion", [7]],
  ["getMyPlanningPreferences", "GET", "/users/me/preferencias-planificacion", []],
  ["savePlanningPreferences", "PUT", "/trips/7/preferencias-planificacion", [7, DATOS], DATOS],
  ["getActivitySuggestionsContext", "GET", "/trips/7/sugerencias-actividades/contexto", [7]],
  ["getActivitySuggestions", "GET", "/trips/7/sugerencias-actividades", [7]],
  ["requestActivitySuggestions", "POST", "/trips/7/sugerencias-actividades", [7, DATOS], DATOS],
  ["discardActivitySuggestion", "POST", "/trips/7/sugerencias-actividades/4/descartar", [7, 4]],
  ["acceptActivitySuggestion", "POST", "/trips/7/sugerencias-actividades/4/aceptar", [7, 4, DATOS], DATOS],
  ["getFreeItinerarySlots", "GET", "/trips/7/sugerencias-actividades/franjas-libres", [7]],
  ["completeFreeItinerarySlots", "POST", "/trips/7/sugerencias-actividades/completar-dias-libres", [7, { Franjas: [1] }], { Franjas: [1] }],
  ["createVotacionDesdeSugerencias", "POST", "/votaciones/desde-sugerencias", [DATOS], DATOS],
];

describe("endpoints de la API", () => {
  it.each(CASOS.map(([nombre, metodo, ruta, args, body = null]) => [nombre, metodo, ruta, args, body]))("%s llama a %s %s", async (nombre, metodo, ruta, args, body) => {
    await api[nombre](...args);

    const [url, opciones = {}] = fetch.mock.calls[0];
    expect(url.slice(-ruta.length)).toBe(ruta);
    expect((opciones.method ?? "GET").toUpperCase()).toBe(metodo);
    if (PUBLICAS.has(nombre)) {
      expect(opciones.headers?.Authorization).toBeUndefined();
    } else {
      expect(opciones.headers?.Authorization).toBe(TOKEN);
    }
    if (body !== null) {
      expect(JSON.parse(opciones.body)).toEqual(body);
    }
  });

  it("sin token guardado no manda Authorization", async () => {
    localStorage.getItem.mockReturnValueOnce(null);

    await api.getTrips();

    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it.each([
    ["getItinerarySocketUrl", [7], "/ws/trips/7/itinerary?token=token-test"],
    ["getExpenseEditSocketUrl", [5], "/api/v1/gastos/ws/5?token=token-test"],
    ["getNotificationsSocketUrl", [], "/api/v1/notificaciones/ws/notifications?token=token-test"],
  ])("%s arma la URL del websocket con el token", async (nombre, args, sufijo) => {
    const url = await api[nombre](...args);

    expect(url.startsWith("ws")).toBe(true);
    expect(url.slice(-sufijo.length)).toBe(sufijo);
  });
});

describe("manejo de errores", () => {
  it("usa el detail del backend como mensaje", async () => {
    fetch.mockResolvedValueOnce(respuestaError(400, { detail: "Dato inválido" }));

    await expect(api.getTrips()).rejects.toMatchObject({ message: "Dato inválido", status: 400, code: null });
  });

  it("une los errores de validación de FastAPI", async () => {
    fetch.mockResolvedValueOnce(
      respuestaError(422, { detail: [{ msg: "campo requerido" }, { message: "formato inválido" }, { x: 1 }] })
    );

    await expect(api.getTrips()).rejects.toThrow('campo requerido. formato inválido. {"x":1}');
  });

  it("expone el detalle estructurado del backend", async () => {
    const detalle = { codigo: "confirmar_tareas_entradas", mensaje: "Confirmá la eliminación", tareas: [1] };
    fetch.mockResolvedValueOnce(respuestaError(409, { detail: detalle }));

    await expect(api.deleteActivity(7, 3, 8)).rejects.toMatchObject({
      message: "Confirmá la eliminación",
      detalle,
    });
  });

  it("usa el mensaje por defecto si la respuesta no es JSON", async () => {
    fetch.mockResolvedValueOnce(respuestaError(500, new Error("no es JSON")));

    await expect(api.getTrips()).rejects.toThrow("No se pudieron obtener los viajes");
  });

  it.each([
    ["30", 30],
    ["abc", null],
    ["0", null],
  ])("con Retry-After %s expone retryAfter %s", async (valor, esperado) => {
    fetch.mockResolvedValueOnce(respuestaError(429, { detail: "Esperá" }, { "Retry-After": valor }));

    await expect(api.getTrips()).rejects.toMatchObject({ retryAfter: esperado });
  });

  it("avisa cuando el viaje finalizó y permite desuscribirse", async () => {
    const listener = jest.fn();
    const desuscribir = api.onTripFinishedError(listener);
    const finalizado = () =>
      respuestaError(409, { detail: "No se puede modificar" }, { "X-Error-Code": "TRIP_FINISHED" });

    fetch.mockResolvedValueOnce(finalizado());
    await expect(api.getTrips()).rejects.toMatchObject({ code: "TRIP_FINISHED" });
    expect(listener).toHaveBeenCalledTimes(1);

    desuscribir();
    fetch.mockResolvedValueOnce(finalizado());
    await expect(api.getTrips()).rejects.toMatchObject({ code: "TRIP_FINISHED" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("detecta el viaje finalizado por el mensaje aunque falte el header", async () => {
    fetch.mockResolvedValueOnce(respuestaError(409, { detail: "El viaje ya finalizó" }));

    await expect(api.getTrips()).rejects.toMatchObject({ code: "TRIP_FINISHED" });
  });

  it("marca la sesión expirada y avisa aunque un listener falle", async () => {
    const listener = jest.fn();
    const quitarRoto = api.onSessionExpired(() => {
      throw new Error("listener roto");
    });
    const quitar = api.onSessionExpired(listener);
    fetch.mockResolvedValueOnce(respuestaError(401, { detail: "No autenticado" }));

    await expect(api.getTrips()).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(listener).toHaveBeenCalledTimes(1);

    quitarRoto();
    quitar();
  });

  it("un 401 con otro mensaje no es sesión expirada", async () => {
    const listener = jest.fn();
    const quitar = api.onSessionExpired(listener);
    fetch.mockResolvedValueOnce(respuestaError(401, { detail: "Correo electrónico o contraseña incorrectos" }));

    await expect(api.loginUser("a@b.com", "x")).rejects.toMatchObject({ code: null });
    expect(listener).not.toHaveBeenCalled();

    quitar();
  });
});

describe("casos especiales", () => {
  it("deleteCurrentUser devuelve true con 204 y manda la contraseña", async () => {
    fetch.mockResolvedValueOnce(respuesta({ status: 204 }));

    await expect(api.deleteCurrentUser("Clave123!")).resolves.toBe(true);

    const opciones = fetch.mock.calls[0][1];
    expect(opciones.method).toBe("DELETE");
    expect(opciones.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opciones.body)).toEqual({ password: "Clave123!" });
  });

  it("deleteCurrentUser sin contraseña no manda body y propaga el error", async () => {
    fetch.mockResolvedValueOnce(respuestaError(400, { detail: "Tenés viajes activos" }));

    await expect(api.deleteCurrentUser()).rejects.toThrow("Tenés viajes activos");
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it("deleteTrip devuelve true si sale bien", async () => {
    await expect(api.deleteTrip(7)).resolves.toBe(true);
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
  });

  it.each([
    [{ detail: "Solo el administrador puede eliminar el viaje" }, "Solo el administrador puede eliminar el viaje"],
    [new Error("no es JSON"), "No se pudo dar de baja el viaje."],
  ])("deleteTrip ante un error lanza el mensaje correspondiente (%#)", async (body, mensaje) => {
    fetch.mockResolvedValueOnce(respuestaError(403, body));

    await expect(api.deleteTrip(7)).rejects.toThrow(mensaje);
  });

  it.each([
    ["requestActivitySuggestions", [7, {}]],
    ["completeFreeItinerarySlots", [7, { Franjas: [1, 2] }]],
  ])("%s convierte el timeout en AI_TIMEOUT", async (nombre, args) => {
    const abortado = new Error("aborted");
    abortado.name = "AbortError";
    fetch.mockRejectedValueOnce(abortado);

    await expect(api[nombre](...args)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });

  it("requestActivitySuggestions propaga otros errores tal cual", async () => {
    fetch.mockRejectedValueOnce(new Error("Network request failed"));

    await expect(api.requestActivitySuggestions(7, {})).rejects.toThrow("Network request failed");
  });

  it("getActivitySuggestionPhotoSource en web descarga la foto con el token", async () => {
    const fuente = await api.getActivitySuggestionPhotoSource(7, 4);

    const [url, opciones] = fetch.mock.calls[0];
    expect(url.endsWith("/trips/7/sugerencias-actividades/4/foto")).toBe(true);
    expect(opciones.headers.Authorization).toBe(TOKEN);
    expect(fuente).toEqual({ uri: "blob:foto" });
  });

  it("getActivitySuggestionPhotoSource falla si la foto no carga", async () => {
    fetch.mockResolvedValueOnce(respuestaError(404, {}));

    await expect(api.getActivitySuggestionPhotoSource(7, 4)).rejects.toThrow("No se pudo cargar la foto");
  });
});