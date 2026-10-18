// US 88: aceptar una sugerencia de actividad. Los casos de prueba de la US se
// mapean como CP1 a CP10 (CP9 y CP10 se validan en el backend).
import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AcceptSuggestionModal from "../components/trip/AcceptSuggestionModal";
import SuggestionCompactCard from "../components/trip/SuggestionCompactCard";
import DaySuggestionsScreen from "../screens/DaySuggestionsScreen";
import { acceptActivitySuggestion, getActivitySuggestions } from "../services/api";
import {
  mensajeSuperposicion,
  normalizarHora,
  validarHorarioSugerencia,
} from "../utils/aceptarSugerencia";
import { confirmar } from "../utils/dialogs";

jest.mock("../services/api", () => ({
  acceptActivitySuggestion: jest.fn(),
  discardActivitySuggestion: jest.fn(),
  getActivitySuggestions: jest.fn(),
  getActivitySuggestionPhotoSource: jest.fn(),
}));

jest.mock("../utils/dialogs", () => ({
  avisar: jest.fn(),
  confirmar: jest.fn(),
}));

// Las hojas de regenerar y votar no participan de esta US.
jest.mock("../screens/ActivitySuggestionsScreen", () => () => null);
jest.mock("../screens/ProposeSuggestionsVoteScreen", () => () => null);

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  const { useEffect } = jest.requireActual("react");
  return { ...actual, useFocusEffect: (callback) => useEffect(callback, [callback]) };
});

const SUGERENCIA = {
  IdSugerenciaActividad: 7,
  IdViaje: 3,
  IdDiaCronograma: 11,
  Estado: "pendiente",
  Nombre: "Visita al Museo de Bellas Artes",
  Descripcion: "Recorrido por la colección permanente.",
  HoraInicio: "15:00",
  HoraFin: "17:00",
  GooglePlaceId: "google:museo",
  LugarNombre: "Museo Nacional de Bellas Artes",
  LugarDireccion: "Av. del Libertador 1473",
  TieneFoto: false,
  CostoEstimadoARS: 0,
  Motivo: "Al grupo le interesa la cultura.",
};

const ACEPTADA = {
  Aceptada: true,
  RequiereConfirmacion: false,
  Superpuestas: [],
  Mensaje: "Se agregó «Visita al Museo de Bellas Artes» al itinerario de 15:00 a 17:00.",
  IdActividad: 99,
  Sugerencia: { ...SUGERENCIA, Estado: "aceptada" },
};

const SUPERPUESTA = {
  Aceptada: false,
  RequiereConfirmacion: true,
  Superpuestas: [{ IdActividad: 5, Nombre: "Almuerzo en Palermo", HoraInicio: "16:00", HoraFin: "17:30" }],
  Mensaje: "El horario 15:00–17:00 se superpone con «Almuerzo en Palermo». ¿Querés agregar la actividad igual?",
};

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderModal(props = {}) {
  const onAceptada = jest.fn();
  const onClose = jest.fn();
  const utils = await render(
    <AcceptSuggestionModal
      visible
      tripId={3}
      sugerencia={SUGERENCIA}
      onAceptada={onAceptada}
      onClose={onClose}
      {...props}
    />
  );
  return { ...utils, onAceptada, onClose };
}

async function confirmarModal(utils) {
  await act(async () => {
    await fireEvent.press(utils.getByTestId("aceptar-sugerencia-confirmar"));
  });
}

