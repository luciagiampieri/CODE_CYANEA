import { fireEvent, render } from "@testing-library/react-native";

import DayTimeGrid from "../components/trip/DayTimeGrid";
import {
  confirmacionDeMovimiento,
  diaDestinoDeArrastre,
  diasParaMover,
  etiquetaArrastre,
  etiquetaDia,
} from "../utils/moverActividad";

const HOY = "2026-12-10";

const DIAS = [
  { dayId: 1, dayIndex: 1, fechaRaw: "2026-12-09" },
  { dayId: 2, dayIndex: 2, fechaRaw: "2026-12-10" },
  { dayId: 3, dayIndex: 3, fechaRaw: "2026-12-11" },
  { dayId: 4, dayIndex: 4, fechaRaw: "2026-12-12" },
  { dayId: "fallback-day-5", dayIndex: 5, fechaRaw: "2026-12-13" },
];

function actividad(extra = {}) {
  return {
    id: 7,
    title: "Visita al museo",
    horaInicio: "10:00",
    horaFin: "12:00",
    time: "10:00 - 12:00",
    icon: "camera",
    ...extra,
  };
}

describe("US 138 - utilidades para mover actividades", () => {
  it("arma la etiqueta corta del día", () => {
    expect(etiquetaDia("2026-12-11")).toBe("Vie 11");
  });

  it("ofrece el día actual y los días futuros del viaje, sin pasados ni días sin guardar", () => {
    expect(diasParaMover(DIAS, 2, HOY).map((d) => d.dayId)).toEqual([2, 3, 4]);
  });

  it("conserva el día actual aunque ya haya pasado", () => {
    expect(diasParaMover(DIAS, 1, HOY).map((d) => d.dayId)).toEqual([1, 2, 3, 4]);
  });

  it("calcula el día de destino según cuánto se deslizó", () => {
    expect(diaDestinoDeArrastre(DIAS, 2, 1, HOY).dayId).toBe(3);
    expect(diaDestinoDeArrastre(DIAS, 2, 2, HOY).dayId).toBe(4);
  });

  it("no devuelve destino si no se movió, si se sale del viaje o si el día ya pasó", () => {
    expect(diaDestinoDeArrastre(DIAS, 2, 0, HOY)).toBeNull();
    expect(diaDestinoDeArrastre(DIAS, 4, 3, HOY)).toBeNull();
    expect(diaDestinoDeArrastre(DIAS, 2, -1, HOY)).toBeNull();
    expect(diaDestinoDeArrastre(DIAS, 4, 1, HOY)).toBeNull();
  });

  it("indica a qué día se va a mover o que el día no está disponible", () => {
    expect(etiquetaArrastre(DIAS, 2, 1, HOY)).toEqual({ texto: "Mover al Vie 11", valido: true });
    expect(etiquetaArrastre(DIAS, 2, -1, HOY).valido).toBe(false);
    expect(etiquetaArrastre(DIAS, 2, 0, HOY).valido).toBe(false);
  });

  it("al confirmar reenvía la superposición y la advertencia de horario", () => {
    expect(
      confirmacionDeMovimiento({ advertencia: { tipo: "cerrado", resumen: "Cerrado ese día" } })
    ).toEqual({
      confirmarSuperposicion: true,
      advertenciaHorario: { tipo: "cerrado", resumen: "Cerrado ese día" },
    });
    expect(confirmacionDeMovimiento({ superpuestas: ["Almuerzo"] })).toEqual({
      confirmarSuperposicion: true,
    });
  });
});

describe("US 138 - arrastrar en el calendario", () => {
  function arrastre() {
    return {
      onInicio: jest.fn(),
      onCambio: jest.fn(),
      onSoltar: jest.fn(),
      etiqueta: jest.fn(() => ({ texto: "Mover al Vie 11", valido: true })),
    };
  }

  it("mantener apretado y soltar sin mover sigue eliminando la actividad", async () => {
    const onDelete = jest.fn();
    const handlers = arrastre();
    const item = actividad();
    const { getByTestId } = await render(
      <DayTimeGrid actividades={[item]} canEdit onDelete={onDelete} arrastre={handlers} />
    );

    await fireEvent(getByTestId("timegrid-block-7"), "longPress");
    await fireEvent(getByTestId("timegrid-block-7"), "pressOut");

    expect(handlers.onInicio).toHaveBeenCalled();
    expect(handlers.onSoltar).toHaveBeenCalledWith(item, 0);
    expect(onDelete).toHaveBeenCalledWith(item);
  });

  it("mientras se mantiene apretado muestra a qué día se va a mover", async () => {
    const handlers = arrastre();
    const { getByTestId } = await render(
      <DayTimeGrid actividades={[actividad()]} canEdit onDelete={jest.fn()} arrastre={handlers} />
    );

    await fireEvent(getByTestId("timegrid-block-7"), "longPress");

    expect(getByTestId("timegrid-destino-7")).toBeTruthy();
  });

  it("los traslados no se arrastran: mantener apretado elimina como antes", async () => {
    const onDelete = jest.fn();
    const handlers = arrastre();
    const item = actividad({ traslado: { tipo: "ida" } });
    const { getByTestId } = await render(
      <DayTimeGrid actividades={[item]} canEdit onDelete={onDelete} arrastre={handlers} />
    );

    await fireEvent(getByTestId("timegrid-block-7"), "longPress");

    expect(handlers.onInicio).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith(item);
  });

  it("sin arrastre configurado se comporta como antes", async () => {
    const onDelete = jest.fn();
    const item = actividad();
    const { getByTestId, queryByText } = await render(
      <DayTimeGrid actividades={[item]} canEdit onDelete={onDelete} />
    );

    await fireEvent(getByTestId("timegrid-block-7"), "longPress");

    expect(onDelete).toHaveBeenCalledWith(item);
    expect(queryByText(/deslizalo hacia un costado/)).toBeNull();
  });
});