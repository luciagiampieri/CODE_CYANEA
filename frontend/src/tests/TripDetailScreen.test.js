import { act, render, waitFor, fireEvent } from "@testing-library/react-native";
import { Alert, Platform } from "react-native";
import { DialogHost } from "../components/ui/AppDialog";
import TripDetailScreen from "../screens/TripDetailScreen";
import {
  getCurrentUser,
  leaveTrip,
  transferTripAdministration,
  getTripDetail,
  getTripPlaces,
  getTripSettlement,
  getMySettlementBalance,
  reportSettlementTransfer,
  getTripDocuments,
  getVotaciones,
  getRepositorioItems,
  getTripParticipants,
  onTripFinishedError,
  getSentInvitations,
  cancelSentInvitation,
  addTripParticipant,
  getTripExpenses,
  getExpenseCategories,
  sendTripAssistantMessage,
  updateAssistantConsent,
  getExpenseDetail,
  getItinerarySocketUrl,
  getActivitySuggestions,
} from "../services/api";

jest.mock("react-native-maps", () => {
  const React = require("react");
  const { View } = require("react-native");
  class MockMapView extends React.Component {
    render() {
      return <View>{this.props.children}</View>;
    }
  }
  return {
    __esModule: true,
    default: MockMapView,
    Marker: (props) => <View {...props} />,
    Polyline: (props) => <View {...props} />,
    PROVIDER_GOOGLE: "google",
  };
});

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  })),
}));

jest.mock("@react-navigation/native", () => {
  const actualNav = jest.requireActual("@react-navigation/native");
  return {
    ...actualNav,
    useFocusEffect: (callback) => {
      const { useEffect } = require("react");
      useEffect(callback, []);
    },
  };
});

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../services/api", () => ({
  getMySettlementBalance: jest.fn(),
  reportSettlementTransfer: jest.fn(),
  rejectSettlementTransfer: jest.fn(),
  getCurrentUser: jest.fn(),
  leaveTrip: jest.fn(),
  transferTripAdministration: jest.fn(),
  getTripDetail: jest.fn(),
  getTripPlaces: jest.fn(),
  getVotaciones: jest.fn(),
  getTripDocuments: jest.fn(),
  getRepositorioItems: jest.fn(),
  getTripSettlement: jest.fn(),
  getTripParticipants: jest.fn(),
  getExpenseCategories: jest.fn(),
  getSentInvitations: jest.fn(),
  cancelSentInvitation: jest.fn(),
  addTripParticipant: jest.fn(),
  getTripExpenses: jest.fn(),
  sendTripAssistantMessage: jest.fn(),
  updateAssistantConsent: jest.fn(),
  onTripFinishedError: jest.fn(),
  getExpenseDetail: jest.fn(),
  getItinerarySocketUrl: jest.fn(),
  getActivitySuggestions: jest.fn(),
}));

