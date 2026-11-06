/**
 * US 136 - Agendar traslados: presentación de los tramos, tarjeta e itinerario.
 * El formulario se prueba en AddTrasladoScreen.test.js.
 */
import { fireEvent, render } from "@testing-library/react-native";

import DayAgenda from "../components/trip/DayAgenda";
import DayTimeGrid from "../components/trip/DayTimeGrid";
import TrasladoCard, { AvisoTraslado } from "../components/trip/TrasladoCard";
import { buildAgenda, getActivityTimes } from "../utils/agenda";
import { calcularActividadesSolapadas } from "../utils/itinerarioOverlaps";
import {
  AVISO_NO_CORRESPONDE,
  AVISO_REVISAR_HORARIO,
  AVISO_SIN_FECHA,
  MEDIOS_TRASLADO,
  avisoDeTraslado,
  etiquetaHoras,
  nombreTraslado,
  paradasDelTramo,
  refDeTramo,
  subtextoTarjeta,
  subtituloDia,
  textoHorario,
  textoOculto,
  tituloFormulario,
  tituloTarjeta,
  tramosDelDia,
  tramosSinAgendar,
  validarTraslado,
} from "../utils/traslados";

const ida = {
  tipo: "ida",
  nombreLlegada: "Bariloche",
  fechaSalida: "2026-11-01",
  fechaLlegada: "2026-11-01",
  validez: "valido",
  estado: "pendiente",
  idDiaCronograma: 1,
};
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
  idDiaCronograma: 5,
};
const nocturno = { ...entre, fechaLlegada: "2026-11-06" };
const regreso = {
  tipo: "regreso",
  nombreOrigen: "Mendoza",
  fechaSalida: "2026-11-09",
  fechaLlegada: "2026-11-09",
  validez: "valido",
  estado: "pendiente",
  idDiaCronograma: 9,
};

describe("textos de los tramos", () => {
  it("usa la pregunta de cada tipo de tramo", () => {
    expect(tituloTarjeta(ida)).toBe("¿Cómo llegan a Bariloche?");
    expect(tituloTarjeta(entre)).toBe("¿Cómo viajan a Mendoza?");
    expect(tituloTarjeta(regreso)).toBe("¿Cómo vuelven?");
  });

  it("el subtexto de la tarjeta es corto y no repite la pregunta", () => {
    expect(subtextoTarjeta(entre)).toBe("Salen de Bariloche");
    expect(subtextoTarjeta(regreso)).toBe("Salen de Mendoza");
    expect(subtextoTarjeta(ida)).toBe("Es el viaje de llegada");
  });

  it("titula el formulario con el destino o como regreso", () => {
    expect(tituloFormulario(entre)).toBe("Traslado a Mendoza");
    expect(tituloFormulario(ida)).toBe("Traslado a Bariloche");
    expect(tituloFormulario(regreso)).toBe("Regreso");
  });

  it("arma las paradas del recorrido según el tipo de tramo", () => {
    expect(paradasDelTramo(entre)).toEqual({
      nochesEnViaje: 0,
      origen: { nombre: "Bariloche", fecha: "Salen el jue 5 nov" },
      llegada: { nombre: "Mendoza", fecha: "Llegan el jue 5 nov" },
    });
    expect(paradasDelTramo(nocturno).llegada.fecha).toBe("Llegan el vie 6 nov");
    expect(paradasDelTramo(nocturno).nochesEnViaje).toBe(1);
    expect(paradasDelTramo(ida).origen).toBeNull();
    expect(paradasDelTramo(ida).llegada.nombre).toBe("Bariloche");
    expect(paradasDelTramo(regreso).llegada).toBeNull();
    expect(paradasDelTramo(regreso).origen.nombre).toBe("Mendoza");
  });

  it("sin fecha lo informa en la caja", () => {
    const tramo = { ...entre, validez: "sin_fecha", fechaSalida: null, fechaLlegada: null };

    expect(paradasDelTramo(tramo).origen.fecha).toBe("Sin fecha hasta armar el recorrido");
    expect(paradasDelTramo(tramo).llegada.fecha).toBe("");
  });

  it("titula la caja según las horas que pide el tramo", () => {
    expect(etiquetaHoras(entre)).toBe("Salida y llegada");
    expect(etiquetaHoras(ida)).toBe("Llegada");
    expect(etiquetaHoras(regreso)).toBe("Salida");
  });

  it("nombra el tramo oculto", () => {
    expect(textoOculto(entre)).toBe("Traslado a Mendoza oculto");
    expect(textoOculto(ida)).toBe("Llegada a Bariloche oculta");
    expect(textoOculto(regreso)).toBe("Regreso oculto");
  });

  it("el subtítulo muestra el día y su número", () => {
    const dias = [{ fechaRaw: "2026-11-05", dayIndex: 4 }];

    expect(subtituloDia(entre, dias)).toBe("Jueves 5 nov · Día 4");
    expect(subtituloDia(entre, [])).toBe("Jueves 5 nov");
    expect(subtituloDia({ ...entre, fechaSalida: null, fechaLlegada: null }, dias)).toBe("");
  });

  it.each([
    ["plane", "Avión a Mendoza", "Avión de regreso"],
    ["bus", "Micro a Mendoza", "Micro de regreso"],
    ["ship", "Barco a Mendoza", "Barco de regreso"],
    ["person-walking", "Caminando a Mendoza", "Caminando de regreso"],
    ["route", "Traslado a Mendoza", "Traslado de regreso"],
  ])("el nombre de %s coincide con el del backend", (medio, aDestino, deRegreso) => {
    expect(nombreTraslado(medio, entre)).toBe(aDestino);
    expect(nombreTraslado(medio, regreso)).toBe(deRegreso);
  });

  it("ofrece los nueve medios de transporte con su ícono", () => {
    expect(MEDIOS_TRASLADO.map((m) => m.name)).toEqual([
      "plane",
      "bus",
      "car",
      "train",
      "ship",
      "motorcycle",
      "bicycle",
      "person-walking",
      "route",
    ]);
    expect(MEDIOS_TRASLADO.map((m) => m.label)).toEqual([
      "Avión",
      "Micro",
      "Auto",
      "Tren",
      "Barco o ferry",
      "Moto",
      "Bicicleta",
      "A pie",
      "Otro",
    ]);
  });
});