describe("reglas de horario", () => {
  it("normaliza horas válidas y rechaza las inválidas", () => {
    expect(normalizarHora("9:30")).toBe("09:30");
    expect(normalizarHora("15:00:00")).toBe("15:00");
    expect(normalizarHora("24:00")).toBeNull();
    expect(normalizarHora("15:75")).toBeNull();
    expect(normalizarHora("abc")).toBeNull();
  });

  it("exige que la hora de fin sea posterior a la de inicio", () => {
    expect(validarHorarioSugerencia("15:00", "17:00")).toBeNull();
    expect(validarHorarioSugerencia("17:00", "15:00")).toMatch(/posterior/);
    expect(validarHorarioSugerencia("15:00", "15:00")).toMatch(/posterior/);
    expect(validarHorarioSugerencia("", "15:00")).toMatch(/HH:MM/);
  });

  it("arma la advertencia con las actividades superpuestas", () => {
    const texto = mensajeSuperposicion(SUPERPUESTA);
    expect(texto).toContain("se superpone con «Almuerzo en Palermo»");
    expect(texto).toContain("• Almuerzo en Palermo (16:00 – 17:30)");
  });
});

describe("AcceptSuggestionModal", () => {
  it("CP1: acepta la sugerencia con su horario original", async () => {
    acceptActivitySuggestion.mockResolvedValue(ACEPTADA);
    const utils = await renderModal();

    expect(utils.getByTestId("aceptar-sugerencia-inicio").props.value).toBe("15:00");
    expect(utils.getByTestId("aceptar-sugerencia-fin").props.value).toBe("17:00");
    await confirmarModal(utils);

    expect(acceptActivitySuggestion).toHaveBeenCalledWith(3, 7, {
      HoraInicio: "15:00",
      HoraFin: "17:00",
      ConfirmarSuperposicion: false,
    });
    expect(utils.onAceptada).toHaveBeenCalledWith(ACEPTADA);
  });

  it("CP2: permite modificar el horario antes de confirmar", async () => {
    acceptActivitySuggestion.mockResolvedValue(ACEPTADA);
    const utils = await renderModal();

    await fireEvent.changeText(utils.getByTestId("aceptar-sugerencia-inicio"), "16:30");
    await fireEvent.changeText(utils.getByTestId("aceptar-sugerencia-fin"), "18:00");
    await confirmarModal(utils);

    expect(acceptActivitySuggestion).toHaveBeenCalledWith(3, 7, {
      HoraInicio: "16:30",
      HoraFin: "18:00",
      ConfirmarSuperposicion: false,
    });
  });

  it("CP3: con hora de fin anterior a la de inicio no llama al backend", async () => {
    const utils = await renderModal();

    await fireEvent.changeText(utils.getByTestId("aceptar-sugerencia-inicio"), "18:00");
    await fireEvent.changeText(utils.getByTestId("aceptar-sugerencia-fin"), "16:00");
    await confirmarModal(utils);

    expect(acceptActivitySuggestion).not.toHaveBeenCalled();
    expect(utils.getByText("La hora de fin debe ser posterior a la hora de inicio.")).toBeTruthy();
    expect(utils.onAceptada).not.toHaveBeenCalled();
  });

  it("CP4: con superposición, al confirmar la advertencia crea la actividad", async () => {
    acceptActivitySuggestion.mockResolvedValueOnce(SUPERPUESTA).mockResolvedValueOnce(ACEPTADA);
    confirmar.mockResolvedValue(true);
    const utils = await renderModal();

    await confirmarModal(utils);

    expect(confirmar).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: "Horario superpuesto",
        mensaje: expect.stringContaining("Almuerzo en Palermo"),
      })
    );
    expect(acceptActivitySuggestion).toHaveBeenCalledTimes(2);
    expect(acceptActivitySuggestion.mock.calls[1][2]).toEqual({
      HoraInicio: "15:00",
      HoraFin: "17:00",
      ConfirmarSuperposicion: true,
    });
    expect(utils.onAceptada).toHaveBeenCalledWith(ACEPTADA);
  });

  it("CP5: con superposición, al cancelar la advertencia no se crea la actividad", async () => {
    acceptActivitySuggestion.mockResolvedValueOnce(SUPERPUESTA);
    confirmar.mockResolvedValue(false);
    const utils = await renderModal();

    await confirmarModal(utils);

    expect(acceptActivitySuggestion).toHaveBeenCalledTimes(1);
    expect(acceptActivitySuggestion.mock.calls[0][2].ConfirmarSuperposicion).toBe(false);
    expect(utils.onAceptada).not.toHaveBeenCalled();
  });

  it("CP6 a CP8: muestra el error del backend si la sugerencia ya no está pendiente", async () => {
    const error = new Error("Esta sugerencia ya fue aceptada y no puede volver a aceptarse.");
    error.status = 409;
    acceptActivitySuggestion.mockRejectedValue(error);
    const utils = await renderModal();

    await confirmarModal(utils);

    expect(utils.getByText("Esta sugerencia ya fue aceptada y no puede volver a aceptarse.")).toBeTruthy();
    expect(utils.onAceptada).not.toHaveBeenCalled();
  });

  it("cancelar cierra el modal sin aceptar", async () => {
    const utils = await renderModal();

    await fireEvent.press(utils.getByText("Cancelar"));

    expect(utils.onClose).toHaveBeenCalled();
    expect(acceptActivitySuggestion).not.toHaveBeenCalled();
  });
});

