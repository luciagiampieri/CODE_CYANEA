import { fireEvent, render, waitFor } from "@testing-library/react-native";

import ExplorePlacesScreen from "../screens/ExplorePlacesScreen";
import * as api from "../services/api";

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