jest.mock("../hooks/useItinerarioViewPreference", () => ({
  __esModule: true,
  default: () => ["timeline", jest.fn()],
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

/**
 * Deja TODOS los mocks de la API con valores por defecto válidos.
 * Se llama en cada beforeEach porque jest.restoreAllMocks() (en versiones
 * anteriores a Jest 30) también borra las implementaciones de los jest.fn().
 */
function setupDefaultMocks() {
  getCurrentUser.mockResolvedValue({
    id: 1,
    nombre: "Juan",
    apellido: "Pérez",
    email: "juan@gmail.com",
  });
  getTripPlaces.mockResolvedValue([]);
  getVotaciones.mockResolvedValue([]);
  getTripDocuments.mockResolvedValue([]);
  getRepositorioItems.mockResolvedValue([]);
  getTripParticipants.mockResolvedValue([]);
  getExpenseCategories.mockResolvedValue([]);
  getSentInvitations.mockResolvedValue([]);
  getTripExpenses.mockResolvedValue([]);
  getActivitySuggestions.mockResolvedValue([]);
  sendTripAssistantMessage.mockResolvedValue({ message: "Listo" });
  updateAssistantConsent.mockResolvedValue({
    consienteAsistenteIA: true,
    fechaConsentimientoAsistenteIA: "2026-10-03T00:00:00Z",
  });
  getTripSettlement.mockResolvedValue({});
  onTripFinishedError.mockImplementation(() => jest.fn());
  // Sin URL el WebSocket del viaje no se conecta (como antes de mockearlo).
  getItinerarySocketUrl.mockRejectedValue(new Error("sin websocket en tests"));
}

function makeNavigation() {
  return {
    goBack: mockGoBack,
    navigate: mockNavigate,
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };
}

describe("Transferir organización sin abandonar", () => {
  const WebSocketOriginal = global.WebSocket;
  const trip = {
    id: 1, title: "Viaje grupal", status: "activo", hasLeft: false, currency: "ARS",
    startDate: "2099-12-01", endDate: "2099-12-10",
    admin: { id: 1, nombreCompleto: "Juan Pérez" },
    participants: [
      { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
      { id: 2, nombreCompleto: "Carlos Gómez", role: "participante", status: "aceptado" },
      { id: 3, nombreCompleto: "Invitado", role: "participante", status: "invitado" },
    ], cronograma: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    getTripDetail.mockResolvedValue(trip);
    transferTripAdministration.mockResolvedValue({ message: "Seguís en el grupo como participante." });
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    global.WebSocket = WebSocketOriginal;
  });

  function confirmacion() {
    return Alert.alert.mock.calls.find(([titulo]) => titulo.includes("¿Transferir"));
  }

  function botonesConfirmacion() {
    return confirmacion()[2];
  }

  async function abrirAccion() {
    const utils = await render(<TripDetailScreen navigation={makeNavigation()} route={{ params: { trip } }} />);
    await fireEvent.press(await utils.findByText("Grupo"));
    await fireEvent.press(await utils.findByTestId("group-member-menu-user-2"));
    await fireEvent.press(await utils.findByTestId("group-member-transfer-user-2"));
    // El menú flotante se cierra antes de ejecutar la acción, así que la
    // confirmación llega un instante después. Esperarla acá también evita que
    // el temporizador de un test se dispare durante el siguiente.
    await waitFor(() => expect(confirmacion()).toBeTruthy());
    return utils;
  }

  test.each(["cancelar", "exito", "error"])("web usa el diálogo de Cyanea para %s", async (caso) => {
    const plataformaAnterior = Platform.OS;
    const ventanaAnterior = global.window;
    const ventana = { alert: jest.fn(), confirm: jest.fn() };
    Platform.OS = "web";
    global.window = ventana;
    let utils;
    try {
      if (caso === "error") transferTripAdministration.mockRejectedValue(new Error("No se pudo transferir."));
      utils = await render(
        <>
          <TripDetailScreen navigation={makeNavigation()} route={{ params: { trip } }} />
          <DialogHost root />
        </>
      );
      await fireEvent.press(await utils.findByText("Grupo"));
      await fireEvent.press(await utils.findByTestId("group-member-menu-user-2"));
      await fireEvent.press(await utils.findByTestId("group-member-transfer-user-2"));
      expect(await utils.findByText("¿Transferir la organización a Carlos Gómez?")).toBeTruthy();
      await fireEvent.press(utils.getByText(caso === "cancelar" ? "Cancelar" : "Transferir organización"));
      if (caso === "cancelar") {
        await waitFor(() => expect(utils.queryByText("¿Transferir la organización a Carlos Gómez?")).toBeNull());
        expect(transferTripAdministration).not.toHaveBeenCalled();
      } else {
        expect(await utils.findByText(caso === "exito" ? "Administración transferida" : "No se pudo transferir la administración")).toBeTruthy();
        expect(transferTripAdministration).toHaveBeenCalledWith(1, 2);
      }
      expect(ventana.alert).not.toHaveBeenCalled();
      expect(ventana.confirm).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    } finally {
      if (utils) await utils.unmount();
      Platform.OS = plataformaAnterior;
      global.window = ventanaAnterior;
    }
  });

  test("cancelar conserva al administrador y no llama al backend", async () => {
    await abrirAccion();
    await act(async () => botonesConfirmacion().find((b) => b.style === "cancel").onPress());
    expect(transferTripAdministration).not.toHaveBeenCalled();
    expect(leaveTrip).not.toHaveBeenCalled();
  });

  test("confirmar transfiere y actualiza los permisos sin abandonar", async () => {
    const utils = await abrirAccion();
    const detalleNuevo = { ...trip, admin: { id: 2, nombreCompleto: "Carlos Gómez" },
      participants: trip.participants.map((p) => ({ ...p, role: p.id === 2 ? "administrador" : "participante" })) };
    getTripDetail.mockResolvedValue(detalleNuevo);
    await act(async () => botonesConfirmacion().find((b) => b.text === "Transferir organización").onPress());
    await waitFor(() => expect(transferTripAdministration).toHaveBeenCalledWith(1, 2));
    await waitFor(() => expect(utils.queryByTestId("group-invite-toggle")).toBeNull());
    expect(utils.queryByText("Ya no formás parte de este viaje")).toBeNull();
    expect(leaveTrip).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith("Administración transferida", "Seguís en el grupo como participante.", undefined, { tipo: "success" });
  });

  test("si falla, muestra el error y recarga los permisos", async () => {
    transferTripAdministration.mockRejectedValue(new Error("El participante abandonó el viaje."));
    const utils = await abrirAccion();
    const lecturas = getTripDetail.mock.calls.length;
    await act(async () => botonesConfirmacion().find((b) => b.text === "Transferir organización").onPress());
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("No se pudo transferir la administración", "El participante abandonó el viaje.", undefined, { tipo: "error" }));
    expect(getTripDetail.mock.calls.length).toBeGreaterThan(lecturas);
    expect(await utils.findByTestId("group-invite-toggle")).toBeTruthy();
    expect(leaveTrip).not.toHaveBeenCalled();
  });

  test("abandonar solo ofrece participantes aceptados", async () => {
    const utils = await render(<TripDetailScreen navigation={makeNavigation()} route={{ params: { trip } }} />);
    await fireEvent.press(await utils.findByText("Grupo"));
    await fireEvent.press(await utils.findByText("Abandonar viaje"));
    expect(await utils.findByTestId("admin-candidate-2")).toBeTruthy();
    expect(utils.queryByTestId("admin-candidate-3")).toBeNull();
  });

  test("muestra progreso y bloquea otras acciones mientras transfiere", async () => {
    let completar;
    transferTripAdministration.mockImplementation(() => new Promise((resolve) => { completar = resolve; }));
    const utils = await abrirAccion();
    await act(async () => botonesConfirmacion().find((b) => b.text === "Transferir organización").onPress());
    expect(await utils.findByText("Transfiriendo organización…")).toBeTruthy();
    expect(utils.queryByTestId("group-member-menu-user-2")).toBeNull();
    expect(utils.queryByTestId("group-invite-toggle")).toBeNull();
    await act(async () => completar({ message: "Transferida" }));
    await waitFor(() => expect(utils.queryByText("Transfiriendo organización…")).toBeNull());
    expect(transferTripAdministration).toHaveBeenCalledTimes(1);
  });

  test("un evento de otra sesión recarga el nuevo administrador", async () => {
    const socket = { close: jest.fn() };
    global.WebSocket = jest.fn(() => socket);
    getItinerarySocketUrl.mockResolvedValue("ws://test/itinerary");
    const utils = await render(<TripDetailScreen navigation={makeNavigation()} route={{ params: { trip } }} />);
    await fireEvent.press(await utils.findByText("Grupo"));
    expect(await utils.findByTestId("group-invite-toggle")).toBeTruthy();
    await waitFor(() => expect(socket.onmessage).toBeDefined());
    getTripDetail.mockResolvedValue({ ...trip, admin: { id: 2, nombreCompleto: "Carlos Gómez" } });
    await act(async () => socket.onmessage({ data: JSON.stringify({ tipo: "administracion_transferida" }) }));
    await waitFor(() => expect(utils.queryByTestId("group-invite-toggle")).toBeNull());
    expect(transferTripAdministration).not.toHaveBeenCalled();
  });
});

describe("US 68 - Abandonar un viaje (Suite completa de tests frontend)", () => {
  const mockTripActive = {
    id: 1,
    title: "Viaje a Bariloche",
    destination: "Bariloche, Argentina",
    status: "activo",
    hasLeft: false,
    currency: "ARS",
    startDate: "2026-12-01",
    endDate: "2026-12-10",
    admin: { id: 2, nombreCompleto: "Admin Test", email: "admin@test.com" },
    participants: [
      { id: 1, nombreCompleto: "Juan Pérez", role: "participante", status: "aceptado" },
      { id: 2, nombreCompleto: "Admin Test", role: "administrador", status: "aceptado" },
    ],
    cronograma: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();

    getTripDetail.mockResolvedValue(mockTripActive);

    jest.spyOn(Alert, "alert").mockImplementation((title, message, buttons) => {
      const confirmButton = buttons?.find(
        (b) => b.style === "destructive" || b.text === "Confirmar"
      );
      if (confirmButton && confirmButton.onPress) {
        confirmButton.onPress();
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("1. muestra la opcion abandonar viaje a un participante aceptado en un viaje activo", async () => {
    const { findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: mockTripActive } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));
    const leaveButton = await findByText("Abandonar viaje");
    expect(leaveButton).toBeTruthy();
  });

  test("2. solicita confirmación antes de ejecutar el abandono", async () => {
    const { findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: mockTripActive } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));
    await fireEvent.press(await findByText("Abandonar viaje"));

    expect(Alert.alert).toHaveBeenCalled();
  });

  test("3. cancela el abandono y el usuario sigue participando (no se llama a leaveTrip)", async () => {
    Alert.alert.mockImplementationOnce((title, message, buttons) => {
      const cancelButton = buttons?.find(
        (b) => b.style === "cancel" || b.text === "Volver"
      );
      if (cancelButton && cancelButton.onPress) {
        cancelButton.onPress();
      }
    });

    const { findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: mockTripActive } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));
    await fireEvent.press(await findByText("Abandonar viaje"));

    expect(leaveTrip).not.toHaveBeenCalled();
  });

  test("4. confirma el abandono, llama a leaveTrip y muestra el mensaje de confirmación", async () => {
    leaveTrip.mockResolvedValueOnce({
      message: "Has abandonado el viaje correctamente.",
    });

    const { findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: mockTripActive } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));
    await fireEvent.press(await findByText("Abandonar viaje"));

    await waitFor(() => {
      expect(leaveTrip).toHaveBeenCalledWith(1, {
        confirmar: true,
        nuevoAdministradorId: null,
      });
    });
  });

  test("5. al abandonar se muestra el banner de solo lectura y se ocultan las acciones de organización", async () => {
    const tripWithHasLeft = { ...mockTripActive, hasLeft: true };
    getTripDetail.mockResolvedValue(tripWithHasLeft);

    const { queryByText, findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: tripWithHasLeft } }}
      />
    );

    expect(await findByText("Ya no formás parte de este viaje")).toBeTruthy();

    await fireEvent.press(await findByText("Gastos"));
    expect(queryByText("Agregar gasto")).toBeNull();

    await fireEvent.press(await findByText("Docs"));
    expect(queryByText("Subir documentos")).toBeNull();
  });

  test("6. si el usuario es admin y hay otros participantes, pide transferir la administración antes de abandonar", async () => {
    const mockTripAdminUser = {
      ...mockTripActive,
      admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
      participants: [
        { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
        { id: 2, nombreCompleto: "Carlos Gómez", role: "participante", status: "aceptado" },
      ],
    };
    getTripDetail.mockResolvedValue(mockTripAdminUser);

    const { findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: mockTripAdminUser } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));
    await fireEvent.press(await findByText("Abandonar viaje"));

    expect(await findByText("Transferir organización")).toBeTruthy();
  });

  test("7. si el admin intenta confirmar la salida sin elegir nuevo administrador, falla y no llama a leaveTrip", async () => {
    const mockTripAdminUser = {
      ...mockTripActive,
      admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
      participants: [
        { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
        { id: 2, nombreCompleto: "Carlos Gómez", role: "participante", status: "aceptado" },
      ],
    };
    getTripDetail.mockResolvedValue(mockTripAdminUser);

    const { findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: mockTripAdminUser } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));
    await fireEvent.press(await findByText("Abandonar viaje"));

    const buttons = await findByText("Confirmar salida");
    await fireEvent.press(buttons);

    expect(leaveTrip).not.toHaveBeenCalled();
  });

  test("8. el admin elige un nuevo administrador y al confirmar se llama a leaveTrip con nuevoAdministradorId", async () => {
    const mockTripAdminUser = {
      ...mockTripActive,
      admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
      participants: [
        { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
        { id: 2, nombreCompleto: "Carlos Gómez", role: "participante", status: "aceptado" },
      ],
    };
    getTripDetail.mockResolvedValue(mockTripAdminUser);
    leaveTrip.mockResolvedValueOnce({ message: "Éxito" });

    const { findByTestId, findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: mockTripAdminUser } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));
    await fireEvent.press(await findByText("Abandonar viaje"));

    const candidateItem = await findByTestId("admin-candidate-2");
    await fireEvent.press(candidateItem);

    const confirmButton = await findByText("Confirmar salida");
    await fireEvent.press(confirmButton);

    await waitFor(() => {
      expect(leaveTrip).toHaveBeenCalledWith(1, {
        confirmar: true,
        nuevoAdministradorId: 2,
      });
    });
  });

  test("9. si el admin es el único participante aceptado, se le pide confirmación directa (sin modal de transferencia)", async () => {
    const mockTripSingleAdmin = {
      ...mockTripActive,
      admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
      participants: [
        { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
      ],
    };
    getTripDetail.mockResolvedValue(mockTripSingleAdmin);

    const { findByText, queryByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: mockTripSingleAdmin } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));
    await fireEvent.press(await findByText("Abandonar viaje"));

    expect(queryByText("Transferir organización")).toBeNull();
  });

  test("10. mostrar mensaje de error cuando se quiera abandonar un viaje que ya finalizó", async () => {
    const tripFinished = { ...mockTripActive, status: "finalizado" };
    getTripDetail.mockResolvedValue(tripFinished);

    const { queryByText, findByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: tripFinished } }}
      />
    );

    await fireEvent.press(await findByText("Grupo"));

    // Con el viaje finalizado la opción directamente no se ofrece.
    await waitFor(() => expect(queryByText("Abandonar viaje")).toBeNull());
    expect(leaveTrip).not.toHaveBeenCalled();
    expect(queryByText("Transferir organización")).toBeNull();
  });

  test("11. en la pestaña de resumen, un viaje finalizado muestra 'Finalizado' y no 'En curso'", async () => {
    const tripFinished = {
      ...mockTripActive,
      status: "finalizado",
      startDate: "2026-01-01",
      endDate: "2026-01-05",
    };
    getTripDetail.mockResolvedValue(tripFinished);

    const { findByText, queryByText } = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip: tripFinished } }}
      />
    );

    expect(await findByText("Finalizado")).toBeTruthy();
    expect(queryByText("En curso")).toBeNull();
  });

  describe("US 77 - Visualizar resumen de viaje", () => {
    // Fechas relativas a hoy: el viaje siempre empieza en el futuro y el
    // resumen muestra "Faltan", sin importar cuándo se corran los tests.
    const enDias = (dias) => {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() + dias);
      const pad = (n) => String(n).padStart(2, "0");
      return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
    };
    const tripSummary = {
      id: 99,
      title: "Viaje a Ushuaia",
      destination: "Ushuaia, Argentina",
      status: "activo",
      hasLeft: false,
      currency: "USD",
      startDate: enDias(10),
      endDate: enDias(15),
      admin: { id: 2, nombreCompleto: "Admin Test", email: "admin@test.com" },
      participants: [
        { id: 1, nombreCompleto: "Juan Pérez", role: "participante", status: "aceptado" },
        { id: 2, nombreCompleto: "Admin Test", role: "administrador", status: "aceptado" },
      ],
      cronograma: [],
    };

    beforeEach(() => {
      getTripDetail.mockResolvedValue(tripSummary);
      getTripSettlement.mockResolvedValue({
        Moneda: "USD",
        TotalGastosViaje: 1250,
        TotalGastosRegistrados: 3,
        Gastos: [{}, {}, {}],
        ResumenParticipantes: [],
        Transferencias: [],
      });
      getTripDocuments.mockResolvedValue([
        { IdDocumento: 1, NombreArchivo: "Itinerario.pdf" },
        { IdDocumento: 2, NombreArchivo: "Presupuesto.pdf" },
      ]);
      getVotaciones.mockResolvedValue([
        { IdVotacion: 1, Estado: "abierta", YaVoto: false },
      ]);
    });

    test("1. la vista de resumen se renderiza con las métricas clave del viaje", async () => {
      const { findByText } = await render(
        <TripDetailScreen
          navigation={makeNavigation()}
          route={{ params: { trip: tripSummary } }}
        />
      );

      expect(await findByText("Noches")).toBeTruthy();
      expect(await findByText("Viajeros")).toBeTruthy();
      expect(await findByText("Gastos del grupo (USD)")).toBeTruthy();
      expect(await findByText("Faltan")).toBeTruthy();
    });

    test("2. se muestra la sumatoria total de gastos con la moneda del viaje", async () => {
      const { findByText } = await render(
        <TripDetailScreen
          navigation={makeNavigation()}
          route={{ params: { trip: tripSummary } }}
        />
      );

      expect(await findByText("Gastos del grupo (USD)")).toBeTruthy();
    });

    test("6. los contadores rápidos reflejan gastos, documentos y decisiones actuales", async () => {
      const { findByText } = await render(
        <TripDetailScreen
          navigation={makeNavigation()}
          route={{ params: { trip: tripSummary } }}
        />
      );

      expect(await findByText("Ver gastos")).toBeTruthy();
      expect(await findByText("3 registrados")).toBeTruthy();
      expect(await findByText("Documentos")).toBeTruthy();
      expect(await findByText("2 subidos")).toBeTruthy();
      expect(await findByText("Decisiones")).toBeTruthy();
      expect(await findByText("1 pendiente")).toBeTruthy();
    });

    test("7. al presionar un acceso rápido se redirige a la sección correspondiente", async () => {
      const { findByText } = await render(
        <TripDetailScreen
          navigation={makeNavigation()}
          route={{ params: { trip: tripSummary } }}
        />
      );

      await fireEvent.press(await findByText("Ver gastos"));
      expect(await findByText("Gastos del grupo")).toBeTruthy();
    });
  });
});

