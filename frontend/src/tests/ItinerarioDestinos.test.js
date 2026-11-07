/**
 * US 138 - Destinos en las vistas del itinerario y ajuste visual de DayAgenda.
 */
import { StyleSheet } from "react-native";
import { fireEvent, render, within } from "@testing-library/react-native";

import AccesosDestino from "../components/trip/AccesosDestino";
import ChipDia from "../components/trip/ChipDia";
import DayAgenda from "../components/trip/DayAgenda";
import DayRouteSection from "../components/trip/DayRouteSection";
import DayTimeGrid from "../components/trip/DayTimeGrid";
import EncabezadoDestino, { MarcaLlegada } from "../components/trip/EncabezadoDestino";
import ItinerarioCalendarView from "../components/trip/ItinerarioCalendarView";
import TrasladoCard from "../components/trip/TrasladoCard";
import { agregarDestinosADias, separarActividadesDia } from "../utils/destinosDias";

jest.mock("../hooks/useResponsive", () => ({
  __esModule: true,
  default: () => ({ width: 400 }),
}));

const destino = (name, noches, nochesEnViaje = 0) => ({ name, noches, nochesEnViaje });
const RECORRIDO = [destino("Bariloche", 3), destino("Mendoza", 3, 1), destino("Salta", 2)];

function dias() {
  return Array.from({ length: 10 }, (_, i) => ({
    dayId: i + 1,
    dayIndex: i + 1,
    dayDateText: `Día ${i + 1}`,
    fechaRaw: `2030-11-${String(i + 1).padStart(2, "0")}`,
    actividades: [],
  }));
}

function itinerario(diasBase = dias()) {
  return agregarDestinosADias(diasBase, RECORRIDO, "2030-11-01", "2030-11-10");
}

const traslado = {
  id: 9,
  title: "Avión a Mendoza",
  icon: "plane",
  horaInicio: "11:40",
  horaFin: "13:35",
  traslado: {
    tipo: "entre_destinos",
    validez: "valido",
    fechaSalida: "2030-11-04",
    fechaLlegada: "2030-11-04",
  },
};
const desayuno = { id: 1, title: "Desayuno", horaInicio: "09:00", horaFin: "10:00" };
const cena = { id: 3, title: "Cena", horaInicio: "20:00", horaFin: "21:00" };

function diaDeTraslado(actividades) {
  const base = dias();
  base[3] = { ...base[3], actividades };
  return itinerario(base).dias[3];
}

const nocturno = {
  id: 8,
  title: "Micro a Salta",
  icon: "bus",
  horaInicio: "20:00",
  horaFin: "07:00",
  traslado: {
    tipo: "entre_destinos",
    validez: "valido",
    fechaSalida: "2030-11-07",
    fechaLlegada: "2030-11-08",
  },
};
const tramoNocturno = {
  tipo: "entre_destinos",
  idActividad: 8,
  fechaLlegada: "2030-11-08",
  validez: "valido",
};

function conNocturno() {
  const base = dias();
  base[6] = { ...base[6], actividades: [desayuno, nocturno] };
  return agregarDestinosADias(base, RECORRIDO, "2030-11-01", "2030-11-10", {
    tramos: [tramoNocturno],
  }).dias;
}

const diaDeSalida = () => conNocturno()[6];
const diaDeLlegada = () => conNocturno()[7];

