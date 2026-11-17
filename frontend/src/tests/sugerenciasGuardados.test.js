import {
  MAX_SUGERENCIAS_GUARDADOS,
  buscarGuardados,
  gruposGuardados,
  mostrarVerTodos,
  ordenGuardadosUbicacion,
  textoDetalleGuardado,
  ultimosSinAgendar,
} from "../utils/sugerenciasGuardados";

// Las categorías llegan como las da Google Places en español ("Museo", "Cafetería").
const lugar = (id, name, extra = {}) => ({ id, name, category: "Museo", scheduledDays: [], ...extra });
const enDias = (...indices) => ({ scheduledDays: indices.map((dayIndex) => ({ dayId: 100 + dayIndex, dayIndex })) });

describe("ultimosSinAgendar (Nombre vacío)", () => {
  it("los 3 primeros que todavía no tienen actividad, en el orden de la API (los últimos guardados)", () => {
    const lugares = [lugar(1, "A"), lugar(2, "B", enDias(1)), lugar(3, "C"), lugar(4, "D"), lugar(5, "E")];
    expect(ultimosSinAgendar(lugares).map((l) => l.id)).toEqual([1, 3, 4]);
    expect(ultimosSinAgendar(lugares)).toHaveLength(MAX_SUGERENCIAS_GUARDADOS);
  });

  it("sin guardados (o todos en el itinerario) no hay ninguno", () => {
    expect(ultimosSinAgendar([])).toEqual([]);
    expect(ultimosSinAgendar(undefined)).toEqual([]);
    expect(ultimosSinAgendar([lugar(1, "A", enDias(2))])).toEqual([]);
  });
});

describe("mostrarVerTodos", () => {
  it("solo si hay más de 3 guardados en total", () => {
    expect(mostrarVerTodos([lugar(1, "A"), lugar(2, "B"), lugar(3, "C")])).toBe(false);
    expect(mostrarVerTodos([lugar(1, "A"), lugar(2, "B"), lugar(3, "C"), lugar(4, "D", enDias(1))])).toBe(true);
    expect(mostrarVerTodos(undefined)).toBe(false);
  });
});

describe("buscarGuardados (mientras se escribe)", () => {
  const lugares = [
    lugar(1, "Café Gijón", { category: "Cafetería", ...enDias(4, 2) }),
    lugar(2, "Cafetería Central", { category: "Cafetería" }),
    lugar(3, "Museo del Prado"),
    lugar(4, "Café de Oriente", { category: "Cafetería" }),
    lugar(5, "Café Comercial", { category: "Cafetería" }),
  ];

  it("sin distinguir mayúsculas ni tildes", () => {
    expect(buscarGuardados(lugares, "GIJON").map((o) => o.lugar.id)).toEqual([1]);
    expect(buscarGuardados(lugares, "muséo").map((o) => o.lugar.id)).toEqual([3]);
  });

  it("hasta 3, primero los que no tienen actividad y al final los que ya están", () => {
    const opciones = buscarGuardados(lugares, "caf");
    expect(opciones).toHaveLength(3);
    expect(opciones.every((o) => !o.enItinerario)).toBe(true);

    const conGijon = buscarGuardados([lugares[0], lugares[1]], "caf");
    expect(conGijon.map((o) => o.lugar.id)).toEqual([2, 1]);
    expect(conGijon[1].enItinerario).toBe(true);
  });

  it("texto vacío o sin coincidencias no devuelve nada", () => {
    expect(buscarGuardados(lugares, "  ")).toEqual([]);
    expect(buscarGuardados(lugares, "zzz")).toEqual([]);
  });
});

describe("gruposGuardados (hoja 'Tus guardados')", () => {
  const lugares = [lugar(1, "Café Gijón", enDias(2)), lugar(2, "Museo del Prado"), lugar(3, "Parque del Retiro")];

  const resumen = (grupos) => grupos.map((g) => [g.clave, g.titulo, g.data.map((l) => l.id)]);

  it("todos en dos grupos: sin agendar y ya en el itinerario", () => {
    expect(resumen(gruposGuardados(lugares))).toEqual([
      ["sin-agendar", "Sin agendar", [2, 3]],
      ["itinerario", "Ya en el itinerario", [1]],
    ]);
  });

  it("el buscador filtra sin distinguir mayúsculas ni tildes y no devuelve grupos vacíos", () => {
    expect(resumen(gruposGuardados(lugares, "GIJON"))).toEqual([["itinerario", "Ya en el itinerario", [1]]]);
    expect(gruposGuardados(lugares, "zzz")).toEqual([]);
  });
});

