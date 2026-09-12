import { act, fireEvent, render } from "@testing-library/react-native";

import FacebookRegisterScreen from "../screens/FacebookRegisterScreen";
import * as api from "../services/api";

jest.mock("../services/api", () => ({
  registerWithFacebook: jest.fn(),
}));

const mockLogin = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
  }),
}));

function baseParams(overrides = {}) {
  return {
    accessToken: "fb-token-123",
    nombre: "Ada",
    apellido: "Lovelace",
    email: "ada@mail.com",
    fotoUrl: null,
    ...overrides,
  };
}

async function aceptarTerminosYRegistrar(getByTestId, getByText) {
  await act(async () => {
    fireEvent(getByTestId("facebook-register-terminos-switch"), "valueChange", true);
  });
  await act(async () => {
    fireEvent.press(getByText("Finalizar registro"));
  });
}

describe("FacebookRegisterScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("muestra nombre, apellido y email recibidos por route.params", async () => {
    const route = { params: baseParams() };

    const { getByText } = await render(<FacebookRegisterScreen route={route} />);

    expect(getByText("Ada")).toBeTruthy();
    expect(getByText("Lovelace")).toBeTruthy();
    expect(getByText("ada@mail.com")).toBeTruthy();
  });

  it("muestra la foto de perfil cuando viene fotoUrl", async () => {
    const route = { params: baseParams({ fotoUrl: "https://cdn.cyanea.app/ada.jpg" }) };

    const { toJSON } = await render(<FacebookRegisterScreen route={route} />);

    expect(JSON.stringify(toJSON())).toContain("https://cdn.cyanea.app/ada.jpg");
  });

  it("si no acepta los términos, muestra el error y no llama a la API", async () => {
    const route = { params: baseParams() };

    const { getByText } = await render(<FacebookRegisterScreen route={route} />);

    await act(async () => {
      fireEvent.press(getByText("Finalizar registro"));
    });

    expect(getByText("Debés aceptar los términos y condiciones.")).toBeTruthy();
    expect(api.registerWithFacebook).not.toHaveBeenCalled();
  });

  it("al aceptar los términos y registrar con éxito, llama a registerWithFacebook y a login", async () => {
    api.registerWithFacebook.mockResolvedValueOnce({ access_token: "jwt-abc" });
    const route = { params: baseParams() };

    const { getByTestId, getByText } = await render(
      <FacebookRegisterScreen route={route} />
    );

    await aceptarTerminosYRegistrar(getByTestId, getByText);

    expect(api.registerWithFacebook).toHaveBeenCalledWith("fb-token-123", true);
    expect(mockLogin).toHaveBeenCalledWith("jwt-abc");
  });

  it("si la API falla, muestra el mensaje de error del backend", async () => {
    api.registerWithFacebook.mockRejectedValueOnce(
      new Error("El email ya está registrado.")
    );
    const route = { params: baseParams() };

    const { getByTestId, getByText } = await render(
      <FacebookRegisterScreen route={route} />
    );

    await aceptarTerminosYRegistrar(getByTestId, getByText);

    expect(getByText("El email ya está registrado.")).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("si la API falla sin mensaje, usa el error genérico", async () => {
    api.registerWithFacebook.mockRejectedValueOnce({});
    const route = { params: baseParams() };

    const { getByTestId, getByText } = await render(
      <FacebookRegisterScreen route={route} />
    );

    await aceptarTerminosYRegistrar(getByTestId, getByText);

    expect(getByText("No se pudo completar el registro.")).toBeTruthy();
  });
});