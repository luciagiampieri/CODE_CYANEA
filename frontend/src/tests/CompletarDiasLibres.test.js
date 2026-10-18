// US 92: completar días libres del itinerario mediante IA. Los casos de prueba
// de la US se mapean como CP1 a CP8 (CP2 a CP4 se validan en la detección del backend).
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import CompleteFreeDaysScreen from "../screens/CompleteFreeDaysScreen";
import { completeFreeItinerarySlots, getFreeItinerarySlots } from "../services/api";
import {
  agruparPorDia,
  avisoLimiteSeleccion,
  claveFranja,
  fechaLegible,
  payloadCompletar,
  textoFranja,
} from "../utils/diasLibres";
import { confirmar } from "../utils/dialogs";

jest.mock("../services/api", () => ({
  completeFreeItinerarySlots: jest.fn(),
  getFreeItinerarySlots: jest.fn(),
  getActivitySuggestionPhotoSource: jest.fn(),
}));

jest.mock("../utils/dialogs", () => ({
  avisar: jest.fn(),
  confirmar: jest.fn(),
}));

const DIA_LIBRE = {
  IdDiaCronograma: 11,
  Fecha: "2026-10-19",
  IndiceDia: 2,
  HoraInicio: "09:00",
  HoraFin: "22:00",
  DiaCompleto: true,
};
const FRANJA_TARDE = {
  IdDiaCronograma: 12,
  Fecha: "2026-10-20",
  IndiceDia: 3,
  HoraInicio: "13:00",
  HoraFin: "17:00",
  DiaCompleto: false,
};
const FRANJA_NOCHE = {
  IdDiaCronograma: 12,
  Fecha: "2026-10-20",
  IndiceDia: 3,
  HoraInicio: "18:30",
  HoraFin: "22:00",
  DiaCompleto: false,
};

function respuestaFranjas(overrides = {}) {
  return {
    Franjas: [DIA_LIBRE, FRANJA_TARDE, FRANJA_NOCHE],
    ItinerarioCompleto: false,
    Mensaje: null,
    SolicitudesRestantes: 5,
    LimiteDiario: 10,
    MaxSugerenciasPorFranja: 3,
    ...overrides,
  };
}

