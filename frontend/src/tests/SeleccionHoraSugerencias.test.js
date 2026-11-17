// Sugerencias con IA: la franja horaria se elige con el mismo selector de hora que
// Nueva actividad (reloj nativo en el celular, selector del navegador en la web),
// sin escribir "10:00" a mano.
import React from "react";
import { Platform } from "react-native";
import { fireEvent, render, within } from "@testing-library/react-native";

import ActivitySuggestionsScreen, { validarFranja } from "../screens/ActivitySuggestionsScreen";
import { fechaDeHora, horaDeFecha } from "../components/ui/SelectorHora";
import { getActivitySuggestionsContext, requestActivitySuggestions } from "../services/api";

jest.mock("../services/api", () => ({
  getActivitySuggestionsContext: jest.fn(),
  requestActivitySuggestions: jest.fn(),
}));

jest.mock("../utils/limitesPlan", () => ({
  esErrorDeLimite: () => false,
  irAPlanes: jest.fn(),
}));

jest.mock("../screens/PlanningPreferencesScreen", () => () => null);

// Reloj nativo simulado: al tocarlo elige las 16:45.
jest.mock("@react-native-community/datetimepicker", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return function MockDateTimePicker({ onChange }) {
    const elegida = new Date();
    elegida.setHours(16, 45, 0, 0);
    return (
      <Pressable testID="reloj-nativo" onPress={() => onChange({ type: "set" }, elegida)}>
        <Text>Reloj</Text>
      </Pressable>
    );
  };
});

const DIAS = [{ dayId: 11, dayIndex: 1, fechaRaw: "2099-12-01", actividades: [] }];

const osOriginal = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  getActivitySuggestionsContext.mockResolvedValue({
    SolicitudesRestantes: 5,
    LimiteDiario: 10,
    ParticipantesConPreferencias: 1,
    ParticipantesTotal: 1,
    MisPreferenciasConfiguradas: true,
    PuedeSolicitar: true,
  });
  requestActivitySuggestions.mockResolvedValue({ Sugerencias: [], SolicitudesRestantes: 4 });
});

afterEach(() => {
  Platform.OS = osOriginal;
});

async function renderPantalla() {
  return render(
    <ActivitySuggestionsScreen visible tripId={3} tripTitle="Viaje" dias={DIAS} onClose={jest.fn()} />
  );
}

function horaEn(utils, testID) {
  return within(utils.getByTestId(testID));
}

async function generar(utils) {
  await fireEvent.press(utils.getByTestId("suggestions-generar"));
}

describe("helpers del selector de hora", () => {
  it("convierte entre 'HH:MM' y Date", () => {
    const fecha = fechaDeHora("09:30");
    expect([fecha.getHours(), fecha.getMinutes()]).toEqual([9, 30]);
    expect(horaDeFecha(fecha)).toBe("09:30");
  });

  it("usa la hora por defecto si la actual no es válida", () => {
    expect(horaDeFecha(fechaDeHora("", "13:00"))).toBe("13:00");
    expect(horaDeFecha(fechaDeHora("25:00", "13:00"))).toBe("13:00");
  });
});

describe("franja horaria de Sugerencias con IA", () => {
  it("no muestra campos de texto para la hora: usa el selector", async () => {
    Platform.OS = "web";
    const utils = await renderPantalla();

    expect(horaEn(utils, "suggestions-hora-inicio").getByText("09:00")).toBeTruthy();
    expect(horaEn(utils, "suggestions-hora-fin").getByText("13:00")).toBeTruthy();
    expect(utils.queryByPlaceholderText("10:00")).toBeNull();
  });

  it("en web elige la franja con el selector del navegador y la envía", async () => {
    Platform.OS = "web";
    const utils = await renderPantalla();

    await fireEvent(utils.getByLabelText("Desde"), "change", { target: { value: "15:00" } });
    await fireEvent(utils.getByLabelText("Hasta"), "change", { target: { value: "18:30" } });
    await generar(utils);

    expect(requestActivitySuggestions).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ IdDiaCronograma: 11, HoraInicio: "15:00", HoraFin: "18:30" })
    );
  });

  it("en el celular abre el reloj al tocar la hora y guarda la elegida", async () => {
    Platform.OS = "android";
    const utils = await renderPantalla();

    expect(utils.queryByTestId("reloj-nativo")).toBeNull();
    await fireEvent.press(utils.getByTestId("suggestions-hora-fin"));
    await fireEvent.press(utils.getByTestId("reloj-nativo"));

    expect(horaEn(utils, "suggestions-hora-fin").getByText("16:45")).toBeTruthy();
    expect(utils.queryByTestId("reloj-nativo")).toBeNull();
  });

  it("los chips de franja rápida siguen completando el selector", async () => {
    Platform.OS = "web";
    const utils = await renderPantalla();

    await fireEvent.press(utils.getByTestId("suggestions-franja-tarde"));

    expect(horaEn(utils, "suggestions-hora-inicio").getByText("14:00")).toBeTruthy();
    expect(horaEn(utils, "suggestions-hora-fin").getByText("18:00")).toBeTruthy();
  });

  it("valida que la franja dure al menos una hora", () => {
    expect(validarFranja("10:00", "10:30").error).toBe("La franja debe durar al menos una hora.");
    expect(validarFranja("", "13:00").error).toBe("Elegí la hora de inicio.");
  });
});