describe("horario del traslado", () => {
  it("CP3: mismo día muestra salida y llegada", () => {
    expect(textoHorario(entre, "11:40", "13:35")).toBe("11:40 → 13:35");
  });

  it("CP4: si llega otro día muestra la fecha de llegada", () => {
    expect(textoHorario(nocturno, "22:00", "08:00")).toBe("Sale 22:00 · llega el 6 nov 08:00");
  });

  it("CP2 y CP5: la ida muestra la llegada y el regreso, la salida", () => {
    expect(textoHorario(ida, "13:35", "13:35")).toBe("Llega 13:35");
    expect(textoHorario(regreso, "18:00", "18:00")).toBe("Sale 18:00");
  });
});

describe("avisos de un traslado agendado", () => {
  it("distingue los tres carteles", () => {
    expect(avisoDeTraslado({ ...entre, validez: "no_corresponde" })).toEqual({
      tono: "danger",
      mensaje: AVISO_NO_CORRESPONDE,
    });
    expect(avisoDeTraslado({ ...entre, validez: "sin_fecha" })).toEqual({
      tono: "danger",
      mensaje: AVISO_SIN_FECHA,
    });
    expect(avisoDeTraslado({ ...entre, revisarHorario: true })).toEqual({
      tono: "warning",
      mensaje: AVISO_REVISAR_HORARIO,
    });
    expect(avisoDeTraslado(entre)).toBeNull();
  });

  it("usa los textos acordados", () => {
    expect(AVISO_NO_CORRESPONDE).toBe("Este traslado ya no corresponde al recorrido");
    expect(AVISO_SIN_FECHA).toBe("Este traslado no tiene fecha porque el recorrido no está armado");
    expect(AVISO_REVISAR_HORARIO).toBe("Revisá el horario: la llegada quedó antes de la salida");
  });

  it("no dibuja nada si no hay aviso", async () => {
    const { toJSON } = await render(<AvisoTraslado traslado={entre} />);

    expect(toJSON()).toBeNull();
  });

  it("dibuja el cartel como alerta", async () => {
    const { getByText, getByRole } = await render(
      <AvisoTraslado traslado={{ ...entre, validez: "no_corresponde" }} />
    );

    expect(getByText(AVISO_NO_CORRESPONDE)).toBeTruthy();
    expect(getByRole("alert")).toBeTruthy();
  });
});

