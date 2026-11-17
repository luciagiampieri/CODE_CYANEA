import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import ExplorePlacesScreen from "../screens/ExplorePlacesScreen";
import * as api from "../services/api";
import { getTodayIso } from "../utils/dates";
import { sumarDias } from "../utils/recorrido";

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock("../components/map/MapCanvas", () => {
  const { View } = require("react-native");
  return function MockMapCanvas(props) {
    return <View testID="map" {...props} />;
  };
});

jest.mock("../components/map/PlaceScheduleSheet", () => () => null);

jest.mock("../services/api", () => ({
  getTripDetail: jest.fn(),
  getTripPlaces: jest.fn(),
  getTripPopularPlaces: jest.fn(),
  getNearbyPlaces: jest.fn(),
  getPlaceDetails: jest.fn(),
  resolveTripPlace: jest.fn(),
  saveTripPlace: jest.fn(),
  scheduleTripPlace: jest.fn(),
  searchTripPlaces: jest.fn(),
}));

const trip = {
  id: 1,
  title: "Mallorca",
  status: "activo",
  startDate: "2026-10-01",
  endDate: "2026-10-03",
  destinations: [{ id: 9, name: "Palma", country: "España", lat: 39.57, lng: 2.65 }],
};

const saved = [
  { id: 11, placeId: "p-cat", name: "Catedral de Palma", address: "Plaça Almoina", lat: 39.567, lng: 2.648, scheduledDays: [] },
  { id: 12, placeId: "p-bel", name: "Castillo de Bellver", address: "Carrer Camilo José Cela", lat: 39.56, lng: 2.62, scheduledDays: [{ dayId: 1, dayIndex: 1 }] },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getTripDetail.mockResolvedValue(trip);
  api.getTripPlaces.mockResolvedValue(saved);
  api.getTripPopularPlaces.mockResolvedValue({
    contextLabel: "Palma",
    items: [
      { placeId: "p-cat", name: "Catedral de Palma", rating: 4.8, userRatingsTotal: 1200, lat: 39.567, lng: 2.648 },
      { placeId: "p-arab", name: "Baños Árabes", rating: 4.2, userRatingsTotal: 300, lat: 39.568, lng: 2.652 },
    ],
  });
  api.getNearbyPlaces.mockResolvedValue({
    items: [{ placeId: "p-caf", name: "Café Riutort", lat: 39.57, lng: 2.65, distanceMeters: 320, rating: 4.5 }],
  });
  api.getPlaceDetails.mockResolvedValue({ reviews: [] });
  api.resolveTripPlace.mockImplementation((_, placeId) =>
    Promise.resolve({ placeId, name: "Baños Árabes", address: "Carrer de Can Serra", lat: 39.568, lng: 2.652 })
  );
});

const renderScreen = async () =>
  render(<ExplorePlacesScreen navigation={{ goBack: jest.fn() }} route={{ params: { tripId: 1 } }} />);

test("muestra imperdibles por defecto y marca los ya guardados", async () => {
  const screen = await renderScreen();
  expect(await screen.findByText("Imperdibles de Palma")).toBeTruthy();
  expect(await screen.findByText("Baños Árabes")).toBeTruthy();
  expect(screen.getAllByText("Guardado").length).toBeGreaterThan(0);
});

test("un chip de categoría carga cercanos y tocarlo de nuevo vuelve a imperdibles", async () => {
  const screen = await renderScreen();
  await screen.findByText("Imperdibles de Palma");
  await fireEvent.press(screen.getByText("Cafeterías"));
  expect(await screen.findByText("Café Riutort")).toBeTruthy();
  expect(screen.getByText("Cafeterías en esta zona")).toBeTruthy();
  expect(api.getNearbyPlaces).toHaveBeenCalledWith(1, 39.57, 2.65, "cafeterias");
  await fireEvent.press(screen.getByText("Cafeterías"));
  expect(await screen.findByText("Imperdibles de Palma")).toBeTruthy();
});

test("la pestaña Guardados agrupa por día y ofrece agendar los pendientes", async () => {
  const screen = await renderScreen();
  await screen.findByText("Imperdibles de Palma");
  await fireEvent.press(screen.getByText("Guardados"));
  expect(await screen.findByText("Sin día asignado")).toBeTruthy();
  expect(screen.getByText("Día 1")).toBeTruthy();
  expect(screen.getByText("jue 1 oct")).toBeTruthy();
  expect(screen.getByText("Agendar")).toBeTruthy();
});