describe("Viaje finalizado: solo lectura salvo Gastos", () => {
  const tripFinalizado = {
    id: 7,
    title: "Viaje a Mendoza",
    destination: "Mendoza, Argentina",
    status: "finalizado",
    hasLeft: false,
    currency: "ARS",
    startDate: "2026-03-01",
    endDate: "2026-03-08",
    admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
    participants: [
      { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
      { id: 2, nombreCompleto: "Ana Gómez", role: "participante", status: "aceptado" },
    ],
    cronograma: [],
  };

  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();

    getTripDetail.mockResolvedValue(tripFinalizado);
    getTripSettlement.mockResolvedValue({
      Moneda: "ARS",
      TotalGastosViaje: 30000,
      ResumenParticipantes: [],
      Transferencias: [
        {
          IdTransferenciaLiquidacion: 1,
          NombreDeudor: "Ana Gómez",
          NombreAcreedor: "Juan Pérez",
          Monto: 15000,
          Estado: "pendiente",
        },
      ],
    });
  });

  const renderFinalizado = () =>
    render(
      <TripDetailScreen
        navigation={navigation}
        route={{ params: { trip: tripFinalizado } }}
      />
    );

  test("muestra el sello, el aviso con la fecha y los pagos pendientes", async () => {
    const { findByText, findAllByText } = await renderFinalizado();

    expect((await findAllByText("Viaje finalizado")).length).toBeGreaterThan(0);
    expect(await findByText("Este viaje terminó el 8 de marzo")).toBeTruthy();
    expect(
      await findByText("Podés consultar todo. Quedan 1 pago pendiente para cerrar las cuentas.")
    ).toBeTruthy();
  });

  test("el aviso aparece solo en Resumen", async () => {
    const { findByText, queryByText, findByLabelText } = await renderFinalizado();

    expect(await findByText("Este viaje terminó el 8 de marzo")).toBeTruthy();

    await fireEvent.press(await findByLabelText("Itinerario, solo lectura"));
    await waitFor(() => expect(queryByText("Este viaje terminó el 8 de marzo")).toBeNull());

    await fireEvent.press(await findByLabelText("Gastos, hay pagos pendientes"));
    await waitFor(() => expect(queryByText("Este viaje terminó el 8 de marzo")).toBeNull());

    // El sello de la portada se mantiene en todas las pestañas.
    expect(await findByText("Viaje finalizado")).toBeTruthy();
  });

  test("marca con candado las pestañas bloqueadas y avisa pagos pendientes en Gastos", async () => {
    const { findByLabelText, findByTestId, queryByLabelText } = await renderFinalizado();

    expect(await findByLabelText("Itinerario, solo lectura")).toBeTruthy();
    expect(await findByLabelText("Grupo, solo lectura")).toBeTruthy();
    expect(await findByLabelText("Gastos, hay pagos pendientes")).toBeTruthy();
    expect(await findByTestId("tab-gastos-pendientes")).toBeTruthy();
    expect(queryByLabelText("Resumen, solo lectura")).toBeNull();
  });

  test("Gastos sigue permitiendo cargar y recalcular", async () => {
    const { findByText } = await renderFinalizado();

    await fireEvent.press(await findByText("Ir a Gastos"));
    expect(await findByText("Agregar gasto")).toBeTruthy();
    expect(await findByText("Recalcular liquidación")).toBeTruthy();
  });

  test("oculta las acciones de edición en las secciones bloqueadas", async () => {
    const { findByText, queryByText, findByLabelText } = await renderFinalizado();

    await fireEvent.press(await findByLabelText("Docs, solo lectura"));
    await waitFor(() => expect(queryByText("Subir documentos")).toBeNull());
    expect(queryByText("Agregar información")).toBeNull();

    await fireEvent.press(await findByLabelText("Checklist, solo lectura"));
    await waitFor(() => expect(queryByText("Crear tarea")).toBeNull());

    await fireEvent.press(await findByLabelText("Grupo, solo lectura"));
    await waitFor(() => expect(queryByText("Abandonar viaje")).toBeNull());

    await fireEvent.press(await findByLabelText("Itinerario, solo lectura"));
    expect(await findByLabelText("Ver mapa del viaje")).toBeTruthy();
    expect(queryByText("Explorar destinos de interés")).toBeNull();
  });

  test("el admin puede editar los datos del viaje durante el mes posterior", async () => {
    getTripDetail.mockResolvedValue({ ...tripFinalizado, infoEditableUntil: "2099-04-08" });
    const { findByLabelText, findByText } = await render(
      <TripDetailScreen
        navigation={navigation}
        route={{ params: { trip: { ...tripFinalizado, infoEditableUntil: "2099-04-08" } } }}
      />
    );

    await fireEvent.press(await findByLabelText("Editar viaje"));
    expect(navigation.navigate).toHaveBeenCalledWith("EditarViaje", { tripId: 7 });
    expect(
      await findByText("Como admin, podés editar los datos del viaje hasta el 8 de abril.")
    ).toBeTruthy();
  });

  test("vencido el mes, el lápiz desaparece", async () => {
    getTripDetail.mockResolvedValue({ ...tripFinalizado, infoEditableUntil: "2026-04-08" });
    const { findByText, queryByLabelText, queryByText } = await render(
      <TripDetailScreen
        navigation={navigation}
        route={{ params: { trip: { ...tripFinalizado, infoEditableUntil: "2026-04-08" } } }}
      />
    );

    expect(await findByText("Este viaje terminó el 8 de marzo")).toBeTruthy();
    // Esperamos a que cargue el usuario, para que el chequeo de admin ya haya corrido.
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queryByLabelText("Editar viaje")).toBeNull();
    expect(queryByText(/podés editar los datos del viaje/)).toBeNull();
  });

  test("un participante que no es admin nunca ve el lápiz", async () => {
    getCurrentUser.mockResolvedValue({
      id: 2,
      nombre: "Ana",
      apellido: "Gómez",
      email: "ana@gmail.com",
    });
    getTripDetail.mockResolvedValue({ ...tripFinalizado, infoEditableUntil: "2099-04-08" });
    const { findByText, queryByLabelText } = await render(
      <TripDetailScreen
        navigation={navigation}
        route={{ params: { trip: { ...tripFinalizado, infoEditableUntil: "2099-04-08" } } }}
      />
    );

    expect(await findByText("Este viaje terminó el 8 de marzo")).toBeTruthy();
    // Esperamos a que cargue el usuario, para que el chequeo de admin ya haya corrido.
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queryByLabelText("Editar viaje")).toBeNull();
  });

  test("se suscribe a los avisos de viaje finalizado del backend", async () => {
    await renderFinalizado();
    await waitFor(() => expect(onTripFinishedError).toHaveBeenCalled());
  });
});