describe("tramos para mostrar", () => {
  const tramos = [
    ida,
    { ...entre, estado: "oculto" },
    { ...regreso, estado: "agendado", idActividad: 8 },
    { ...entre, idDestinoLlegada: 9, validez: "no_corresponde", estado: "agendado" },
  ];

  it("excluye los agendados y los no válidos", () => {
    expect(tramosSinAgendar(tramos)).toEqual([tramos[0], tramos[1]]);
  });

  it("filtra por día", () => {
    expect(tramosDelDia(tramos, 5)).toEqual([tramos[1]]);
    expect(tramosDelDia(tramos, 9)).toEqual([]);
    expect(tramosDelDia(undefined, 1)).toEqual([]);
  });

  it("arma la referencia del tramo", () => {
    expect(refDeTramo(entre)).toEqual({
      tipo: "entre_destinos",
      idDestinoOrigen: 4,
      idDestinoLlegada: 5,
    });
    expect(refDeTramo(ida)).toEqual({ tipo: "ida", idDestinoOrigen: null, idDestinoLlegada: null });
  });
});

describe("validarTraslado", () => {
  const datos = { medio: "plane", tramo: entre, horaSalida: "11:40", horaLlegada: "13:35" };

  it("acepta un traslado completo", () => {
    expect(validarTraslado(datos)).toBeNull();
  });

  it("CP15: exige el medio de transporte", () => {
    expect(validarTraslado({ ...datos, medio: null })).toBe("Elegí el medio de transporte.");
  });

  it("CP16: el mismo día la llegada debe ser posterior a la salida", () => {
    const mensaje = "La hora de llegada debe ser posterior a la de salida.";
    expect(validarTraslado({ ...datos, horaLlegada: "09:00" })).toBe(mensaje);
    expect(validarTraslado({ ...datos, horaLlegada: "11:40" })).toBe(mensaje);
  });

  it("si llega otro día la llegada puede ser menor", () => {
    expect(
      validarTraslado({ ...datos, tramo: nocturno, horaSalida: "22:00", horaLlegada: "08:00" })
    ).toBeNull();
  });

  it("sin fecha no compara las horas", () => {
    expect(
      validarTraslado({
        ...datos,
        tramo: { ...entre, validez: "sin_fecha", fechaSalida: null, fechaLlegada: null },
        horaSalida: "22:00",
        horaLlegada: "08:00",
      })
    ).toBeNull();
  });

  it("pide solo las horas del tipo de tramo", () => {
    expect(validarTraslado({ medio: "bus", tramo: ida, horaLlegada: "13:00" })).toBeNull();
    expect(validarTraslado({ medio: "bus", tramo: ida })).toBe("Ingresá la hora de llegada.");
    expect(validarTraslado({ medio: "bus", tramo: regreso, horaSalida: "13:00" })).toBeNull();
    expect(validarTraslado({ medio: "bus", tramo: regreso })).toBe("Ingresá la hora de salida.");
  });

  it("exige un tramo", () => {
    expect(validarTraslado({ ...datos, tramo: null })).toBe(
      "Elegí el tramo del recorrido para este traslado."
    );
  });
});

describe("TrasladoCard", () => {
  it("CP1: muestra la pregunta con Agendar y Ocultar", async () => {
    const onAgendar = jest.fn();
    const onOcultar = jest.fn();
    const { getByText } = await render(
      <TrasladoCard tramo={entre} onAgendar={onAgendar} onOcultar={onOcultar} />
    );

    expect(getByText("¿Cómo viajan a Mendoza?")).toBeTruthy();

    await fireEvent.press(getByText("Agendar"));
    await fireEvent.press(getByText("Ocultar"));

    expect(onAgendar).toHaveBeenCalledWith(entre);
    expect(onOcultar).toHaveBeenCalledWith(entre);
  });

  it("CP11: oculta queda como línea que permite mostrarla o agendarla", async () => {
    const onAgendar = jest.fn();
    const onMostrar = jest.fn();
    const tramo = { ...entre, estado: "oculto" };
    const { getByText, queryByText } = await render(
      <TrasladoCard tramo={tramo} onAgendar={onAgendar} onMostrar={onMostrar} />
    );

    expect(queryByText("¿Cómo viajan a Mendoza?")).toBeNull();
    expect(getByText("Traslado a Mendoza oculto")).toBeTruthy();

    await fireEvent.press(getByText("Mostrar"));
    await fireEvent.press(getByText("Agendar"));

    expect(onMostrar).toHaveBeenCalledWith(tramo);
    expect(onAgendar).toHaveBeenCalledWith(tramo);
  });
});

