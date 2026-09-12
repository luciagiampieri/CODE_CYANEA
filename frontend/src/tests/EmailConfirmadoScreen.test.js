import { fireEvent, render } from "@testing-library/react-native";

import EmailConfirmadoScreen from "../screens/EmailConfirmadoScreen";

function renderScreen(status) {
  const navigation = { replace: jest.fn() };
  const route = { params: { status } };
  return {
    navigation,
    renderPromise: render(
      <EmailConfirmadoScreen navigation={navigation} route={route} />
    ),
  };
}

describe("EmailConfirmadoScreen", () => {
  it("con status 'ok', muestra el mensaje de cuenta confirmada", async () => {
    const { renderPromise } = renderScreen("ok");
    const { getByText } = await renderPromise;

    expect(getByText("¡Cuenta confirmada!")).toBeTruthy();
    expect(
      getByText(
        "Tu correo fue verificado exitosamente. Ya podés iniciar sesión en Cyanea."
      )
    ).toBeTruthy();
    expect(getByText("Ir al login")).toBeTruthy();
  });

  it("con status 'ya-confirmado', muestra el mensaje correspondiente", async () => {
    const { renderPromise } = renderScreen("ya-confirmado");
    const { getByText } = await renderPromise;

    expect(getByText("Ya confirmada")).toBeTruthy();
    expect(
      getByText("Tu cuenta ya fue confirmada anteriormente. Podés iniciar sesión.")
    ).toBeTruthy();
  });

  it("con status 'error', muestra el enlace inválido y el botón para volver a registrarse", async () => {
    const { renderPromise } = renderScreen("error");
    const { getByText } = await renderPromise;

    expect(getByText("Enlace inválido")).toBeTruthy();
    expect(getByText("Volver al registro")).toBeTruthy();
  });

  it("con un status desconocido o ausente, cae al estado de error por defecto", async () => {
    const navigation = { replace: jest.fn() };
    const route = { params: {} };

    const { getByText } = await render(
      <EmailConfirmadoScreen navigation={navigation} route={route} />
    );

    expect(getByText("Enlace inválido")).toBeTruthy();
  });

  it("con status 'ok', al presionar el botón navega a Login", async () => {
    const { navigation, renderPromise } = renderScreen("ok");
    const { getByText } = await renderPromise;

    fireEvent.press(getByText("Ir al login"));

    expect(navigation.replace).toHaveBeenCalledWith("Login");
  });

  it("con status 'error', al presionar el botón navega a Register", async () => {
    const { navigation, renderPromise } = renderScreen("error");
    const { getByText } = await renderPromise;

    fireEvent.press(getByText("Volver al registro"));

    expect(navigation.replace).toHaveBeenCalledWith("Register");
  });

  it("siempre muestra el logo y el tagline de Cyanea", async () => {
    const { renderPromise } = renderScreen("ok");
    const { getByText } = await renderPromise;

    expect(getByText("CYANEA")).toBeTruthy();
    expect(getByText("Muchas manos, un único destino")).toBeTruthy();
  });
});