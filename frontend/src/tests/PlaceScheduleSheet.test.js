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
describe("PlaceScheduleSheet - horarios y recomendación de entradas (igual que al registrar una actividad)", () => {
  const { Alert, Linking } = require("react-native");

  const recomendacion = {
    tipo: "ENTRADAS_ANTICIPADAS",
    mensaje: "Te recomendamos comprar las entradas antes de tu visita para asegurarte el ingreso.",
    nombreLugar: "Museo de Bellas Artes",
    urlSitioOficial: "https://www.bellasartes.gob.ar/",
    urlAccion: "https://www.bellasartes.gob.ar/entradas",
    verificada: true,
  };

  const advertencia = {
    advertencia: true,
    tipo: "fuera_de_horario",
    mensaje: "",
    horariosApertura: "11:00 - 19:00",
    resumen: "Fuera del horario del lugar (11:00 a 19:00)",
    nombreLugar: "Museo de Bellas Artes",
    recomendacionEntradas: recomendacion,
    googlePlaceIdEntradas: "ChIJbellas",
  };

  beforeEach(() => {
    Platform.OS = "android";
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  afterEach(() => {
    Alert.alert.mockRestore();
    Linking.openURL.mockRestore();
    Platform.OS = "web";
  });

  async function renderYAgregar(onSubmit, onClose = jest.fn()) {
    Platform.OS = "web";
    const utils = await render(
      <PlaceScheduleSheet days={days} place={place} visible onClose={onClose} onSubmit={onSubmit} />
    );
    await elegirHoras(utils, "09:00", "10:00");
    Platform.OS = "android";
    await agregar(utils);
    return { utils, onClose };
  }

  it("muestra la recomendación con la confirmación separada y el enlace oficial", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ IdActividad: 5, RecomendacionEntradas: recomendacion });
    const { onClose } = await renderYAgregar(onSubmit);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [titulo, mensaje, botones, opciones] = Alert.alert.mock.calls[0];
    expect(titulo).toBe("Comprá tus entradas antes");
    expect(opciones.confirmacion).toBe("Agregada al itinerario");
    expect(Alert.alert.mock.calls[0][3].etiqueta.texto).toBe("Museo de Bellas Artes");
    expect(mensaje).toContain("Su sitio oficial recomienda sacarlas online");
    // Sin el viaje no se puede crear la tarea: solo "Entendido" y la compra.
    expect(botones.map((b) => b.text)).toEqual(["Comprar entradas", "Entendido"]);
    // El formulario ya se cerró: la actividad está agregada.
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      await botones[0].onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith("https://www.bellasartes.gob.ar/entradas");
  });

  it("sin recomendación se cierra sin diálogos", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ IdActividad: 5, RecomendacionEntradas: null });
    const { onClose } = await renderYAgregar(onSubmit);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("fuera de horario: advierte, y al confirmar reenvía con la advertencia y el lugar analizado", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce(advertencia)
      .mockResolvedValueOnce({ IdActividad: 5, RecomendacionEntradas: null });
    const { onClose } = await renderYAgregar(onSubmit);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [titulo, mensaje, botones] = Alert.alert.mock.calls[0];
    expect(titulo).toBe("Revisá el horario de tu actividad");
    expect(mensaje).toContain("Horario del establecimiento: 11:00 a 19:00");
    expect(botones.map((b) => b.text)).toEqual(["Modificar horario", "Registrar igual"]);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      await botones[1].onPress();
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        advertenciaHorario: { tipo: "fuera_de_horario", resumen: "Fuera del horario del lugar (11:00 a 19:00)" },
        googlePlaceIdEntradas: "ChIJbellas",
      })
    );
    expect(onSubmit.mock.calls[1][1]).toEqual(expect.objectContaining({ ignorarAdvertencia: true }));
    // La recomendación llegó con la advertencia: se muestra después de guardar.
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(Alert.alert.mock.calls[1][0]).toBe("Comprá tus entradas antes");
  });

  it("'Modificar horario' deja el formulario abierto sin reenviar", async () => {
    const onSubmit = jest.fn().mockResolvedValue(advertencia);
    const { onClose } = await renderYAgregar(onSubmit);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(Alert.alert.mock.calls[0][2][0].onPress).toBeUndefined();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
