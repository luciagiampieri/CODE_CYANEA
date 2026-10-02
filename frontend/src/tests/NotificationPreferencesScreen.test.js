import { Alert } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import NotificationPreferencesScreen, {
  CONSENTIMIENTO_EMAIL,
  CONSENTIMIENTO_PUSH,
  isPushDisponible,
} from "../screens/NotificationPreferencesScreen";
import * as api from "../services/api";
import * as pushNotifications from "../services/pushNotifications";

jest.mock("../services/api", () => ({
  getCurrentUser: jest.fn(),
  registerPushToken: jest.fn(),
  updateCurrentUser: jest.fn(),
}));

jest.mock("../services/pushNotifications", () => ({
  getExpoPushTokenForDevice: jest.fn(),
  getPushAvailabilityReason: jest.fn(() => null),
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
    consienteNotificacionesPush: false,
    fechaConsentimientoNotificacionesEmail: null,
    fechaConsentimientoNotificacionesPush: null,
    recibeEmailsNuevasActividades: true,
    recibeEmailsNuevaVotacion: true,
    recibeEmailsCambiosViaje: false,
    recibeEmailsNuevosGastos: true,
    recibeEmailsRecordatoriosDeuda: false,
    recibeEmailsRecordatoriosActividad: true,
    recibeEmailsRecordatoriosReserva: false,
    recibePushNuevasActividades: true,
    recibePushNuevaVotacion: true,
    recibePushCambiosViaje: true,
    recibePushNuevosGastos: true,
    recibePushRecordatoriosDeuda: true,
    recibePushRecordatoriosActividad: true,
    recibePushRecordatoriosReserva: true,
    ...overrides,
  };
}

// Simula que el usuario toca un botón del Alert de consentimiento.
function responderAlertCon(textoBoton) {
  return jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => {
    const boton = (botones || []).find((b) => b.text === textoBoton);
    if (boton?.onPress) boton.onPress();
  });
}