test("tocar un imperdible abre el detalle en el panel y se puede volver", async () => {
  const screen = await renderScreen();
  await fireEvent.press(await screen.findByText("Baños Árabes"));
  expect(await screen.findByText("Guardar en el viaje")).toBeTruthy();
  await fireEvent.press(screen.getByText("Imperdibles"));
  expect(await screen.findByText("Imperdibles de Palma")).toBeTruthy();
});

test("en modo solo lectura no se muestran acciones", async () => {
  api.getTripDetail.mockResolvedValue({ ...trip, hasLeft: true });
  const screen = await renderScreen();
  expect(await screen.findByText("Ya no sos parte de este viaje: solo podés mirar.")).toBeTruthy();
  await fireEvent.press(await screen.findByText("Baños Árabes"));
  await waitFor(() => expect(screen.queryByText("Guardar en el viaje")).toBeNull());
});

test("en un viaje finalizado se puede mirar el mapa pero no guardar lugares", async () => {
  api.getTripDetail.mockResolvedValue({ ...trip, status: "finalizado" });
  const screen = await renderScreen();
  expect(
    await screen.findByText("El viaje terminó: podés mirar el mapa, pero no guardar ni agendar lugares.")
  ).toBeTruthy();
  await fireEvent.press(await screen.findByText("Baños Árabes"));
  await waitFor(() => expect(screen.queryByText("Guardar en el viaje")).toBeNull());

  await fireEvent.press(screen.getByText("Imperdibles"));
  await fireEvent.press(await screen.findByText("Guardados"));
  expect(await screen.findByText("Sin día asignado")).toBeTruthy();
  expect(screen.queryByText("Agendar")).toBeNull();
});
// --- Varios destinos: selector de destino y Guardados por destino ---

const MADRID = { id: 21, name: "Madrid", country: "España", lat: 40.4168, lng: -3.7038, noches: 3, nochesEnViaje: 0 };
const BARCELONA = { id: 22, name: "Barcelona", country: "España", lat: 41.3874, lng: 2.1686, noches: 2, nochesEnViaje: 0 };

const viajeDosDestinos = {
  ...trip,
  title: "España",
  startDate: "2030-12-01",
  endDate: "2030-12-06",
  destinations: [MADRID, BARCELONA],
};

const guardadosDosDestinos = [
  { id: 31, placeId: "p-prado", name: "Museo del Prado", address: "Madrid", lat: 40.4138, lng: -3.6921, scheduledDays: [] },
  // Toledo queda a ~70 km de Madrid: es una excursión y va con Madrid.
  { id: 32, placeId: "p-tol", name: "Catedral de Toledo", address: "Toledo", lat: 39.8571, lng: -4.0237, scheduledDays: [{ dayId: 2, dayIndex: 2 }] },
  { id: 33, placeId: "p-sagrada", name: "Sagrada Familia", address: "Barcelona", lat: 41.4036, lng: 2.1744, scheduledDays: [] },
  // Sevilla está lejos de los dos destinos.
  { id: 34, placeId: "p-giralda", name: "La Giralda", address: "Sevilla", lat: 37.3861, lng: -5.9926, scheduledDays: [] },
];

