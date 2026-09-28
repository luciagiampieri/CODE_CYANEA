import { render, waitFor, fireEvent } from "@testing-library/react-native";
import InvitationsScreen from "../screens/InvitationsScreen";
import { Alert } from "react-native";
import {
  getNotifications,
  getPendingInvitations,
  markNotificationAsRead,
  respondToInvitation,
} from "../services/api";

const mockGoBack = jest.fn();

jest.mock("../services/api", () => ({
  getNotifications: jest.fn(),
  getPendingInvitations: jest.fn(),
  markNotificationAsRead: jest.fn(),
  markAllNotificationsAsRead: jest.fn(),
  respondToInvitation: jest.fn(),
  getNotificationsSocketUrl: jest.fn().mockRejectedValue(new Error("No socket in test")),
}));

jest.mock("../components/ui/PrimaryButton", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");

  return function PrimaryButton({ label, onPress, testID }) {
    return (
      <Pressable testID={testID || `button-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  };
});

describe("US 68 - Notificaciones por abandono de viaje (Frontend Tests)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPendingInvitations.mockResolvedValue([]);
  });

  test("muestra la notificación cuando un participante abandona el viaje (para el administrador)", async () => {
    const mockNotifications = [
      {
        id: 101,
        titulo: "Un participante abandonó el viaje",
        mensaje: "Juan Pérez abandonó el viaje 'Viaje a Bariloche'.",
        fechaCreacion: "2026-12-02T10:00:00Z",
        leida: false,
        tipo: "participante_salio",
      },
    ];

    getNotifications.mockResolvedValueOnce(mockNotifications);

    const { findByText } = await render(
      <InvitationsScreen navigation={{ goBack: mockGoBack }} />
    );

    expect(await findByText("Un participante abandonó el viaje")).toBeTruthy();
    expect(await findByText("Juan Pérez abandonó el viaje 'Viaje a Bariloche'.")).toBeTruthy();
  });

  test("muestra la notificación cuando se transfiere la administración por abandono (para el nuevo admin)", async () => {
    const mockNotifications = [
      {
        id: 102,
        titulo: "Ahora eres el administrador del viaje",
        mensaje: "Juan Pérez te asignó como nuevo administrador del viaje 'Viaje a Bariloche'.",
        fechaCreacion: "2026-12-02T10:05:00Z",
        leida: false,
        tipo: "nuevo_administrador",
      },
    ];

    getNotifications.mockResolvedValueOnce(mockNotifications);

    const { findByText } = await render(
      <InvitationsScreen navigation={{ goBack: mockGoBack }} />
    );

    expect(await findByText("Ahora eres el administrador del viaje")).toBeTruthy();
    expect(await findByText("Juan Pérez te asignó como nuevo administrador del viaje 'Viaje a Bariloche'.")).toBeTruthy();
  });

  test("permite marcar una notificación de salida como leída", async () => {
    const mockNotifications = [
      {
        id: 103,
        titulo: "Un participante abandonó el viaje",
        mensaje: "Carlos Gómez abandonó el viaje.",
        fechaCreacion: "2026-12-02T10:10:00Z",
        leida: false,
        tipo: "participante_salio",
      },
    ];

    getNotifications.mockResolvedValueOnce(mockNotifications);
    markNotificationAsRead.mockResolvedValueOnce({ message: "OK" });

    const { findByText } = await render(
      <InvitationsScreen navigation={{ goBack: mockGoBack }} />
    );

    const markButton = await findByText("Marcar como leída");
    fireEvent.press(markButton);

    await waitFor(() => {
      expect(markNotificationAsRead).toHaveBeenCalledWith(103);
    });
  });
});

describe("HU 72 - Invitación cancelada (vista del invitado)", () => {
  const invitacionPendiente = {
    tripId: 5,
    title: "Viaje a Salta",
    destinations: [],
    status: "invitado",
    role: "participante",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("muestra la notificación de invitación cancelada", async () => {
    getPendingInvitations.mockResolvedValue([]);
    getNotifications.mockResolvedValue([
      {
        id: 7,
        titulo: "Invitación cancelada",
        mensaje: "Lucia Giampieri canceló tu invitación al viaje 'Viaje a Salta'.",
        fechaCreacion: "2026-09-28T10:00:00Z",
        leida: false,
        tipo: "invitacion_cancelada",
      },
    ]);

    const { findByText } = await render(<InvitationsScreen navigation={{ goBack: jest.fn() }} />);

    expect(await findByText("Invitación cancelada")).toBeTruthy();
    expect(
      await findByText("Lucia Giampieri canceló tu invitación al viaje 'Viaje a Salta'.")
    ).toBeTruthy();
  });

  test("si la invitación fue cancelada al intentar aceptarla, avisa y la quita del listado", async () => {
    getPendingInvitations
      .mockResolvedValueOnce([invitacionPendiente])
      .mockResolvedValueOnce([]);
    getNotifications.mockResolvedValue([]);
    respondToInvitation.mockRejectedValueOnce(
      new Error("Esta invitación fue cancelada por el administrador del viaje.")
    );

    const { findByText, queryByText } = await render(
      <InvitationsScreen navigation={{ goBack: jest.fn() }} />
    );

    fireEvent.press(await findByText("Unirme"));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Atención",
        "Esta invitación fue cancelada por el administrador del viaje."
      )
    );
    await waitFor(() => expect(queryByText("Viaje a Salta")).toBeNull());
  });
});