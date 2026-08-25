import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import RegisterScreen from "../screens/RegisterScreen";

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const navigation = { navigate: mockNavigate, replace: mockReplace };

async function press(getters, texto) {
  await act(async () => {
    fireEvent.press(getters.getByText(texto));
  });
}

async function pressSubmit(getters) {
  await act(async () => {
    fireEvent.press(getters.getByTestId("register-submit-button"));
  });
}

async function escribir(getters, testId, texto) {
  await act(async () => {
    fireEvent.changeText(getters.getByTestId(testId), texto);
  });
}

async function toggleTerminos(getters) {
  await act(async () => {
    fireEvent(getters.getByTestId("register-terminos-switch"), "valueChange", true);
  });
}

async function completarFormularioValido(utils, overrides = {}) {
  const datos = {
    nombre: "Ada",
    apellido: "Lovelace",
    usuario: "adalovelace",
    email: "ada@mail.com",
    password: "Clave-Segura1",
    confirmar: "Clave-Segura1",
    ...overrides,
  };

  await escribir(utils, "register-nombre-input", datos.nombre);
  await escribir(utils, "register-apellido-input", datos.apellido);
  await escribir(utils, "register-usuario-input", datos.usuario);
  await escribir(utils, "register-email-input", datos.email);
  await escribir(utils, "register-password-input", datos.password);
  await escribir(utils, "register-confirmar-password-input", datos.confirmar);
  await toggleTerminos(utils);
}

describe("US - Registrarse (RegisterScreen)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("muestra el formulario de registro", async () => {
    const utils = await render(<RegisterScreen navigation={navigation} />);

    expect(utils.getByTestId("register-submit-button")).toBeTruthy();
    expect(utils.getByText("Correo electrónico")).toBeTruthy();
  });

  it("muestra todos los errores de validación si se envía el formulario vacío", async () => {
    const utils = await render(<RegisterScreen navigation={navigation} />);

    await pressSubmit(utils);

    expect(utils.getByText("El nombre es requerido.")).toBeTruthy();
    expect(utils.getByText("El apellido es requerido.")).toBeTruthy();
    expect(utils.getByText("El nombre de usuario es requerido.")).toBeTruthy();
    expect(utils.getByText("El correo es requerido.")).toBeTruthy();
    expect(utils.getByText("La contraseña es requerida.")).toBeTruthy();
    expect(utils.getByText("Confirmá tu contraseña.")).toBeTruthy();
    expect(utils.getByText("Debés aceptar los términos y condiciones.")).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rechaza un correo con formato inválido", async () => {
    const utils = await render(<RegisterScreen navigation={navigation} />);

    await completarFormularioValido(utils, { email: "no-es-un-correo" });
    await pressSubmit(utils);

    expect(utils.getByText("El correo no tiene un formato válido.")).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rechaza una contraseña que no cumple la complejidad mínima", async () => {
    const utils = await render(<RegisterScreen navigation={navigation} />);

    await completarFormularioValido(utils, {
      password: "solominusculas",
      confirmar: "solominusculas",
    });
    await pressSubmit(utils);

    expect(
      utils.getByText("La contraseña no cumple con la complejidad mínima.")
    ).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rechaza si la confirmación no coincide con la contraseña", async () => {
    const utils = await render(<RegisterScreen navigation={navigation} />);

    await completarFormularioValido(utils, { confirmar: "Otra-Clave2" });
    await pressSubmit(utils);

    expect(utils.getByText("Las contraseñas no coinciden.")).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("registra correctamente y navega a la pantalla de éxito", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({}),
    });

    const utils = await render(<RegisterScreen navigation={navigation} />);
    await completarFormularioValido(utils);
    await pressSubmit(utils);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain("/auth/register");
    const body = JSON.parse(options.body);
    expect(body).toEqual(
      expect.objectContaining({
        nombre: "Ada",
        apellido: "Lovelace",
        nombreUsuario: "adalovelace",
        email: "ada@mail.com", 
        password: "Clave-Segura1",
        aceptaTerminos: true,
      })
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("RegistrationSuccess", {
        email: "ada@mail.com",
      });
    });
  });

  it("muestra un error específico si el backend rechaza el email (422)", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ loc: ["body", "email"], msg: "value is not a valid email address" }],
      }),
    });

    const utils = await render(<RegisterScreen navigation={navigation} />);
    await completarFormularioValido(utils);
    await pressSubmit(utils);

    await waitFor(() => {
      expect(
        utils.getByText("El formato del correo no es válido o usa un dominio no permitido.")
      ).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("muestra el mensaje de error genérico del servidor", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "El nombre de usuario ya está en uso." }),
    });

    const utils = await render(<RegisterScreen navigation={navigation} />);
    await completarFormularioValido(utils);
    await pressSubmit(utils);

    await waitFor(() => {
      expect(utils.getByText("El nombre de usuario ya está en uso.")).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("muestra un mensaje de conexión si el fetch falla", async () => {
    global.fetch.mockRejectedValue(new Error("Network request failed"));

    const utils = await render(<RegisterScreen navigation={navigation} />);
    await completarFormularioValido(utils);
    await pressSubmit(utils);

    await waitFor(() => {
      expect(utils.getByText("No se pudo conectar con el servidor.")).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("navega a la pantalla de login al tocar 'Inicia sesión'", async () => {
    const utils = await render(<RegisterScreen navigation={navigation} />);

    await press(utils, "Inicia sesión");

    expect(mockNavigate).toHaveBeenCalledWith("Login");
  });
});