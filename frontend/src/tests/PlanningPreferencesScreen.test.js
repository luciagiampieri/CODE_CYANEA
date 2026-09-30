import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import PlanningPreferencesScreen, { validarPreferencias } from "../screens/PlanningPreferencesScreen";
import { getPlanningPreferences, savePlanningPreferences } from "../services/api";

jest.mock("../services/api", () => ({
  getPlanningPreferences: jest.fn(),
  savePlanningPreferences: jest.fn(),
}));

const opciones = {
  Intereses: [
    { IdInteresPlanificacion: 1, Nombre: "Gastronomía", Icono: "utensils" },
    { IdInteresPlanificacion: 2, Nombre: "Cultura e historia", Icono: "landmark" },
    { IdInteresPlanificacion: 3, Nombre: "Relax", Icono: "spa" },
  ],
  Ritmos: [
    { IdRitmoViaje: 1, Nombre: "Tranquilo", Descripcion: "Pocas actividades." },
    { IdRitmoViaje: 2, Nombre: "Moderado", Descripcion: "Equilibrio." },
    { IdRitmoViaje: 3, Nombre: "Intenso", Descripcion: "Muchas actividades." },
  ],
  MaxCaracteresConsideraciones: 300,
};

function respuesta({ preferencias = null, puedeEditar = true } = {}) {
  return {
    Configurada: Boolean(preferencias),
    PuedeEditar: puedeEditar,
    Preferencias: preferencias,
    Opciones: opciones,
  };
}

const mockOnClose = jest.fn();

async function renderCargada(props = {}) {
  const utils = await render(
    <PlanningPreferencesScreen visible tripId={7} onClose={mockOnClose} {...props} />
  );
  await waitFor(() => expect(utils.getByText("Gastronomía")).toBeTruthy());
  return utils;
}

async function press(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => {
    botones?.[0]?.onPress?.();
  });
});

describe("validarPreferencias", () => {
  const base = { intereses: [1], ritmo: 2, presupuesto: "", consideraciones: "", maxConsideraciones: 300 };

  it("acepta preferencias válidas sin presupuesto ni consideraciones", () => {
    expect(validarPreferencias(base)).toEqual({});
  });

  it("exige al menos un interés y un ritmo", () => {
    const errores = validarPreferencias({ ...base, intereses: [], ritmo: null });
    expect(errores.intereses).toBeTruthy();
    expect(errores.ritmo).toBeTruthy();
  });

  it.each(["0", "0,00", "-10", "abc", "10.123"])("rechaza el presupuesto %s", (valor) => {
    expect(validarPreferencias({ ...base, presupuesto: valor }).presupuesto).toBeTruthy();
  });

  it("acepta presupuesto con coma decimal", () => {
    expect(validarPreferencias({ ...base, presupuesto: "15000,50" })).toEqual({});
  });

  it("rechaza consideraciones de más de 300 caracteres", () => {
    expect(
      validarPreferencias({ ...base, consideraciones: "a".repeat(301) }).consideraciones
    ).toBeTruthy();
  });
});

describe("PlanningPreferencesScreen", () => {
  it("guarda intereses, ritmo y presupuesto y muestra confirmación", async () => {
    getPlanningPreferences.mockResolvedValue(respuesta());
    savePlanningPreferences.mockResolvedValue(respuesta({ preferencias: {} }));
    const utils = await renderCargada();

    await press(utils, "Gastronomía");
    await press(utils, "Relax");
    await press(utils, "Moderado");
    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("40000"), "45000");
    });
    await act(async () => {
      fireEvent.press(utils.getByTestId("guardar-preferencias"));
    });

    expect(savePlanningPreferences).toHaveBeenCalledWith(7, {
      IdsIntereses: [1, 3],
      IdRitmoViaje: 2,
      PresupuestoDiarioARS: 45000,
      Consideraciones: null,
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      "¡Listo!",
      expect.stringContaining("se guardaron correctamente"),
      expect.any(Array)
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("no guarda si falta interés o ritmo", async () => {
    getPlanningPreferences.mockResolvedValue(respuesta());
    const utils = await renderCargada();

    await act(async () => {
      fireEvent.press(utils.getByTestId("guardar-preferencias"));
    });

    expect(savePlanningPreferences).not.toHaveBeenCalled();
    expect(utils.getByText("Seleccioná al menos un interés.")).toBeTruthy();
    expect(utils.getByText("Seleccioná un ritmo de viaje.")).toBeTruthy();
  });

  it("precarga las preferencias guardadas", async () => {
    getPlanningPreferences.mockResolvedValue(
      respuesta({
        preferencias: {
          IdsIntereses: [2],
          IdRitmoViaje: 3,
          PresupuestoDiarioARS: 30000,
          Consideraciones: "Vegetarianos",
        },
      })
    );
    const utils = await renderCargada();

    expect(utils.getByDisplayValue("30000")).toBeTruthy();
    expect(utils.getByDisplayValue("Vegetarianos")).toBeTruthy();
    expect(utils.getByText("Guardar cambios")).toBeTruthy();
  });

  it("muestra solo lectura si el viaje finalizó", async () => {
    getPlanningPreferences.mockResolvedValue(respuesta({ puedeEditar: false }));
    const utils = await renderCargada();

    expect(utils.getByTestId("preferencias-solo-lectura")).toBeTruthy();
    expect(utils.queryByTestId("guardar-preferencias")).toBeNull();
  });

  it("muestra el error del backend al guardar", async () => {
    getPlanningPreferences.mockResolvedValue(respuesta());
    savePlanningPreferences.mockRejectedValue(new Error("El viaje ya finalizó"));
    const utils = await renderCargada();

    await press(utils, "Gastronomía");
    await press(utils, "Tranquilo");
    await act(async () => {
      fireEvent.press(utils.getByTestId("guardar-preferencias"));
    });

    expect(Alert.alert).toHaveBeenCalledWith("Error", "El viaje ya finalizó", undefined);
    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
