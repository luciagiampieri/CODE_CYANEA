import { act, fireEvent, render } from "@testing-library/react-native";

import MyTripsScreen from "../screens/MyTripsScreen";
import * as api from "../services/api";

jest.mock("../services/api", () => ({
  getTrips: jest.fn(),
}));

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({ isTablet: false, isDesktop: false }),
}));

function trip(overrides = {}) {
  return {
    id: 1,
    title: "Viaje sin nombre",
    status: "planificando",
    startDate: null,
    endDate: null,
    destinations: [],
    participants: [],
    hasLeft: false,
    budgetProgress: null,
    image: null,
    ...overrides,
  };
}

const enCurso = trip({
  id: 1,
  title: "Viaje en curso",
  status: "activo",
  startDate: "2026-06-01",
  endDate: "2026-06-20",
});
const proximoLejano = trip({
  id: 2,
  title: "Viaje próximo lejano",
  status: "planificando",
  startDate: "2026-08-01",
  endDate: "2026-08-15",
});
const proximoCercano = trip({
  id: 3,
  title: "Viaje próximo cercano",
  status: "planificando",
  startDate: "2026-07-01",
  endDate: "2026-07-10",
});
const pasadoFinalizado = trip({
  id: 4,
  title: "Viaje finalizado",
  status: "finalizado",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
});
const abandonado = trip({
  id: 5,
  title: "Viaje que abandoné",
  status: "activo",
  startDate: "2026-06-01",
  endDate: "2026-06-20",
  hasLeft: true,
});

async function renderScreen(trips, navigation = { navigate: jest.fn() }) {
  api.getTrips.mockResolvedValueOnce(trips);
  const utils = await render(<MyTripsScreen navigation={navigation} />);
  return { ...utils, navigation };
}

describe("MyTripsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-06-15T00:00:00"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("muestra el resumen de viajes activos y completados", async () => {
    const { getByText } = await renderScreen([
      enCurso,
      proximoCercano,
      pasadoFinalizado,
      abandonado,
    ]);

    // activos = en_curso + proximo = 2. completados = pasado sin hasLeft = 1 (el finalizado; el abandonado no cuenta como completado)
    expect(getByText("2 viajes activos · 1 completado")).toBeTruthy();
  });

  it("por defecto ordena en curso, luego próximos, luego pasados", async () => {
    const { getAllByTestId } = await renderScreen([
      pasadoFinalizado,
      proximoCercano,
      enCurso,
      proximoLejano,
    ]);

    const orden = getAllByTestId(/^mytrips-trip-/).map((n) => n.props.testID);

    expect(orden).toEqual([
      "mytrips-trip-1", // en curso
      "mytrips-trip-3", // próximo cercano (arranca antes)
      "mytrips-trip-2", // próximo lejano
      "mytrips-trip-4", // pasado
    ]);
  });

  it("muestra el badge 'Próximo' solo en el viaje próximo que arranca primero", async () => {
    const { getByTestId } = await renderScreen([proximoCercano, proximoLejano]);

    const cercano = getByTestId("mytrips-trip-3");
    const lejano = getByTestId("mytrips-trip-2");

    expect(JSON.stringify(cercano)).toContain("Próximo");
    expect(JSON.stringify(lejano)).not.toContain("Próximo");
  });

  it("muestra 'Saliste' para un viaje abandonado, aunque las fechas coincidan con uno en curso", async () => {
    const { getByText } = await renderScreen([abandonado]);

    expect(getByText("Saliste")).toBeTruthy();
  });

  it("muestra 'Finalizado' para un viaje pasado que no fue abandonado", async () => {
    const { getByText } = await renderScreen([pasadoFinalizado]);

    expect(getByText("Finalizado")).toBeTruthy();
  });

  it("filtra por categoría al elegir un chip", async () => {
    const { getByTestId, queryByText, getByText } = await renderScreen([
      enCurso,
      pasadoFinalizado,
    ]);

    await act(async () => {
      fireEvent.press(getByTestId("mytrips-filter-pasado"));
    });

    expect(getByText("Viaje finalizado")).toBeTruthy();
    expect(queryByText("Viaje en curso")).toBeNull();
  });

  it("muestra el estado vacío cuando el filtro no tiene resultados", async () => {
    const { getByTestId, getByText } = await renderScreen([enCurso]);

    await act(async () => {
      fireEvent.press(getByTestId("mytrips-filter-pasado"));
    });

    expect(getByText("No hay viajes en esta categoría.")).toBeTruthy();
  });

  it("muestra 'Fechas por definir' cuando el viaje no tiene fechas", async () => {
    const { getByText } = await renderScreen([trip({ id: 9, title: "Viaje sin fechas" })]);

    expect(getByText("Fechas por definir")).toBeTruthy();
  });

  it("muestra la barra de progreso cuando el viaje tiene budgetProgress", async () => {
    const { getByText } = await renderScreen([
      trip({ id: 10, title: "Viaje con presupuesto", budgetProgress: 45 }),
    ]);

    expect(getByText("45%")).toBeTruthy();
  });

  it("no muestra la barra de progreso cuando budgetProgress es null", async () => {
    const { queryByText } = await renderScreen([enCurso]);

    expect(queryByText(/%$/)).toBeNull();
  });

  it("si falla la carga, no rompe y muestra el estado vacío", async () => {
    api.getTrips.mockRejectedValueOnce(new Error("network error"));

    const { getByText } = await render(
      <MyTripsScreen navigation={{ navigate: jest.fn() }} />
    );

    expect(getByText("No hay viajes en esta categoría.")).toBeTruthy();
  });

  it("al presionar 'Crear viaje', navega a NuevoViaje", async () => {
    const { getByTestId, navigation } = await renderScreen([enCurso]);

    fireEvent.press(getByTestId("mytrips-add-button"));

    expect(navigation.navigate).toHaveBeenCalledWith("NuevoViaje");
  });

  it("al presionar una tarjeta, navega a TripDetail con ese viaje", async () => {
    const { getByTestId, navigation } = await renderScreen([enCurso]);

    fireEvent.press(getByTestId("mytrips-trip-1"));

    expect(navigation.navigate).toHaveBeenCalledWith(
      "TripDetail",
      expect.objectContaining({ trip: expect.objectContaining({ id: 1 }) })
    );
  });

  it("al presionar una acción rápida, navega a TripDetail con el initialTab correcto", async () => {
    const { getByTestId, navigation } = await renderScreen([enCurso]);

    fireEvent.press(getByTestId("mytrips-action-1-gastos"));

    expect(navigation.navigate).toHaveBeenCalledWith(
      "TripDetail",
      expect.objectContaining({ initialTab: "gastos" })
    );
  });
});