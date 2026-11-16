import { act, fireEvent, render, screen } from "@testing-library/react-native";

import HomeScreen, { ESPERA_REINTENTO_MS } from "../screens/HomeScreen";
import * as api from "../services/api";

// QA: después de iniciar sesión, si la carga de viajes fallaba la pantalla mostraba
// "Viajera", 0 viajes y "Todavía no hay viajes cargados" como si no tuviera ninguno.

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
  getTrips: jest.fn(),
  getCurrentUser: jest.fn(),
  getNotifications: jest.fn(() => Promise.resolve([])),
  getPendingInvitations: jest.fn(() => Promise.resolve([])),
  getNotificationsSocketUrl: jest.fn(() => new Promise(() => {})),
}));

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { nombre: "Lucía" } }),
}));

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({ isTablet: false, isDesktop: false }),
}));

const navigation = { navigate: jest.fn() };

const viajeProximo = {
  id: 1,
  title: "Escapada a Mendoza",
  status: "activo",
  startDate: "2099-03-01",
  endDate: "2099-03-05",
  destinations: [{ name: "Mendoza", country: "Argentina" }],
  participants: [],
  image: null,
};

async function renderizar() {
  await render(<HomeScreen navigation={navigation} />);
  await act(async () => {});
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  api.getCurrentUser.mockResolvedValue({ nombre: "Ana" });
});

afterEach(() => {
  jest.useRealTimers();
});

test("muestra el estado de carga mientras se consultan los viajes", async () => {
  api.getTrips.mockReturnValue(new Promise(() => {}));

  await renderizar();

  expect(screen.getByTestId("home-cargando")).toBeTruthy();
  expect(screen.queryByText("Todavía no hay viajes cargados.")).toBeNull();
});

test("si la primera consulta falla reintenta una vez y muestra los viajes", async () => {
  api.getTrips.mockRejectedValueOnce(new Error("red")).mockResolvedValueOnce([viajeProximo]);

  await renderizar();
  await act(async () => {
    jest.advanceTimersByTime(ESPERA_REINTENTO_MS);
  });

  expect(api.getTrips).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Escapada a Mendoza")).toBeTruthy();
  expect(screen.queryByTestId("home-error")).toBeNull();
});

test("si el reintento también falla muestra el error con Reintentar y no el estado vacío", async () => {
  api.getTrips.mockRejectedValue(new Error("red"));

  await renderizar();
  await act(async () => {
    jest.advanceTimersByTime(ESPERA_REINTENTO_MS);
  });

  expect(screen.getByTestId("home-error")).toBeTruthy();
  expect(screen.getByText("No pudimos cargar tus viajes.")).toBeTruthy();
  expect(screen.queryByTestId("home-vacio")).toBeNull();
  expect(screen.queryByText("0")).toBeNull();
});

test("Reintentar vuelve a consultar y muestra los viajes", async () => {
  api.getTrips.mockRejectedValueOnce(new Error("red")).mockRejectedValueOnce(new Error("red"));

  await renderizar();
  await act(async () => {
    jest.advanceTimersByTime(ESPERA_REINTENTO_MS);
  });
  expect(screen.getByTestId("home-error")).toBeTruthy();

  api.getTrips.mockResolvedValueOnce([viajeProximo]);
  await act(async () => {
    fireEvent.press(screen.getByTestId("home-reintentar"));
  });

  expect(screen.getByText("Escapada a Mendoza")).toBeTruthy();
  expect(screen.queryByTestId("home-error")).toBeNull();
});

test("sin viajes muestra el estado vacío", async () => {
  api.getTrips.mockResolvedValue([]);

  await renderizar();

  expect(screen.getByTestId("home-vacio")).toBeTruthy();
  expect(screen.getByText("Todavía no hay viajes cargados.")).toBeTruthy();
});

test("si falla la consulta del perfil saluda con el usuario de la sesión", async () => {
  api.getTrips.mockResolvedValue([]);
  api.getCurrentUser.mockRejectedValue(new Error("red"));

  await renderizar();

  expect(screen.getByText(/Lucía/)).toBeTruthy();
  expect(screen.queryByText(/Viajera/)).toBeNull();
});
