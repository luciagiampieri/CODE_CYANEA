/**
 * US 136 - Formulario para agendar y editar traslados.
 */
import { Alert, Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddTrasladoScreen from "../screens/AddTrasladoScreen";
import { simularDialogos } from "./helpers/dialogosSimulados";

// Guarda las props del Modal para poder simular el botón atrás de Android.
let mockHoja = null;
jest.mock("../components/ui/AppModal", () => {
  const { Modal } = jest.requireActual("react-native");
  const React = jest.requireActual("react");
  return {
    __esModule: true,
    default: (props) => {
      mockHoja = props;
      return React.createElement(Modal, props);
    },
  };
});

const entre = {
  tipo: "entre_destinos",
  idDestinoOrigen: 4,
  idDestinoLlegada: 5,
  nombreOrigen: "Bariloche",
  nombreLlegada: "Mendoza",
  fechaSalida: "2026-11-05",
  fechaLlegada: "2026-11-05",
  validez: "valido",
  estado: "pendiente",
};
const ida = {
  tipo: "ida",
  nombreLlegada: "Bariloche",
  fechaSalida: "2026-11-01",
  fechaLlegada: "2026-11-01",
  validez: "valido",
  estado: "pendiente",
};
const regreso = {
  tipo: "regreso",
  nombreOrigen: "Mendoza",
  fechaSalida: "2026-11-09",
  fechaLlegada: "2026-11-09",
  validez: "valido",
  estado: "pendiente",
};

async function elegirHora(utils, etiqueta, valor) {
  await act(async () => {
    fireEvent(utils.getByLabelText(etiqueta), "change", { target: { value: valor } });
  });
}

async function renderizar(props = {}) {
  const onSubmit = props.onSubmit ?? jest.fn().mockResolvedValue({ guardado: true });
  const onClose = jest.fn();
  const utils = await render(
    <AddTrasladoScreen visible tramo={entre} onSubmit={onSubmit} onClose={onClose} {...props} />
  );
  return { ...utils, onSubmit, onClose };
}

async function elegirMedio(utils, etiqueta) {
  await fireEvent.press(utils.getByTestId("traslado-medio"));
  await fireEvent.press(utils.getByText(etiqueta));
}

async function completar(utils) {
  await elegirMedio(utils, "Avión");
  await elegirHora(utils, "Hora de salida", "11:40");
  await elegirHora(utils, "Hora de llegada", "13:35");
}

async function guardar(utils) {
  await act(async () => {
    fireEvent.press(utils.getByText("Agendar traslado"));
  });
}

let confirmaciones;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "web";
  ({ confirmaciones } = simularDialogos({ confirma: true }));
});