describe("calendario", () => {
  it("CP1: cada día lleva un punto de su color y dos en el día de traslado", async () => {
    const { dias: conDestino, accesos } = itinerario();

    const utils = await render(<ItinerarioCalendarView dias={conDestino} accesos={accesos} />);

    expect(utils.getByTestId("dia-puntos-2").children).toHaveLength(1);
    expect(utils.getByTestId("dia-puntos-4").children).toHaveLength(2);
    expect(utils.queryByTestId("tira-franja-1")).toBeNull();
  });

  it("los tramos resaltan el destino del día y atenúan los demás", async () => {
    const { dias: conDestino, accesos } = itinerario();
    const utils = await render(<ItinerarioCalendarView dias={conDestino} accesos={accesos} />);

    const opacidad = (id) => StyleSheet.flatten(utils.getByTestId(id).props.style).opacity;

    expect(opacidad("tramo-destino-0")).toBe(1);
    expect(opacidad("tramo-destino-1")).toBe(0.3);
    expect(opacidad("tramo-destino-2")).toBe(0.3);
  });

  it("el ancho de cada tramo es proporcional a sus noches", async () => {
    const { dias: conDestino, accesos } = itinerario();
    const utils = await render(<ItinerarioCalendarView dias={conDestino} accesos={accesos} />);

    const flex = (id) => StyleSheet.flatten(utils.getByTestId(id).props.style).flex;

    expect([flex("tramo-destino-0"), flex("tramo-destino-2")]).toEqual([3, 2]);
  });

  it("CP2: el tramo de Mendoza lleva al primer día en Mendoza y resalta los dos", async () => {
    const { dias: conDestino, accesos } = itinerario();
    const utils = await render(<ItinerarioCalendarView dias={conDestino} accesos={accesos} />);

    await fireEvent.press(utils.getByTestId("tramo-destino-1"));

    const opacidad = (id) => StyleSheet.flatten(utils.getByTestId(id).props.style).opacity;
    expect(within(utils.getByTestId("chip-dia")).getByText("Mendoza")).toBeTruthy();
    expect(opacidad("tramo-destino-0")).toBe(1);
    expect(opacidad("tramo-destino-1")).toBe(1);
  });

  it("el encabezado del día lleva fecha, resumen y chip del destino", async () => {
    const { dias: conDestino, accesos } = itinerario();

    const utils = await render(<ItinerarioCalendarView dias={conDestino} accesos={accesos} />);

    expect(utils.getByText("Viernes 1 de noviembre")).toBeTruthy();
    expect(utils.getByText(/^Día 1 · Sin actividades/)).toBeTruthy();
    expect(utils.getByText("En Bariloche")).toBeTruthy();
  });

  it("se pasa de día tocando la tira", async () => {
    const { dias: conDestino, accesos } = itinerario();
    const utils = await render(<ItinerarioCalendarView dias={conDestino} accesos={accesos} />);

    await fireEvent.press(utils.getByLabelText("Día 7, 0 actividades"));

    expect(utils.getByText("Hoy viajan a Salta")).toBeTruthy();
  });

  it("CP14: sin destinos no hay tramos, chips ni puntos de color", async () => {
    const utils = await render(<ItinerarioCalendarView dias={dias()} />);

    expect(utils.getByTestId("recorrido-calendario")).toBeTruthy();
    expect(utils.queryByTestId("recorrido-tramos")).toBeNull();
    expect(utils.queryByTestId("chip-dia")).toBeNull();
    expect(utils.queryByTestId("dia-puntos-1")).toBeNull();
  });

  it("marca el tinte de cada franja y su etiqueta, sin las etiquetas viejas", async () => {
    const dia = diaDeTraslado([desayuno, traslado, cena]);

    const utils = await render(
      <DayTimeGrid
        actividades={dia.actividades}
        fecha={dia.fechaRaw}
        franjas={dia.franjas}
        viaje={dia.viaje}
      />
    );

    expect(utils.getByTestId("timegrid-franja-salida")).toBeTruthy();
    expect(utils.getByTestId("timegrid-franja-llegada")).toBeTruthy();
    expect(utils.getByText("En Bariloche")).toBeTruthy();
    expect(utils.getByText("En Mendoza")).toBeTruthy();
    expect(utils.queryByText("EN BARILOCHE")).toBeNull();
  });

  it("la grilla sin franjas sigue igual", async () => {
    const utils = await render(<DayTimeGrid actividades={[desayuno]} fecha="2030-11-04" />);

    expect(utils.queryByTestId("timegrid-franja-salida")).toBeNull();
  });

  it("dibuja el viaje como tarjeta con salida, duración y llegada", async () => {
    const largo = { ...traslado, horaInicio: "10:30", horaFin: "16:30" };
    const dia = diaDeTraslado([largo]);
    const onEdit = jest.fn();

    const utils = await render(
      <DayTimeGrid
        actividades={dia.actividades}
        canEdit
        fecha={dia.fechaRaw}
        onEdit={onEdit}
        viaje={dia.viaje}
      />
    );

    expect(utils.getByTestId("timegrid-viaje")).toBeTruthy();
    expect(utils.getByText("6 h de viaje")).toBeTruthy();
    expect(utils.getByText(/sale 10:30/)).toBeTruthy();
    expect(utils.getByText(/llega 16:30/)).toBeTruthy();

    await fireEvent.press(utils.getByTestId(`timegrid-block-${largo.id}`));

    expect(onEdit).toHaveBeenCalledWith(largo);
  });

  it("un viaje corto va compacto", async () => {
    const corto = { ...traslado, horaInicio: "10:30", horaFin: "11:00" };
    const dia = diaDeTraslado([corto]);

    const utils = await render(
      <DayTimeGrid actividades={dia.actividades} fecha={dia.fechaRaw} viaje={dia.viaje} />
    );

    expect(utils.getByTestId("timegrid-viaje-compacto")).toBeTruthy();
    expect(utils.getByText("Sale 10:30 · llega 11:00")).toBeTruthy();
  });

  it("con noches en viaje indica el día de llegada", async () => {
    const dia = diaDeSalida();

    const utils = await render(
      <DayTimeGrid actividades={dia.actividades} fecha={dia.fechaRaw} viaje={dia.viaje} />
    );

    expect(utils.getByTestId("timegrid-viaje")).toBeTruthy();
    expect(utils.getByText(/llega vie 8, 07:00/)).toBeTruthy();
  });

  it("el día de llegada lleva la etiqueta con la hora", async () => {
    const dia = diaDeLlegada();

    const utils = await render(
      <DayTimeGrid actividades={[desayuno]} fecha={dia.fechaRaw} franjas={dia.franjas} />
    );

    expect(utils.getByTestId("timegrid-franja-llegada")).toBeTruthy();
    expect(utils.getByText("Llegan a Salta · 07:00")).toBeTruthy();
  });
});

