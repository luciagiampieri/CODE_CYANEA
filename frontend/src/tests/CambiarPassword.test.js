// US 101: cambiar contraseña desde "Mi cuenta". Los casos de prueba de la US se
// mapean como CP1 a CP9 (CP8 y CP9 se validan además en el backend).
import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import ChangePasswordScreen from "../screens/ChangePasswordScreen";
import SettingsScreen from "../screens/SettingScreen";
import { changePassword } from "../services/api";
import { avisar } from "../utils/dialogs";
import {
  cumpleReglasPassword,
  puedeCambiarPassword,
  validarCambioPassword,
} from "../utils/passwordRules";

const mockAuth = { user: { proveedorAutenticacion: "local" }, login: jest.fn(), logout: jest.fn() };

jest.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

jest.mock("../services/api", () => ({
  changePassword: jest.fn(),
}));

jest.mock("../utils/dialogs", () => ({
  avisar: jest.fn(),
  confirmar: jest.fn(),
}));

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({ isDesktop: false }),
}));

const ACTUAL = "Password123!";
const NUEVA = "NuevaClave456#";
const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.user = { proveedorAutenticacion: "local" };
});

async function completar(utils, { actual = ACTUAL, nueva = NUEVA, confirmacion = nueva } = {}) {
  await fireEvent.changeText(utils.getByTestId("change-password-current"), actual);
  await fireEvent.changeText(utils.getByTestId("change-password-new"), nueva);
  await fireEvent.changeText(utils.getByTestId("change-password-confirm"), confirmacion);
  await act(async () => {
    await fireEvent.press(utils.getByTestId("change-password-submit"));
  });
}

describe("reglas de la nueva contraseña", () => {
  it("CP3 y CP4: exige 8 caracteres, mayúscula, minúscula, número y carácter especial", () => {
    expect(cumpleReglasPassword(NUEVA)).toBe(true);
    expect(cumpleReglasPassword("Ab1#xyz")).toBe(false);
    expect(cumpleReglasPassword("nuevaclave456#")).toBe(false);
    expect(cumpleReglasPassword("NUEVACLAVE456#")).toBe(false);
    expect(cumpleReglasPassword("NuevaClave####")).toBe(false);
    expect(cumpleReglasPassword("NuevaClave4567")).toBe(false);
  });

  it("valida campos obligatorios, igualdad con la actual y confirmación", () => {
    expect(validarCambioPassword({ passwordActual: "", passwordNueva: NUEVA, confirmacion: NUEVA })).toMatch(/Completá/);
    expect(validarCambioPassword({ passwordActual: ACTUAL, passwordNueva: "corta", confirmacion: "corta" })).toMatch(/reglas/);
    expect(validarCambioPassword({ passwordActual: ACTUAL, passwordNueva: ACTUAL, confirmacion: ACTUAL })).toMatch(/distinta/);
    expect(validarCambioPassword({ passwordActual: ACTUAL, passwordNueva: NUEVA, confirmacion: "Otra123$x" })).toMatch(/no coinciden/);
    expect(validarCambioPassword({ passwordActual: ACTUAL, passwordNueva: NUEVA, confirmacion: NUEVA })).toBeNull();
  });

  it("CP7: solo las cuentas registradas con correo pueden cambiar la contraseña", () => {
    expect(puedeCambiarPassword({ proveedorAutenticacion: "local" })).toBe(true);
    expect(puedeCambiarPassword({ proveedorAutenticacion: "google" })).toBe(false);
    expect(puedeCambiarPassword({ proveedorAutenticacion: "facebook" })).toBe(false);
    expect(puedeCambiarPassword(null)).toBe(false);
  });
});

describe("ChangePasswordScreen", () => {
  it("CP1: cambia la contraseña, guarda el token nuevo y muestra la confirmación", async () => {
    changePassword.mockResolvedValue({
      message: "Tu contraseña se cambió correctamente. Cerramos tu sesión en los demás dispositivos.",
      access_token: "token-nuevo",
    });
    const utils = await render(<ChangePasswordScreen navigation={navigation} />);

    await completar(utils);

    expect(changePassword).toHaveBeenCalledWith({
      passwordActual: ACTUAL,
      passwordNueva: NUEVA,
      confirmacion: NUEVA,
    });
    expect(mockAuth.login).toHaveBeenCalledWith("token-nuevo");
    expect(avisar).toHaveBeenCalledWith(
      "Contraseña actualizada",
      expect.stringContaining("se cambió correctamente"),
      expect.any(Function)
    );
    avisar.mock.calls[0][2]();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it("CP2: muestra el error si la contraseña actual es incorrecta", async () => {
    const error = new Error("La contraseña actual es incorrecta.");
    error.status = 400;
    changePassword.mockRejectedValue(error);
    const utils = await render(<ChangePasswordScreen navigation={navigation} />);

    await completar(utils, { actual: "Incorrecta1!" });

    expect(utils.getByTestId("change-password-error")).toHaveTextContent(/La contraseña actual es incorrecta/);
    expect(mockAuth.login).not.toHaveBeenCalled();
    expect(avisar).not.toHaveBeenCalled();
  });

  it.each([
    ["CP3: menos de 8 caracteres", { nueva: "Ab1#xyz" }, /no cumple con todas las reglas/],
    ["CP4: sin carácter especial", { nueva: "NuevaClave4567" }, /no cumple con todas las reglas/],
    ["CP5: idéntica a la actual", { nueva: ACTUAL }, /distinta de la contraseña actual/],
    ["CP6: confirmación distinta", { confirmacion: "OtraClave789$" }, /no coinciden/],
  ])("%s no se envía al backend", async (_, datos, mensaje) => {
    const utils = await render(<ChangePasswordScreen navigation={navigation} />);

    await completar(utils, datos);

    expect(changePassword).not.toHaveBeenCalled();
    expect(utils.getByTestId("change-password-error")).toHaveTextContent(mensaje);
  });

  it("CP7: con una cuenta de Google no muestra el formulario", async () => {
    mockAuth.user = { proveedorAutenticacion: "google" };
    const utils = await render(<ChangePasswordScreen navigation={navigation} />);

    expect(utils.getByTestId("change-password-unavailable")).toHaveTextContent(/Google/);
    expect(utils.queryByTestId("change-password-current")).toBeNull();
  });
});

describe("SettingScreen > Mi cuenta", () => {
  it("CP1: la opción está en la sección Mi cuenta y abre la pantalla", async () => {
    const utils = await render(<SettingsScreen navigation={navigation} />);

    expect(utils.getByText("Mi cuenta")).toBeTruthy();
    await act(async () => {
      await fireEvent.press(utils.getByTestId("settings-cambiar-password-row"));
    });
    expect(navigation.navigate).toHaveBeenCalledWith("CambiarPassword");
  });

  it.each(["google", "facebook"])("CP7: no se ofrece para cuentas de %s", async (proveedor) => {
    mockAuth.user = { proveedorAutenticacion: proveedor };
    const utils = await render(<SettingsScreen navigation={navigation} />);

    expect(utils.queryByTestId("settings-cambiar-password-row")).toBeNull();
  });
});
