import { Alert } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import SettingsScreen from "../screens/SettingScreen";

const mockLogout = jest.fn();

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    logout: mockLogout,
  }),
}));

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({
    isDesktop: false,
  }),
}));

describe("US 07 - Cerrar sesión", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("muestra la opción Cerrar sesión", async () => {
    const { getByText } = await render(
      <SettingsScreen navigation={{}} />
    );

    expect(getByText("Cerrar sesión")).toBeTruthy();
  });

  it("cierra la sesión al confirmar la operación", async () => {
    const alertMock = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        const confirmButton = buttons?.find(
          (button) => button.text === "Cerrar sesión"
        );

        confirmButton?.onPress?.();
      });

    const { getByTestId } = await render(
      <SettingsScreen navigation={{}} />
    );

    fireEvent.press(getByTestId("logout-button"));

    expect(alertMock).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalledTimes(1);

    alertMock.mockRestore();
  });

  it("mantiene la sesión activa al cancelar el cierre de sesión", async () => {
    const alertMock = jest
      .spyOn(Alert, "alert")
      .mockImplementation((title, message, buttons) => {
        const cancelButton = buttons?.find(
          (button) => button.text === "Cancelar"
        );

        cancelButton?.onPress?.();
      });

    const { getByTestId } = await render(
      <SettingsScreen navigation={{}} />
    );

    fireEvent.press(getByTestId("logout-button"));

    expect(alertMock).toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();

    alertMock.mockRestore();
  });
});