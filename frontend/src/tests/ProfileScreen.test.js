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
  getAccountUsage: jest.fn(),
  getAchievements: jest.fn(),
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

function uso(overrides = {}) {
  return {
    limite: 5,
    usoActual: 1,
    ilimitado: false,
    porcentajeUso: 20,
    limiteAlcanzado: false,
    limiteExcedido: false,
    renuevaEl: null,
    ...overrides,
  };
}

function consumo(planActual = "gratuito") {
  return { planActual, viajesActivos: uso(), escaneosMensuales: uso({ limite: 3, usoActual: 0, porcentajeUso: 0 }) };
}

const LOGROS = [
  {
    id: "primer_viaje", titulo: "Primer viaje", descripcion: "Creá un viaje o sumate al de tu grupo.",
    icono: "plane-departure", valor: 1, meta: 1, nivel: 1, niveles: 1, obtenido: true, completo: true,
    progreso: 100, progresoTexto: "Logro completo",
  },
  {
    id: "explorador", titulo: "Explorador", descripcion: "Conocé países nuevos con tus viajes.",
    icono: "earth-americas", valor: 1, meta: 3, nivel: 0, niveles: 3, obtenido: false, completo: false,
    progreso: 33, progresoTexto: "Te faltan 2 países",
  },
];

