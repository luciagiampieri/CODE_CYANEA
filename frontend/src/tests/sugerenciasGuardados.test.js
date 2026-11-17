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

  it("todos en dos grupos: sin agendar y ya en el itinerario", () => {
    const { sinAgendar, enItinerario } = gruposGuardados(lugares);
    expect(sinAgendar.map((l) => l.id)).toEqual([2, 3]);
    expect(enItinerario.map((l) => l.id)).toEqual([1]);
  });

  it("el buscador filtra sin distinguir mayúsculas ni tildes y puede dejar un grupo vacío", () => {
    const { sinAgendar, enItinerario } = gruposGuardados(lugares, "GIJON");
    expect(sinAgendar).toEqual([]);
    expect(enItinerario.map((l) => l.id)).toEqual([1]);

    const nada = gruposGuardados(lugares, "zzz");
    expect(nada).toEqual({ sinAgendar: [], enItinerario: [] });
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
