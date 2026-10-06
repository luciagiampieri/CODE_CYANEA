import { Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import PlaceScheduleSheet from "../components/map/PlaceScheduleSheet";

const days = [{ IdDiaCronograma: 7, IndiceDia: 1, Fecha: "2026-12-01" }];
const place = { id: 3, name: "Museo de Bellas Artes", address: "Av. Siempre Viva 123" };

// En web las horas se eligen con el <input type="time"> del navegador.
async function elegirHoras(utils, inicio, fin) {
  await act(async () => {
    fireEvent(utils.getByLabelText("Hora de inicio"), "change", { target: { value: inicio } });
  });
  await act(async () => {
    fireEvent(utils.getByLabelText("Hora de fin"), "change", { target: { value: fin } });
  });
}

async function agregar(utils) {
  await act(async () => {
    const botones = utils.getAllByText("Agregar al itinerario");
    fireEvent.press(botones[botones.length - 1]);
  });
}

describe("PlaceScheduleSheet - formato de horas", () => {
  beforeEach(() => {
    Platform.OS = "web";
  });

  it("manda las horas como HH:MM (sin agregar segundos)", async () => {
    const onSubmit = jest.fn().mockResolvedValue();
    const utils = await render(
      <PlaceScheduleSheet days={days} place={place} visible onClose={jest.fn()} onSubmit={onSubmit} />
    );

    await elegirHoras(utils, "10:00", "12:30");
    await agregar(utils);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ dayId: 7, horaInicio: "10:00", horaFin: "12:30" })
    );
  });

  it("si el selector devuelve la hora con segundos, la normaliza a HH:MM", async () => {
    const onSubmit = jest.fn().mockResolvedValue();
    const utils = await render(
      <PlaceScheduleSheet days={days} place={place} visible onClose={jest.fn()} onSubmit={onSubmit} />
    );

    await elegirHoras(utils, "10:00:00", "12:30:00");
    await agregar(utils);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ horaInicio: "10:00", horaFin: "12:30" })
    );
  });
});