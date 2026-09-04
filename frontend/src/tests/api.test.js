import { Platform } from "react-native";
import * as api from "../services/api";

// API_BASE_URL se resuelve UNA sola vez, al importar el módulo, en base al
// Platform.OS que haya en ese momento (jest-expo arranca en "ios" por
// defecto). Por eso queda fija en la variante nativa/localhost aunque
// después cambiemos Platform.OS en los tests para controlar el storage.
const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

// getStoredToken() usa `await import("expo-secure-store")` en nativo, que
// Jest no soporta sin --experimental-vm-modules (ver nota en
// AuthContext.test.js). Por eso, igual que ahí, forzamos Platform.OS = "web"
// y controlamos el storage con un localStorage global fake: es la única
// rama 100% mockeable en este entorno.
let localStorageMock;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "web";
  localStorageMock = {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
  global.localStorage = localStorageMock;
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
    json: async () => body,
  });
}

describe("parseResponse (comportamiento compartido, probado vía loginUser)", () => {
  it("con respuesta ok, devuelve el body ya parseado", async () => {
    mockFetchOnce(200, { token: "abc123" });

    const result = await api.loginUser("ada@mail.com", "secreta123");

    expect(result).toEqual({ token: "abc123" });
  });

  it("con error y detail como array, junta los mensajes con '. '", async () => {
    mockFetchOnce(422, {
      detail: [{ msg: "El email no es válido" }, { msg: "La contraseña es muy corta" }],
    });

    await expect(api.loginUser("a", "b")).rejects.toThrow(
      "El email no es válido. La contraseña es muy corta"
    );
  });

  it("con error y detail como string, usa ese string directo", async () => {
    mockFetchOnce(401, { detail: "Credenciales incorrectas" });

    await expect(api.loginUser("ada@mail.com", "mal")).rejects.toThrow(
      "Credenciales incorrectas"
    );
  });

  it("con error y body no parseable como JSON, usa el mensaje de fallback", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("no es JSON");
      },
    });

    await expect(api.loginUser("ada@mail.com", "x")).rejects.toThrow(
      "No se pudo iniciar sesión"
    );
  });

  it("con error y sin campo detail, usa el mensaje de fallback", async () => {
    mockFetchOnce(500, {});

    await expect(api.loginUser("ada@mail.com", "x")).rejects.toThrow(
      "No se pudo iniciar sesión"
    );
  });
});