function sugerencia(id, idDia, nombre) {
  return {
    IdSugerenciaActividad: id,
    IdViaje: 3,
    IdDiaCronograma: idDia,
    Estado: "pendiente",
    Nombre: nombre,
    HoraInicio: "13:00",
    HoraFin: "15:00",
    LugarNombre: `Lugar de ${nombre}`,
    TieneFoto: false,
    CostoEstimadoARS: 0,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderPantalla(props = {}) {
  const onClose = jest.fn();
  const onGenerado = jest.fn();
  const utils = await render(
    <CompleteFreeDaysScreen
      visible
      tripId={3}
      tripTitle="Buenos Aires"
      onClose={onClose}
      onGenerado={onGenerado}
      {...props}
    />
  );
  return { ...utils, onClose, onGenerado };
}

async function presionar(elemento) {
  await act(async () => {
    await fireEvent.press(elemento);
  });
}

describe("helpers", () => {
  it("agrupa franjas por día respetando el orden", () => {
    const grupos = agruparPorDia([DIA_LIBRE, FRANJA_TARDE, FRANJA_NOCHE]);
    expect(grupos.map((g) => g.IdDiaCronograma)).toEqual([11, 12]);
    expect(grupos[1].items).toHaveLength(2);
  });

  it("describe días libres y franjas con su duración", () => {
    expect(textoFranja(DIA_LIBRE)).toBe("Día libre · 09:00 – 22:00");
    expect(textoFranja(FRANJA_TARDE)).toBe("13:00 – 17:00 · 4 h libres");
    expect(textoFranja(FRANJA_NOCHE)).toBe("18:30 – 22:00 · 3 h 30 min libres");
  });

  it("formatea la fecha sin depender de la zona horaria", () => {
    expect(fechaLegible("2026-10-19")).toBe("Lunes 19 de octubre");
  });

  it("avisa cuando la selección supera las solicitudes disponibles", () => {
    expect(avisoLimiteSeleccion(2, 5)).toBeNull();
    expect(avisoLimiteSeleccion(3, 3)).toBeNull();
    expect(avisoLimiteSeleccion(3, 2)).toMatch(/Seleccionaste 3 franjas, pero hoy quedan 2 solicitudes/);
    expect(avisoLimiteSeleccion(2, 1)).toMatch(/queda 1 solicitud/);
    expect(avisoLimiteSeleccion(1, 0)).toMatch(/ya usó todas las solicitudes/);
  });

  it("arma el payload solo con los datos de cada franja", () => {
    expect(payloadCompletar([FRANJA_TARDE], { continuarSinPreferencias: true })).toEqual({
      ContinuarSinPreferencias: true,
      Franjas: [{ IdDiaCronograma: 12, HoraInicio: "13:00", HoraFin: "17:00" }],
    });
  });
});

describe("CompleteFreeDaysScreen", () => {
  it("CP1: lista los días y franjas libres detectados, agrupados por día", async () => {
    getFreeItinerarySlots.mockResolvedValue(respuestaFranjas());
    const utils = await renderPantalla();

    await waitFor(() => expect(utils.getByText("Día 2 · Lunes 19 de octubre")).toBeTruthy());
    expect(getFreeItinerarySlots).toHaveBeenCalledWith(3);
    expect(utils.getByText("Día 3 · Martes 20 de octubre")).toBeTruthy();
    expect(utils.getByText("Día libre · 09:00 – 22:00")).toBeTruthy();
    expect(utils.getByText("13:00 – 17:00 · 4 h libres")).toBeTruthy();
    expect(utils.getByText("18:30 – 22:00 · 3 h 30 min libres")).toBeTruthy();
    // Sin selección no se puede generar.
    expect(utils.getByTestId("generar-sugerencias-dias-libres").props.accessibilityState?.disabled).toBe(true);
  });

  it("CP5: informa que el itinerario está completo si no hay franjas libres", async () => {
    getFreeItinerarySlots.mockResolvedValue(
      respuestaFranjas({
        Franjas: [],
        ItinerarioCompleto: true,
        Mensaje: "Tu itinerario se encuentra completo: no hay días ni franjas libres.",
      })
    );
    const utils = await renderPantalla();

    await waitFor(() => expect(utils.getByTestId("itinerario-completo")).toBeTruthy());
    expect(utils.getByText("Tu itinerario se encuentra completo: no hay días ni franjas libres.")).toBeTruthy();
    expect(utils.queryByTestId("generar-sugerencias-dias-libres")).toBeNull();
  });

  it("CP6: completa dos franjas y muestra las sugerencias agrupadas por día", async () => {
    getFreeItinerarySlots.mockResolvedValue(respuestaFranjas());
    completeFreeItinerarySlots.mockResolvedValue({
      Resultados: [
        {
          IdDiaCronograma: 11,
          Fecha: "2026-10-19",
          HoraInicio: "09:00",
          HoraFin: "22:00",
          Sugerencias: [sugerencia(1, 11, "Paseo por San Telmo"), sugerencia(2, 11, "Feria de Mataderos")],
          Mensaje: null,
          CodigoError: null,
        },
        {
          IdDiaCronograma: 12,
          Fecha: "2026-10-20",
          HoraInicio: "13:00",
          HoraFin: "17:00",
          Sugerencias: [sugerencia(3, 12, "Museo Evita")],
          Mensaje: null,
          CodigoError: null,
        },
      ],
      SolicitudesRestantes: 3,
      LimiteDiario: 10,
    });
    const utils = await renderPantalla();
    await waitFor(() => expect(utils.getByText("Día libre · 09:00 – 22:00")).toBeTruthy());

    await presionar(utils.getByTestId(`franja-libre-${claveFranja(DIA_LIBRE)}`));
    await presionar(utils.getByTestId(`franja-libre-${claveFranja(FRANJA_TARDE)}`));
    expect(utils.getByText(/2 franjas seleccionadas/)).toBeTruthy();
    await presionar(utils.getByTestId("generar-sugerencias-dias-libres"));

    expect(completeFreeItinerarySlots).toHaveBeenCalledWith(3, {
      ContinuarSinPreferencias: false,
      Franjas: [
        { IdDiaCronograma: 11, HoraInicio: "09:00", HoraFin: "22:00" },
        { IdDiaCronograma: 12, HoraInicio: "13:00", HoraFin: "17:00" },
      ],
    });
    await waitFor(() => expect(utils.getByTestId("resultado-dia-11")).toBeTruthy());
    const diaLunes = utils.getByTestId("resultado-dia-11");
    const diaMartes = utils.getByTestId("resultado-dia-12");
    expect(utils.getByText("Lunes 19 de octubre")).toBeTruthy();
    expect(utils.getByText("Martes 20 de octubre")).toBeTruthy();
    expect(diaLunes).toHaveTextContent(/Paseo por San Telmo/);
    expect(diaLunes).toHaveTextContent(/Feria de Mataderos/);
    expect(diaMartes).toHaveTextContent(/Museo Evita/);
    expect(utils.getByText(/3 sugerencias pendientes/)).toBeTruthy();
    expect(utils.getAllByText("Pendiente")).toHaveLength(3);
    expect(utils.onGenerado).toHaveBeenCalled();
  });

  it("CP7: con más franjas que solicitudes disponibles no permite generar", async () => {
    getFreeItinerarySlots.mockResolvedValue(respuestaFranjas({ SolicitudesRestantes: 1 }));
    const utils = await renderPantalla();
    await waitFor(() => expect(utils.getByText("Día libre · 09:00 – 22:00")).toBeTruthy());

    await presionar(utils.getByTestId(`franja-libre-${claveFranja(DIA_LIBRE)}`));
    await presionar(utils.getByTestId(`franja-libre-${claveFranja(FRANJA_TARDE)}`));

    expect(utils.getByTestId("aviso-limite-franjas")).toHaveTextContent(
      /Seleccionaste 2 franjas, pero hoy queda 1 solicitud/
    );
    const boton = utils.getByTestId("generar-sugerencias-dias-libres");
    expect(boton.props.accessibilityState?.disabled).toBe(true);
    await presionar(boton);
    expect(completeFreeItinerarySlots).not.toHaveBeenCalled();
  });

  it("CP7: si el backend rechaza por el límite diario, muestra el error", async () => {
    getFreeItinerarySlots.mockResolvedValue(respuestaFranjas());
    const error = new Error("Seleccionaste 1 franjas, pero hoy solo quedan 0 solicitudes disponibles.");
    error.code = "SUGGESTION_LIMIT_REACHED";
    completeFreeItinerarySlots.mockRejectedValue(error);
    const utils = await renderPantalla();
    await waitFor(() => expect(utils.getByText("Día libre · 09:00 – 22:00")).toBeTruthy());

    await presionar(utils.getByTestId(`franja-libre-${claveFranja(DIA_LIBRE)}`));
    await presionar(utils.getByTestId("generar-sugerencias-dias-libres"));

    await waitFor(() =>
      expect(utils.getByTestId("completar-dias-libres-error")).toHaveTextContent(/solo quedan 0 solicitudes/)
    );
  });

  it("muestra el error de una franja sin cancelar las demás", async () => {
    getFreeItinerarySlots.mockResolvedValue(respuestaFranjas());
    completeFreeItinerarySlots.mockResolvedValue({
      Resultados: [
        {
          IdDiaCronograma: 12,
          Fecha: "2026-10-20",
          HoraInicio: "13:00",
          HoraFin: "17:00",
          Sugerencias: [],
          Mensaje: "La franja ya está ocupada por otras actividades.",
          CodigoError: "SLOT_FULL",
        },
        {
          IdDiaCronograma: 11,
          Fecha: "2026-10-19",
          HoraInicio: "09:00",
          HoraFin: "22:00",
          Sugerencias: [sugerencia(1, 11, "Paseo por San Telmo")],
          Mensaje: null,
          CodigoError: null,
        },
      ],
      SolicitudesRestantes: 4,
      LimiteDiario: 10,
    });
    const utils = await renderPantalla();
    await waitFor(() => expect(utils.getByText("Día libre · 09:00 – 22:00")).toBeTruthy());

    await presionar(utils.getByTestId(`franja-libre-${claveFranja(FRANJA_TARDE)}`));
    await presionar(utils.getByTestId(`franja-libre-${claveFranja(DIA_LIBRE)}`));
    await presionar(utils.getByTestId("generar-sugerencias-dias-libres"));

    await waitFor(() => expect(utils.getByText("La franja ya está ocupada por otras actividades.")).toBeTruthy());
    expect(utils.getByText("Paseo por San Telmo")).toBeTruthy();
  });

  it("sin preferencias del grupo pide confirmación y reintenta con criterios generales", async () => {
    getFreeItinerarySlots.mockResolvedValue(respuestaFranjas());
    const sinPreferencias = new Error("Ningún participante configuró sus preferencias de planificación.");
    sinPreferencias.code = "NO_PREFERENCES";
    completeFreeItinerarySlots
      .mockRejectedValueOnce(sinPreferencias)
      .mockResolvedValueOnce({ Resultados: [], SolicitudesRestantes: 4, LimiteDiario: 10 });
    confirmar.mockResolvedValue(true);
    const utils = await renderPantalla();
    await waitFor(() => expect(utils.getByText("Día libre · 09:00 – 22:00")).toBeTruthy());

    await presionar(utils.getByTestId(`franja-libre-${claveFranja(DIA_LIBRE)}`));
    await presionar(utils.getByTestId("generar-sugerencias-dias-libres"));

    await waitFor(() => expect(completeFreeItinerarySlots).toHaveBeenCalledTimes(2));
    expect(confirmar).toHaveBeenCalled();
    expect(completeFreeItinerarySlots.mock.calls[1][1].ContinuarSinPreferencias).toBe(true);
  });

  it("CP8: en un viaje finalizado muestra el error del backend", async () => {
    const error = new Error("El viaje ya finalizó: las sugerencias de actividades no se puede modificar.");
    error.code = "TRIP_FINISHED";
    getFreeItinerarySlots.mockRejectedValue(error);
    const utils = await renderPantalla();

    await waitFor(() =>
      expect(
        utils.getByText("El viaje ya finalizó: las sugerencias de actividades no se puede modificar.")
      ).toBeTruthy()
    );
    expect(utils.queryByTestId("generar-sugerencias-dias-libres")).toBeNull();
  });
});
