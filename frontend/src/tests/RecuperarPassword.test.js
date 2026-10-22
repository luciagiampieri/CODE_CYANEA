import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import {
  requestPasswordReset,
  resetPassword,
  validateResetToken,
} from "../services/PasswordRecovery";

jest.mock("../services/PasswordRecovery", () => ({
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  validateResetToken: jest.fn(),
}));

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({ isDesktop: false }),
}));

const TOKEN = "token-123";
const NUEVA = "NuevaClave456#";
const LINK_ERROR = "El enlace de recuperación es inválido, venció o ya fue utilizado.";
const ERROR_RED = "No se pudo conectar con el servidor. Intentá de nuevo.";
const MENSAJE_GENERICO = "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña";
const navigation = { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

function errorCon(mensaje, status) {
  const error = new Error(mensaje);
  if (status) error.status = status;
  return error;
}

async function presionar(elemento) {
  await act(async () => {
    await fireEvent.press(elemento);
  });
}

describe("ForgotPasswordScreen", () => {
  async function enviar(utils, email) {
    await fireEvent.changeText(utils.getByTestId("forgot-email-input"), email);
    await presionar(utils.getByText("Enviar enlace"));
  }

  it("pide el correo si está vacío y no llama al backend", async () => {
    const utils = await render(<ForgotPasswordScreen navigation={navigation} />);

    await enviar(utils, "   ");

    expect(utils.getByText("Ingresá tu correo electrónico.")).toBeTruthy();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it.each(["sin-arroba", "a@b", "a b@c.com"])("rechaza el correo inválido %s", async (email) => {
    const utils = await render(<ForgotPasswordScreen navigation={navigation} />);

    await enviar(utils, email);

    expect(
      utils.getByText("Ingresá un correo electrónico válido (nombre_usuario@dominio).")
    ).toBeTruthy();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("envía el correo normalizado y muestra el mensaje genérico", async () => {
    requestPasswordReset.mockResolvedValue({ message: MENSAJE_GENERICO });
    const utils = await render(<ForgotPasswordScreen navigation={navigation} />);

    await enviar(utils, "  ANA@Test.COM ");

    expect(requestPasswordReset).toHaveBeenCalledWith("ana@test.com");
    expect(utils.getByText(MENSAJE_GENERICO)).toBeTruthy();
    expect(utils.getByText("Podés reenviar en 60s")).toBeTruthy();
  });

  it("bloquea el reenvío durante 60 segundos y después lo habilita", async () => {
    jest.useFakeTimers();
    requestPasswordReset.mockResolvedValue({ message: MENSAJE_GENERICO });
    const utils = await render(<ForgotPasswordScreen navigation={navigation} />);
    await enviar(utils, "ana@test.com");

    await presionar(utils.getByText("Podés reenviar en 60s"));
    expect(requestPasswordReset).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 60; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }

    await presionar(utils.getByText("Reenviar enlace"));
    expect(requestPasswordReset).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["Failed to fetch", ERROR_RED],
    ["Network request failed", ERROR_RED],
    [
      "Esperá 30 segundos antes de solicitar un nuevo enlace.",
      "Esperá 30 segundos antes de solicitar un nuevo enlace.",
    ],
    ["", "No se pudo enviar el enlace. Intentá de nuevo."],
  ])("ante el error '%s' muestra '%s' y no activa el cooldown", async (mensaje, esperado) => {
    requestPasswordReset.mockRejectedValue(errorCon(mensaje));
    const utils = await render(<ForgotPasswordScreen navigation={navigation} />);

    await enviar(utils, "ana@test.com");

    expect(utils.getByText(esperado)).toBeTruthy();
    expect(utils.getByText("Enviar enlace")).toBeTruthy();
  });
});

describe("ResetPasswordScreen", () => {
  function renderizar(token = TOKEN) {
    return render(
      <ResetPasswordScreen
        navigation={navigation}
        route={token ? { params: { token } } : undefined}
      />
    );
  }

  async function renderizarValido() {
    validateResetToken.mockResolvedValue({ valid: true });
    const utils = await renderizar();
    await utils.findByTestId("reset-password-input");
    return utils;
  }

  async function completar(utils, password = NUEVA, confirmacion = password) {
    await fireEvent.changeText(utils.getByTestId("reset-password-input"), password);
    await fireEvent.changeText(utils.getByTestId("reset-confirm-input"), confirmacion);
    await presionar(utils.getAllByText("Restablecer contraseña").at(-1));
  }

  it("sin token muestra el enlace como inválido y permite pedir uno nuevo", async () => {
    const utils = await renderizar(null);

    expect(utils.getByText("Enlace no válido")).toBeTruthy();
    expect(utils.getByText(LINK_ERROR)).toBeTruthy();
    expect(validateResetToken).not.toHaveBeenCalled();

    await presionar(utils.getByText("Solicitar un nuevo enlace"));
    expect(navigation.navigate).toHaveBeenCalledWith("ForgotPassword");
  });

  it("valida el token al abrir y muestra el formulario si es válido", async () => {
    const utils = await renderizarValido();

    expect(validateResetToken).toHaveBeenCalledWith(TOKEN);
    expect(utils.getByTestId("reset-confirm-input")).toBeTruthy();
  });

  it.each([
    ["El enlace venció.", "El enlace venció."],
    ["Failed to fetch", ERROR_RED],
    ["", LINK_ERROR],
  ])("si la validación falla con '%s' muestra '%s'", async (mensaje, esperado) => {
    validateResetToken.mockRejectedValue(errorCon(mensaje, 410));
    const utils = await renderizar();

    expect(await utils.findByText(esperado)).toBeTruthy();
    expect(utils.getByText("Enlace no válido")).toBeTruthy();
  });

  it.each([
    ["", "", "Ingresá y confirmá la nueva contraseña."],
    ["corta", "corta", "La contraseña no cumple con todas las reglas indicadas."],
    [NUEVA, "OtraClave789$", "Las contraseñas no coinciden."],
  ])("con '%s' y '%s' muestra '%s' sin llamar al backend", async (password, confirmacion, mensaje) => {
    const utils = await renderizarValido();

    await completar(utils, password, confirmacion);

    expect(utils.getByText(mensaje)).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("avisa que no coinciden al salir del campo de confirmación", async () => {
    const utils = await renderizarValido();

    await fireEvent.changeText(utils.getByTestId("reset-password-input"), NUEVA);
    await fireEvent.changeText(utils.getByTestId("reset-confirm-input"), "Otra");
    await fireEvent(utils.getByTestId("reset-confirm-input"), "blur");

    expect(utils.getByText("Las contraseñas no coinciden.")).toBeTruthy();
  });

  it("restablece la contraseña y permite ir al inicio de sesión", async () => {
    resetPassword.mockResolvedValue({ message: "Tu contraseña se restableció correctamente." });
    const utils = await renderizarValido();

    await completar(utils);

    expect(resetPassword).toHaveBeenCalledWith(TOKEN, NUEVA, NUEVA);
    expect(utils.getByText("¡Listo!")).toBeTruthy();
    expect(utils.getByText(/se restableció correctamente/)).toBeTruthy();

    await presionar(utils.getByText("Ir a iniciar sesión"));
    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Login" }] });
  });

  it("si el backend no devuelve mensaje usa el mensaje por defecto", async () => {
    resetPassword.mockResolvedValue({});
    const utils = await renderizarValido();

    await completar(utils);

    expect(utils.getByText(/Tu contraseña se restableció correctamente/)).toBeTruthy();
  });

  it("redirige solo al inicio de sesión después del éxito", async () => {
    jest.useFakeTimers();
    resetPassword.mockResolvedValue({ message: "Tu contraseña se restableció correctamente." });
    const utils = await renderizarValido();

    await completar(utils);
    expect(navigation.reset).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(2500);
    });

    expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: "Login" }] });
  });

  it("si el token venció al enviar, pasa a la pantalla de enlace inválido", async () => {
    resetPassword.mockRejectedValue(errorCon("El enlace ya fue utilizado.", 410));
    const utils = await renderizarValido();

    await completar(utils);

    expect(utils.getByText("Enlace no válido")).toBeTruthy();
    expect(utils.getByText("El enlace ya fue utilizado.")).toBeTruthy();
  });

  it.each([
    [
      "La nueva contraseña debe ser distinta de la contraseña actual.",
      "La nueva contraseña debe ser distinta de la contraseña actual.",
    ],
    ["Network request failed", ERROR_RED],
    ["", "No se pudo restablecer la contraseña."],
  ])("ante el error '%s' se queda en el formulario y muestra '%s'", async (mensaje, esperado) => {
    resetPassword.mockRejectedValue(errorCon(mensaje, 400));
    const utils = await renderizarValido();

    await completar(utils);

    expect(utils.getByText(esperado)).toBeTruthy();
    expect(utils.getByTestId("reset-password-input")).toBeTruthy();
  });
});