describe("lista", () => {
  it("CP11: el encabezado lleva número, nombre y detalle", async () => {
    const utils = await render(
      <EncabezadoDestino
        encabezado={{ indice: 1, nombre: "Mendoza", detalle: "4 → 7 nov · 3 noches", color: "#000" }}
      />
    );

    expect(utils.getByText("2")).toBeTruthy();
    expect(utils.getByText("Mendoza")).toBeTruthy();
    expect(utils.getByText("4 → 7 nov · 3 noches")).toBeTruthy();
    expect(utils.getByTestId("foto-destino-vacia")).toBeTruthy();
  });

  it("CP10: la sección sin destino va sin foto ni número", async () => {
    const utils = await render(
      <EncabezadoDestino
        encabezado={{ indice: null, nombre: "Sin destino asignado · 2 noches", color: "#000" }}
      />
    );

    expect(utils.getByText("Sin destino asignado · 2 noches")).toBeTruthy();
    expect(utils.queryByTestId("foto-destino-vacia")).toBeNull();
  });

  it("el chip muestra los dos destinos o el ícono y el texto", async () => {
    const utils = await render(
      <ChipDia
        chip={{
          ruta: [
            { nombre: "Roma", color: "#000" },
            { nombre: "París", color: "#111" },
          ],
        }}
      />
    );

    expect(utils.getByText("Roma")).toBeTruthy();
    expect(utils.getByText("París")).toBeTruthy();
  });

  it("sin chip no dibuja nada", async () => {
    const { toJSON } = await render(<ChipDia chip={null} />);

    expect(toJSON()).toBeNull();
  });

  it("CP7: muestra la marca de llegada", async () => {
    const utils = await render(
      <MarcaLlegada texto="Llegás a Salta · 08:00" color="#000" fondo="#eee" />
    );

    expect(utils.getByText("Llegás a Salta · 08:00")).toBeTruthy();
  });
});