describe("HU 71 - Tab Grupo: invitaciones enviadas", () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };
  const tripBase = {
    id: 1,
    title: "Viaje a Bariloche",
    status: "activo",
    hasLeft: false,
    currency: "ARS",
    startDate: "2099-12-01",
    endDate: "2099-12-10",
    admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
    participants: [
      { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
      { id: 2, nombreCompleto: "Carlos Gómez", role: "participante", status: "aceptado" },
      { id: 3, nombreCompleto: "Pepa Pérez", role: "participante", status: "invitado" },
    ],
    cronograma: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();

    getTripDetail.mockResolvedValue(tripBase);
    getSentInvitations.mockResolvedValue([
      {
        userId: 3,
        nombreUsuario: "pepa",
        nombreCompleto: "Pepa Pérez",
        status: "pendiente",
        invitedAt: "2099-09-28T10:00:00",
        respondedAt: null,
      },
    ]);
  });

  test("el administrador puede ver el listado de invitaciones enviadas", async () => {
    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Juan", apellido: "Pérez" });
    const { findByText, findByTestId } = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip: tripBase } }} />
    );

    await fireEvent.press(await findByText("Grupo"));
    await fireEvent.press(await findByTestId("group-view-invitaciones"));

    expect(await findByText("@pepa")).toBeTruthy();
    expect(getSentInvitations).toHaveBeenCalledWith(1);
  });

  test("un participante no administrador no ve el selector de invitaciones", async () => {
    getCurrentUser.mockResolvedValue({ id: 2, nombre: "Carlos", apellido: "Gómez" });
    const { findByText, queryByTestId } = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip: tripBase } }} />
    );

    await fireEvent.press(await findByText("Grupo"));

    expect(await findByText("Invitación pendiente")).toBeTruthy();
    expect(queryByTestId("group-view-invitaciones")).toBeNull();
    expect(getSentInvitations).not.toHaveBeenCalled();
  });
});

