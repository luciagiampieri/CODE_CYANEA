import { act, fireEvent, render } from "@testing-library/react-native";

import ProfileScreen, { calcularEstadisticas } from "../screens/ProfileScreen";
import * as api from "../services/api";

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
  getPaisesVisitados: jest.fn(),
  getTrips: jest.fn(),
}));

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({ isDesktop: false }),
}));

function viaje(overrides = {}) {
  return {
    id: 1,
    title: "Bariloche",
    status: "activo",
    startDate: "2026-07-01",
    endDate: "2026-07-10",
    image: null,
    destinations: [{ name: "Bariloche", country: "argentina" }],
    participants: [{ id: 1 }, { id: 2 }],
    ...overrides,
  };
}

describe("calcularEstadisticas", () => {
  const hoy = new Date("2026-06-15T00:00:00");

  it("con year=null, cuenta los viajes ya iniciados y también los que no tienen fecha", () => {
    const viajes = [
      viaje({ id: 1, startDate: "2026-05-01" }), // ya empezó
      viaje({ id: 2, startDate: "2026-07-01" }), // todavía no empieza
      viaje({ id: 3, startDate: null }), // sin fecha
    ];

    const stats = calcularEstadisticas(viajes, 99, null, hoy);

    expect(stats.totalViajes).toBe(2);
  });

  it("con un year puntual, solo cuenta los viajes de ese año que ya empezaron", () => {
    const viajes = [
      viaje({ id: 1, startDate: "2025-05-01" }),
      viaje({ id: 2, startDate: "2026-05-01" }),
      viaje({ id: 3, startDate: "2026-08-01" }), // 2026 pero futuro
      viaje({ id: 4, startDate: null }), // se excluye cuando hay year
    ];

    const stats = calcularEstadisticas(viajes, 99, 2026, hoy);

    expect(stats.totalViajes).toBe(1);
  });

  it("cuenta amigos únicos excluyendo al usuario actual, across varios viajes", () => {
    const viajes = [
      viaje({ id: 1, startDate: "2026-01-01", participants: [{ id: 1 }, { id: 2 }, { id: 3 }] }),
      viaje({ id: 2, startDate: "2026-02-01", participants: [{ id: 1 }, { id: 2 }, { id: 4 }] }),
    ];

    const stats = calcularEstadisticas(viajes, 1, null, hoy);

    expect(stats.totalAmigos).toBe(3); // 2, 3, 4
  });

  it("cuenta países únicos across varios viajes, ignorando destinos sin country", () => {
    const viajes = [
      viaje({
        id: 1,
        startDate: "2026-01-01",
        destinations: [{ name: "Bariloche", country: "argentina" }, { name: "Sin país" }],
      }),
      viaje({
        id: 2,
        startDate: "2026-02-01",
        destinations: [{ name: "Rio", country: "brasil" }, { name: "Cordoba", country: "argentina" }],
      }),
    ];

    const stats = calcularEstadisticas(viajes, 99, null, hoy);

    expect(stats.totalPaises).toBe(2); // argentina, brasil
  });

  it("con una lista vacía de viajes, devuelve todo en cero", () => {
    const stats = calcularEstadisticas([], 1, null, hoy);

    expect(stats).toEqual({ totalViajes: 0, totalAmigos: 0, totalPaises: 0 });
  });
});