describe("US 136 - AddTrasladoScreen", () => {
  it("muestra el recorrido y las fechas sin poder cambiarlas", async () => {
    const utils = await renderizar();

    expect(utils.getByText("Traslado a Mendoza")).toBeTruthy();
    expect(utils.getByText("Bariloche")).toBeTruthy();
    expect(utils.getByText("Salen el jue 5 nov")).toBeTruthy();
    expect(utils.getByText("Mendoza")).toBeTruthy();
    expect(utils.getByText("Llegan el jue 5 nov")).toBeTruthy();
    expect(utils.getByText("Salida y llegada")).toBeTruthy();
    expect(utils.getByText(/Los días salen del recorrido del viaje\./)).toBeTruthy();
    // CP18: no hay ningún campo para editar las fechas.
    expect(utils.queryByLabelText(/fecha/i)).toBeNull();
  });

  it("con noches en viaje muestra la etiqueta entre las dos filas", async () => {
    const utils = await renderizar({ tramo: { ...entre, fechaLlegada: "2026-11-06" } });

    expect(utils.getByText("Llegan el vie 6 nov")).toBeTruthy();
    expect(utils.getByText("1 noche en viaje")).toBeTruthy();
  });

  it("con dos noches la etiqueta va en plural", async () => {
    const utils = await renderizar({ tramo: { ...entre, fechaLlegada: "2026-11-07" } });

    expect(utils.getByText("2 noches en viaje")).toBeTruthy();
  });

  it("el mismo día no muestra la etiqueta de noches", async () => {
    const utils = await renderizar();

    expect(utils.queryByTestId("traslado-noches-en-viaje")).toBeNull();
  });

  it("la ida muestra solo el destino", async () => {
    const utils = await renderizar({ tramo: ida });

    expect(utils.getByText("Llegada")).toBeTruthy();
    expect(utils.getByText("Bariloche")).toBeTruthy();
    expect(utils.queryByText(/^Salen el/)).toBeNull();
  });

  it("el regreso muestra solo el origen", async () => {
    const utils = await renderizar({ tramo: regreso });

    expect(utils.getByText("Salida")).toBeTruthy();
    expect(utils.getByText("Mendoza")).toBeTruthy();
    expect(utils.queryByText(/^Llegan el/)).toBeNull();
  });

  it("el título se actualiza al elegir el medio", async () => {
    const utils = await renderizar();

    await elegirMedio(utils, "Micro");

    expect(utils.getByText("Micro a Mendoza")).toBeTruthy();
    expect(utils.queryByText("Traslado a Mendoza")).toBeNull();
  });

  it("el regreso se nombra con el medio elegido", async () => {
    const utils = await renderizar({ tramo: regreso });

    await elegirMedio(utils, "Barco o ferry");

    expect(utils.getByText("Barco de regreso")).toBeTruthy();
  });

  it("muestra el día con su número debajo del título", async () => {
    const utils = await renderizar({ dias: [{ fechaRaw: "2026-11-05", dayIndex: 4 }] });

    expect(utils.getByText("Jueves 5 nov · Día 4")).toBeTruthy();
  });

  it("el selector de medio se abre en el panel inferior y marca el elegido", async () => {
    const utils = await renderizar();

    expect(utils.getByText("Seleccionar medio")).toBeTruthy();

    await fireEvent.press(utils.getByTestId("traslado-medio"));

    expect(utils.getByText("Seleccionar medio de transporte")).toBeTruthy();
    ["Avión", "Micro", "Auto", "Tren", "Barco o ferry", "Moto", "Bicicleta", "A pie", "Otro"].forEach(
      (etiqueta) => expect(utils.getByText(etiqueta)).toBeTruthy()
    );

    await fireEvent.press(utils.getByText("Tren"));

    expect(utils.queryByText("Seleccionar medio de transporte")).toBeNull();
    expect(utils.getByLabelText("Medio de transporte: Tren")).toBeTruthy();
  });

  it("corregir un dato borra el error", async () => {
    const utils = await renderizar();

    await guardar(utils);
    expect(utils.getByText("Elegí el medio de transporte.")).toBeTruthy();

    await elegirMedio(utils, "Auto");

    expect(utils.queryByText("Elegí el medio de transporte.")).toBeNull();
  });

  it("la cruz cierra una sola vez", async () => {
    const utils = await renderizar();

    await fireEvent.press(utils.getByTestId("traslado-cerrar"));
    await fireEvent.press(utils.getByTestId("traslado-cerrar"));

    expect(utils.onClose).toHaveBeenCalledTimes(1);
  });

  it("el botón atrás de Android cierra la hoja", async () => {
    const utils = await renderizar();

    await act(async () => {
      mockHoja.onRequestClose();
    });

    expect(utils.onClose).toHaveBeenCalledTimes(1);
  });

  it("no envía dos veces con un doble toque", async () => {
    let resolver;
    const onSubmit = jest.fn(() => new Promise((resolve) => (resolver = resolve)));
    const utils = await renderizar({ onSubmit });

    await completar(utils);
    const boton = utils.getByText("Agendar traslado");
    await act(async () => {
      fireEvent.press(boton);
      fireEvent.press(boton);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolver({ guardado: true });
    });
  });

  it("al cerrarse sigue montado y conserva el contenido mientras baja la hoja", async () => {
    const utils = await renderizar();

    await utils.rerender(
      <AddTrasladoScreen
        visible={false}
        tramo={null}
        actividad={null}
        onSubmit={utils.onSubmit}
        onClose={utils.onClose}
      />
    );

    expect(mockHoja.visible).toBe(false);
    expect(mockHoja.children).toBeTruthy();
  });

  it("CP3: agenda con salida y llegada", async () => {
    const utils = await renderizar();

    await completar(utils);
    await guardar(utils);

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
    expect(utils.onSubmit).toHaveBeenCalledWith({
      tramo: { tipo: "entre_destinos", idDestinoOrigen: 4, idDestinoLlegada: 5 },
      medio: "plane",
      horaSalida: "11:40:00",
      horaLlegada: "13:35:00",
      notas: null,
      confirmarSuperposicion: false,
    });
    await waitFor(() => expect(utils.onClose).toHaveBeenCalled());
  });

  it("CP2: en la ida solo pide la hora de llegada", async () => {
    const utils = await renderizar({ tramo: ida });

    expect(utils.queryByLabelText("Hora de salida")).toBeNull();
    await elegirMedio(utils, "Micro");
    await elegirHora(utils, "Hora de llegada", "10:00");
    await guardar(utils);

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
    expect(utils.onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ horaSalida: null, horaLlegada: "10:00:00", medio: "bus" })
    );
  });

  it("CP5: el regreso se titula Regreso y solo pide la hora de salida", async () => {
    const utils = await renderizar({ tramo: regreso });

    expect(utils.getByText("Regreso")).toBeTruthy();
    expect(utils.queryByLabelText("Hora de llegada")).toBeNull();
    await elegirMedio(utils, "Auto");
    await elegirHora(utils, "Hora de salida", "18:00");
    await guardar(utils);

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
    expect(utils.onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ horaSalida: "18:00:00", horaLlegada: null })
    );
  });

  it("CP7: envía las notas", async () => {
    const utils = await renderizar();

    await completar(utils);
    await fireEvent.changeText(utils.getByLabelText("Notas"), "  Vuelo AR1234 ");
    await guardar(utils);

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
    expect(utils.onSubmit.mock.calls[0][0].notas).toBe("Vuelo AR1234");
  });

  it("CP15: no guarda sin medio de transporte", async () => {
    const utils = await renderizar();

    await elegirHora(utils, "Hora de salida", "11:40");
    await elegirHora(utils, "Hora de llegada", "13:35");
    await guardar(utils);

    expect(utils.getByText("Elegí el medio de transporte.")).toBeTruthy();
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });

  it("CP16: no guarda con llegada anterior a la salida el mismo día", async () => {
    const utils = await renderizar();

    await elegirMedio(utils, "Avión");
    await elegirHora(utils, "Hora de salida", "13:35");
    await elegirHora(utils, "Hora de llegada", "11:40");
    await guardar(utils);

    expect(utils.getByText("La hora de llegada debe ser posterior a la de salida.")).toBeTruthy();
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });

  it("CP4: si llega otro día acepta una hora de llegada menor", async () => {
    const utils = await renderizar({ tramo: { ...entre, fechaLlegada: "2026-11-06" } });

    await elegirMedio(utils, "Micro");
    await elegirHora(utils, "Hora de salida", "22:00");
    await elegirHora(utils, "Hora de llegada", "08:00");
    await guardar(utils);

    await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
  });

  it("muestra el error del servidor y no cierra", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("Ese tramo ya tiene un traslado"));
    const utils = await renderizar({ onSubmit });

    await completar(utils);
    await guardar(utils);

    await waitFor(() => expect(utils.getByText("Ese tramo ya tiene un traslado")).toBeTruthy());
    expect(utils.onClose).not.toHaveBeenCalled();
  });

  describe("recorrido", () => {
    it("el administrador puede ir a cambiarlo", async () => {
      const onCambiarRecorrido = jest.fn();
      const utils = await renderizar({
        esAdmin: true,
        puedeCambiarRecorrido: true,
        nombreAdministrador: "Ana Gómez",
        onCambiarRecorrido,
      });

      expect(utils.getByText("Editar recorrido")).toBeTruthy();
      await fireEvent.press(utils.getByTestId("traslado-cambiar-recorrido"));

      expect(onCambiarRecorrido).toHaveBeenCalled();
      expect(utils.queryByTestId("traslado-solo-admin")).toBeNull();
    });

    it("CP13: el resto de los participantes ve el nombre del administrador", async () => {
      const utils = await renderizar({ nombreAdministrador: "Ana Gómez" });

      expect(
        utils.getByText(
          "Los días salen del recorrido del viaje. Solo Ana Gómez (administrador/a) puede cambiarlos."
        )
      ).toBeTruthy();
      expect(utils.queryByTestId("traslado-cambiar-recorrido")).toBeNull();
    });
  });

  describe("superposición", () => {
    const aviso = {
      guardado: false,
      requiereConfirmacion: true,
      mensaje: "Hay 1 actividad mientras viajan: Museo (12:00).",
    };

    it("CP10: avisa y permite guardar igual", async () => {
      const onSubmit = jest
        .fn()
        .mockResolvedValueOnce(aviso)
        .mockResolvedValueOnce({ guardado: true });
      const utils = await renderizar({ onSubmit });

      await completar(utils);
      await guardar(utils);

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(confirmaciones).toHaveBeenCalledWith(`Atención\n\n${aviso.mensaje}`);
      expect(Alert.alert.mock.calls[0][2].map((boton) => boton.text)).toEqual([
        "Revisar",
        "Guardar igual",
      ]);
      expect(onSubmit.mock.calls[1][0].confirmarSuperposicion).toBe(true);
      await waitFor(() => expect(utils.onClose).toHaveBeenCalled());
    });

    it("Revisar deja el formulario abierto sin guardar", async () => {
      simularDialogos({ confirma: false });
      const onSubmit = jest.fn().mockResolvedValue(aviso);
      const utils = await renderizar({ onSubmit });

      await completar(utils);
      await guardar(utils);

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(utils.onClose).not.toHaveBeenCalled();
    });
  });

  describe("edición", () => {
    const actividad = {
      id: 7,
      icon: "bus",
      note: "Andesmar",
      horaInicio: "11:40",
      horaFin: "13:35",
      traslado: entre,
    };

    it("precarga el traslado y no reenvía el tramo", async () => {
      const utils = await renderizar({ tramo: null, actividad });

      await act(async () => {
        fireEvent.press(utils.getByText("Guardar cambios"));
      });

      await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
      expect(utils.onSubmit).toHaveBeenCalledWith({
        medio: "bus",
        horaSalida: "11:40:00",
        horaLlegada: "13:35:00",
        notas: "Andesmar",
        confirmarSuperposicion: false,
      });
    });

    it("ofrece eliminar el traslado solo al editar", async () => {
      const onEliminar = jest.fn();
      const utils = await renderizar({ tramo: null, actividad, onEliminar });

      await fireEvent.press(utils.getByText("Eliminar traslado"));

      expect(onEliminar).toHaveBeenCalled();
    });

    it("al agendar no ofrece eliminar", async () => {
      const utils = await renderizar({ onEliminar: jest.fn() });

      expect(utils.queryByText("Eliminar traslado")).toBeNull();
    });

    it("CP9: un no válido exige elegir un tramo libre", async () => {
      const noValido = {
        ...actividad,
        traslado: { ...entre, validez: "no_corresponde", fechaLlegada: null },
      };
      const libre = { ...entre, idDestinoLlegada: 9, nombreLlegada: "Salta" };
      const utils = await renderizar({ tramo: null, actividad: noValido, tramosLibres: [libre] });

      expect(utils.getByText("Este traslado ya no corresponde al recorrido")).toBeTruthy();

      await act(async () => {
        fireEvent.press(utils.getByText("Guardar cambios"));
      });
      expect(utils.getByText("Elegí el tramo del recorrido para este traslado.")).toBeTruthy();
      expect(utils.onSubmit).not.toHaveBeenCalled();

      await fireEvent.press(utils.getByTestId("traslado-tramo"));
      await fireEvent.press(utils.getByText("Bariloche → Salta"));
      await act(async () => {
        fireEvent.press(utils.getByText("Guardar cambios"));
      });

      await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
      expect(utils.onSubmit.mock.calls[0][0].tramo).toEqual({
        tipo: "entre_destinos",
        idDestinoOrigen: 4,
        idDestinoLlegada: 9,
      });
    });

    it("sin tramos libres informa que solo se puede eliminar", async () => {
      const noValido = { ...actividad, traslado: { ...entre, validez: "no_corresponde" } };
      const utils = await renderizar({ tramo: null, actividad: noValido, tramosLibres: [] });

      expect(utils.getByTestId("traslado-sin-tramos")).toBeTruthy();
    });

    it("sin fecha muestra su cartel y permite guardar horas sin compararlas", async () => {
      const sinFecha = {
        ...actividad,
        horaInicio: "22:00",
        horaFin: "08:00",
        traslado: { ...entre, validez: "sin_fecha", fechaSalida: null, fechaLlegada: null },
      };
      const utils = await renderizar({ tramo: null, actividad: sinFecha });

      expect(
        utils.getByText("Este traslado no tiene fecha porque el recorrido no está armado")
      ).toBeTruthy();

      await act(async () => {
        fireEvent.press(utils.getByText("Guardar cambios"));
      });

      await waitFor(() => expect(utils.onSubmit).toHaveBeenCalled());
    });
  });
});