describe("authHeaders / getStoredToken", () => {
  it("sin token guardado, pega sin header de Authorization", async () => {
    localStorageMock.getItem.mockReturnValue(null);
    mockFetchOnce(200, []);

    await api.getTrips();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("con token guardado, agrega el header Authorization: Bearer <token>", async () => {
    localStorageMock.getItem.mockReturnValue("mi-token");
    mockFetchOnce(200, []);

    await api.getTrips();

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer mi-token");
  });
});

// Los ~60 endpoints de este archivo comparten el mismo patrón (armar la URL,
// pegarle a fetch con parseResponse), así que en vez de escribir un test
// casi idéntico para cada uno, tomamos una muestra representativa de
// distintos métodos (GET/POST/PUT/DELETE), distintos armados de URL
// (path params, query params, IDs anidados) y verificamos el contrato:
// URL correcta, método correcto, body correcto y headers de auth correctos.
const casosDeEndpoints = [
  {
    nombre: "loginUser",
    call: () => api.loginUser("ada@mail.com", "secreta123"),
    url: `${API_BASE_URL}/auth/login`,
    method: "POST",
    body: { email: "ada@mail.com", password: "secreta123" },
    needsAuth: false,
  },
  {
    nombre: "getTrips",
    call: () => api.getTrips(),
    url: `${API_BASE_URL}/trips`,
    needsAuth: true,
  },
  {
    nombre: "getTripDetail",
    call: () => api.getTripDetail(42),
    url: `${API_BASE_URL}/trips/42`,
    needsAuth: true,
  },
  {
    nombre: "updateTrip",
    call: () => api.updateTrip(42, { nombre: "Bariloche" }),
    url: `${API_BASE_URL}/trips/42`,
    method: "PUT",
    body: { nombre: "Bariloche" },
    needsAuth: true,
  },
  {
    nombre: "removeTripParticipant",
    call: () => api.removeTripParticipant(42, 7),
    url: `${API_BASE_URL}/trips/42/participants/7`,
    method: "DELETE",
    needsAuth: true,
  },
  {
    nombre: "createExpense",
    call: () => api.createExpense({ Nombre: "Almuerzo", Monto: 1000 }),
    url: `${API_BASE_URL}/gastos`,
    method: "POST",
    body: { Nombre: "Almuerzo", Monto: 1000 },
    needsAuth: true,
  },
  {
    nombre: "getTripSettlement",
    call: () => api.getTripSettlement(42),
    url: `${API_BASE_URL}/trips/42/settlement`,
    needsAuth: true,
  },
  {
    nombre: "rebuildTripSettlement",
    call: () => api.rebuildTripSettlement(42),
    url: `${API_BASE_URL}/trips/42/settlement/rebuild`,
    method: "POST",
    needsAuth: true,
  },
  {
    nombre: "markSettlementTransferPaid",
    call: () => api.markSettlementTransferPaid(42, 7, true),
    url: `${API_BASE_URL}/trips/42/settlement/transfers/7`,
    method: "PATCH",
    body: { Realizada: true },
    needsAuth: true,
  },
  {
    nombre: "emitirVoto",
    call: () => api.emitirVoto(9, [1, 2]),
    url: `${API_BASE_URL}/votaciones/9/votar`,
    method: "POST",
    body: { idPropuestas: [1, 2] },
    needsAuth: true,
  },
  {
    nombre: "createActivity",
    call: () => api.createActivity(1, 2, { nombre: "Museo" }),
    url: `${API_BASE_URL}/trips/1/days/2/activities`,
    method: "POST",
    body: { nombre: "Museo" },
    needsAuth: true,
  },
  {
    nombre: "deleteActivity",
    call: () => api.deleteActivity(1, 2, 3),
    url: `${API_BASE_URL}/trips/1/days/2/activities/3`,
    method: "DELETE",
    needsAuth: true,
  },
  {
    nombre: "searchTripPlaces (encodea la query)",
    call: () => api.searchTripPlaces(1, "café & té"),
     url: `${API_BASE_URL}/trips/1/places/search?${new URLSearchParams({
      q: "café & té",
    }).toString()}`,
    needsAuth: true,
  },
  {
    nombre: "resolveTripPlace",
    call: () => api.resolveTripPlace(42, "place-123"),
     url: `${API_BASE_URL}/trips/42/places/resolve?${new URLSearchParams({
      placeId: "place-123",
    }).toString()}`,
    needsAuth: true,
  },
];

describe.each(casosDeEndpoints)("$nombre", ({ call, url, method, body, needsAuth }) => {
  it("pega al endpoint correcto con método, body y headers de auth esperados", async () => {
    localStorageMock.getItem.mockReturnValue(needsAuth ? "mi-token" : null);
    mockFetchOnce(200, { ok: true });

    await call();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, options] = global.fetch.mock.calls[0];

    expect(calledUrl).toBe(url);
    if (method) {
      expect(options.method).toBe(method);
    }
    if (body) {
      expect(JSON.parse(options.body)).toEqual(body);
    }
    expect(options.headers.Authorization).toBe(needsAuth ? "Bearer mi-token" : undefined);
  });
});

describe("deleteTrip (caso especial: no usa parseResponse, tiene su propio manejo de error)", () => {
  it("devuelve true si la baja fue exitosa", async () => {
    mockFetchOnce(200, {});

    const result = await api.deleteTrip(5);

    expect(result).toBe(true);
  });

  it("lanza el detail del backend si falla", async () => {
    mockFetchOnce(400, { detail: "El viaje tiene gastos pendientes." });

    await expect(api.deleteTrip(5)).rejects.toThrow("El viaje tiene gastos pendientes.");
  });

  it("usa un mensaje por defecto si el error no trae detail", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("no es JSON");
      },
    });

    await expect(api.deleteTrip(5)).rejects.toThrow("No se pudo dar de baja el viaje.");
  });
});

describe("uploadProfilePhoto (rama web)", () => {
  it("arma un FormData con el archivo y lo sube con el token del usuario", async () => {
    localStorageMock.getItem.mockReturnValue("mi-token");
    mockFetchOnce(200, { fotoUrl: "https://cdn.cyanea.app/perfil.jpg" });

    // FormData.append exige un Blob real (como en un navegador), así que
    // usamos la rama `archivo.file instanceof Blob` del código.
    const archivo = {
      file: new Blob(["fake-image-data"], { type: "image/jpeg" }),
      fileName: "perfil.jpg",
      mimeType: "image/jpeg",
    };

    const result = await api.uploadProfilePhoto(archivo);

    expect(result).toEqual({ fotoUrl: "https://cdn.cyanea.app/perfil.jpg" });

    const [calledUrl, options] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe(`${API_BASE_URL}/users/me/photo`);
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer mi-token");
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("propaga el error del backend si falla la subida", async () => {
    localStorageMock.getItem.mockReturnValue("mi-token");
    mockFetchOnce(400, { detail: "El archivo es demasiado pesado." });

    const archivo = {
      file: new Blob(["fake-image-data"], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
    };

    await expect(api.uploadProfilePhoto(archivo)).rejects.toThrow(
      "El archivo es demasiado pesado."
    );
  });
});
