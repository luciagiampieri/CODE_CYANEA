import { act, fireEvent, render } from "@testing-library/react-native";

import GoogleRegisterScreen from "../screens/GoogleRegisterScreen";
import * as api from "../services/api";

jest.mock("../services/api", () => ({
  registerWithGoogle: jest.fn(),
}));

const mockLogin = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

function baseParams(overrides = {}) {
  return {
    idToken: "google-token-123",
    nombre: "Alan",
    apellido: "Turing",
    email: "alan@mail.com",
    fotoUrl: null,
    ...overrides,
  };
}

async function aceptarTerminosYRegistrar(getByTestId, getByText) {
  await act(async () => {
    fireEvent(getByTestId("google-register-terminos-switch"), "valueChange", true);
  });
  await act(async () => {
    fireEvent.press(getByText("Finalizar registro"));
  });
}

describe("GoogleRegisterScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("muestra nombre, apellido y email recibidos por route.params", async () => {
    const route = { params: baseParams() };

    const { getByText } = await render(<GoogleRegisterScreen route={route} />);

    expect(getByText("Alan")).toBeTruthy();
    expect(getByText("Turing")).toBeTruthy();
    expect(getByText("alan@mail.com")).toBeTruthy();
  });

  it("muestra la foto de perfil cuando viene fotoUrl", async () => {
    const route = { params: baseParams({ fotoUrl: "https://cdn.cyanea.app/alan.jpg" }) };

    const { toJSON } = await render(<GoogleRegisterScreen route={route} />);

    expect(JSON.stringify(toJSON())).toContain("https://cdn.cyanea.app/alan.jpg");
  });

  it("si no acepta los términos, muestra el error y no llama a la API", async () => {
    const route = { params: baseParams() };

    const { getByText } = await render(<GoogleRegisterScreen route={route} />);

    await act(async () => {
      fireEvent.press(getByText("Finalizar registro"));
    });

    expect(getByText("Debés aceptar los términos y condiciones.")).toBeTruthy();
    expect(api.registerWithGoogle).not.toHaveBeenCalled();
  });

  it("al aceptar los términos y registrar con éxito, llama a registerWithGoogle y a login", async () => {
    api.registerWithGoogle.mockResolvedValueOnce({ access_token: "jwt-xyz" });
    const route = { params: baseParams() };

    const { getByTestId, getByText } = await render(
      <GoogleRegisterScreen route={route} />
    );

    await aceptarTerminosYRegistrar(getByTestId, getByText);

    expect(api.registerWithGoogle).toHaveBeenCalledWith("google-token-123", true);
    expect(mockLogin).toHaveBeenCalledWith("jwt-xyz");
  });

  it("si la API falla, muestra el mensaje de error del backend", async () => {
    api.registerWithGoogle.mockRejectedValueOnce(
      new Error("El email ya está registrado.")
    );
    const route = { params: baseParams() };

    const { getByTestId, getByText } = await render(
      <GoogleRegisterScreen route={route} />
    );

    await aceptarTerminosYRegistrar(getByTestId, getByText);

    expect(getByText("El email ya está registrado.")).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("si la API falla sin mensaje, usa el error genérico", async () => {
    api.registerWithGoogle.mockRejectedValueOnce({});
    const route = { params: baseParams() };

    const { getByTestId, getByText } = await render(
      <GoogleRegisterScreen route={route} />
    );

    await aceptarTerminosYRegistrar(getByTestId, getByText);

    expect(getByText("No se pudo completar el registro.")).toBeTruthy();
  });
});