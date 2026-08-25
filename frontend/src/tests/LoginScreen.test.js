import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import LoginScreen from "../screens/LoginScreen";
import { loginUser } from "../services/api";

const mockLogin = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../services/api", () => ({
  loginUser: jest.fn(),
  loginWithFacebook: jest.fn(),
  loginWithGoogle: jest.fn(),
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin }),
}));


jest.mock("expo-auth-session/providers/google", () => ({
  useIdTokenAuthRequest: () => [{}, null, jest.fn()],
}));

jest.mock("expo-auth-session", () => ({
  useAuthRequest: () => [{}, null, jest.fn()],
  ResponseType: { Token: "token" },
  makeRedirectUri: () => "https://redirect.example",
}));

jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

const navigation = { navigate: mockNavigate };


async function press(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getByText(texto));
  });
}

async function completarCredenciales(utils, email, password) {
  await act(async () => {
    fireEvent.changeText(utils.getByTestId("login-email-input"), email);
  });
  await act(async () => {
    fireEvent.changeText(utils.getByTestId("login-password-input"), password);
  });
}

describe("US - Iniciar sesión (LoginScreen)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("muestra el formulario de login", async () => {
    const utils = await render(<LoginScreen navigation={navigation} />);

    expect(utils.getByText("Entrar")).toBeTruthy();
    expect(utils.getByText("Correo electrónico")).toBeTruthy();
    expect(utils.getByText("Contraseña")).toBeTruthy();
  });

  it("muestra un error si se intenta entrar sin completar los campos", async () => {
    const utils = await render(<LoginScreen navigation={navigation} />);

    await press(utils, "Entrar");

    expect(
      utils.getByText("Completá el correo electrónico y la contraseña.")
    ).toBeTruthy();
    expect(loginUser).not.toHaveBeenCalled();
  });

  it("inicia sesión correctamente con credenciales válidas", async () => {
    loginUser.mockResolvedValue({ access_token: "token-123" });
    const utils = await render(<LoginScreen navigation={navigation} />);

    await completarCredenciales(utils, "Persona@Mail.com", "secreta123");
    await press(utils, "Entrar");

    await waitFor(() => expect(loginUser).toHaveBeenCalledTimes(1));

    expect(loginUser).toHaveBeenCalledWith("persona@mail.com", "secreta123");

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("token-123"));
  });

  it("muestra un mensaje de conexión si el login falla por red", async () => {
    loginUser.mockRejectedValue(new Error("Network request failed"));
    const utils = await render(<LoginScreen navigation={navigation} />);

    await completarCredenciales(utils, "persona@mail.com", "secreta123");
    await press(utils, "Entrar");

    await waitFor(() => {
      expect(
        utils.getByText("No se pudo conectar con el servidor. Intentá de nuevo.")
      ).toBeTruthy();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("muestra el mensaje de error del servidor si las credenciales son incorrectas", async () => {
    loginUser.mockRejectedValue(new Error("Usuario o contraseña incorrectos"));
    const utils = await render(<LoginScreen navigation={navigation} />);

    await completarCredenciales(utils, "persona@mail.com", "mala-clave");
    await press(utils, "Entrar");

    await waitFor(() => {
      expect(utils.getByText("Usuario o contraseña incorrectos")).toBeTruthy();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("navega a la pantalla de registro al tocar 'Regístrate'", async () => {
    const utils = await render(<LoginScreen navigation={navigation} />);

    await press(utils, "Regístrate");

    expect(mockNavigate).toHaveBeenCalledWith("Register");
  });
});