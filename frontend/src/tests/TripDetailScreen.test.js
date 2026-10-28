import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import TripDetailScreen from "../screens/TripDetailScreen";
import {
  getActivitySuggestions,
  getCurrentUser,
  getExpenseCategories,
  getItinerarySocketUrl,
  getRepositorioItems,
  getSentInvitations,
  getTripDetail,
  getTripDocuments,
  getTripExpenses,
  getTripParticipants,
  getTripSettlement,
  getVotaciones,
  onTripFinishedError,
} from "../services/api";
import {
  guardarDocumentoOffline,
  guardarItinerarioOffline,
  listarDocumentosOffline,
  obtenerItinerarioOffline,
  offlineDisponible,
} from "../database/offlineViajes";

let mockNetInfoListener = null;

jest.mock("@react-native-community/netinfo", () => {
  const fetch = jest.fn(() => Promise.resolve({ isConnected: false, isInternetReachable: false }));
  const addEventListener = jest.fn((listener) => {
    mockNetInfoListener = listener;
    return jest.fn();
  });
  return { __esModule: true, default: { fetch, addEventListener }, fetch, addEventListener };
});

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

jest.mock("../services/api", () => ({
  getCurrentUser: jest.fn(),
  getTripDetail: jest.fn(),
  getVotaciones: jest.fn(),
  getTripDocuments: jest.fn(),
  getRepositorioItems: jest.fn(),
  getTripSettlement: jest.fn(),
  getTripParticipants: jest.fn(),
  getExpenseCategories: jest.fn(),
  getSentInvitations: jest.fn(),
  getTripExpenses: jest.fn(),
  onTripFinishedError: jest.fn(),
  getItinerarySocketUrl: jest.fn(),
  getActivitySuggestions: jest.fn(),
}));