describe("SuggestionCompactCard", () => {
  it("muestra la opción de agregar al itinerario solo en sugerencias pendientes", async () => {
    const onAceptar = jest.fn();
    const pendiente = await render(
      <SuggestionCompactCard sugerencia={SUGERENCIA} expandida onAceptar={onAceptar} />
    );
    await fireEvent.press(pendiente.getByTestId("aceptar-sugerencia-7"));
    expect(onAceptar).toHaveBeenCalledWith(SUGERENCIA);

    const enVotacion = await render(
      <SuggestionCompactCard
        sugerencia={{ ...SUGERENCIA, Estado: "en_votacion" }}
        expandida
        onAceptar={onAceptar}
      />
    );
    expect(enVotacion.queryByTestId("aceptar-sugerencia-7")).toBeNull();
  });

  it("sin permisos de edición no ofrece aceptar", async () => {
    const utils = await render(<SuggestionCompactCard sugerencia={SUGERENCIA} expandida />);
    expect(utils.queryByTestId("aceptar-sugerencia-7")).toBeNull();
  });
});

describe("DaySuggestionsScreen", () => {
  const route = {
    params: {
      tripId: 3,
      tripTitle: "Buenos Aires",
      canPropose: true,
      dia: { dayId: 11, dayIndex: 2, fechaRaw: "2026-10-28", dayDateText: "Miércoles 28", actividades: [] },
    },
  };
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };

  it("CP1 y criterio 11: acepta, muestra la confirmación y deja de listar la sugerencia", async () => {
    getActivitySuggestions.mockResolvedValue([SUGERENCIA]);
    acceptActivitySuggestion.mockResolvedValue(ACEPTADA);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const utils = await render(<DaySuggestionsScreen navigation={navigation} route={route} />);

    await waitFor(() => expect(utils.getByText("Visita al Museo de Bellas Artes")).toBeTruthy());
    await fireEvent.press(utils.getByTestId("sugerencia-compacta-7"));
    await fireEvent.press(utils.getByTestId("aceptar-sugerencia-7"));
    await confirmarModal(utils);

    expect(alertSpy).toHaveBeenCalledWith("Actividad agregada", ACEPTADA.Mensaje);
    await waitFor(() => expect(utils.queryByTestId("sugerencia-compacta-7")).toBeNull());
    alertSpy.mockRestore();
  });

  it("sin permisos (viaje finalizado o no participante) no ofrece aceptar", async () => {
    getActivitySuggestions.mockResolvedValue([SUGERENCIA]);
    const utils = await render(
      <DaySuggestionsScreen
        navigation={navigation}
        route={{ params: { ...route.params, canPropose: false } }}
      />
    );

    await waitFor(() => expect(utils.getByText("Visita al Museo de Bellas Artes")).toBeTruthy());
    await fireEvent.press(utils.getByTestId("sugerencia-compacta-7"));
    expect(utils.queryByTestId("aceptar-sugerencia-7")).toBeNull();
  });
});
