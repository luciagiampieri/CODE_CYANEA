import { render } from "@testing-library/react-native";

import RegisterScreen from "../screens/RegisterScreen";

jest.mock("../components/legal/TermsModal", () => () => null);

const navigation = { navigate: jest.fn(), replace: jest.fn() };

describe("US 134 - Registro desde una invitación por correo", () => {
  it("precarga el correo de la invitación y muestra el aviso", async () => {
    const { getByTestId } = await render(
      <RegisterScreen
        navigation={navigation}
        route={{ params: { email: " Nueva@Afuera.com ", invitacion: "1" } }}
      />
    );

    expect(getByTestId("register-email-input").props.value).toBe("nueva@afuera.com");
    expect(getByTestId("register-invitacion-aviso")).toBeTruthy();
  });

  it("sin invitación el correo arranca vacío y no muestra el aviso", async () => {
    const { getByTestId, queryByTestId } = await render(
      <RegisterScreen navigation={navigation} />
    );

    expect(getByTestId("register-email-input").props.value).toBe("");
    expect(queryByTestId("register-invitacion-aviso")).toBeNull();
  });
});