describe("día de traslado en DayAgenda", () => {
  function renderDia(dia, props = {}) {
    return render(
      <DayAgenda
        actividades={dia.actividades}
        fecha={dia.fechaRaw}
        separacion={dia.separacion}
        viaje={dia.viaje}
        {...props}
      />
    );
  }

  it("CP5: muestra zona de salida, viaje y zona de llegada", async () => {
    const dia = diaDeTraslado([desayuno, traslado, cena]);

    const utils = await renderDia(dia);

    expect(within(utils.getByTestId("zona-salida")).getByText("Desayuno")).toBeTruthy();
    expect(within(utils.getByTestId("zona-salida")).getByText("hasta las 11:40")).toBeTruthy();
    expect(within(utils.getByTestId("zona-llegada")).getByText("Cena")).toBeTruthy();
    expect(within(utils.getByTestId("zona-llegada")).getByText("desde las 13:35")).toBeTruthy();
    expect(utils.getByTestId("tarjeta-viaje")).toBeTruthy();
  });

  it("la tarjeta del viaje no lleva la etiqueta TRASLADO y muestra las horas", async () => {
    const dia = diaDeTraslado([desayuno, traslado, cena]);

    const utils = await renderDia(dia);
    const tarjeta = within(utils.getByTestId("tarjeta-viaje"));

    expect(utils.queryByText("TRASLADO")).toBeNull();
    expect(tarjeta.getByText("Avión a Mendoza")).toBeTruthy();
    expect(tarjeta.getByText("11:40")).toBeTruthy();
    expect(tarjeta.getByText("Sale")).toBeTruthy();
    expect(tarjeta.getByText("13:35")).toBeTruthy();
    expect(tarjeta.getByText("Llega")).toBeTruthy();
    expect(tarjeta.getByText("1 h 55 min")).toBeTruthy();
    expect(tarjeta.getByText("Bariloche")).toBeTruthy();
    expect(tarjeta.getByText("Mendoza")).toBeTruthy();
  });

  it("tocar la tarjeta del viaje abre la edición", async () => {
    const onEdit = jest.fn();
    const dia = diaDeTraslado([traslado]);

    const utils = await renderDia(dia, { canEdit: true, onEdit });
    await fireEvent.press(utils.getByTestId("tarjeta-viaje"));

    expect(onEdit).toHaveBeenCalledWith(traslado);
  });

  it("quien no puede editar no abre la edición", async () => {
    const onEdit = jest.fn();
    const dia = diaDeTraslado([traslado]);

    const utils = await renderDia(dia, { onEdit });
    await fireEvent.press(utils.getByTestId("tarjeta-viaje"));

    expect(onEdit).not.toHaveBeenCalled();
  });

  it("une las actividades de una zona, pero no la zona con la tarjeta del viaje", async () => {
    const otra = { id: 4, title: "Museo", horaInicio: "10:30", horaFin: "11:00" };
    const dia = diaDeTraslado([desayuno, otra, traslado, cena]);

    const utils = await renderDia(dia);
    const zona = within(utils.getByTestId("zona-salida"));

    expect(zona.getByTestId("agenda-conector-4")).toBeTruthy();
    expect(utils.getAllByTestId("linea-punteada")).toHaveLength(1);
  });

  it("la línea de la zona usa el color del destino al 35 %", async () => {
    const otra = { id: 4, title: "Museo", horaInicio: "10:30", horaFin: "11:00" };
    const dia = diaDeTraslado([desayuno, otra, traslado]);

    expect(dia.separacion.salida.linea).toBe(`${dia.separacion.salida.color}59`);
  });

  it("muestra las horas libres y Sugerir dentro de una zona", async () => {
    const onSuggestGap = jest.fn();
    const louvre = { id: 5, title: "Museo", horaInicio: "17:00", horaFin: "19:00" };
    const nocturna = { id: 6, title: "Cena tarde", horaInicio: "21:00", horaFin: "22:30" };
    const dia = diaDeTraslado([traslado, louvre, nocturna]);

    const utils = await renderDia(dia, { canEdit: true, onSuggestGap });
    const conector = within(utils.getByTestId("agenda-conector-6"));

    expect(conector.getByText("2 h libres")).toBeTruthy();
    await fireEvent.press(utils.getByTestId("agenda-gap-6"));
    expect(onSuggestGap).toHaveBeenCalledWith("19:00", "21:00");
  });

  it("las actividades de la zona son tarjetas blancas de radio 14", async () => {
    const dia = diaDeTraslado([desayuno, traslado]);

    const utils = await renderDia(dia);
    const estilo = StyleSheet.flatten(utils.getByTestId("agenda-detail-1").props.style);

    expect(estilo.borderRadius).toBe(14);
    expect(estilo.borderWidth).toBe(0);
  });

  it("dibuja al pie de cada zona lo que recibe", async () => {
    const { Text } = require("react-native");
    const dia = diaDeTraslado([traslado]);

    const utils = await renderDia(dia, {
      renderPieZona: (clave) => <Text>{`Pie ${clave}`}</Text>,
    });

    expect(within(utils.getByTestId("zona-salida")).getByText("Pie salida")).toBeTruthy();
    expect(within(utils.getByTestId("zona-llegada")).getByText("Pie llegada")).toBeTruthy();
  });

  it("avisa lo que empieza durante el viaje, en la zona de llegada", async () => {
    const durante = { id: 2, title: "Museo", horaInicio: "12:00", horaFin: "14:00" };
    const dia = diaDeTraslado([traslado, durante]);

    const utils = await renderDia(dia);
    const zona = within(utils.getByTestId("zona-llegada"));

    expect(zona.getByText("Museo")).toBeTruthy();
    expect(zona.getByText("Se superpone con el traslado")).toBeTruthy();
  });

  it("una zona sin actividades se muestra igual", async () => {
    const dia = diaDeTraslado([traslado, cena]);

    const utils = await renderDia(dia);

    expect(within(utils.getByTestId("zona-salida")).getByText("Bariloche")).toBeTruthy();
  });

  it("muestra todas las actividades, sin cortar la lista", async () => {
    const muchas = Array.from({ length: 7 }, (_, i) => ({
      id: 20 + i,
      title: `Actividad ${i}`,
      horaInicio: `0${i + 1}:00`,
      horaFin: `0${i + 1}:30`,
    }));
    const dia = diaDeTraslado([...muchas, traslado]);

    const utils = await renderDia(dia);

    expect(utils.queryByTestId("agenda-show-more")).toBeNull();
    expect(utils.getByText("Actividad 6")).toBeTruthy();
  });

  it("CP6: sin el traslado agendado no hay subtítulos", async () => {
    const dia = diaDeTraslado([desayuno, cena]);

    const utils = await renderDia(dia);

    expect(dia.separacion).toBeNull();
    expect(utils.queryByTestId("zona-salida")).toBeNull();
    expect(utils.getAllByTestId("linea-punteada")).toHaveLength(1);
  });

  it("CP6: la tarjeta avisa que al agendarlo se separan las actividades", async () => {
    const tramo = {
      tipo: "entre_destinos",
      nombreOrigen: "Bariloche",
      nombreLlegada: "Mendoza",
      fechaSalida: "2030-11-04",
      fechaLlegada: "2030-11-04",
      estado: "pendiente",
    };

    const utils = await render(<TrasladoCard tramo={tramo} />);

    expect(utils.getByText("Al agendarlo, las actividades se separan por destino")).toBeTruthy();
  });

  it("con noches en viaje el traslado es una tarjeta más, unida por la línea", async () => {
    const dia = diaDeSalida();

    const utils = await renderDia(dia);
    const tarjeta = within(utils.getByTestId("tarjeta-viaje"));

    expect(tarjeta.getByText("Sale hoy")).toBeTruthy();
    expect(tarjeta.getByText("Llega el vie 8")).toBeTruthy();
    expect(utils.queryByTestId("zona-salida")).toBeNull();
    expect(utils.getAllByTestId("linea-punteada")).toHaveLength(1);
  });

  it("con noches en viaje la tarjeta no lo avisa", async () => {
    const tramo = {
      tipo: "entre_destinos",
      nombreOrigen: "Bariloche",
      nombreLlegada: "Mendoza",
      fechaSalida: "2030-11-04",
      fechaLlegada: "2030-11-05",
      estado: "pendiente",
    };

    const utils = await render(<TrasladoCard tramo={tramo} />);

    expect(utils.queryByText(/se separan por destino/)).toBeNull();
  });
});