function usuarioAda() {
  api.getCurrentUser.mockResolvedValueOnce({
    id: 1,
    nombre: "Ada",
    apellido: "Lovelace",
    nombreUsuario: "adalovelace",
  });
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
    api.getAccountUsage.mockResolvedValue(consumo());
    api.getAchievements.mockResolvedValue({ logros: LOGROS });
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

    const { queryByTestId, queryByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(queryByText("Ada Lovelace")).toBeNull();
    expect(queryByTestId("profile-plan-card")).toBeNull();
    expect(queryByTestId("profile-logros")).toBeNull();

    await act(async () => {
      resolveUser({ id: 1, nombre: "Ada", apellido: "Lovelace" });
    });
  });

  it("muestra el nombre completo y el @usuario una vez cargado", async () => {
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText("@adalovelace")).toBeTruthy();
  });

  it("sin viajes, invita a crear el primero", async () => {
    const navigation = { navigate: jest.fn() };
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByTestId, getByText, queryByText } = await render(
      <ProfileScreen navigation={navigation} />
    );

    expect(getByTestId("profile-empty")).toBeTruthy();
    expect(queryByText("Próximo viaje")).toBeNull();
    fireEvent.press(getByText("Crear viaje"));
    expect(navigation.navigate).toHaveBeenCalledWith("NuevoViaje");
  });

  it("muestra el próximo viaje activo con destino y fechas", async () => {
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([
      viaje({
        id: 5,
        title: "Vacaciones de invierno",
        startDate: "2026-07-01",
        endDate: "2026-07-10",
      }),
    ]);

    const { getByText, queryByTestId } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Vacaciones de invierno")).toBeTruthy();
    expect(getByText("Bariloche")).toBeTruthy();
    expect(queryByTestId("profile-empty")).toBeNull();
  });

  it("si no hay ningún viaje próximo, muestra el estado vacío", async () => {
    usuarioAda();
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
    usuarioAda();
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
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByTestId } = await render(<ProfileScreen navigation={navigation} />);

    fireEvent.press(getByTestId("profile-settings-button"));

    expect(navigation.navigate).toHaveBeenCalledWith("Configuracion");
  });

  it("al presionar editar perfil, navega a EditarPerfil", async () => {
    const navigation = { navigate: jest.fn() };
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByTestId } = await render(<ProfileScreen navigation={navigation} />);

    fireEvent.press(getByTestId("profile-edit-button"));

    expect(navigation.navigate).toHaveBeenCalledWith("EditarPerfil");
  });

  it("muestra la bandera de un país conocido y un ícono de fallback para uno desconocido", async () => {
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: ["argentina", "narnia"] });
    api.getTrips.mockResolvedValueOnce([viaje({ startDate: "2026-01-01" })]);

    const { getByText, toJSON } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(JSON.stringify(toJSON())).toContain("https://flagcdn.com/h80/ar.png");
    expect(getByText("narnia")).toBeTruthy();
  });

  it("con viajes pero sin países visitados, muestra el estado vacío del pasaporte", async () => {
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([viaje()]);

    const { getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Cuando termine tu primer viaje, sus países van a aparecer acá.")).toBeTruthy();
  });

  it("sin viajes, no muestra el resumen anual ni los países", async () => {
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { queryByTestId, queryByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(queryByTestId("profile-stat-viajes")).toBeNull();
    expect(queryByText("Países visitados")).toBeNull();
  });

  it("con viajes, muestra las estadísticas de 'Todos' por defecto y las actualiza al elegir un año", async () => {
    usuarioAda();
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

  it("plan gratuito: muestra el distintivo y ofrece conocer Pro", async () => {
    const navigation = { navigate: jest.fn() };
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByTestId, getByText } = await render(<ProfileScreen navigation={navigation} />);

    expect(getByTestId("profile-plan-badge").props.children).toBe("Gratuito");
    expect(getByTestId("profile-uso-viajes")).toBeTruthy();
    expect(getByText("Conocé Pro")).toBeTruthy();
    fireEvent.press(getByTestId("profile-plan-button"));
    expect(navigation.navigate).toHaveBeenCalledWith("Planes");
  });

  it("plan Pro: muestra el distintivo y lleva a gestionar el plan", async () => {
    const navigation = { navigate: jest.fn() };
    api.getAccountUsage.mockResolvedValue(consumo("pro"));
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByTestId, getByText } = await render(<ProfileScreen navigation={navigation} />);

    expect(getByTestId("profile-plan-badge").props.children).toBe("Pro");
    expect(getByText("Gestionar plan")).toBeTruthy();
    fireEvent.press(getByTestId("profile-plan-button"));
    expect(navigation.navigate).toHaveBeenCalledWith("MiSuscripcion");
  });

  it("si falla el consumo, el perfil se muestra igual y la tarjeta ofrece ver el plan", async () => {
    const navigation = { navigate: jest.fn() };
    api.getAccountUsage.mockRejectedValue(new Error("falló"));
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByTestId, getByText, queryByTestId, queryByText } = await render(
      <ProfileScreen navigation={navigation} />
    );

    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(queryByTestId("profile-plan-badge")).toBeNull();
    expect(getByText("No pudimos cargar el consumo de tu plan.")).toBeTruthy();
    expect(queryByText("falló")).toBeNull();
    fireEvent.press(getByTestId("profile-plan-button"));
    expect(navigation.navigate).toHaveBeenCalledWith("MiSuscripcion");
  });

  it("muestra los logros con su progreso", async () => {
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([viaje()]);

    const { getByTestId, getByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByTestId("profile-logros")).toBeTruthy();
    expect(getByText("1 de 2 logros obtenidos")).toBeTruthy();
    expect(getByTestId("logro-primer_viaje")).toBeTruthy();
    expect(getByText("Logro completo")).toBeTruthy();
    expect(getByText("Te faltan 2 países")).toBeTruthy();
  });

  it("si fallan los logros, no muestra la sección", async () => {
    api.getAchievements.mockRejectedValue(new Error("falló"));
    usuarioAda();
    api.getPaisesVisitados.mockResolvedValueOnce({ paises: [] });
    api.getTrips.mockResolvedValueOnce([]);

    const { getByText, queryByTestId } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(queryByTestId("profile-logros")).toBeNull();
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
    usuarioAda();
    api.getPaisesVisitados.mockRejectedValueOnce(new Error("falló"));
    api.getTrips.mockRejectedValueOnce(new Error("falló"));

    const { getByText, queryByText } = await render(
      <ProfileScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("Ada Lovelace")).toBeTruthy();
    expect(getByText("Planeá tu primer viaje")).toBeTruthy();
    expect(queryByText("No se pudo conectar.")).toBeNull();
    expect(queryByText("falló")).toBeNull();
  });
});