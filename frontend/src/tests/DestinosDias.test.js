/**
 * US 138 - Destino de cada día: clasificación, chips y separación por destino.
 */
import { colorDeDestino, colorSuaveDeDestino, colors } from "../theme/tokens";
import {
  TIPOS_DIA,
  accesosDeDestino,
  agregarDestinosADias,
  chipDelDia,
  chipDelDiaCalendario,
  clasificarDias,
  coloresDelDia,
  duracionTraslado,
  encabezadosPorDia,
  separarActividadesDia,
  textoMarcaLlegada,
} from "../utils/destinosDias";

const destino = (name, noches, nochesEnViaje = 0) => ({ name, noches, nochesEnViaje });

// 1 al 4 Bariloche, 4 al 7 Mendoza, 7 viajan a Salta, llegan el 8, 8 al 10 Salta.
const RECORRIDO = [destino("Bariloche", 3), destino("Mendoza", 3, 1), destino("Salta", 2)];
const INICIO = "2026-11-01";
const FIN = "2026-11-10";

const clasificacion = clasificarDias(RECORRIDO, INICIO, FIN);
const dia = (numero, mapa = clasificacion) => mapa.get(`2026-11-${String(numero).padStart(2, "0")}`);

function diasDelViaje(fin = 10) {
  return Array.from({ length: fin }, (_, i) => ({
    dayId: i + 1,
    dayIndex: i + 1,
    fechaRaw: `2026-11-${String(i + 1).padStart(2, "0")}`,
    actividades: [],
  }));
}

describe("clasificarDias", () => {
  it("CP14: un viaje de un destino no muestra destinos", () => {
    expect(clasificarDias([destino("Mendoza", null)], INICIO, FIN)).toBeNull();
  });

  it("CP15: con menos noches que destinos no muestra destinos", () => {
    const destinos = [destino("A", 1), destino("B", 1), destino("C", 1)];

    expect(clasificarDias(destinos, "2026-11-01", "2026-11-02")).toBeNull();
  });

  it("sin recorrido armado no muestra destinos", () => {
    expect(clasificarDias([destino("A", null), destino("B", null)], INICIO, FIN)).toBeNull();
  });

  it("CP3: cuenta las noches de la estadía", () => {
    expect(dia(2)).toEqual(
      expect.objectContaining({ tipo: TIPOS_DIA.EN_DESTINO, noche: 2, totalNoches: 3 })
    );
  });

  it("el día de traslado sin noches en viaje pertenece a los dos destinos", () => {
    expect(dia(4).tipo).toBe(TIPOS_DIA.TRASLADO);
    expect(dia(4).indices).toEqual([0, 1]);
  });

  it("después del traslado sigue la noche 2 del destino de llegada", () => {
    expect(dia(5)).toEqual(expect.objectContaining({ destino: "Mendoza", noche: 2 }));
  });

  it("CP7: con una noche en viaje hay día de salida y de llegada", () => {
    expect(dia(7).tipo).toBe(TIPOS_DIA.SALIDA_EN_VIAJE);
    expect(dia(7).indices).toEqual([1]);
    expect(dia(8).tipo).toBe(TIPOS_DIA.LLEGADA);
    expect(dia(8).indices).toEqual([2]);
  });

  it("CP8: con dos noches en viaje el día intermedio es completo en viaje", () => {
    const destinos = [destino("Bariloche", 2, 2), destino("Mendoza", 3)];
    const mapa = clasificarDias(destinos, INICIO, "2026-11-08");

    expect(dia(3, mapa).tipo).toBe(TIPOS_DIA.SALIDA_EN_VIAJE);
    expect(dia(4, mapa).tipo).toBe(TIPOS_DIA.EN_VIAJE);
    expect(dia(5, mapa).tipo).toBe(TIPOS_DIA.LLEGADA);
  });

  it("cubre todos los días del viaje", () => {
    expect(clasificacion.size).toBe(10);
  });
});

