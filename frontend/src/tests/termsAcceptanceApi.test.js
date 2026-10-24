import { acceptTerms, getTermsAcceptance } from "../services/termsAcceptanceApi";

jest.mock("../services/api", () => ({
  getStoredToken: jest.fn(() => Promise.resolve("tok-123")),
  resolveApiBaseUrl: jest.fn(() => "http://api.test/api/v1"),
}));

function respuesta(status, cuerpo) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(cuerpo),
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe("termsAcceptanceApi (US 110)", () => {
  it("consulta si hay que aceptar, con el token", async () => {
    fetch.mockReturnValue(respuesta(200, { requiereAceptacion: true }));

    const datos = await getTermsAcceptance();

    expect(fetch.mock.calls[0][0]).toBe("http://api.test/api/v1/legal/terms/acceptance");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-123");
    expect(datos).toEqual({ requiereAceptacion: true });
  });

  it("acepta la versión vigente por POST", async () => {
    fetch.mockReturnValue(respuesta(200, { requiereAceptacion: false }));

    await acceptTerms();

    expect(fetch.mock.calls[0][0]).toBe("http://api.test/api/v1/legal/terms/accept");
    expect(fetch.mock.calls[0][1].method).toBe("POST");
  });

  it("propaga el mensaje y el estado del error", async () => {
    fetch.mockReturnValue(respuesta(401, { detail: "No autenticado" }));

    await expect(acceptTerms()).rejects.toMatchObject({ message: "No autenticado", status: 401 });
  });

  it("usa el mensaje por defecto si no hay detalle", async () => {
    fetch.mockReturnValue(respuesta(500, {}));

    await expect(getTermsAcceptance()).rejects.toMatchObject({
      message: "No se pudo verificar la aceptación de los términos",
    });
  });
});
