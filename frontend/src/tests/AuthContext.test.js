import { Platform, Pressable, Text } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { AuthProvider, useAuth } from "../context/AuthContext";
import { getCurrentUser } from "../services/api";

jest.mock("../services/api", () => ({
  getCurrentUser: jest.fn(),
}));

const AUTH_TOKEN_KEY = "auth_token";

function TestConsumer() {
  const { token, isLoading, login, logout } = useAuth();

  return (
    <>
      <Text>{isLoading ? "cargando" : "listo"}</Text>
      <Text>{token ?? "sin-token"}</Text>
      <Pressable onPress={() => login("nuevo-token")}>
        <Text>Login</Text>
      </Pressable>
      <Pressable onPress={() => logout()}>
        <Text>Logout</Text>
      </Pressable>
    </>
  );
}

// AuthContext usa `await import("expo-secure-store")` (import dinámico) en
// nativo, y este entorno de Jest no soporta imports dinámicos sin
// --experimental-vm-modules: cualquier jest.mock("expo-secure-store", ...)
// se ignora en silencio y la promesa rechaza, cayendo siempre al catch
// externo de loadToken(). Eso da falsos positivos (el mock nunca se llega
// a usar). Por eso probamos la rama web, que usa `localStorage` y sí es
// 100% mockeable con un objeto global fake.
let localStorageMock;

beforeEach(() => {
  jest.resetAllMocks();
  Platform.OS = "web";
  localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  };
  global.localStorage = localStorageMock;
});

afterEach(() => {
  delete global.localStorage;
});

describe("AuthContext", () => {
  it("useAuth lanza un error si se usa fuera de AuthProvider", async () => {
    // Silenciamos el log de error de React para este test puntual: el throw
    // es esperado y no queremos ensuciar la salida de la suite.
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(render(<TestConsumer />)).rejects.toThrow(
      "useAuth debe usarse dentro de AuthProvider"
    );

    consoleError.mockRestore();
  });

  it("sin token guardado: termina de cargar sin autenticar y no consulta al backend", async () => {
    localStorageMock.getItem.mockReturnValue(null);

    const utils = await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(utils.getByText("listo")).toBeTruthy());

    expect(utils.getByText("sin-token")).toBeTruthy();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("con token guardado y válido: autentica y expone el token", async () => {
    localStorageMock.getItem.mockReturnValue("token-guardado");
    getCurrentUser.mockResolvedValue({ id: 1, nombreCompleto: "Ada Lovelace" });

    const utils = await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(utils.getByText("listo")).toBeTruthy());

    expect(utils.getByText("token-guardado")).toBeTruthy();
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });

  it("con token guardado pero inválido (rechazado por el backend): lo descarta", async () => {
    localStorageMock.getItem.mockReturnValue("token-vencido");
    getCurrentUser.mockRejectedValue(new Error("401"));

    const utils = await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(utils.getByText("listo")).toBeTruthy());

    expect(utils.getByText("sin-token")).toBeTruthy();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
  });

  it("si falla la lectura del storage, termina de cargar sin token (no rompe la app)", async () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error("Storage no disponible");
    });

    const utils = await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(utils.getByText("listo")).toBeTruthy());

    expect(utils.getByText("sin-token")).toBeTruthy();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("login: guarda el token en el storage y actualiza el estado", async () => {
    localStorageMock.getItem.mockReturnValue(null);

    const utils = await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(utils.getByText("listo")).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByText("Login"));
    });

    await waitFor(() => expect(utils.getByText("nuevo-token")).toBeTruthy());
    expect(localStorageMock.setItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY, "nuevo-token");
  });

  it("logout: elimina el token del storage y limpia el estado", async () => {
    localStorageMock.getItem.mockReturnValue("token-guardado");
    getCurrentUser.mockResolvedValue({ id: 1 });

    const utils = await render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => expect(utils.getByText("token-guardado")).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByText("Logout"));
    });

    await waitFor(() => expect(utils.getByText("sin-token")).toBeTruthy());
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY);
  });
});