describe("chip del día", () => {
  it("los días normales no llevan chip", () => {
    expect(chipDelDia(dia(2))).toBeNull();
    expect(chipDelDia(undefined)).toBeNull();
  });

  it("el día de traslado muestra los dos destinos con su color", () => {
    expect(chipDelDia(dia(4))).toEqual({
      ruta: [
        { nombre: "Bariloche", color: colorDeDestino(0) },
        { nombre: "Mendoza", color: colorDeDestino(1) },
      ],
    });
  });

  it("indica la salida y la llegada con noches en viaje", () => {
    expect(chipDelDia(dia(7))).toEqual({ icono: "moon", texto: "Hoy viajan a Salta" });
    expect(chipDelDia(dia(8))).toEqual({ icono: "location-dot", texto: "Llegada a Salta" });
  });

  it("CP8: indica el día completo en viaje", () => {
    const destinos = [destino("Bariloche", 2, 2), destino("Mendoza", 3)];
    const mapa = clasificarDias(destinos, INICIO, "2026-11-08");

    expect(chipDelDia(dia(4, mapa)).texto).toBe("En viaje · Bariloche → Mendoza");
  });

  it("CP4: indica el último día", () => {
    expect(chipDelDia(dia(10))).toEqual({ icono: "flag", texto: "Último día" });
  });

  it("CP10: con noches sin asignar distingue cada día", () => {
    const destinos = [destino("Bariloche", 2), destino("Salta", 2)];
    const mapa = clasificarDias(destinos, INICIO, "2026-11-07");

    expect(chipDelDia(dia(5, mapa))).toEqual({ icono: "flag", texto: "Último día en Salta" });
    expect(chipDelDia(dia(6, mapa)).texto).toBe("Sin destino asignado");
    expect(chipDelDia(dia(7, mapa)).texto).toBe("Sin destino asignado · Último día");
  });

  it("en el calendario el día normal lleva su destino y su color", () => {
    expect(chipDelDiaCalendario(dia(2))).toEqual({
      icono: "location-dot",
      texto: "En Bariloche",
      color: colorDeDestino(0),
      fondo: colorSuaveDeDestino(0),
    });
  });

  it("en el calendario los días especiales usan el mismo chip", () => {
    expect(chipDelDiaCalendario(dia(7))).toEqual(chipDelDia(dia(7)));
  });

  it("sin destinos no hay chip en el calendario", () => {
    expect(chipDelDiaCalendario(undefined)).toBeNull();
  });
});

describe("colores", () => {
  it("CP1: cada día usa el color de su destino", () => {
    expect(coloresDelDia(dia(2))).toEqual([colorDeDestino(0)]);
    expect(coloresDelDia(dia(5))).toEqual([colorDeDestino(1)]);
    expect(coloresDelDia(dia(9))).toEqual([colorDeDestino(2)]);
  });

  it("el día de traslado lleva los dos colores", () => {
    expect(coloresDelDia(dia(4))).toEqual([colorDeDestino(0), colorDeDestino(1)]);
  });

  it("los días en viaje y sin destino van en gris", () => {
    const destinos = [destino("Bariloche", 2, 2), destino("Mendoza", 1)];
    const mapa = clasificarDias(destinos, INICIO, "2026-11-08");

    expect(coloresDelDia(dia(4, mapa))).toEqual([colors.borderStrong]);
    expect(coloresDelDia(dia(8, mapa))).toEqual([colors.borderStrong]);
  });

  it("sin información no hay colores", () => {
    expect(coloresDelDia(null)).toEqual([]);
  });
});

