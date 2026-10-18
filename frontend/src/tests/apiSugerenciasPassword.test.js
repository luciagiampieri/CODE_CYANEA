// Cliente HTTP de las US 88 (aceptar sugerencia), 92 (completar días libres) y
// 101 (cambiar contraseña y cierre de sesión en otros dispositivos).
import { Platform } from "react-native";
import * as api from "../services/api";

const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

beforeEach(() => {
  jest.clearAllMocks();
  // Igual que api.test.js: en web el token se lee de un localStorage controlable.
  Platform.OS = "web";
  global.localStorage = {
    getItem: jest.fn().mockReturnValue("token-actual"),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.localStorage;
  delete global.fetch;
});

function mockFetchOnce(status, body) {
  global.fetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  });
}

describe("US 88: acceptActivitySuggestion", () => {
  it("envía el horario y la confirmación de superposición", async () => {
    mockFetchOnce(200, { Aceptada: true });

    await api.acceptActivitySuggestion(3, 7, {
      HoraInicio: "16:30",
      HoraFin: "18:00",
      ConfirmarSuperposicion: true,
    });

    const [url, opciones] = global.fetch.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/trips/3/sugerencias-actividades/7/aceptar`);
    expect(opciones.method).toBe("POST");
    expect(opciones.headers.Authorization).toBe("Bearer token-actual");
    expect(JSON.parse(opciones.body)).toEqual({
      HoraInicio: "16:30",
      HoraFin: "18:00",
      ConfirmarSuperposicion: true,
    });
  });
});

describe("US 92: días libres", () => {
  it("consulta las franjas libres del viaje", async () => {
    mockFetchOnce(200, { Franjas: [] });

    await api.getFreeItinerarySlots(3);

    expect(global.fetch.mock.calls[0][0]).toBe(
      `${API_BASE_URL}/trips/3/sugerencias-actividades/franjas-libres`
    );
  });

  it("pide completar las franjas elegidas y conserva el código de error", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: { get: (name) => (name === "X-Error-Code" ? "SUGGESTION_LIMIT_REACHED" : null) },
      json: async () => ({ detail: "Seleccionaste 2 franjas, pero hoy solo queda 1 solicitud disponible." }),
    });
    const payload = {
      ContinuarSinPreferencias: false,
      Franjas: [{ IdDiaCronograma: 11, HoraInicio: "09:00", HoraFin: "22:00" }],
    };

    await expect(api.completeFreeItinerarySlots(3, payload)).rejects.toMatchObject({
      status: 429,
      code: "SUGGESTION_LIMIT_REACHED",
    });
    const [url, opciones] = global.fetch.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/trips/3/sugerencias-actividades/completar-dias-libres`);
    expect(JSON.parse(opciones.body)).toEqual(payload);
  });
});

describe("US 101: cambio de contraseña", () => {
  it("envía la contraseña actual, la nueva y su confirmación", async () => {
    mockFetchOnce(200, { message: "ok", access_token: "nuevo" });

    const resultado = await api.changePassword({
      passwordActual: "Password123!",
      passwordNueva: "NuevaClave456#",
      confirmacion: "NuevaClave456#",
    });

    expect(resultado.access_token).toBe("nuevo");
    const [url, opciones] = global.fetch.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/users/me/password`);
    expect(opciones.method).toBe("PUT");
    expect(JSON.parse(opciones.body)).toEqual({
      passwordActual: "Password123!",
      passwordNueva: "NuevaClave456#",
      confirmacion: "NuevaClave456#",
    });
  });

  it("CP8: avisa que la sesión expiró cuando el backend rechaza el token", async () => {
    const listener = jest.fn();
    const desuscribir = api.onSessionExpired(listener);
    mockFetchOnce(401, { detail: "No autenticado" });

    await expect(api.getCurrentUser()).rejects.toMatchObject({ status: 401, code: "SESSION_EXPIRED" });

    expect(listener).toHaveBeenCalledTimes(1);
    desuscribir();
  });

  it("otros 401 (contraseña incorrecta al eliminar la cuenta) no cierran la sesión", async () => {
    const listener = jest.fn();
    const desuscribir = api.onSessionExpired(listener);
    mockFetchOnce(401, { detail: "Contraseña incorrecta." });

    await expect(api.getCurrentUser()).rejects.toMatchObject({ status: 401 });

    expect(listener).not.toHaveBeenCalled();
    desuscribir();
  });
});
