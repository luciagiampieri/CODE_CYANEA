/**
 * Las actividades tienen 6 categorías: Vuelo y Traslado pasaron a ser traslados (US 136).
 */
import { Platform } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";

import AddActivityScreen from "../screens/AddActivityScreen";
import { ICON_OPTIONS, detectIcon } from "../utils/categoriasActividad";

jest.mock("../services/api", () => ({
  searchTripPlaces: jest.fn(),
  saveActivityLocation: jest.fn(),
  resolveTripPlace: jest.fn(),
}));

describe("categorías de actividades", () => {
  it("ofrece Hotel, Comida, Turismo, Evento, Excursión y Otro", () => {
    expect(ICON_OPTIONS.map((opcion) => opcion.label)).toEqual([
      "Hotel",
      "Comida",
      "Turismo",
      "Evento",
      "Excursión",
      "Otro",
    ]);
  });

  it("no incluye los íconos de Vuelo ni de Traslado", () => {
    const iconos = ICON_OPTIONS.map((opcion) => opcion.name);

    expect(iconos).not.toContain("plane");
    expect(iconos).not.toContain("car");
  });

  it.each([
    "Vuelo a Madrid",
    "Ir al aeropuerto",
    "Embarque",
    "Taxi al centro",
    "Tren a Córdoba",
    "Ferry",
    "Uber",
    "Traslado",
    "Subte",
    "Vuelo a Bariloche",
    "Aeropuerto de Bariloche",
    "Tren a la playa",
  ])("«%s» queda en Otro", (nombre) => {
    expect(detectIcon(nombre)).toBe("location-dot");
  });

  it.each([
    ["Check-in", "building"],
    ["Cena en el puerto", "utensils"],
    ["Visita al museo", "camera"],
    ["Show de tango", "ticket"],
    ["Trekking", "person-hiking"],
  ])("«%s» sigue detectando su categoría", (nombre, icono) => {
    expect(detectIcon(nombre)).toBe(icono);
  });

  it("«Escalada» deja de confundirse con un vuelo", () => {
    expect(detectIcon("Escalada")).toBe("person-hiking");
  });

  it("sin nombre queda en Otro", () => {
    expect(detectIcon("  ")).toBe("location-dot");
  });
});

describe("AddActivityScreen", () => {
  beforeEach(() => {
    Platform.OS = "web";
  });

  it("el selector no ofrece Vuelo ni Traslado", async () => {
    const utils = await render(
      <AddActivityScreen
        visible
        onClose={jest.fn()}
        onSubmit={jest.fn()}
        dayLabel="Día 1"
        tripId={42}
      />
    );

    await act(async () => {
      fireEvent.press(utils.getByText("Otro"));
    });

    expect(utils.getByText("Hotel")).toBeTruthy();
    expect(utils.queryByText("Vuelo")).toBeNull();
    expect(utils.queryByText("Traslado")).toBeNull();
  });
});