describe("con varios destinos", () => {
  beforeEach(() => {
    api.getTripDetail.mockResolvedValue(viajeDosDestinos);
    api.getTripPlaces.mockResolvedValue(guardadosDosDestinos);
  });

  test("el botón muestra el destino activo con su número y noches, y arranca en el primero", async () => {
    const screen = await renderScreen();
    expect(await screen.findByText("Imperdibles de Madrid")).toBeTruthy();
    expect(screen.getByTestId("selector-destino")).toHaveTextContent(/1Madrid · 3 noches/);
    expect(api.getTripPopularPlaces).toHaveBeenCalledWith(1, MADRID.lat, MADRID.lng, 8);
  });

  test("la hoja lista los destinos con fechas y noches, y elegir uno centra y recarga ahí", async () => {
    const screen = await renderScreen();
    await screen.findByText("Imperdibles de Madrid");

    await fireEvent.press(screen.getByTestId("selector-destino"));
    expect(screen.getByText("Destinos del viaje")).toBeTruthy();
    expect(screen.getByTestId("hoja-destino-0")).toHaveTextContent(/1 → 4 dic · 3 noches/);
    expect(screen.getByTestId("hoja-destino-1")).toHaveTextContent(/4 → 6 dic · 2 noches/);
    expect(screen.getByTestId("hoja-destino-0").props.accessibilityState.selected).toBe(true);
    expect(screen.queryByTestId("hoja-destino-hoy-0")).toBeNull();

    await fireEvent.press(screen.getByTestId("hoja-destino-1"));

    expect(await screen.findByText("Imperdibles de Barcelona")).toBeTruthy();
    expect(screen.queryByText("Destinos del viaje")).toBeNull();
    expect(api.getTripPopularPlaces).toHaveBeenLastCalledWith(1, BARCELONA.lat, BARCELONA.lng, 8);
    expect(screen.getByTestId("map").props.centrarEn).toEqual(
      expect.objectContaining({ lat: BARCELONA.lat, lng: BARCELONA.lng })
    );
    expect(screen.getByTestId("selector-destino")).toHaveTextContent(/2Barcelona · 2 noches/);
  });

  test("con el viaje en curso arranca en el destino de hoy y lo marca con 'Hoy'", async () => {
    const inicio = sumarDias(getTodayIso(), -4);
    api.getTripDetail.mockResolvedValue({ ...viajeDosDestinos, startDate: inicio, endDate: sumarDias(inicio, 5) });
    const screen = await renderScreen();

    expect(await screen.findByText("Imperdibles de Barcelona")).toBeTruthy();
    expect(api.getTripPopularPlaces).toHaveBeenCalledWith(1, BARCELONA.lat, BARCELONA.lng, 8);

    await fireEvent.press(screen.getByTestId("selector-destino"));
    expect(screen.getByTestId("hoja-destino-hoy-1")).toHaveTextContent(/Hoy/);
    expect(screen.queryByTestId("hoja-destino-hoy-0")).toBeNull();
  });

  test("'Buscar en esta zona' lejos del destino pasa a 'Zona del mapa' y se puede volver", async () => {
    const screen = await renderScreen();
    await screen.findByText("Imperdibles de Madrid");

    await act(async () => {
      screen.getByTestId("map").props.onViewportChange({ lat: 40.9, lng: -4.1 });
    });
    await fireEvent.press(await screen.findByText("Buscar en esta zona"));

    expect(await screen.findByText("Imperdibles de Palma")).toBeTruthy();
    expect(screen.getByTestId("selector-destino")).toHaveTextContent(/Zona del mapa/);

    await fireEvent.press(screen.getByTestId("selector-destino"));
    expect(screen.getByTestId("hoja-destino-0").props.accessibilityState.selected).toBe(false);
    await fireEvent.press(screen.getByTestId("hoja-destino-0"));
    expect(await screen.findByText("Imperdibles de Madrid")).toBeTruthy();
  });

  test("el selector va en el panel: arriba del mapa quedan solo buscador y categorías", async () => {
    const screen = await renderScreen();
    await screen.findByText("Imperdibles de Madrid");
    expect(screen.getByTestId("map").props.topInset).toBe(124);
  });

  test("Guardados agrupa por destino, con 'Otros lugares' al final y los agendados con su día", async () => {
    const screen = await renderScreen();
    await screen.findByText("Imperdibles de Madrid");
    await fireEvent.press(screen.getByText("Guardados"));

    expect(screen.getByTestId("selector-destino")).toHaveTextContent(/Todos los destinos/);
    const madrid = await screen.findByTestId("saved-group-destination-0");
    expect(madrid).toHaveTextContent(/Madrid · 1 → 4 dic/);
    expect(screen.getByTestId("saved-group-destination-1")).toHaveTextContent(/Barcelona · 4 → 6 dic/);
    expect(screen.getByTestId("saved-group-others")).toHaveTextContent(/Otros lugares/);
    expect(screen.getByTestId("saved-group-others")).toHaveTextContent(/La Giralda/);
    expect(screen.getByText("Día 2")).toBeTruthy();
    // Sin encabezados por día cuando hay varios destinos.
    expect(screen.queryByText("Sin día asignado")).toBeNull();
  });

  test("en Guardados el selector filtra por destino y centra el mapa sin cambiar Descubrir", async () => {
    const screen = await renderScreen();
    await screen.findByText("Imperdibles de Madrid");
    const llamadasImperdibles = api.getTripPopularPlaces.mock.calls.length;
    await fireEvent.press(screen.getByText("Guardados"));

    await fireEvent.press(screen.getByTestId("selector-destino"));
    expect(screen.getByTestId("hoja-destino-todos").props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId("hoja-destino-0").props.accessibilityState.selected).toBe(false);

    await fireEvent.press(screen.getByTestId("hoja-destino-1"));

    expect(screen.getByTestId("selector-destino")).toHaveTextContent(/2Barcelona · 2 noches/);
    expect(screen.getByTestId("saved-group-destination-1")).toHaveTextContent(/Sagrada Familia/);
    expect(screen.queryByTestId("saved-group-destination-0")).toBeNull();
    expect(screen.queryByTestId("saved-group-others")).toBeNull();
    expect(screen.getByTestId("map").props.centrarEn).toEqual(
      expect.objectContaining({ lat: BARCELONA.lat, lng: BARCELONA.lng })
    );
    // El contador de la pestaña no cambia y Descubrir no recarga.
    expect(screen.getByText("4")).toBeTruthy();
    expect(api.getTripPopularPlaces.mock.calls.length).toBe(llamadasImperdibles);

    // Volver a Descubrir: sigue en Madrid y el mapa vuelve ahí.
    await fireEvent.press(screen.getByText("Descubrir"));
    expect(await screen.findByText("Imperdibles de Madrid")).toBeTruthy();
    expect(screen.getByTestId("selector-destino")).toHaveTextContent(/1Madrid · 3 noches/);
    expect(screen.getByTestId("map").props.centrarEn).toEqual(
      expect.objectContaining({ lat: MADRID.lat, lng: MADRID.lng })
    );
    expect(screen.queryByText("Buscar en esta zona")).toBeNull();

    // Al volver a Guardados el filtro arranca otra vez en "Todos los destinos".
    await fireEvent.press(screen.getByText("Guardados"));
    expect(screen.getByTestId("selector-destino")).toHaveTextContent(/Todos los destinos/);
    expect(screen.getByTestId("saved-group-others")).toBeTruthy();
  });

  test("elegir 'Todos los destinos' vuelve a mostrar todos los grupos", async () => {
    const screen = await renderScreen();
    await screen.findByText("Imperdibles de Madrid");
    await fireEvent.press(screen.getByText("Guardados"));
    await fireEvent.press(screen.getByTestId("selector-destino"));
    await fireEvent.press(screen.getByTestId("hoja-destino-0"));
    expect(screen.queryByTestId("saved-group-destination-1")).toBeNull();

    await fireEvent.press(screen.getByTestId("selector-destino"));
    await fireEvent.press(screen.getByTestId("hoja-destino-todos"));

    expect(screen.getByTestId("saved-group-destination-0")).toBeTruthy();
    expect(screen.getByTestId("saved-group-destination-1")).toBeTruthy();
    expect(screen.getByTestId("saved-group-others")).toBeTruthy();
  });

  test("un destino sin guardados muestra un aviso", async () => {
    api.getTripPlaces.mockResolvedValue([guardadosDosDestinos[0]]);
    const screen = await renderScreen();
    await screen.findByText("Imperdibles de Madrid");
    await fireEvent.press(screen.getByText("Guardados"));
    await fireEvent.press(screen.getByTestId("selector-destino"));
    await fireEvent.press(screen.getByTestId("hoja-destino-1"));

    expect(screen.getByText("Todavía no guardaste lugares en Barcelona.")).toBeTruthy();
  });
});

describe("con un solo destino", () => {
  test("no se muestra el selector en Descubrir ni en Guardados y el mapa queda como antes", async () => {
    const screen = await renderScreen();
    await screen.findByText("Imperdibles de Palma");
    expect(screen.queryByTestId("selector-destino")).toBeNull();
    expect(screen.getByTestId("map").props.topInset).toBe(124);

    await fireEvent.press(screen.getByText("Guardados"));
    expect(await screen.findByText("Sin día asignado")).toBeTruthy();
    expect(screen.queryByTestId("selector-destino")).toBeNull();
  });
});
