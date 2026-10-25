import { Alert, Platform } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

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

describe("SettingScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = "ios";
  });

  it("al presionar el botón de volver, llama a navigation.goBack", async () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };

    const { getByTestId } = await render(<SettingsScreen navigation={navigation} />);

    await act(async () => {

      fireEvent.press(getByTestId("settings-back-button"));

    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("al presionar 'Cuenta', navega a EditarPerfil", async () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };

    const { getByTestId } = await render(<SettingsScreen navigation={navigation} />);

    await act(async () => {

      fireEvent.press(getByTestId("settings-cuenta-row"));

    });
    expect(navigation.navigate).toHaveBeenCalledWith("EditarPerfil");
  });

  it("al presionar 'Notificaciones', navega a PreferenciasNotificaciones", async () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };

    const { getByText } = await render(<SettingsScreen navigation={navigation} />);

    await act(async () => {

      fireEvent.press(getByText("Notificaciones"));

    });
    expect(navigation.navigate).toHaveBeenCalledWith("PreferenciasNotificaciones");
  });

  it("al presionar 'Planificación de viajes', navega a PreferenciasPlanificacion", async () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };

    const { getByTestId } = await render(<SettingsScreen navigation={navigation} />);

    await act(async () => {
      fireEvent.press(getByTestId("settings-planificacion-row"));
    });
    expect(navigation.navigate).toHaveBeenCalledWith("PreferenciasPlanificacion");
  });

  it("abre planes desde Mi cuenta", async () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const { getByTestId } = await render(<SettingsScreen navigation={navigation} />);
    await fireEvent.press(getByTestId("settings-planes-row"));
    expect(navigation.navigate).toHaveBeenCalledWith("Planes");
  });

  describe("cerrar sesión en Web (modal, en vez de Alert nativo)", () => {
    beforeEach(() => {
      Platform.OS = "web";
    });

    it("al presionar 'Cerrar sesión', abre el modal de confirmación en vez de un Alert nativo", async () => {
      const alertMock = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const navigation = { goBack: jest.fn(), navigate: jest.fn() };

      const { getByTestId, getByText } = await render(
        <SettingsScreen navigation={navigation} />
      );

      await act(async () => {

        fireEvent.press(getByTestId("logout-button"));

      });
      expect(alertMock).not.toHaveBeenCalled();
      expect(
        getByText("¿Estás seguro de que deseás cerrar tu sesión en CYANEA?")
      ).toBeTruthy();

      alertMock.mockRestore();
    });

    it("al confirmar en el modal, llama a logout", async () => {
      const navigation = { goBack: jest.fn(), navigate: jest.fn() };

      const { getByTestId } = await render(<SettingsScreen navigation={navigation} />);

      await act(async () => {

        fireEvent.press(getByTestId("logout-button"));

      });
      await act(async () => {
        fireEvent.press(getByTestId("settings-modal-confirm-logout-button"));
      });
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it("al cancelar en el modal, no llama a logout", async () => {
      const navigation = { goBack: jest.fn(), navigate: jest.fn() };

      const { getByTestId } = await render(<SettingsScreen navigation={navigation} />);

      await act(async () => {

        fireEvent.press(getByTestId("logout-button"));

      });
      await act(async () => {
        fireEvent.press(getByTestId("settings-modal-cancel-button"));
      });
      expect(mockLogout).not.toHaveBeenCalled();
    });
  });
});