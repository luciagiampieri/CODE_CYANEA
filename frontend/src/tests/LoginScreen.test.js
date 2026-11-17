import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Platform, ScrollView } from "react-native";

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

  it("Enter en la contraseña envía el formulario", async () => {
    loginUser.mockResolvedValue({ access_token: "token-123" });
    const utils = await render(<LoginScreen navigation={navigation} />);

    await completarCredenciales(utils, "persona@mail.com", "secreta123");
    await act(async () => {
      fireEvent(utils.getByTestId("login-password-input"), "submitEditing");
    });

    await waitFor(() => expect(loginUser).toHaveBeenCalledWith("persona@mail.com", "secreta123"));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith("token-123"));
  });

  it("Enter en el correo pasa a la contraseña sin enviar", async () => {
    const utils = await render(<LoginScreen navigation={navigation} />);

    await act(async () => {
      fireEvent(utils.getByTestId("login-email-input"), "submitEditing");
    });

    expect(loginUser).not.toHaveBeenCalled();
    expect(utils.getByTestId("login-email-input").props.returnKeyType).toBe("next");
  });

  it.each(["login-email-input", "login-password-input"])(
    "el error se borra al editar %s",
    async (campo) => {
      loginUser.mockRejectedValue(new Error("Usuario o contraseña incorrectos"));
      const utils = await render(<LoginScreen navigation={navigation} />);
      await completarCredenciales(utils, "persona@mail.com", "mala-clave");
      await press(utils, "Entrar");
      await waitFor(() => expect(utils.getByText("Usuario o contraseña incorrectos")).toBeTruthy());

      await act(async () => {
        fireEvent.changeText(utils.getByTestId(campo), "otro valor");
      });

      expect(utils.queryByText("Usuario o contraseña incorrectos")).toBeNull();
    }
  );

  it("navega a la pantalla de registro al tocar 'Regístrate'", async () => {
    const utils = await render(<LoginScreen navigation={navigation} />);

    await press(utils, "Regístrate");

    expect(mockNavigate).toHaveBeenCalledWith("Register");
  });

  it("ofrece reenvio cuando el servidor exige confirmar el correo", async () => {
    loginUser.mockRejectedValue(Object.assign(new Error("Confirmá tu correo"), { code: "EMAIL_CONFIRMATION_REQUIRED" }));
    const utils = await render(<LoginScreen navigation={navigation} />);
    await completarCredenciales(utils, "Persona@Mail.com", "secreta123");
    await press(utils, "Entrar");
    await press(utils, "Reenviar confirmación");
    expect(mockNavigate).toHaveBeenCalledWith("ResendConfirmation", { email: "persona@mail.com" });
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

// En la web el teclado tapaba el campo que se estaba completando: al enfocarlo se lo lleva
// por encima del teclado. En Android/iOS no cambia nada.
describe("Login: el campo enfocado queda a la vista", () => {
  const osOriginal = Platform.OS;
  let scrollToSpy;

  beforeEach(() => {
    scrollToSpy = jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = osOriginal;
    scrollToSpy.mockRestore();
  });

  // persist: en Android/iOS el ScrollView y el campo no tienen onLayout (el hook es solo web)
  // y el evento sube hasta el KeyboardAvoidingView, que lo llama.
  const layout = (y, height) => ({
    persist: () => {},
    nativeEvent: { layout: { x: 0, y, width: 300, height } },
  });

  // Área visible chica (teclado abierto) y la contraseña más abajo.
  async function enfocarPassword(utils) {
    const input = utils.getByTestId("login-password-input");
    await act(async () => {
      fireEvent(utils.getByTestId("login-scroll"), "layout", layout(0, 300));
      // Input > caja del input > View del campo.
      fireEvent(input.parent.parent, "layout", layout(600, 60));
      fireEvent(input, "focus");
    });
  }

  it("CP1 en la web enfocar la contraseña la lleva por encima del teclado", async () => {
    Platform.OS = "web";
    const utils = await render(<LoginScreen navigation={{ navigate: jest.fn() }} />);

    await enfocarPassword(utils);

    await waitFor(() => expect(scrollToSpy).toHaveBeenCalled());
    // abajo (660) + margen (20) - visible (300)
    expect(scrollToSpy).toHaveBeenLastCalledWith({ y: 380, animated: true });
  });

  it("en Android/iOS no desplaza nada", async () => {
    const utils = await render(<LoginScreen navigation={{ navigate: jest.fn() }} />);

    await enfocarPassword(utils);
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});