describe("HU 72 - Cancelar invitación enviada", () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };
  const trip = {
    id: 1,
    title: "Viaje a Bariloche",
    status: "activo",
    hasLeft: false,
    currency: "ARS",
    startDate: "2099-12-01",
    endDate: "2099-12-10",
    admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
    participants: [
      { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
      { id: 3, nombreCompleto: "Pepa Pérez", role: "participante", status: "invitado" },
    ],
    cronograma: [],
  };

  async function abrirInvitaciones() {
    const utils = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
    );
    await fireEvent.press(await utils.findByText("Grupo"));
    await fireEvent.press(await utils.findByTestId("group-view-invitaciones"));
    return utils;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();

    getTripDetail.mockResolvedValue(trip);
    getSentInvitations.mockResolvedValue([
      {
        userId: 3,
        nombreUsuario: "pepa",
        nombreCompleto: "Pepa Pérez",
        status: "pendiente",
        invitedAt: "2099-09-28T10:00:00",
        respondedAt: null,
      },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("pide confirmación, cancela y muestra el mensaje de confirmación", async () => {
    cancelSentInvitation.mockResolvedValueOnce({ message: "Invitación cancelada correctamente" });
    jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => {
      botones?.find((boton) => boton.text === "Confirmar")?.onPress?.();
    });

    const { findByTestId } = await abrirInvitaciones();
    await fireEvent.press(await findByTestId("sent-invitation-cancel-3"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Cancelar invitación",
      "¿Seguro que querés cancelar la invitación de @pepa?",
      expect.any(Array)
    );
    await waitFor(() => expect(cancelSentInvitation).toHaveBeenCalledWith(1, 3));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Invitación cancelada",
        "Invitación cancelada correctamente"
      )
    );
  });

  test("si se vuelve atrás en la confirmación, la invitación no se cancela", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => {
      botones?.find((boton) => boton.text === "Volver")?.onPress?.();
    });

    const { findByTestId } = await abrirInvitaciones();
    await fireEvent.press(await findByTestId("sent-invitation-cancel-3"));

    expect(Alert.alert).toHaveBeenCalled();
    expect(cancelSentInvitation).not.toHaveBeenCalled();
    expect(await findByTestId("sent-invitation-3")).toBeTruthy();
  });

  test("si el backend rechaza la cancelación, muestra el motivo", async () => {
    cancelSentInvitation.mockRejectedValueOnce(
      new Error("Solo se pueden cancelar invitaciones pendientes")
    );
    jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => {
      botones?.find((boton) => boton.text === "Confirmar")?.onPress?.();
    });

    const { findByTestId } = await abrirInvitaciones();
    await fireEvent.press(await findByTestId("sent-invitation-cancel-3"));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "No se pudo cancelar",
        "Solo se pueden cancelar invitaciones pendientes"
      )
    );
  });

  describe("volver a invitar a quien rechazó", () => {
    beforeEach(() => {
      getSentInvitations.mockResolvedValue([
        {
          userId: 4,
          nombreUsuario: "camila",
          nombreCompleto: "Camila Pardo",
          status: "rechazada",
          invitedAt: "2099-09-28T10:00:00",
          respondedAt: "2099-09-29T10:00:00",
        },
      ]);
    });

    test("pide confirmación, reenvía la invitación y muestra el mensaje", async () => {
      addTripParticipant.mockResolvedValueOnce({ message: "Invitación reenviada correctamente" });
      jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => {
        botones?.find((boton) => boton.text === "Confirmar")?.onPress?.();
      });

      const { findByTestId } = await abrirInvitaciones();
      await fireEvent.press(await findByTestId("sent-invitation-resend-4"));

      expect(Alert.alert).toHaveBeenCalledWith(
        "Volver a invitar",
        "@camila rechazó la invitación. ¿Querés enviársela de nuevo?",
        expect.any(Array)
      );
      await waitFor(() => expect(addTripParticipant).toHaveBeenCalledWith(1, { userId: 4 }));
      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          "Invitación reenviada",
          "Invitación reenviada correctamente"
        )
      );
    });

    test("si se vuelve atrás en la confirmación, no se reenvía", async () => {
      jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => {
        botones?.find((boton) => boton.text === "Volver")?.onPress?.();
      });

      const { findByTestId } = await abrirInvitaciones();
      await fireEvent.press(await findByTestId("sent-invitation-resend-4"));

      expect(Alert.alert).toHaveBeenCalled();
      expect(addTripParticipant).not.toHaveBeenCalled();
    });

    test("si el backend rechaza el reenvío, muestra el motivo", async () => {
      addTripParticipant.mockRejectedValueOnce(new Error("El usuario ya está agregado al viaje"));
      jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => {
        botones?.find((boton) => boton.text === "Confirmar")?.onPress?.();
      });

      const { findByTestId } = await abrirInvitaciones();
      await fireEvent.press(await findByTestId("sent-invitation-resend-4"));

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          "No se pudo reenviar",
          "El usuario ya está agregado al viaje"
        )
      );
    });
  });
});