jest.mock("../database/offlineViajes", () => ({
  esErrorDeRed: (error) => error instanceof TypeError,
  offlineDisponible: jest.fn(),
  guardarItinerarioOffline: jest.fn(),
  obtenerItinerarioOffline: jest.fn(),
  listarDocumentosOffline: jest.fn(),
  guardarDocumentoOffline: jest.fn(),
  quitarDocumentoOffline: jest.fn(),
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

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
};

const viaje = {
  id: 5,
  title: "Viaje a Mendoza",
  status: "activo",
  hasLeft: false,
  currency: "ARS",
  startDate: "2099-12-01",
  endDate: "2099-12-01",
  admin: { id: 1, nombreCompleto: "Juan Pérez" },
  participants: [{ id: 1, nombreCompleto: "Juan Pérez", role: "administrador", status: "aceptado" }],
  cronograma: [{ id: 11, indiceDia: 1, fecha: "2099-12-01", actividades: [] }],
};

const viajeGuardado = {
  ...viaje,
  cronograma: [
    {
      id: 11,
      indiceDia: 1,
      fecha: "2099-12-01",
      actividades: [
        {
          idActividad: 100,
          nombre: "Desayuno en el hotel",
          horaInicio: "09:00:00",
          horaFin: "10:00:00",
          icono: "mug-hot",
        },
      ],
    },
  ],
};

function documento(overrides = {}) {
  return {
    IdDocumento: 9,
    IdViaje: 5,
    IdCategoriaDocumento: 1,
    NombreCategoria: "Pasajes",
    NombreArchivo: "pasaje.pdf",
    NombreUsuarioSubida: "Juan Pérez",
    EsPublico: true,
    EsPropio: true,
    UrlArchivo: "https://storage.test/pasaje.pdf",
    TamanoBytes: 100,
    ...overrides,
  };
}

const sinRed = () => new TypeError("Network request failed");

function renderPantalla() {
  return render(<TripDetailScreen navigation={navigation} route={{ params: { trip: viaje } }} />);
}

describe("US 127 - Consultar itinerario y documentos sin conexión", () => {
  let alertSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNetInfoListener = null;

    getCurrentUser.mockResolvedValue({ id: 1, nombre: "Juan", apellido: "Pérez" });
    getTripDetail.mockResolvedValue(viaje);
    getVotaciones.mockResolvedValue([]);
    getTripDocuments.mockResolvedValue([]);
    getRepositorioItems.mockResolvedValue([]);
    getTripSettlement.mockResolvedValue({});
    getTripParticipants.mockResolvedValue([]);
    getExpenseCategories.mockResolvedValue([]);
    getSentInvitations.mockResolvedValue([]);
    getTripExpenses.mockResolvedValue([]);
    getActivitySuggestions.mockResolvedValue([]);
    onTripFinishedError.mockImplementation(() => jest.fn());
    getItinerarySocketUrl.mockReturnValue(new Promise(() => {}));

    offlineDisponible.mockReturnValue(true);
    guardarItinerarioOffline.mockReturnValue("2026-10-28T17:00:00.000Z");
    obtenerItinerarioOffline.mockReturnValue(null);
    listarDocumentosOffline.mockReturnValue([]);
    guardarDocumentoOffline.mockResolvedValue({});

    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  test("con conexión guarda el itinerario para consultarlo después sin conexión", async () => {
    const { queryByTestId } = await renderPantalla();

    await waitFor(() => expect(guardarItinerarioOffline).toHaveBeenCalledWith(viaje));
    expect(queryByTestId("banner-sin-conexion")).toBeNull();
  });

  test("sin conexión muestra el itinerario guardado con el aviso y en solo lectura", async () => {
    getTripDetail.mockRejectedValue(sinRed());
    obtenerItinerarioOffline.mockReturnValue({
      detalle: viajeGuardado,
      sincronizadoEn: "2026-10-28T14:32:00.000Z",
    });

    const { findByText, findByTestId, queryByLabelText, queryByText } = await renderPantalla();

    expect(await findByTestId("banner-sin-conexion")).toBeTruthy();
    await fireEvent.press(await findByText("Itinerario"));

    expect(await findByText("Desayuno en el hotel")).toBeTruthy();
    expect(queryByLabelText("Editar Desayuno en el hotel")).toBeNull();
    expect(queryByText("Agregar actividad")).toBeNull();
    expect(queryByText("Sugerir con IA")).toBeNull();
  });

  test("si el viaje nunca se abrió con conexión, lo informa", async () => {
    getTripDetail.mockRejectedValue(sinRed());

    const { findByText } = await renderPantalla();

    expect(
      await findByText(
        "Este viaje todavía no está disponible sin conexión. Abrilo con conexión al menos una vez."
      )
    ).toBeTruthy();
  });

  test("guardar un documento lo deja disponible sin conexión", async () => {
    const doc = documento();
    getTripDocuments.mockResolvedValue([doc]);

    const { findByText, findByTestId } = await renderPantalla();

    await fireEvent.press(await findByText("Docs"));
    await fireEvent.press(await findByTestId("documento-offline-9"));

    await waitFor(() => expect(guardarDocumentoOffline).toHaveBeenCalledWith(doc));
    expect(await findByText("Disponible sin conexión")).toBeTruthy();
  });

  test("si no hay espacio en el dispositivo, avisa el motivo", async () => {
    getTripDocuments.mockResolvedValue([documento()]);
    guardarDocumentoOffline.mockRejectedValue(
      Object.assign(new Error("No hay espacio suficiente en el dispositivo para guardar este documento."), {
        code: "ESPACIO_INSUFICIENTE",
      })
    );

    const { findByText, findByTestId } = await renderPantalla();

    await fireEvent.press(await findByText("Docs"));
    await fireEvent.press(await findByTestId("documento-offline-9"));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "No se pudo guardar",
        "No hay espacio suficiente en el dispositivo para guardar este documento."
      )
    );
  });

  test("sin conexión lista los documentos guardados y abre las imágenes en el visor", async () => {
    const foto = documento({ NombreArchivo: "foto.jpg" });
    getTripDetail.mockRejectedValue(sinRed());
    obtenerItinerarioOffline.mockReturnValue({ detalle: viajeGuardado, sincronizadoEn: null });
    getTripDocuments.mockRejectedValue(sinRed());
    listarDocumentosOffline.mockReturnValue([
      { idDocumento: 9, documento: foto, uri: "file:///docs/viajes-offline/5/9-foto.jpg" },
    ]);

    const { findByText, findByTestId, queryByTestId } = await renderPantalla();

    await fireEvent.press(await findByText("Docs"));
    expect(await findByText("foto.jpg")).toBeTruthy();
    expect(queryByTestId("documento-descargar-9")).toBeNull();
    expect(queryByTestId("documento-editar-9")).toBeNull();

    await fireEvent.press(await findByTestId("documento-abrir-9"));

    const visor = await findByTestId("visor-offline-imagen");
    expect(visor.props.source).toEqual({ uri: "file:///docs/viajes-offline/5/9-foto.jpg" });
  });

  test("sin conexión, un PDF guardado avisa que necesita conexión para abrirse", async () => {
    getTripDetail.mockRejectedValue(sinRed());
    obtenerItinerarioOffline.mockReturnValue({ detalle: viajeGuardado, sincronizadoEn: null });
    getTripDocuments.mockRejectedValue(sinRed());
    listarDocumentosOffline.mockReturnValue([
      { idDocumento: 9, documento: documento(), uri: "file:///docs/viajes-offline/5/9-pasaje.pdf" },
    ]);

    const { findByText, findByTestId } = await renderPantalla();

    await fireEvent.press(await findByText("Docs"));
    await fireEvent.press(await findByTestId("documento-abrir-9"));

    expect(Alert.alert).toHaveBeenCalledWith(
      "Documento guardado",
      "Este PDF está guardado en el dispositivo, pero para abrirlo necesitás conexión."
    );
  });

  test("al recuperar la conexión vuelve a cargar el viaje y quita el aviso", async () => {
    getTripDetail.mockRejectedValue(sinRed());
    obtenerItinerarioOffline.mockReturnValue({ detalle: viajeGuardado, sincronizadoEn: null });

    const { findByTestId, queryByTestId } = await renderPantalla();

    expect(await findByTestId("banner-sin-conexion")).toBeTruthy();
    await waitFor(() => expect(mockNetInfoListener).toBeTruthy());

    getTripDetail.mockResolvedValue(viaje);
    await act(async () => {
      mockNetInfoListener({ isConnected: true, isInternetReachable: true });
    });

    await waitFor(() => expect(queryByTestId("banner-sin-conexion")).toBeNull());
  });
});