import { fireEvent, render } from "@testing-library/react-native";

import RegistrationSuccessScreen from "../screens/RegistrationSuccessScreen";

function renderScreen({ email = "ada@mail.com" } = {}) {
  const navigation = { replace: jest.fn() };
  const route = { params: { email } };
  const utils = { navigation, route };
  return {
    ...utils,
    render: async () =>
      render(<RegistrationSuccessScreen navigation={navigation} route={route} />),
  };
}

describe("RegistrationSuccessScreen", () => {
  it("muestra el email al que se envió la confirmación", async () => {
    const { render: doRender } = renderScreen({ email: "ada@mail.com" });
    const { getByText } = await doRender();

    expect(getByText(/Revisá la bandeja de entrada de ada@mail.com/)).toBeTruthy();
  });

  it("muestra el título y el mensaje de instrucciones", async () => {
    const { render: doRender } = renderScreen();
    const { getByText } = await doRender();

    expect(getByText("¡Revisá tu correo electrónico!")).toBeTruthy();
    expect(getByText(/El enlace es válido por 24 horas/)).toBeTruthy();
    expect(getByText("Reenviar correo de confirmación")).toBeTruthy();
  });

  it("al presionar el botón, navega a Login reemplazando la pantalla actual", async () => {
    const { navigation, render: doRender } = renderScreen();
    const { getByText } = await doRender();

    await fireEvent.press(getByText("Ir al inicio de sesión"));

    expect(navigation.replace).toHaveBeenCalledWith("Login");
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it("muestra un email distinto si viene otro en route.params", async () => {
    const { render: doRender } = renderScreen({ email: "otra@mail.com" });
    const { getByText, queryByText } = await doRender();

    expect(getByText(/Revisá la bandeja de entrada de otra@mail.com/)).toBeTruthy();
    expect(queryByText(/Revisá la bandeja de entrada de ada@mail.com/)).toBeNull();
  });
});
