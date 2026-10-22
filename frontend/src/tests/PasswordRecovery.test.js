import { requestPasswordReset, resetPassword, validateResetToken } from "../services/PasswordRecovery";

function respuesta({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve(respuesta({ body: { message: "ok" } })));
});

const FUNCIONES = {
  requestPasswordReset,
  validateResetToken,
  resetPassword,
};

describe("requests", () => {
  it.each([
    ["requestPasswordReset", ["ana@test.com"], "/auth/forgot-password", { email: "ana@test.com" }],
    ["validateResetToken", ["tok-1"], "/auth/reset-password/validate", { token: "tok-1" }],
    [
      "resetPassword",
      ["tok-1", "Clave123!", "Clave123!"],
      "/auth/reset-password",
      { token: "tok-1", password: "Clave123!", confirmPassword: "Clave123!" },
    ],
  ])("%s hace POST al endpoint correcto", async (nombre, args, ruta, body) => {
    const resultado = await FUNCIONES[nombre](...args);

    const [url, opciones] = fetch.mock.calls[0];
    expect(url.endsWith(ruta)).toBe(true);
    expect(opciones.method).toBe("POST");
    expect(opciones.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opciones.body)).toEqual(body);
    expect(resultado).toEqual({ message: "ok" });
  });
});

describe("errores", () => {
  it("usa el detail del backend y expone el status", async () => {
    fetch.mockResolvedValueOnce(
      respuesta({ ok: false, status: 410, body: { detail: "El enlace venció." } })
    );

    await expect(validateResetToken("tok-1")).rejects.toMatchObject({
      message: "El enlace venció.",
      status: 410,
    });
  });

  it("une los errores de validación de FastAPI", async () => {
    fetch.mockResolvedValueOnce(
      respuesta({
        ok: false,
        status: 422,
        body: { detail: [{ msg: "campo requerido" }, { message: "formato inválido" }, { x: 1 }] },
      })
    );

    await expect(requestPasswordReset("")).rejects.toThrow('campo requerido. formato inválido. {"x":1}');
  });

  it.each([
    ["requestPasswordReset", ["ana@test.com"], "No se pudo enviar el enlace de recuperación"],
    ["validateResetToken", ["tok-1"], "El enlace de recuperación no es válido"],
    ["resetPassword", ["tok-1", "a", "a"], "No se pudo restablecer la contraseña"],
  ])("%s usa su mensaje por defecto si la respuesta no es JSON", async (nombre, args, mensaje) => {
    fetch.mockResolvedValueOnce(respuesta({ ok: false, status: 500, body: new Error("no es JSON") }));

    await expect(FUNCIONES[nombre](...args)).rejects.toMatchObject({ message: mensaje, status: 500 });
  });

  it("usa el mensaje por defecto si el detail no es texto ni lista", async () => {
    fetch.mockResolvedValueOnce(respuesta({ ok: false, status: 400, body: { detail: { codigo: "X" } } }));

    await expect(resetPassword("tok-1", "a", "a")).rejects.toThrow("No se pudo restablecer la contraseña");
  });
});