const actividadTraslado = {
  id: 7,
  title: "Micro a Salta",
  note: "Empresa Andesmar",
  icon: "bus",
  horaInicio: "22:00",
  horaFin: "08:00",
  time: "22:00 - 08:00",
  traslado: nocturno,
};

describe("itinerario", () => {
  it("un traslado que llega otro día ocupa hasta el final del día de salida", () => {
    expect(getActivityTimes(actividadTraslado).endMin).toBe(23 * 60 + 59);
    expect(getActivityTimes({ horaInicio: "22:00", horaFin: "08:00" }).endMin).toBeNull();
  });

  it("la ida y el regreso no tienen duración", () => {
    expect(
      getActivityTimes({ horaInicio: "13:00", horaFin: "13:00", traslado: ida }).endMin
    ).toBeNull();
  });

  it("detecta el solapamiento con un traslado nocturno", () => {
    const solapadas = calcularActividadesSolapadas([
      actividadTraslado,
      { id: 8, horaInicio: "22:30", horaFin: "23:00" },
    ]);

    expect([...solapadas].sort()).toEqual([7, 8]);
  });

  it("buildAgenda ordena el traslado por su salida", () => {
    const agenda = buildAgenda([
      actividadTraslado,
      { id: 8, title: "Cena", horaInicio: "20:00", horaFin: "21:00" },
    ]);

    expect(agenda.map((entrada) => entrada.item.id)).toEqual([8, 7]);
  });

  it("CP4 y CP7: DayAgenda lo destaca con su horario, fecha y notas", async () => {
    const { getByText, getByTestId, queryByText } = await render(
      <DayAgenda actividades={[actividadTraslado]} fecha="2026-11-05" canEdit />
    );

    expect(getByTestId("agenda-traslado-7")).toBeTruthy();
    expect(getByText("TRASLADO")).toBeTruthy();
    expect(getByText("Micro a Salta")).toBeTruthy();
    expect(getByText("Sale 22:00 · llega el 6 nov 08:00")).toBeTruthy();
    expect(getByText("Empresa Andesmar")).toBeTruthy();
    expect(queryByText(/Desde las/)).toBeNull();
  });

  it("se edita y se elimina como cualquier actividad", async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const { getByTestId } = await render(
      <DayAgenda
        actividades={[actividadTraslado]}
        fecha="2026-11-05"
        canEdit
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    await fireEvent.press(getByTestId("agenda-edit-7"));
    await fireEvent.press(getByTestId("agenda-delete-7"));

    expect(onEdit).toHaveBeenCalledWith(actividadTraslado);
    expect(onDelete).toHaveBeenCalledWith(actividadTraslado);
  });

  it("CP9: DayAgenda muestra el cartel del traslado no válido", async () => {
    const { getByText } = await render(
      <DayAgenda
        actividades={[
          { ...actividadTraslado, traslado: { ...entre, validez: "no_corresponde" } },
        ]}
        fecha="2026-11-05"
        canEdit
      />
    );

    expect(getByText(AVISO_NO_CORRESPONDE)).toBeTruthy();
  });

  it("DayAgenda muestra el aviso de revisar el horario", async () => {
    const { getByText } = await render(
      <DayAgenda
        actividades={[{ ...actividadTraslado, traslado: { ...entre, revisarHorario: true } }]}
        fecha="2026-11-05"
        canEdit
      />
    );

    expect(getByText(AVISO_REVISAR_HORARIO)).toBeTruthy();
  });

  it("el calendario del celular lo destaca y muestra el cartel", async () => {
    const onEdit = jest.fn();
    const invalido = { ...actividadTraslado, traslado: { ...nocturno, validez: "no_corresponde" } };
    const { getByTestId, getByText } = await render(
      <DayTimeGrid actividades={[invalido]} fecha="2026-11-05" canEdit onEdit={onEdit} />
    );

    expect(getByTestId("timegrid-traslado-7")).toBeTruthy();
    expect(getByText("Sale 22:00 · llega el 6 nov 08:00")).toBeTruthy();
    expect(getByText(AVISO_NO_CORRESPONDE)).toBeTruthy();

    await fireEvent.press(getByTestId("timegrid-block-7"));

    expect(onEdit).toHaveBeenCalledWith(invalido);
  });
});