describe("Tab Gastos rediseñado", () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };
  const trip = {
    id: 9,
    title: "Viaje a Córdoba",
    status: "activo",
    hasLeft: false,
    currency: "ARS",
    startDate: "2099-12-01",
    endDate: "2099-12-10",
    admin: { id: 1, nombreCompleto: "Lucia Giampieri", email: "lucia@test.com" },
    participants: [
      { id: 1, nombreCompleto: "Lucia Giampieri", role: "administrador", status: "aceptado" },
      { id: 2, nombreCompleto: "Daniela F", role: "participante", status: "aceptado" },
    ],
    cronograma: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();

    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Lucia", apellido: "Giampieri" });
    getTripDetail.mockResolvedValue(trip);
    getTripSettlement.mockResolvedValue({
      Moneda: "ARS",
      TotalGastosViaje: 1100,
      ResumenParticipantes: [
        {
          IdParticipanteViaje: 20,
          IdUsuario: 2,
          NombreCompleto: "Daniela F",
          TotalPagado: 1100,
          GastoIndividual: 1000,
          BalanceOriginal: 100,
          BalancePendiente: 100,
        },
        {
          IdParticipanteViaje: 10,
          IdUsuario: 1,
          NombreCompleto: "Lucia Giampieri",
          TotalPagado: 0,
          GastoIndividual: 100,
          BalanceOriginal: -100,
          BalancePendiente: -100,
        },
      ],
      Transferencias: [
        {
          IdTransferenciaLiquidacion: 5,
          IdParticipanteDeudor: 10,
          IdParticipanteAcreedor: 20,
          NombreDeudor: "Lucia Giampieri",
          NombreAcreedor: "Daniela F",
          Monto: 100,
          Estado: "pendiente",
        },
      ],
    });
  });

  test("muestra el saldo del usuario y lleva a sus transferencias", async () => {
    const { findByText, findByTestId } = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
    );

    await fireEvent.press(await findByText("Gastos"));

    expect(await findByText("Tu saldo")).toBeTruthy();
    await fireEvent.press(await findByTestId("gastos-view-saldos"));
    expect(await findByTestId("balance-10")).toBeTruthy();

    await fireEvent.press(await findByTestId("expense-my-balance"));

    expect(await findByTestId("transfer-report-5")).toBeTruthy();
    expect(await findByText("Tenés que transferir")).toBeTruthy();
  });

  test("'Ya transferí' avisa al acreedor y muestra que espera su confirmación", async () => {
    reportSettlementTransfer.mockResolvedValue({
      Moneda: "ARS",
      TotalGastosViaje: 1100,
      ResumenParticipantes: [
        { IdParticipanteViaje: 20, IdUsuario: 2, NombreCompleto: "Daniela F", BalancePendiente: 0 },
        { IdParticipanteViaje: 10, IdUsuario: 1, NombreCompleto: "Lucia Giampieri", BalancePendiente: 0 },
      ],
      Transferencias: [
        {
          IdTransferenciaLiquidacion: 5,
          IdParticipanteDeudor: 10,
          IdParticipanteAcreedor: 20,
          NombreDeudor: "Lucia Giampieri",
          NombreAcreedor: "Daniela F",
          Monto: 100,
          Estado: "informada",
        },
      ],
    });
    const { findByText, findByTestId } = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
    );
    await fireEvent.press(await findByText("Gastos"));
    await fireEvent.press(await findByTestId("gastos-view-transferencias"));

    await fireEvent.press(await findByTestId("transfer-report-5"));

    expect(reportSettlementTransfer).toHaveBeenCalledWith(9, 5);
    expect(await findByTestId("transfer-5")).toHaveTextContent(/Esperando que Daniela confirme/);
  });

  test("una notificación de transferencia abre Gastos en Transferencias", async () => {
    const { findByTestId } = await render(
      <TripDetailScreen
        navigation={navigation}
        route={{
          params: {
            trip,
            initialTab: "gastos",
            notificationTarget: { tripId: 9, gastosView: "transferencias" },
          },
        }}
      />
    );

    expect(await findByTestId("transfer-report-5")).toBeTruthy();
  });

  test("desde Saldos se abre 'De dónde sale tu saldo'", async () => {
    getMySettlementBalance.mockResolvedValue({
      Moneda: "ARS",
      TotalPagado: 0,
      TotalParte: 100,
      TransferenciasEnviadas: 0,
      TransferenciasRecibidas: 0,
      Saldo: -100,
      Gastos: [
        { IdGasto: 30, Nombre: "Cena", FechaGasto: "2099-09-02", NombreCategoria: "Comida y Bebida", Monto: 1100, NombrePagador: "Daniela F", PagasteVos: false, Pagado: 0, TuParte: 100, Efecto: -100 },
      ],
      Transferencias: [],
    });
    const { findByText, findByTestId } = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
    );
    await fireEvent.press(await findByText("Gastos"));
    await fireEvent.press(await findByTestId("gastos-view-saldos"));

    await fireEvent.press(await findByTestId("balance-breakdown-open"));

    expect(getMySettlementBalance).toHaveBeenCalledWith(9);
    expect(await findByTestId("my-balance-headline")).toHaveTextContent(/Debés .*100/);
    expect(await findByTestId("my-balance-expense-30")).toHaveTextContent(/Pagó Daniela/);
  });

  test("muestra el total del grupo y tu gasto con lo que informa la liquidación", async () => {
    getTripSettlement.mockResolvedValue({
      Moneda: "ARS",
      TotalGastosViaje: 1100,
      GastoUsuario: 600,
      GastoPersonalUsuario: 500,
      ResumenParticipantes: [],
      Transferencias: [],
    });
    const { findByText, findByTestId } = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
    );

    await fireEvent.press(await findByText("Gastos"));

    expect(await findByTestId("expense-group-total")).toHaveTextContent(/1\.100/);
    expect(await findByTestId("expense-my-total")).toHaveTextContent(/600/);
    expect(await findByTestId("expense-my-personal")).toHaveTextContent(/500 personales/);
  });

  test("abre por defecto el listado de gastos y permite filtrar por categoría", async () => {
    getExpenseCategories.mockResolvedValue([
      { IdCategoria: 1, Nombre: "Comida y Bebida" },
      { IdCategoria: 2, Nombre: "Transporte" },
    ]);
    getTripExpenses.mockResolvedValue([
      {
        IdGasto: 31,
        Nombre: "Taxi",
        Monto: 40,
        FechaGasto: "2099-09-03",
        IdCategoria: 2,
        NombreCategoria: "Transporte",
        IdPagador: 20,
        IdUsuarioPagador: 2,
        NombrePagador: "Daniela F",
      },
      {
        IdGasto: 30,
        Nombre: "Cena",
        Monto: 100,
        FechaGasto: "2099-09-02",
        IdCategoria: 1,
        NombreCategoria: "Comida y Bebida",
        IdPagador: 10,
        IdUsuarioPagador: 1,
        NombrePagador: "Lucia Giampieri",
      },
    ]);

    const { findByText, findByTestId } = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
    );

    await fireEvent.press(await findByText("Gastos"));

    expect(await findByTestId("expense-category-header-1")).toBeTruthy();
    expect(await findByTestId("expense-category-header-2")).toBeTruthy();
    expect(getTripExpenses).toHaveBeenCalledWith(9);

    await fireEvent.press(await findByTestId("expense-filter-open"));
    await fireEvent.press(await findByTestId("expense-filter-categorias"));
    await fireEvent.press(await findByTestId("expense-filter-1"));
    await fireEvent.press(await findByTestId("expense-categories-done"));
    await fireEvent.press(await findByTestId("expense-filter-aplicar"));

    expect(await findByTestId("expense-category-header-1")).toBeTruthy();
    expect(await findByTestId("expense-filter-tag-categorias")).toBeTruthy();
  });
});