describe("accesos y encabezados", () => {
  const accesos = accesosDeDestino(RECORRIDO, INICIO);

  it("cada acceso lleva nombre, fechas y primer día", () => {
    expect(accesos.map((a) => [a.nombre, a.rango, a.primeraFecha])).toEqual([
      ["Bariloche", "1 → 4 nov", "2026-11-01"],
      ["Mendoza", "4 → 7 nov", "2026-11-04"],
      ["Salta", "8 → 10 nov", "2026-11-08"],
    ]);
  });

  it("suma la foto de cada destino", () => {
    const conFoto = accesosDeDestino(RECORRIDO, INICIO, { Mendoza: "foto.jpg" });

    expect(conFoto[1].foto).toBe("foto.jpg");
    expect(conFoto[0].foto).toBeUndefined();
  });

  it("CP11: el destino de llegada empieza después del día de traslado", () => {
    const { dias } = agregarDestinosADias(diasDelViaje(), RECORRIDO, INICIO, FIN);

    const encabezados = encabezadosPorDia(dias, accesos);

    expect(Object.keys(encabezados)).toEqual(["1", "5", "8"]);
    expect(encabezados[5]).toEqual(
      expect.objectContaining({ indice: 1, nombre: "Mendoza", detalle: "4 → 7 nov · 3 noches" })
    );
  });

  it("los días sin destino tienen encabezado propio", () => {
    const destinos = [destino("Bariloche", 2), destino("Salta", 2)];
    const { dias, encabezados } = agregarDestinosADias(
      diasDelViaje(7),
      destinos,
      INICIO,
      "2026-11-07"
    );

    expect(dias).toHaveLength(7);
    expect(encabezados[6]).toEqual(
      expect.objectContaining({ indice: null, nombre: "Sin destino asignado · 2 noches" })
    );
  });

  it("CP14: sin destinos deja los días como estaban", () => {
    const originales = diasDelViaje();

    const resultado = agregarDestinosADias(originales, [destino("Mendoza", null)], INICIO, FIN);

    expect(resultado.dias).toBe(originales);
    expect(resultado.accesos).toBeNull();
    expect(resultado.encabezados).toEqual({});
  });
});

describe("separarActividadesDia", () => {
  const traslado = {
    id: 9,
    horaInicio: "11:40",
    horaFin: "13:35",
    traslado: {
      tipo: "entre_destinos",
      validez: "valido",
      fechaSalida: "2026-11-04",
      fechaLlegada: "2026-11-04",
    },
  };
  const antes = { id: 1, horaInicio: "09:00", horaFin: "10:00" };
  const durante = { id: 2, horaInicio: "12:00", horaFin: "14:00" };
  const despues = { id: 3, horaInicio: "20:00", horaFin: "21:00" };
  const actividades = [antes, traslado, durante, despues];

  it("CP5: separa por la hora de salida", () => {
    const separacion = separarActividadesDia(actividades, dia(4), { Mendoza: "foto.jpg" });

    expect(separacion.antes).toEqual([antes]);
    expect(separacion.despues).toEqual([durante, despues]);
    expect(separacion.traslado).toBe(traslado);
    expect(separacion.salida.nombre).toBe("Bariloche");
    expect(separacion.llegada.foto).toBe("foto.jpg");
  });

  it("marca lo que empieza durante el viaje", () => {
    expect(separarActividadesDia(actividades, dia(4)).superpuestas).toEqual([durante]);
  });

  it("CP6: sin el traslado agendado no separa", () => {
    expect(separarActividadesDia([antes, despues], dia(4))).toBeNull();
  });

  it("un traslado que ya no corresponde no separa", () => {
    const noValido = { ...traslado, traslado: { ...traslado.traslado, validez: "no_corresponde" } };

    expect(separarActividadesDia([antes, noValido], dia(4))).toBeNull();
  });

  it("un día que no es de traslado no separa", () => {
    expect(separarActividadesDia(actividades, dia(2))).toBeNull();
    expect(separarActividadesDia(actividades, undefined)).toBeNull();
  });
});