describe("ruta del día de traslado", () => {
  const info = { tipo: "traslado", origen: "Bariloche", destino: "Mendoza", indices: [0, 1] };
  const conLugar = (id, horaInicio) => ({
    id,
    title: `Actividad ${id}`,
    idLugarInteres: id,
    horaInicio,
    horaFin: `${horaInicio.slice(0, 2)}:30`,
  });
  const ruta = (id, nombreDestino) => ({
    id,
    nombreDestino,
    modo: "walking",
    distanciaMetros: 2100,
    duracionSegundos: 1500,
    idsActividadesOrdenadas: [id],
    polilineaCodificada: "abc",
  });

  const conIds = {
    ...traslado,
    traslado: { ...traslado.traslado, idDestinoOrigen: 10, idDestinoLlegada: 20 },
  };
  const rutaDe = (id, idDestino, nombreDestino, modo = "walking") => ({
    ...ruta(id, nombreDestino),
    idDestino,
    modo,
  });
  const antes = [conLugar(1, "08:00"), conLugar(2, "09:00")];
  const despues = [conLugar(3, "15:00"), conLugar(4, "16:00")];

  function seccion(actividades, props = {}) {
    return render(
      <DayRouteSection
        dayId={4}
        actividades={actividades}
        infoDestino={info}
        separacion={separarActividadesDia(actividades, info)}
        {...props}
      />
    );
  }

  it("CP12: muestra una fila por destino, cada una con su mapa", async () => {
    const onVerMapaDestino = jest.fn();
    const actividades = [...antes, conIds, ...despues];

    const utils = await seccion(actividades, {
      rutas: [rutaDe(1, 10, "Bariloche"), rutaDe(3, 20, "Mendoza")],
      onVerMapaDestino,
    });

    expect(utils.getByText("Ruta en Bariloche · 2.1 km · 25 min")).toBeTruthy();
    expect(utils.getByText("Ruta en Mendoza · 2.1 km · 25 min")).toBeTruthy();

    await fireEvent.press(utils.getAllByText("Ver mapa")[1]);

    expect(onVerMapaDestino.mock.calls[0][0].ruta.nombreDestino).toBe("Mendoza");
  });

  it("con destino dibuja solo la ruta de esa zona", async () => {
    const actividades = [...antes, conIds, ...despues];

    const utils = await seccion(actividades, {
      destino: "llegada",
      rutas: [rutaDe(1, 10, "Bariloche"), rutaDe(3, 20, "Mendoza")],
    });

    expect(utils.getByText("Ruta en Mendoza · 2.1 km · 25 min")).toBeTruthy();
    expect(utils.queryByText(/Ruta en Bariloche/)).toBeNull();
  });

  it("cada destino tiene su selector y genera con su destino y su modo", async () => {
    const onGenerarDestino = jest.fn();
    const onCambiarModoDestino = jest.fn();
    const actividades = [...antes, conIds, ...despues];

    const utils = await seccion(actividades, {
      canEdit: true,
      rutas: [rutaDe(1, 10, "Bariloche"), rutaDe(3, 20, "Mendoza", "driving")],
      modoDeDestino: (idDestino, item) => item?.modo,
      onGenerarDestino,
      onCambiarModoDestino,
    });

    expect(utils.getAllByText("Caminando")).toHaveLength(2);

    await fireEvent.press(utils.getAllByText("Bici")[1]);
    await fireEvent.press(utils.getByTestId("route-action-4-20"));

    expect(onCambiarModoDestino).toHaveBeenCalledWith(20, "bicycling");
    expect(onGenerarDestino).toHaveBeenCalledWith(20, "driving");
  });

  it("sin traslado agendado invita a agendarlo y no permite generar", async () => {
    const actividades = [conLugar(1, "08:00"), conLugar(2, "15:00")];

    const utils = await render(
      <DayRouteSection
        dayId={4}
        actividades={actividades}
        infoDestino={info}
        canEdit
        onGenerar={jest.fn()}
      />
    );

    expect(
      utils.getByText("Agendá el traslado para calcular la ruta de cada destino.")
    ).toBeTruthy();
    expect(utils.queryByTestId("route-action-4")).toBeNull();
  });

  it("avisa en su zona si a un destino le faltan actividades con ubicación", async () => {
    const actividades = [...antes, conIds, conLugar(3, "15:00")];

    const utils = await seccion(actividades, { canEdit: true, onGenerarDestino: jest.fn() });

    expect(
      utils.getByText("En Mendoza faltan actividades con ubicación para armar la ruta.")
    ).toBeTruthy();
    expect(utils.getByTestId("route-action-4-10")).toBeTruthy();
    expect(utils.queryByTestId("route-action-4-20")).toBeNull();
  });

  it("un día normal sigue con una sola ruta", async () => {
    const utils = await render(
      <DayRouteSection dayId={2} actividades={[]} ruta={ruta(1, null)} rutas={[]} />
    );

    expect(utils.getByText("Ruta · 2.1 km · 25 min")).toBeTruthy();
  });
});
