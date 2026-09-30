import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import PlanningPreferencesListScreen, {
  formatearRangoFechas,
  resumirPreferencias,
} from "../screens/PlanningPreferencesListScreen";
import { getMyPlanningPreferences, getPlanningPreferences } from "../services/api";

jest.mock("../services/api", () => ({
  getMyPlanningPreferences: jest.fn(),
  getPlanningPreferences: jest.fn(),
  savePlanningPreferences: jest.fn(),
}));

jest.mock("../hooks/useResponsive", () => () => ({ isDesktop: false }));

const viajes = [
  {
    IdViaje: 3,
    Titulo: "Bariloche con amigos",
    FechaInicio: "2026-10-05",
    FechaFin: "2026-10-09",
    Destinos: ["Bariloche"],
    Configurada: false,
    Intereses: [],
    Ritmo: null,
  },
  {
    IdViaje: 8,
    Titulo: "Europa 2027",
    FechaInicio: "2026-12-28",
    FechaFin: "2027-01-15",
    Destinos: ["Madrid", "Roma"],
    Configurada: true,
    Intereses: ["Gastronomía", "Cultura e historia"],
    Ritmo: "Moderado",
  },
];

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("helpers", () => {
  it("formatea rangos en el mismo año y entre años", () => {
    expect(formatearRangoFechas("2026-10-05", "2026-10-09")).toBe("5 oct – 9 oct 2026");
    expect(formatearRangoFechas("2026-12-28", "2027-01-15")).toBe("28 dic 2026 – 15 ene 2027");
  });

  it("resume las preferencias configuradas", () => {
    expect(resumirPreferencias(viajes[1])).toBe("Gastronomía, Cultura e historia · ritmo moderado");
    expect(resumirPreferencias(viajes[0])).toMatch(/Todavía no configuraste/);
  });
});

describe("PlanningPreferencesListScreen", () => {
  it("lista los viajes con el estado de sus preferencias", async () => {
    getMyPlanningPreferences.mockResolvedValue(viajes);
    const utils = await render(<PlanningPreferencesListScreen navigation={navigation} />);

    await waitFor(() => expect(utils.getByText("Bariloche con amigos")).toBeTruthy());
    expect(utils.getByText("Europa 2027")).toBeTruthy();
    expect(utils.getByText("Pendiente")).toBeTruthy();
    expect(utils.getByText("Configuradas")).toBeTruthy();
    expect(utils.getByText("28 dic 2026 – 15 ene 2027 · Madrid, Roma")).toBeTruthy();
  });

  it("abre el formulario del viaje elegido", async () => {
    getMyPlanningPreferences.mockResolvedValue(viajes);
    getPlanningPreferences.mockResolvedValue({
      Configurada: false,
      PuedeEditar: true,
      Preferencias: null,
      Opciones: { Intereses: [], Ritmos: [], MaxCaracteresConsideraciones: 300 },
    });
    const utils = await render(<PlanningPreferencesListScreen navigation={navigation} />);
    await waitFor(() => expect(utils.getByText("Bariloche con amigos")).toBeTruthy());

    await act(async () => {
      fireEvent.press(utils.getByTestId("planning-prefs-trip-3"));
    });

    await waitFor(() => expect(getPlanningPreferences).toHaveBeenCalledWith(3));
    expect(utils.getByText("Mis preferencias")).toBeTruthy();
  });

  it("muestra un estado vacío si no hay viajes vigentes", async () => {
    getMyPlanningPreferences.mockResolvedValue([]);
    const utils = await render(<PlanningPreferencesListScreen navigation={navigation} />);

    await waitFor(() => expect(utils.getByTestId("planning-prefs-empty")).toBeTruthy());
  });

  it("muestra el error si falla la carga", async () => {
    getMyPlanningPreferences.mockRejectedValue(new Error("Sin conexión"));
    const utils = await render(<PlanningPreferencesListScreen navigation={navigation} />);

    await waitFor(() => expect(utils.getByText("Sin conexión")).toBeTruthy());
  });

  it("vuelve atrás con el botón del header", async () => {
    getMyPlanningPreferences.mockResolvedValue([]);
    const utils = await render(<PlanningPreferencesListScreen navigation={navigation} />);
    await waitFor(() => expect(utils.getByTestId("planning-prefs-empty")).toBeTruthy());

    fireEvent.press(utils.getByTestId("planning-prefs-back-button"));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