describe("con el destino del día (viaje con varios destinos)", () => {
  const MADRID = { name: "Madrid", lat: 40.4168, lng: -3.7038 };
  const TOLEDO = { name: "Toledo", lat: 39.8628, lng: -4.0273 };
  const BARCELONA = { name: "Barcelona", lat: 41.3874, lng: 2.1686 };
  const destinos = [MADRID, TOLEDO, BARCELONA];
  const enMadrid = { lat: 40.4138, lng: -3.6921 };
  const enBarcelona = { lat: 41.4036, lng: 2.1744 };
  const enToledo = { lat: 39.8571, lng: -4.0237 };

  // Del más nuevo al más viejo, como la API.
  const lugares = [
    lugar(1, "Museo del Prado", enMadrid),
    lugar(2, "Sagrada Familia", enBarcelona),
    lugar(3, "Casa Batlló", enBarcelona),
    lugar(4, "Catedral de Toledo", enToledo),
    lugar(5, "Parque Güell", { ...enBarcelona, ...enDias(4) }),
    lugar(6, "Retiro", enMadrid),
  ];
  const diaEnBarcelona = { destinos, indicesDia: [2] };

  it("campo vacío: primero los sin agendar del destino del día y después se completa con otros", () => {
    expect(ultimosSinAgendar(lugares, diaEnBarcelona).map((l) => l.id)).toEqual([2, 3, 1]);
    expect(ultimosSinAgendar(lugares).map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it("al escribir: sin agendar del destino, sin agendar de otros y al final los agendados", () => {
    const opciones = buscarGuardados(lugares, "a", diaEnBarcelona).map((o) => o.lugar.id);
    expect(opciones).toEqual([2, 3, 1]);
    const conAgendado = buscarGuardados([lugares[4], lugares[0]], "a", diaEnBarcelona).map((o) => o.lugar.id);
    expect(conAgendado).toEqual([1, 5]);
  });

  it("la hoja agrupa 'En <destino del día>' y 'Otros destinos', con los sin agendar primero", () => {
    const grupos = gruposGuardados(lugares, "", diaEnBarcelona);
    expect(grupos.map((g) => [g.clave, g.titulo, g.data.map((l) => l.id)])).toEqual([
      ["destino-del-dia", "En Barcelona", [2, 3, 5]],
      ["otros-destinos", "Otros destinos", [1, 4, 6]],
    ]);
  });

  it("en un día de traslado prioriza los dos destinos", () => {
    const traslado = { destinos, indicesDia: [1, 2] };
    expect(gruposGuardados(lugares, "", traslado)[0].titulo).toBe("En Toledo y Barcelona");
    expect(ultimosSinAgendar(lugares, traslado).map((l) => l.id)).toEqual([2, 3, 4]);
  });

  it("un guardado de otro destino muestra su nombre en el detalle", () => {
    expect(textoDetalleGuardado(lugares[0], diaEnBarcelona)).toBe("Museo · Madrid · Sin día asignado");
    expect(textoDetalleGuardado(lugares[1], diaEnBarcelona)).toBe("Museo · Sin día asignado");
    expect(textoDetalleGuardado(lugares[4], { destinos, indicesDia: [0] })).toBe(
      "Ya en el itinerario · Barcelona · Día 4"
    );
  });

  it("sin destino del día (en viaje) o con un solo destino queda como siempre", () => {
    expect(ultimosSinAgendar(lugares, { destinos, indicesDia: [] }).map((l) => l.id)).toEqual([1, 2, 3]);
    expect(ultimosSinAgendar(lugares, { destinos: [MADRID], indicesDia: [0] }).map((l) => l.id)).toEqual([1, 2, 3]);
    expect(textoDetalleGuardado(lugares[0], { destinos: [MADRID], indicesDia: [0] })).toBe("Museo · Sin día asignado");
  });
});

describe("textoDetalleGuardado", () => {
  it("sin actividad: la categoría en español que muestra Explorar y 'Sin día asignado'", () => {
    expect(textoDetalleGuardado(lugar(1, "A", { category: "Museo" }))).toBe("Museo · Sin día asignado");
  });

  it("los tipos crudos de Google y los genéricos no se muestran", () => {
    expect(textoDetalleGuardado(lugar(1, "A", { category: "art_gallery" }))).toBe("Sin día asignado");
    expect(textoDetalleGuardado(lugar(1, "A", { category: "point of interest" }))).toBe("Sin día asignado");
    expect(textoDetalleGuardado(lugar(1, "A", { category: null }))).toBe("Sin día asignado");
  });

  it("con actividad: 'Ya en el itinerario' con los días ordenados y sin repetir", () => {
    expect(textoDetalleGuardado(lugar(1, "A", enDias(4, 2, 2)))).toBe("Ya en el itinerario · Día 2, Día 4");
  });
});

describe("ordenGuardadosUbicacion", () => {
  it("todos, primero los que no tienen actividad", () => {
    const lugares = [lugar(1, "A", enDias(1)), lugar(2, "B"), lugar(3, "C")];
    expect(ordenGuardadosUbicacion(lugares).map((l) => l.id)).toEqual([2, 3, 1]);
  });
});
