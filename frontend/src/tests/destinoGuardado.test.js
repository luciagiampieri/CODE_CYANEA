import { groupSavedPlacesByDestination } from "../components/explore/exploreUtils";
import {
  RADIO_DESTINO_KM,
  destinoDeLugar,
  destinoInicial,
  distanciaKm,
  indicesDestinoDeFecha,
  nombresDestinos,
  resumenDestinos,
  textoDias,
} from "../utils/destinoGuardado";

const MADRID = { name: "Madrid", lat: 40.4168, lng: -3.7038, noches: 3, nochesEnViaje: 0 };
const BARCELONA = { name: "Barcelona", lat: 41.3874, lng: 2.1686, noches: 2, nochesEnViaje: 0 };
const DESTINOS = [MADRID, BARCELONA];
// 1 → 4 dic en Madrid, 4 (traslado) y 5 dic en Barcelona, 6 dic último día.
const INICIO = "2030-12-01";
const FIN = "2030-12-06";

const PRADO = { id: 1, name: "Museo del Prado", lat: 40.4138, lng: -3.6921, scheduledDays: [] };
const TOLEDO = { id: 2, name: "Catedral de Toledo", lat: 39.8571, lng: -4.0237, scheduledDays: [{ dayIndex: 3 }, { dayIndex: 2 }] };
const SAGRADA = { id: 3, name: "Sagrada Familia", lat: 41.4036, lng: 2.1744, scheduledDays: [] };
const GIRALDA = { id: 4, name: "La Giralda", lat: 37.3861, lng: -5.9926, scheduledDays: [] };

describe("distanciaKm", () => {
  it("calcula la distancia entre dos puntos", () => {
    expect(distanciaKm(MADRID, BARCELONA)).toBeGreaterThan(490);
    expect(distanciaKm(MADRID, BARCELONA)).toBeLessThan(510);
    expect(distanciaKm(MADRID, MADRID)).toBe(0);
  });
});

describe("destinoDeLugar", () => {
  it("asigna el destino más cercano, también en una excursión cercana", () => {
    expect(destinoDeLugar(PRADO, DESTINOS)).toBe(0);
    expect(destinoDeLugar(TOLEDO, DESTINOS)).toBe(0);
    expect(destinoDeLugar(SAGRADA, DESTINOS)).toBe(1);
  });

  it(`a más de ${RADIO_DESTINO_KM} km de todos, o sin coordenadas, no tiene destino`, () => {
    expect(destinoDeLugar(GIRALDA, DESTINOS)).toBeNull();
    expect(destinoDeLugar({ id: 9, name: "Sin ubicación" }, DESTINOS)).toBeNull();
    expect(destinoDeLugar(PRADO, [{ name: "A" }, { name: "B" }])).toBeNull();
  });

  it("con un solo destino no se trabaja por destino", () => {
    expect(destinoDeLugar(PRADO, [MADRID])).toBeNull();
    expect(destinoDeLugar(PRADO, [])).toBeNull();
  });
});

describe("resumenDestinos", () => {
  it("con el recorrido armado trae fechas y noches en el orden del recorrido", () => {
    const resumen = resumenDestinos(DESTINOS, INICIO, FIN);
    expect(resumen.map((d) => [d.indice, d.nombre, d.rango, d.textoNoches])).toEqual([
      [0, "Madrid", "1 → 4 dic", "3 noches"],
      [1, "Barcelona", "4 → 6 dic", "2 noches"],
    ]);
  });

  it("sin recorrido armado solo el nombre", () => {
    const resumen = resumenDestinos([{ ...MADRID, noches: null }, { ...BARCELONA, noches: null }], INICIO, FIN);
    expect(resumen.map((d) => [d.nombre, d.rango, d.noches])).toEqual([
      ["Madrid", null, null],
      ["Barcelona", null, null],
    ]);
  });

  it("un destino sin coordenadas queda sin ubicación", () => {
    expect(resumenDestinos([{ name: "X", noches: 3 }, BARCELONA], INICIO, FIN)[0].conUbicacion).toBe(false);
  });
});