describe("Tab Itinerario: agenda por día", () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };

  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(
    hoy.getDate()
  ).padStart(2, "0")}`;

  const crearTrip = (fecha) => ({
    id: 5,
    title: "Viaje a Mendoza",
    status: "activo",
    hasLeft: false,
    currency: "ARS",
    startDate: fecha,
    endDate: fecha,
    admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
    participants: [
      { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
    ],
    cronograma: [
      {
        id: 11,
        indiceDia: 1,
        fecha,
        actividades: [
          {
            idActividad: 100,
            nombre: "Desayuno en el hotel",
            horaInicio: "09:00:00",
            horaFin: "10:00:00",
            icono: "mug-hot",
            descripcion: "Buffet libre",
          },
          {
            idActividad: 101,
            nombre: "Visita a la bodega",
            horaInicio: "15:00:00",
            horaFin: "17:30:00",
            icono: "wine-glass",
          },
        ],
      },
    ],
  });

  async function abrirItinerario(trip) {
    getTripDetail.mockResolvedValue(trip);
    const utils = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
    );
    await fireEvent.press(await utils.findByText("Itinerario"));
    return utils;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Juan", apellido: "Pérez" });
  });

  test("el encabezado del día muestra solo la cantidad de actividades, sin el rango de horas", async () => {
    const { findByText, queryByText } = await abrirItinerario(crearTrip("2099-12-01"));

    expect(await findByText("Día 1 · 2 actividades")).toBeTruthy();
    expect(queryByText(/09:00 – 17:30/)).toBeNull();
  });

  test("el día abierto muestra cada actividad con su nombre y su horario", async () => {
    const { findByText } = await abrirItinerario(crearTrip("2099-12-01"));

    expect(await findByText("Desayuno en el hotel")).toBeTruthy();
    expect(await findByText("Visita a la bodega")).toBeTruthy();
    expect(await findByText(/09:00 – 10:00/)).toBeTruthy();
    expect(await findByText("Buffet libre")).toBeTruthy();
  });

  test("el día de hoy lleva la marca HOY", async () => {
    const { findByText } = await abrirItinerario(crearTrip(fechaHoy));

    expect(await findByText("HOY")).toBeTruthy();
  });

  test("un día que no es hoy no lleva la marca HOY", async () => {
    const { findByText, queryByText } = await abrirItinerario(crearTrip("2099-12-01"));

    expect(await findByText("Día 1 · 2 actividades")).toBeTruthy();
    expect(queryByText("HOY")).toBeNull();
  });

  test("un participante con permisos ve los botones para editar y eliminar", async () => {
    const { findByLabelText, findByText } = await abrirItinerario(crearTrip("2099-12-01"));

    expect(await findByLabelText("Editar Desayuno en el hotel")).toBeTruthy();
    expect(await findByLabelText("Eliminar Desayuno en el hotel")).toBeTruthy();
    expect(await findByText("Agregar actividad")).toBeTruthy();
  });

  test("un día sin actividades lo indica y no muestra el rango de horas", async () => {
    const trip = crearTrip("2099-12-01");
    trip.cronograma[0].actividades = [];
    const { findByText } = await abrirItinerario(trip);

    expect(await findByText("Día 1 · Sin actividades")).toBeTruthy();
    expect(await findByText("Todavía no hay planes para este día")).toBeTruthy();
  });
});


describe("US 79 - Editar gasto desde la solapa Gastos", () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };
  const trip = {
    id: 9,
    title: "Viaje a Córdoba",
    status: "activo",
    hasLeft: false,
    currency: "ARS",
    startDate: "2099-12-01",
    endDate: "2099-12-10",
    admin: { id: 1, nombreCompleto: "Lucia Giampieri", email: "lucia@test.com" },
    participants: [
      { id: 1, nombreCompleto: "Lucia Giampieri", role: "administrador", status: "aceptado" },
      { id: 2, nombreCompleto: "Daniela F", role: "participante", status: "aceptado" },
    ],
    cronograma: [],
  };
  const gastoDeLista = {
    IdGasto: 30,
    Nombre: "Cena",
    Monto: 100,
    FechaGasto: "2099-09-02",
    IdCategoria: 1,
    NombreCategoria: "Comida y Bebida",
    IdPagador: 20,
    IdUsuarioPagador: 2,
    NombrePagador: "Daniela F",
  };
  const detalle = (overrides = {}) => ({
    ...gastoDeLista,
    IdViaje: 9,
    MontoOriginal: 100,
    MonedaOriginal: "ARS",
    MonedaViaje: "ARS",
    TipoCambio: 1,
    NombreCreador: "Daniela F",
    EsCompartido: false,
    TipoDivision: null,
    DividirEntreTodos: false,
    Participantes: [],
    PuedeEditar: false,
    CodigoNoEditable: "EXPENSE_EDIT_FORBIDDEN",
    MotivoNoEditable: "Solo el creador del gasto o su pagador actual pueden editarlo.",
    IdUsuarioEditando: null,
    NombreUsuarioEditando: null,
    ...overrides,
  });

  let alertSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Lucia", apellido: "Giampieri" });
    getTripDetail.mockResolvedValue(trip);
    getExpenseCategories.mockResolvedValue([{ IdCategoria: 1, Nombre: "Comida y Bebida" }]);
    getTripExpenses.mockResolvedValue([gastoDeLista]);
    getExpenseDetail.mockResolvedValue(detalle());
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  async function abrirGastos() {
    const utils = await render(<TripDetailScreen navigation={navigation} route={{ params: { trip } }} />);
    await fireEvent.press(await utils.findByText("Gastos"));
    // Con una sola categoría la sección ya viene abierta.
    await utils.findByTestId("expense-30");
    return utils;
  }

  test("tocar un gasto abre su detalle; sin permiso muestra el motivo y permite eliminar", async () => {
    const { findByTestId, queryByTestId } = await abrirGastos();

    await fireEvent.press(await findByTestId("expense-30"));

    expect(getExpenseDetail).toHaveBeenCalledWith(30);
    expect(await findByTestId("expense-detail-motivo")).toBeTruthy();
    expect(queryByTestId("expense-detail-edit")).toBeNull();
    expect(await findByTestId("expense-detail-delete")).toBeTruthy();
  });

  test("con permiso, Editar del detalle abre el formulario en modo edición", async () => {
    getExpenseDetail.mockResolvedValue(detalle({ PuedeEditar: true, CodigoNoEditable: null, MotivoNoEditable: null }));
    const { findByTestId, findByText } = await abrirGastos();

    await fireEvent.press(await findByTestId("expense-30"));
    await fireEvent.press(await findByTestId("expense-detail-edit"));

    expect(await findByText("Editar gasto")).toBeTruthy();
  });

  test("el lápiz de la lista sin permiso muestra el motivo y no abre el formulario", async () => {
    const { findByTestId, queryByText } = await abrirGastos();

    await fireEvent.press(await findByTestId("expense-edit-30"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "No podés editar este gasto",
        "Solo el creador del gasto o su pagador actual pueden editarlo."
      )
    );
    expect(queryByText("Editar gasto")).toBeNull();
  });

  test("el lápiz de la lista con permiso abre directamente el formulario de edición", async () => {
    getExpenseDetail.mockResolvedValue(detalle({ PuedeEditar: true, CodigoNoEditable: null, MotivoNoEditable: null }));
    const { findByTestId, findByText } = await abrirGastos();

    await fireEvent.press(await findByTestId("expense-edit-30"));

    expect(await findByText("Editar gasto")).toBeTruthy();
  });

  describe("tiempo real", () => {
    const WebSocketOriginal = global.WebSocket;
    let sockets;

    class FakeWebSocket {
      static OPEN = 1;
      constructor(url) {
        this.url = url;
        this.readyState = 1;
        sockets.push(this);
      }
      send() {}
      close() {
        this.readyState = 3;
      }
    }

    beforeEach(() => {
      sockets = [];
      global.WebSocket = FakeWebSocket;
      getItinerarySocketUrl.mockResolvedValue("ws://test/ws/trips/9/itinerary?token=t");
    });

    afterEach(() => {
      global.WebSocket = WebSocketOriginal;
    });

    test("cuando otro participante edita un gasto, se recargan gastos y liquidación sin recargar la pantalla", async () => {
      const { findByText } = await render(
        <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
      );
      await fireEvent.press(await findByText("Gastos"));
      await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
      await waitFor(() => expect(getTripExpenses).toHaveBeenCalled());

      const gastosAntes = getTripExpenses.mock.calls.length;
      const liquidacionAntes = getTripSettlement.mock.calls.length;
      const detalleViajeAntes = getTripDetail.mock.calls.length;

      const socketViaje = sockets.find((s) => s.url.includes("/itinerary"));
      await act(async () => {
        socketViaje.onmessage({ data: JSON.stringify({ tipo: "gasto_actualizado", idGasto: 30 }) });
      });

      await waitFor(() => expect(getTripExpenses.mock.calls.length).toBe(gastosAntes + 1));
      expect(getTripSettlement.mock.calls.length).toBe(liquidacionAntes + 1);
      // No recarga todo el viaje.
      expect(getTripDetail.mock.calls.length).toBe(detalleViajeAntes);
    });

    test("cuando alguien cambia una transferencia, se recargan saldos y transferencias", async () => {
      const { findByText } = await render(
        <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
      );
      await fireEvent.press(await findByText("Gastos"));
      await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
      await waitFor(() => expect(getTripSettlement).toHaveBeenCalled());

      const liquidacionAntes = getTripSettlement.mock.calls.length;
      const gastosAntes = getTripExpenses.mock.calls.length;

      const socketViaje = sockets.find((s) => s.url.includes("/itinerary"));
      await act(async () => {
        socketViaje.onmessage({ data: JSON.stringify({ tipo: "liquidacion_actualizada" }) });
      });

      await waitFor(() => expect(getTripSettlement.mock.calls.length).toBe(liquidacionAntes + 1));
      // Solo cambió la liquidación: la lista de gastos no se vuelve a pedir.
      expect(getTripExpenses.mock.calls.length).toBe(gastosAntes);
    });

    test("cuando otro elimina un gasto, se recargan la lista y los saldos", async () => {
      const { findByText } = await render(
        <TripDetailScreen navigation={navigation} route={{ params: { trip } }} />
      );
      await fireEvent.press(await findByText("Gastos"));
      await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
      await waitFor(() => expect(getTripExpenses).toHaveBeenCalled());

      const gastosAntes = getTripExpenses.mock.calls.length;
      const liquidacionAntes = getTripSettlement.mock.calls.length;

      const socketViaje = sockets.find((s) => s.url.includes("/itinerary"));
      await act(async () => {
        socketViaje.onmessage({ data: JSON.stringify({ tipo: "gasto_eliminado", idGasto: 30 }) });
      });

      await waitFor(() => expect(getTripExpenses.mock.calls.length).toBe(gastosAntes + 1));
      expect(getTripSettlement.mock.calls.length).toBe(liquidacionAntes + 1);
    });
  });
});

describe("Pestaña inicial (notificaciones y accesos rápidos)", () => {
  const trip = {
    id: 9,
    title: "Viaje a Córdoba",
    status: "activo",
    hasLeft: false,
    currency: "ARS",
    startDate: "2099-12-01",
    endDate: "2099-12-10",
    admin: { id: 1, nombreCompleto: "Lucia Giampieri", email: "lucia@test.com" },
    participants: [
      { id: 1, nombreCompleto: "Lucia Giampieri", role: "administrador", status: "aceptado" },
      { id: 2, nombreCompleto: "Daniela F", role: "participante", status: "aceptado" },
    ],
    cronograma: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Lucia", apellido: "Giampieri" });
    getTripDetail.mockResolvedValue(trip);
  });

  // La primera coincidencia es la barra de pestañas del viaje (dentro de Gastos
  // hay otra sub-pestaña llamada "Gastos").
  const pestania = (utils, nombre) => utils.getAllByRole("tab", { name: nombre })[0];
  const pestaniaSeleccionada = (utils, nombre) =>
    pestania(utils, nombre).props.accessibilityState?.selected;

  test("abre directamente la pestaña indicada en initialTab", async () => {
    const utils = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip, initialTab: "gastos" } }}
      />
    );

    await waitFor(() => expect(getTripExpenses).toHaveBeenCalled());
    expect(pestaniaSeleccionada(utils, "Gastos")).toBe(true);
    expect(pestaniaSeleccionada(utils, "Resumen")).toBe(false);
  });

  test("sin initialTab o con una pestaña desconocida abre el resumen", async () => {
    const utils = await render(
      <TripDetailScreen
        navigation={makeNavigation()}
        route={{ params: { trip, initialTab: "no-existe" } }}
      />
    );

    await waitFor(() => expect(pestaniaSeleccionada(utils, "Resumen")).toBe(true));
  });

  test("si ya estaba abierta y llega otra notificación, cambia a su pestaña", async () => {
    const navigation = makeNavigation();
    const utils = await render(
      <TripDetailScreen
        navigation={navigation}
        route={{ params: { trip, initialTab: "gastos", notificationTarget: { tripId: 9 } } }}
      />
    );
    await waitFor(() => expect(pestaniaSeleccionada(utils, "Gastos")).toBe(true));

    // El usuario se va a otra pestaña y toca de nuevo un aviso de gastos.
    await act(async () => {
      await fireEvent.press(pestania(utils, "Grupo"));
    });
    expect(pestaniaSeleccionada(utils, "Grupo")).toBe(true);

    await act(async () => {
      utils.rerender(
        <TripDetailScreen
          navigation={navigation}
          route={{ params: { trip, initialTab: "gastos", notificationTarget: { tripId: 9 } } }}
        />
      );
    });
    expect(pestaniaSeleccionada(utils, "Gastos")).toBe(true);
  });
});

describe("US 103 - Las votaciones siguen el estado del viaje", () => {
  const WebSocketOriginal = global.WebSocket;
  const trip = {
    id: 1, title: "Viaje grupal", status: "activo", hasLeft: false, currency: "ARS",
    startDate: "2099-12-01", endDate: "2099-12-10",
    admin: { id: 1, nombreCompleto: "Juan Pérez" },
    participants: [{ id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" }],
    cronograma: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    getTripDetail.mockResolvedValue(trip);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    global.WebSocket = WebSocketOriginal;
  });

  test("recarga las votaciones cuando el viaje finaliza y cuando vuelve a estar activo", async () => {
    const socket = { close: jest.fn() };
    global.WebSocket = jest.fn(() => socket);
    getItinerarySocketUrl.mockResolvedValue("ws://test/itinerary");
    await render(<TripDetailScreen navigation={makeNavigation()} route={{ params: { trip } }} />);
    await waitFor(() => expect(socket.onmessage).toBeDefined());
    await waitFor(() => expect(getVotaciones).toHaveBeenCalled());
    const antes = getVotaciones.mock.calls.length;

    // El admin acorta las fechas: el viaje pasa a finalizado.
    getTripDetail.mockResolvedValue({ ...trip, status: "finalizado" });
    await act(async () => socket.onmessage({ data: JSON.stringify({ tipo: "viaje_actualizado" }) }));
    await waitFor(() => expect(getVotaciones.mock.calls.length).toBeGreaterThan(antes));
    const trasFinalizar = getVotaciones.mock.calls.length;

    // Extiende las fechas: vuelve a activo y las votaciones se reabren.
    getTripDetail.mockResolvedValue({ ...trip, status: "activo" });
    await act(async () => socket.onmessage({ data: JSON.stringify({ tipo: "viaje_actualizado" }) }));
    await waitFor(() => expect(getVotaciones.mock.calls.length).toBeGreaterThan(trasFinalizar));
  });

  test("no recarga las votaciones si el estado del viaje no cambia", async () => {
    const socket = { close: jest.fn() };
    global.WebSocket = jest.fn(() => socket);
    getItinerarySocketUrl.mockResolvedValue("ws://test/itinerary");
    await render(<TripDetailScreen navigation={makeNavigation()} route={{ params: { trip } }} />);
    await waitFor(() => expect(socket.onmessage).toBeDefined());
    await waitFor(() => expect(getVotaciones).toHaveBeenCalled());
    const antes = getVotaciones.mock.calls.length;
    const lecturas = getTripDetail.mock.calls.length;

    getTripDetail.mockResolvedValue({ ...trip, title: "Otro título" });
    await act(async () => socket.onmessage({ data: JSON.stringify({ tipo: "viaje_actualizado" }) }));
    await waitFor(() => expect(getTripDetail.mock.calls.length).toBeGreaterThan(lecturas));
    expect(getVotaciones.mock.calls.length).toBe(antes);
  });
});
