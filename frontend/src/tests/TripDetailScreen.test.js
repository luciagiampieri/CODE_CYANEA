import { render, waitFor, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";
import TripDetailScreen from "../screens/TripDetailScreen";
import {
  getCurrentUser,
  leaveTrip,
  getTripDetail,
  getTripPlaces,
  getTripSettlement,
  getTripDocuments,
  getVotaciones,
  getRepositorioItems,
  getTripParticipants,
  onTripFinishedError,
  getSentInvitations,
  cancelSentInvitation,
  getTripExpenses,
  getExpenseCategories,
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
  getCurrentUser: jest.fn(),
  leaveTrip: jest.fn(),
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
  getTripExpenses: jest.fn(),
  onTripFinishedError: jest.fn(),
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
  getTripSettlement.mockResolvedValue({});
  onTripFinishedError.mockImplementation(() => jest.fn());
}

function makeNavigation() {
  return {
    goBack: mockGoBack,
    navigate: mockNavigate,
    setParams: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
  };
}

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

    fireEvent.press(await findByText("Grupo"));
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

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

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

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

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

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

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

    fireEvent.press(await findByText("Gastos"));
    expect(queryByText("Agregar gasto")).toBeNull();

    fireEvent.press(await findByText("Docs"));
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

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    expect(await findByText("Transferir administración")).toBeTruthy();
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

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    const buttons = await findByText("Confirmar salida");
    fireEvent.press(buttons);

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

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    const candidateItem = await findByTestId("admin-candidate-2");
    fireEvent.press(candidateItem);

    const confirmButton = await findByText("Confirmar salida");
    fireEvent.press(confirmButton);

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

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    expect(queryByText("Transferir administración")).toBeNull();
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

    fireEvent.press(await findByText("Grupo"));

    // Con el viaje finalizado la opción directamente no se ofrece.
    await waitFor(() => expect(queryByText("Abandonar viaje")).toBeNull());
    expect(leaveTrip).not.toHaveBeenCalled();
    expect(queryByText("Transferir administración")).toBeNull();
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
    const tripSummary = {
      id: 99,
      title: "Viaje a Ushuaia",
      destination: "Ushuaia, Argentina",
      status: "activo",
      hasLeft: false,
      currency: "USD",
      startDate: "2026-10-10",
      endDate: "2026-10-15",
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
      expect(await findByText("Total gastado (USD)")).toBeTruthy();
      expect(await findByText("Faltan")).toBeTruthy();
    });

    test("2. se muestra la sumatoria total de gastos con la moneda del viaje", async () => {
      const { findByText } = await render(
        <TripDetailScreen
          navigation={makeNavigation()}
          route={{ params: { trip: tripSummary } }}
        />
      );

      expect(await findByText("Total gastado (USD)")).toBeTruthy();
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

      fireEvent.press(await findByText("Ver gastos"));
      expect(await findByText("Total gastado")).toBeTruthy();
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

    fireEvent.press(await findByLabelText("Itinerario, solo lectura"));
    await waitFor(() => expect(queryByText("Este viaje terminó el 8 de marzo")).toBeNull());

    fireEvent.press(await findByLabelText("Gastos, hay pagos pendientes"));
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

    fireEvent.press(await findByText("Ir a Gastos"));
    expect(await findByText("Agregar gasto")).toBeTruthy();
    expect(await findByText("Recalcular liquidación")).toBeTruthy();
  });

  test("oculta las acciones de edición en las secciones bloqueadas", async () => {
    const { findByText, queryByText, findByLabelText } = await renderFinalizado();

    fireEvent.press(await findByLabelText("Docs, solo lectura"));
    await waitFor(() => expect(queryByText("Subir documentos")).toBeNull());
    expect(queryByText("Agregar información")).toBeNull();

    fireEvent.press(await findByLabelText("Checklist, solo lectura"));
    await waitFor(() => expect(queryByText("Crear tarea")).toBeNull());

    fireEvent.press(await findByLabelText("Grupo, solo lectura"));
    await waitFor(() => expect(queryByText("Abandonar viaje")).toBeNull());

    fireEvent.press(await findByLabelText("Itinerario, solo lectura"));
    expect(await findByText("Ver mapa del viaje")).toBeTruthy();
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

    fireEvent.press(await findByLabelText("Editar viaje"));
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

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByTestId("group-view-invitaciones"));

    expect(await findByText("@pepa")).toBeTruthy();
    expect(getSentInvitations).toHaveBeenCalledWith(1);
  });

  test("un participante no administrador no ve el selector de invitaciones", async () => {
    getCurrentUser.mockResolvedValue({ id: 2, nombre: "Carlos", apellido: "Gómez" });
    const { findByText, queryByTestId } = await render(
      <TripDetailScreen navigation={navigation} route={{ params: { trip: tripBase } }} />
    );

    fireEvent.press(await findByText("Grupo"));

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
    fireEvent.press(await utils.findByText("Grupo"));
    fireEvent.press(await utils.findByTestId("group-view-invitaciones"));
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
    fireEvent.press(await findByTestId("sent-invitation-cancel-3"));

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
    fireEvent.press(await findByTestId("sent-invitation-cancel-3"));

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
    fireEvent.press(await findByTestId("sent-invitation-cancel-3"));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "No se pudo cancelar",
        "Solo se pueden cancelar invitaciones pendientes"
      )
    );
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

    fireEvent.press(await findByText("Gastos"));

    expect(await findByText("Tu saldo")).toBeTruthy();
    fireEvent.press(await findByTestId("gastos-view-saldos"));
    expect(await findByTestId("balance-10")).toBeTruthy();

    fireEvent.press(await findByTestId("expense-my-balance"));

    expect(await findByTestId("transfer-pay-5")).toBeTruthy();
    expect(await findByText("Vos")).toBeTruthy();
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

    fireEvent.press(await findByText("Gastos"));

    expect(await findByTestId("expense-category-header-1")).toBeTruthy();
    expect(await findByTestId("expense-category-header-2")).toBeTruthy();
    expect(getTripExpenses).toHaveBeenCalledWith(9);

    fireEvent.press(await findByTestId("expense-filter-open"));
    fireEvent.press(await findByTestId("expense-filter-categorias"));
    fireEvent.press(await findByTestId("expense-filter-1"));
    fireEvent.press(await findByTestId("expense-categories-done"));
    fireEvent.press(await findByTestId("expense-filter-aplicar"));

    expect(await findByTestId("expense-category-header-1")).toBeTruthy();
    expect(await findByTestId("expense-filter-tag-categorias")).toBeTruthy();
  });
});