describe("agregarDestinosADias", () => {
  const trasladoMismoDia = {
    id: 9,
    horaInicio: "10:30",
    horaFin: "16:30",
    traslado: {
      tipo: "entre_destinos",
      validez: "valido",
      fechaSalida: "2026-11-04",
      fechaLlegada: "2026-11-04",
    },
  };
  const trasladoNocturno = {
    id: 7,
    horaInicio: "20:00",
    horaFin: "07:00",
    traslado: {
      tipo: "entre_destinos",
      validez: "valido",
      fechaSalida: "2026-11-07",
      fechaLlegada: "2026-11-08",
    },
  };

  function conActividades(actividadesPorDia, opciones) {
    const dias = diasDelViaje().map((item) => ({
      ...item,
      actividades: actividadesPorDia[item.dayId] ?? [],
    }));
    return agregarDestinosADias(dias, RECORRIDO, INICIO, FIN, opciones).dias;
  }

  it("arma la tarjeta del viaje de un día de traslado", () => {
    const { viaje } = conActividades({ 4: [trasladoMismoDia] })[3];

    expect(viaje.otroDia).toBe(false);
    expect(viaje.duracion).toBe("6 h");
    expect(viaje.salida).toEqual(
      expect.objectContaining({ nombre: "Bariloche", hora: "10:30", etiqueta: "Sale" })
    );
    expect(viaje.llegada).toEqual(
      expect.objectContaining({ nombre: "Mendoza", hora: "16:30", etiqueta: "Llega" })
    );
  });

  it("arma la tarjeta del viaje de un día de salida con noches en viaje", () => {
    const { viaje } = conActividades({ 7: [trasladoNocturno] })[6];

    expect(viaje.otroDia).toBe(true);
    expect(viaje.duracion).toBe("11 h");
    expect(viaje.salida.etiqueta).toBe("Sale hoy");
    expect(viaje.llegada.etiqueta).toBe("Llega el dom 8");
    expect(viaje.llegada.color).toBe(colorDeDestino(2));
  });

  it("un día normal no tiene tarjeta del viaje", () => {
    expect(conActividades({})[1].viaje).toBeNull();
  });

  it("el día de traslado agendado tiene una franja por destino", () => {
    const { franjas } = conActividades({ 4: [trasladoMismoDia] })[3];

    expect(franjas.map((f) => [f.clave, f.desde, f.hasta, f.etiqueta])).toEqual([
      ["salida", null, 10 * 60 + 30, "En Bariloche"],
      ["llegada", 16 * 60 + 30, null, "En Mendoza"],
    ]);
  });

  it("con horas invertidas no hay franjas", () => {
    const invertido = {
      ...trasladoMismoDia,
      horaInicio: "22:00",
      horaFin: "08:00",
      traslado: { ...trasladoMismoDia.traslado, revisarHorario: true },
    };

    expect(conActividades({ 4: [invertido] })[3].franjas).toBeNull();
  });

  it("el día de llegada tiene el tinte y la etiqueta con la hora", () => {
    const tramos = [
      {
        tipo: "entre_destinos",
        idActividad: 7,
        fechaLlegada: "2026-11-08",
        validez: "valido",
      },
    ];

    const dias = conActividades({ 7: [trasladoNocturno] }, { tramos });

    expect(dias[7].franjas[0].etiqueta).toBe("Llegan a Salta · 07:00");
    expect(dias[7].marcaLlegada).toBe("Llegás a Salta · 07:00");
  });

  it("el día de llegada sin traslado agendado lleva el tinte sin etiqueta", () => {
    const { franjas, marcaLlegada } = conActividades({})[7];

    expect(franjas[0].etiqueta).toBeNull();
    expect(marcaLlegada).toBeNull();
  });

  it("un día normal no tiene franjas", () => {
    expect(conActividades({})[1].franjas).toBeNull();
  });
});

describe("duracionTraslado", () => {
  const item = (horaInicio, horaFin, fechaSalida, fechaLlegada) => ({
    horaInicio,
    horaFin,
    traslado: { fechaSalida, fechaLlegada },
  });

  it("calcula horas y minutos el mismo día", () => {
    expect(duracionTraslado(item("11:40", "13:35", "2026-11-04", "2026-11-04"))).toBe("1 h 55 min");
  });

  it("cuenta las noches en viaje", () => {
    expect(duracionTraslado(item("22:00", "08:00", "2026-11-04", "2026-11-05"))).toBe("10 h");
  });

  it("con las horas invertidas no hay duración", () => {
    expect(duracionTraslado(item("22:00", "08:00", "2026-11-04", "2026-11-04"))).toBe("");
  });
});

describe("textoMarcaLlegada", () => {
  const tramo = {
    tipo: "entre_destinos",
    idActividad: 7,
    fechaLlegada: "2026-11-08",
    validez: "valido",
  };
  const dias = [{ actividades: [{ id: 7, horaFin: "08:00" }] }];

  it("CP7: indica la hora de llegada", () => {
    expect(textoMarcaLlegada(dia(8), "2026-11-08", [tramo], dias)).toBe("Llegás a Salta · 08:00");
  });

  it("sin traslado agendado no hay marca", () => {
    const pendiente = { ...tramo, idActividad: null };

    expect(textoMarcaLlegada(dia(8), "2026-11-08", [pendiente], dias)).toBeNull();
  });

  it("solo aplica al día de llegada", () => {
    expect(textoMarcaLlegada(dia(7), "2026-11-07", [tramo], dias)).toBeNull();
  });
});