describe("NotificationPreferencesScreen", () => {
  let alertSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks no descarta las respuestas encoladas con mock*Once que un
    // test anterior no llegó a consumir. Se resetean solo los mocks propios
    // de este archivo: resetAllMocks también borraría los mocks globales del
    // preset de React Native y rompería el render.
    [
      api.getCurrentUser,
      api.registerPushToken,
      api.updateCurrentUser,
      pushNotifications.getExpoPushTokenForDevice,
      pushNotifications.getPushAvailabilityReason,
    ].forEach((mock) => mock.mockReset());
    pushNotifications.getPushAvailabilityReason.mockImplementation(() => null);
    alertSpy = responderAlertCon("Acepto");
  });

  afterEach(() => {
    alertSpy.mockRestore();
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

    expect(queryByText("Preferencias por tipo")).toBeNull();

    await act(async () => {
      resolveGetCurrentUser(usuario());
    });
  });

  it("una vez cargado, muestra las preferencias con los valores del usuario", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario());

    const { getByText, getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(getByText("Canales")).toBeTruthy();
    expect(getByText("Preferencias por tipo")).toBeTruthy();
    expect(getByTestId("notification-prefs-master-switch").props.value).toBe(true);
    expect(
      getByTestId("notification-prefs-switch-recibeEmailsNuevaVotacion").props.value
    ).toBe(true);
    expect(
      getByTestId("notification-prefs-switch-recibeEmailsCambiosViaje").props.value
    ).toBe(false);
    expect(getByTestId("notification-prefs-push-master-switch").props.value).toBe(false);
    expect(getByTestId("notification-prefs-switch-recibePushNuevaVotacion").props.value).toBe(false);
    expect(getByTestId("notification-prefs-switch-recibeEmailsNuevosGastos").props.value).toBe(true);
    expect(getByTestId("notification-prefs-switch-recibeEmailsRecordatoriosActividad").props.value).toBe(true);
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

  it("al activar push, pide consentimiento, token y registra el dispositivo", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario());
    api.updateCurrentUser.mockResolvedValueOnce({});
    api.registerPushToken.mockResolvedValueOnce({});
    pushNotifications.getExpoPushTokenForDevice.mockResolvedValueOnce({
      token: "ExponentPushToken[test]",
      plataforma: "ios",
      dispositivoId: "device-1",
    });

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    await act(async () => {
      fireEvent(getByTestId("notification-prefs-push-master-switch"), "valueChange", true);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      CONSENTIMIENTO_PUSH.titulo,
      CONSENTIMIENTO_PUSH.mensaje,
      expect.any(Array),
      expect.any(Object)
    );
    expect(api.updateCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ consienteNotificacionesPush: true })
    );
    expect(api.registerPushToken).toHaveBeenCalledWith({
      token: "ExponentPushToken[test]",
      plataforma: "ios",
      dispositivoId: "device-1",
    });
  });

  it("considera push no disponible en web o Expo Go Android", () => {
    expect(isPushDisponible("web", "unsupported_platform")).toBe(false);
    expect(isPushDisponible("android", "expo_go_android")).toBe(false);
    expect(isPushDisponible("ios", null)).toBe(true);
    expect(isPushDisponible("android", null)).toBe(true);
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
  });

  // --- US 60 -------------------------------------------------------------

  it("US 60 CA1: muestra 'Nuevas actividades' como tipo independiente de 'Cambios en el itinerario'", async () => {
    api.getCurrentUser.mockResolvedValueOnce(
      usuario({ consienteNotificacionesPush: true, recibePushCambiosViaje: true })
    );
    api.updateCurrentUser.mockResolvedValueOnce({});

    const { getByText, getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(getByText("Nuevas actividades")).toBeTruthy();
    expect(getByText("Cambios en el itinerario")).toBeTruthy();
    expect(getByText("Votaciones activas")).toBeTruthy();
    expect(getByText("Deudas pendientes")).toBeTruthy();
    expect(getByText("Vencimientos de reservas")).toBeTruthy();

    await act(async () => {
      fireEvent(
        getByTestId("notification-prefs-switch-recibePushNuevasActividades"),
        "valueChange",
        false
      );
    });

    expect(api.updateCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({
        recibePushNuevasActividades: false,
        recibePushCambiosViaje: true,
      })
    );
  });

  it("US 60 CA3: activar email pide consentimiento explícito y, al aceptarlo, lo guarda", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario({ consienteNotificacionesEmail: false }));
    api.updateCurrentUser.mockResolvedValueOnce({});

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    await act(async () => {
      fireEvent(getByTestId("notification-prefs-master-switch"), "valueChange", true);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      CONSENTIMIENTO_EMAIL.titulo,
      CONSENTIMIENTO_EMAIL.mensaje,
      expect.any(Array),
      expect.any(Object)
    );
    expect(api.updateCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ consienteNotificacionesEmail: true })
    );
    expect(getByTestId("notification-prefs-master-switch").props.value).toBe(true);
  });

  it("US 60 CA3: si el usuario cancela el consentimiento de email, no se guarda nada", async () => {
    alertSpy.mockRestore();
    alertSpy = responderAlertCon("Cancelar");
    api.getCurrentUser.mockResolvedValueOnce(usuario({ consienteNotificacionesEmail: false }));

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    await act(async () => {
      fireEvent(getByTestId("notification-prefs-master-switch"), "valueChange", true);
    });

    expect(api.updateCurrentUser).not.toHaveBeenCalled();
    expect(getByTestId("notification-prefs-master-switch").props.value).toBe(false);
  });

  it("US 60 CA3: si el usuario cancela el consentimiento push, no pide token ni guarda", async () => {
    alertSpy.mockRestore();
    alertSpy = responderAlertCon("Cancelar");
    api.getCurrentUser.mockResolvedValueOnce(usuario());

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    await act(async () => {
      fireEvent(getByTestId("notification-prefs-push-master-switch"), "valueChange", true);
    });

    expect(pushNotifications.getExpoPushTokenForDevice).not.toHaveBeenCalled();
    expect(api.updateCurrentUser).not.toHaveBeenCalled();
    expect(api.registerPushToken).not.toHaveBeenCalled();
  });

  it("US 60 CA3: revocar un consentimiento no pide confirmación", async () => {
    api.getCurrentUser.mockResolvedValueOnce(usuario({ consienteNotificacionesPush: true }));
    api.updateCurrentUser.mockResolvedValueOnce({});

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    await act(async () => {
      fireEvent(getByTestId("notification-prefs-push-master-switch"), "valueChange", false);
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(api.updateCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ consienteNotificacionesPush: false })
    );
  });

  it("US 60 CA3: muestra la fecha en que se otorgó el consentimiento", async () => {
    api.getCurrentUser.mockResolvedValueOnce(
      usuario({ fechaConsentimientoNotificacionesEmail: "2026-10-02T12:00:00Z" })
    );

    const { getByTestId, queryByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(getByTestId("notification-prefs-email-consent-date")).toBeTruthy();
    expect(queryByTestId("notification-prefs-push-consent-date")).toBeNull();
  });

  it("US 60 CA4: en web, con push ya consentido, se pueden editar los tipos y revocar", async () => {
    pushNotifications.getPushAvailabilityReason.mockImplementation(() => "unsupported_platform");
    api.getCurrentUser.mockResolvedValueOnce(usuario({ consienteNotificacionesPush: true }));

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(getByTestId("notification-prefs-push-master-switch").props.disabled).toBe(false);
    expect(
      getByTestId("notification-prefs-switch-recibePushNuevosGastos").props.disabled
    ).toBe(false);
    expect(
      getByTestId("notification-prefs-switch-recibePushNuevosGastos").props.value
    ).toBe(true);
  });

  it("US 60 CA4: en web, sin consentimiento push, no se puede activar", async () => {
    pushNotifications.getPushAvailabilityReason.mockImplementation(() => "unsupported_platform");
    api.getCurrentUser.mockResolvedValueOnce(usuario({ consienteNotificacionesPush: false }));

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={{ goBack: jest.fn() }} />
    );

    expect(getByTestId("notification-prefs-push-master-switch").props.disabled).toBe(true);
  });

  it("US 60 CA4: al volver a la pantalla recarga las preferencias", async () => {
    const listeners = {};
    const navigation = {
      goBack: jest.fn(),
      addListener: jest.fn((evento, callback) => {
        listeners[evento] = callback;
        return jest.fn();
      }),
    };
    api.getCurrentUser
      .mockResolvedValueOnce(usuario())
      .mockResolvedValueOnce(usuario({ consienteNotificacionesEmail: false }));

    const { getByTestId } = await render(
      <NotificationPreferencesScreen navigation={navigation} />
    );

    // El primer foco coincide con el montaje y no vuelve a pedir datos.
    await act(async () => {
      listeners.focus();
    });
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1);

    await act(async () => {
      listeners.focus();
    });
    expect(api.getCurrentUser).toHaveBeenCalledTimes(2);
    expect(getByTestId("notification-prefs-master-switch").props.value).toBe(false);
  });
});