describe("indicesDestinoDeFecha", () => {
  it("día normal, día de traslado y último día", () => {
    expect(indicesDestinoDeFecha(DESTINOS, INICIO, FIN, "2030-12-02")).toEqual([0]);
    expect(indicesDestinoDeFecha(DESTINOS, INICIO, FIN, "2030-12-04")).toEqual([0, 1]);
    expect(indicesDestinoDeFecha(DESTINOS, INICIO, FIN, "2030-12-06")).toEqual([1]);
  });

  it("en viaje o sin recorrido armado no hay destino", () => {
    // Madrid 1 → 3 dic, en viaje el 4 y llegada a Barcelona el 5.
    const conNochesEnViaje = [{ ...MADRID, noches: 2, nochesEnViaje: 2 }, { ...BARCELONA, noches: 1 }];
    expect(indicesDestinoDeFecha(conNochesEnViaje, INICIO, FIN, "2030-12-04")).toEqual([]);
    expect(indicesDestinoDeFecha(conNochesEnViaje, INICIO, FIN, "2030-12-05")).toEqual([1]);
    expect(indicesDestinoDeFecha([{ ...MADRID, noches: null }, BARCELONA], INICIO, FIN, "2030-12-02")).toEqual([]);
    expect(indicesDestinoDeFecha([MADRID], INICIO, FIN, "2030-12-02")).toEqual([]);
  });

  it("en los días libres del final no hay destino", () => {
    expect(indicesDestinoDeFecha([{ ...MADRID, noches: 1 }, { ...BARCELONA, noches: 1 }], INICIO, FIN, "2030-12-05")).toEqual([]);
  });
});

describe("destinoInicial", () => {
  it("si el viaje no está en curso, el primero", () => {
    expect(destinoInicial(DESTINOS, INICIO, FIN, "2030-11-20")).toEqual({ indice: 0, indicesHoy: [] });
  });

  it("en curso, el de hoy", () => {
    expect(destinoInicial(DESTINOS, INICIO, FIN, "2030-12-05")).toEqual({ indice: 1, indicesHoy: [1] });
  });

  it("en un día de traslado, el de salida, con 'Hoy' en los dos", () => {
    expect(destinoInicial(DESTINOS, INICIO, FIN, "2030-12-04")).toEqual({ indice: 0, indicesHoy: [0, 1] });
  });

  it("en viaje, el destino al que van; en los días libres, el último", () => {
    const conNocheEnViaje = [{ ...MADRID, noches: 2, nochesEnViaje: 2 }, { ...BARCELONA, noches: 1 }];
    expect(destinoInicial(conNocheEnViaje, INICIO, FIN, "2030-12-04")).toEqual({ indice: 1, indicesHoy: [] });
    const conLibres = [{ ...MADRID, noches: 1 }, { ...BARCELONA, noches: 1 }];
    expect(destinoInicial(conLibres, INICIO, FIN, "2030-12-05")).toEqual({ indice: 1, indicesHoy: [] });
  });
});

describe("textoDias y nombresDestinos", () => {
  it("días ordenados sin repetir y nombres unidos con 'y'", () => {
    expect(textoDias(TOLEDO)).toBe("Día 2, Día 3");
    expect(nombresDestinos(DESTINOS, [0])).toBe("Madrid");
    expect(nombresDestinos(DESTINOS, [0, 1])).toBe("Madrid y Barcelona");
  });
});

describe("groupSavedPlacesByDestination (pestaña Guardados)", () => {
  it("un grupo por destino en el orden del recorrido y 'Otros lugares' al final", () => {
    const grupos = groupSavedPlacesByDestination([GIRALDA, SAGRADA, TOLEDO, PRADO], DESTINOS, INICIO, FIN);
    expect(grupos.map((g) => [g.key, g.title, g.dateLabel, g.count])).toEqual([
      ["destination-0", "Madrid", "1 → 4 dic", 2],
      ["destination-1", "Barcelona", "4 → 6 dic", 1],
      ["others", "Otros lugares", null, 1],
    ]);
  });

  it("dentro de cada grupo separa sin agendar y agendados", () => {
    const [madrid] = groupSavedPlacesByDestination([TOLEDO, PRADO], DESTINOS, INICIO, FIN);
    expect(madrid.unscheduled.map((p) => p.id)).toEqual([1]);
    expect(madrid.scheduled.map((p) => p.id)).toEqual([2]);
  });

  it("los grupos vacíos no se muestran", () => {
    const grupos = groupSavedPlacesByDestination([SAGRADA], DESTINOS, INICIO, FIN);
    expect(grupos.map((g) => g.key)).toEqual(["destination-1"]);
  });

  it("con un solo destino devuelve null (la pestaña sigue agrupando por día)", () => {
    expect(groupSavedPlacesByDestination([PRADO], [MADRID], INICIO, FIN)).toBeNull();
  });
});
