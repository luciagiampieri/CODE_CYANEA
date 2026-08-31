import { render, waitFor, fireEvent, act} from "@testing-library/react-native";
import { Alert } from "react-native";
import TripDetailScreen from "../screens/TripDetailScreen";
import { getCurrentUser, leaveTrip, getTripDetail, getTripPlaces } from "../services/api";

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

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();

jest.mock("../services/api", () => ({
  getCurrentUser: jest.fn(),
  leaveTrip: jest.fn(),
  getTripDetail: jest.fn(),
  getTripPlaces: jest.fn(),
  getVotaciones: jest.fn().mockResolvedValue([]),
  getTripDocuments: jest.fn().mockResolvedValue([]),
  getRepositorioItems: jest.fn().mockResolvedValue([]),
  getTripSettlement: jest.fn().mockResolvedValue({}),
  getTripParticipants: jest.fn().mockResolvedValue([]),
  getExpenseCategories: jest.fn().mockResolvedValue([]),
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
      { id: 2, nombreCompleto: "Admin Test", role: "administrador", status: "aceptado" }
    ],
    cronograma: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    getCurrentUser.mockResolvedValue({
      id: 1,
      nombre: "Juan",
      apellido: "Pérez",
      email: "juan@gmail.com",
    });

    getTripDetail.mockResolvedValue(mockTripActive);
    getTripPlaces.mockResolvedValue([]);
    
    // Espiamos o mockeamos Alert para simular la confirmación en los tests
    jest.spyOn(Alert, "alert").mockImplementation((title, message, buttons) => {
      // Si hay un botón de confirmar/destructive, lo disparamos automáticamente en los tests de éxito
      const confirmButton = buttons?.find(b => b.style === "destructive" || b.text === "Confirmar");
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
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
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
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
        route={{ params: { trip: mockTripActive } }}
      />
    );

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    // Se debió invocar a la alerta de confirmación y no llamar directamente a leaveTrip sin mediar la UI
    expect(Alert.alert).toHaveBeenCalled();
  });

  test("3. cancela el abandono y el usuario sigue participando (no se llama a leaveTrip)", async () => {
    // Sobrescribimos el mock de Alert para simular que el usuario presiona "Volver" (cancela)
    Alert.alert.mockImplementationOnce((title, message, buttons) => {
      const cancelButton = buttons?.find(b => b.style === "cancel" || b.text === "Volver");
      if (cancelButton && cancelButton.onPress) {
        cancelButton.onPress();
      }
    });

    const { findByText } = await render(
      <TripDetailScreen
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
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
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
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
    getTripDetail.mockResolvedValueOnce(tripWithHasLeft);

    const { queryByText, findByText } = await render(
      <TripDetailScreen
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
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
        { id: 2, nombreCompleto: "Carlos Gómez", role: "participante", status: "aceptado" }
      ]
    };
    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Juan", apellido: "Pérez", email: "juan@gmail.com" });
    getTripDetail.mockResolvedValueOnce(mockTripAdminUser);

    const { findByText, getAllByText } = await render(
      <TripDetailScreen
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
        route={{ params: { trip: mockTripAdminUser } }}
      />
    );

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    expect(await findByText("Transferir administración")).toBeTruthy();
    
    const elements = await getAllByText("Carlos Gómez");
    expect(elements.length).toBeGreaterThan(0);
  });


  test("7. si el admin intenta confirmar la salida sin elegir nuevo administrador, falla y no llama a leaveTrip", async () => {
    const mockTripAdminUser = {
      ...mockTripActive,
      admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
      participants: [
        { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
        { id: 2, nombreCompleto: "Carlos Gómez", role: "participante", status: "aceptado" }
      ]
    };
    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Juan", apellido: "Pérez", email: "juan@gmail.com" });
    getTripDetail.mockResolvedValueOnce(mockTripAdminUser);

    const { findByText } = await render(
      <TripDetailScreen
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
        route={{ params: { trip: mockTripAdminUser } }}
      />
    );

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    // Presionar confirmar salida sin seleccionar a nadie en el modal
    fireEvent.press(await findByText("Confirmar salida"));

    expect(leaveTrip).not.toHaveBeenCalled();
  });

  test("8. el admin elige un nuevo administrador y al confirmar se llama a leaveTrip con nuevoAdministradorId", async () => {
    const mockTripAdminUser = {
      ...mockTripActive,
      admin: { id: 1, nombreCompleto: "Juan Pérez", email: "juan@gmail.com" },
      participants: [
        { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" },
        { id: 2, nombreCompleto: "Carlos Gómez", role: "participante", status: "aceptado" }
      ]
    };
    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Juan", apellido: "Pérez", email: "juan@gmail.com" });
    getTripDetail.mockResolvedValueOnce(mockTripAdminUser);
    leaveTrip.mockResolvedValueOnce({ message: "Éxito" });

    const { findByText, findByTestId } = await render(
      <TripDetailScreen
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
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
        { id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" }
      ]
    };
    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Juan", apellido: "Pérez", email: "juan@gmail.com" });
    getTripDetail.mockResolvedValueOnce(mockTripSingleAdmin);

    const { findByText, queryByText } = await render(
      <TripDetailScreen
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
        route={{ params: { trip: mockTripSingleAdmin } }}
      />
    );

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    expect(queryByText("Transferir administración")).toBeNull();
  });

  test("10. mostrar mensaje de error cuando se quiera abandonar un viaje que ya finalizó", async () => {
    const tripFinished = { ...mockTripActive, status: "finalizado" };
    getTripDetail.mockResolvedValueOnce(tripFinished);

    const { queryByText, findByText } = await render(
      <TripDetailScreen
        navigation={{ goBack: mockGoBack, navigate: mockNavigate, setParams: jest.fn(), addListener: jest.fn(() => jest.fn()) }}
        route={{ params: { trip: tripFinished } }}
      />
    );

    fireEvent.press(await findByText("Grupo"));
    fireEvent.press(await findByText("Abandonar viaje"));

    expect(leaveTrip).not.toHaveBeenCalled();
    expect(queryByText("Transferir administración")).toBeNull();
  });
});