describe("ProfileScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-06-15T00:00:00"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("mientras carga, no muestra el contenido del perfil", async () => {
    let resolveUser;
    api.getCurrentUser.mockReturnValue(
      new Promise((resolve) => {
        resolveUser = resolve;
      })
    );
    api.getPaisesVisitados.mockResolvedValue({ paises: [] });
    api.getTrips.mockResolvedValue([]);

    const { queryByTestId } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(queryByTestId("profile-settings-button")).toBeNull();

    await act(async () => {
      resolveUser({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    });
  });

  it("muestra el nombre completo y el @usuario una vez cargado", async () => {
    api.getCurrentUser.mockResolvedValueOnce({
      id: 1,
      nombre: "Ada",
      apellido: "Lovelace",
      nombreUsuario: "adalovelace",
    });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText("@adalovelace")).toBeTruthy();
  });

  it("muestra el próximo viaje activo con destino y fechas", async () => {
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([
      viaje({
        id: 5,
        title: "Vacaciones de invierno",
        startDate: "2026-07-01",
        endDate: "2026-07-10",
      }),
    ]);

    const { getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Vacaciones de invierno")).toBeTruthy();
    expect(getByText("Bariloche")).toBeTruthy();
  });

  it("si no hay ningún viaje próximo, muestra el estado vacío", async () => {
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([
      viaje({ id: 5, startDate: "2026-01-01" }), // ya pasó
    ]);

    const { getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Todavía no tenés un próximo viaje planeado.")).toBeTruthy();
  });

  it("al presionar el próximo viaje, navega a TripDetail con el id y el viaje", async () => {
    const navigation = { navigate: jest.fn() };
    const trip = viaje({ id: 7, title: "Ushuaia", startDate: "2026-07-01" });
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([trip]);

    const { getByText } = await render(<ProfileScreen navigation={navigation} />);

    fireEvent.press(getByText("Ushuaia"));

    expect(navigation.navigate).toHaveBeenCalledWith("TripDetail", {
      tripId: 7,
      trip,
    });
  });

  it("al presionar el botón de ajustes, navega a Configuracion", async () => {
    const navigation = { navigate: jest.fn() };
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByTestId } = await render(<ProfileScreen navigation={navigation} />);

    fireEvent.press(getByTestId("profile-settings-button"));

    expect(navigation.navigate).toHaveBeenCalledWith("Configuracion");
  });

  it("muestra la bandera de un país conocido y un ícono de fallback para uno desconocido", async () => {
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: ["argentina", "narnia"] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByText, toJSON } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(JSON.stringify(toJSON())).toContain("https://flagcdn.com/h80/ar.png");
    expect(getByText("narnia")).toBeTruthy();
  });

  it("si no visitó ningún país, muestra el estado vacío del pasaporte", async () => {
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(
      getByText(
        "Todavía no completaste ningún viaje. ¡Tu primer país visitado va a aparecer acá!"
      )
    ).toBeTruthy();
  });

  it("sin viajes, no muestra la sección de estadísticas por año", async () => {
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { queryByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(queryByText("Estadísticas por año")).toBeNull();
  });

  it("con viajes, muestra las estadísticas de 'Todos' por defecto y las actualiza al elegir un año", async () => {
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([
      viaje({ id: 1, startDate: "2025-01-01", participants: [{ id: 1 }, { id: 2 }] }),
      viaje({ id: 2, startDate: "2026-01-01", participants: [{ id: 1 }, { id: 3 }] }),
    ]);

    const { getByTestId, getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    // "Todos": ambos viajes ya empezaron -> 2 viajes
    expect(getByTestId("profile-stat-viajes").props.children).toBe(2);

    await act(async () => {
      fireEvent.press(getByText("2025"));
    });

    // Filtrado a 2025: 1 solo viaje
    expect(getByTestId("profile-stat-viajes").props.children).toBe(1);
  });

  it("si falla la carga del usuario, muestra el mensaje de error", async () => {
    api.getCurrentUser.mockRejectedValueOnce(new Error("No se pudo conectar."));
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("No se pudo conectar.")).toBeTruthy();
  });

  it("si fallan países o viajes, cae a listas vacías sin mostrar error", async () => {
    api.getCurrentUser.mockResolvedValueOnce({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    api.getPaisesVisitados.mockRejectedValueOnce(new Error("falló"));
    api.getTrips.mockRejectedValueOnce(new Error("falló"));

    const { getByText, queryByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(
      getByText(
        "Todavía no completaste ningún viaje. ¡Tu primer país visitado va a aparecer acá!"
      )
    ).toBeTruthy();
    expect(queryByText("No se pudo conectar.")).toBeNull();
  });
});