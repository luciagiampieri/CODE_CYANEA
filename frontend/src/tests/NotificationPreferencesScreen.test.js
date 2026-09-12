import { Alert } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import NotificationPreferencesScreen from "../screens/NotificationPreferencesScreen";
import * as api from "../services/api";

jest.mock("../services/api", () => ({
  getCurrentUser: jest.fn(),
  updateCurrentUser: jest.fn(),
}));

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({ isDesktop: false }),
}));

function usuario(overrides = {}) {
  return {
    nombre: "Ada",
    apellido: "Lovelace",
    nombreUsuario: "adalovelace",
    fotoUrl: null,
    consienteNotificacionesEmail: true,
    recibeEmailsNuevaVotacion: true,
    recibeEmailsCambiosViaje: false,
    recibeEmailsRecordatoriosDeuda: false,
    recibeEmailsRecordatoriosReserva: false,
    ...overrides,
  };
}

describe("NotificationPreferencesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mientras carga, muestra el spinner y no las preferencias", async () => {
    let resolveGetCurrentUser;
    api.getCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveGetCurrentUser = resolve;
      })
    );

    const { queryByText } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(queryByText("Notificaciones por email")).toBeNull();

    await act(async () => {
      resolveGetCurrentUser(usuario());
    });
  });

  it("una vez cargado, muestra las preferencias con los valores del usuario", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario());

    const { getByText, getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(getByText("Notificaciones por email")).toBeTruthy();
    expect(getByText("Nuevas votaciones")).toBeTruthy();
    expect(getByTestId("notification-prefs-master-switch").props.value).toBe(true);
    expect(
      getByTestId("notification-prefs-switch-recibeEmailsNuevaVotacion").props.value
    ).toBe(true);
    expect(
      getByTestId("notification-prefs-switch-recibeEmailsCambiosViaje").props.value
    ).toBe(false);
  });

  it("si falla la carga, muestra el mensaje de error", async () => {
    api.getCurrentUser.mockRejectedValueOnce(new Error("No hay conexión."));

    const { getByText } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(getByText("No hay conexión.")).toBeTruthy();
  });

  it("si falla la carga sin mensaje, usa el error genérico", async () => {
    api.getCurrentUser.mockRejectedValueOnce({});

    const { getByText } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(getByText("No se pudieron cargar tus preferencias.")).toBeTruthy();
  });

  it("con notificaciones apagadas, los switches por tipo quedan deshabilitados", async () => {
    api.getCurrentUser.mockResolvedValueOnce(
      usuario({ consienteNotificacionesEmail: false })
    );

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(
      getByTestId("notification-prefs-switch-recibeEmailsNuevaVotacion").props.disabled
    ).toBe(true);
  });

  it("al tocar el botón de volver, llama a navigation.goBack", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario());
    const navigation = { goBack: jest.fn() };

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={navigation} />
    );

    await act(async () => {
      fireEvent(getByTestId("notification-prefs-back-button"), "press");
    });

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it("al togglear el switch maestro, guarda el cambio con el resto de los datos del usuario", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario());
    api.updateCurrentUser.mockResolvedValueOnce({});

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    await act(async () => {
      fireEvent(getByTestId("notification-prefs-master-switch"), "valueChange", false);
    });

    expect(api.updateCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Ada",
        apellido: "Lovelace",
        consienteNotificacionesEmail: false,
      })
    );
  });

  it("al togglear un tipo puntual, guarda solo ese cambio", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario());
    api.updateCurrentUser.mockResolvedValueOnce({});

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    await act(async () => {
      fireEvent(
        getByTestId("notification-prefs-switch-recibeEmailsCambiosViaje"),
        "valueChange",
        true
      );
    });

    expect(api.updateCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ recibeEmailsCambiosViaje: true })
    );
  });

  it("si falla el guardado, revierte el cambio y muestra un Alert", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario());
    api.updateCurrentUser.mockRejectedValueOnce(new Error("Server down"));
    const alertMock = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    await act(async () => {
      fireEvent(getByTestId("notification-prefs-master-switch"), "valueChange", false);
    });

    expect(alertMock).toHaveBeenCalledWith("No se pudo guardar", "Server down");
    expect(getByTestId("notification-prefs-master-switch").props.value).toBe(true);

    alertMock.mockRestore();
  });
});