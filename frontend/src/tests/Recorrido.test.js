import { colorDeDestino, colorSuaveDeDestino, routeColors } from "../theme/tokens";
import { formatDateRangeShort, formatDayMonth } from "../utils/dates";
import {
  agregarDestino,
  avisoCambioFechas,
  calcularNochesViaje,
  calcularTramos,
  cambiarNoches,
  cambiarNochesEnViaje,
  destinosParaGuardar,
  indiceDeArrastre,
  modoRecorrido,
  moverDestino,
  quitarDestino,
  repartirNoches,
  resumenRecorrido,
  textoPildoraTraslado,
  textoRangoTramo,
  textoRegion,
  textoTraslado,
} from "../utils/recorrido";

const destino = (name, noches = null, nochesEnViaje = 0) => ({ name, noches, nochesEnViaje });
const noches = (lista) => lista.map((d) => d.noches);
const enViaje = (lista) => lista.map((d) => d.nochesEnViaje);
const nombres = (lista) => lista.map((d) => d.name);

describe("fechas cortas", () => {
  it("formatea día y rango", () => {
    expect(formatDayMonth("2026-11-21")).toBe("21 nov");
    expect(formatDateRangeShort("2026-11-03", "2026-11-12")).toBe("3 al 12 nov");
    expect(formatDateRangeShort("2026-11-28", "2026-12-03")).toBe("28 nov al 3 dic");
    expect(formatDateRangeShort("2026-12-28", "2027-01-03")).toBe("28 dic 2026 al 3 ene 2027");
  });
});

describe("colores por destino", () => {
  it("usa el color por orden y después los repite", () => {
    expect(routeColors).toEqual(["#1e3e7b", "#8e3b5c", "#2a7a6d", "#9a5a14"]);
    expect(colorDeDestino(1)).toBe("#8e3b5c");
    expect(colorDeDestino(4)).toBe("#1e3e7b");
    expect(colorSuaveDeDestino(1)).toBe("#8e3b5c1a");
  });
});

describe("calcularNochesViaje", () => {
  it("cuenta las noches entre las fechas", () => {
    expect(calcularNochesViaje("2026-11-03", "2026-11-12")).toBe(9);
    expect(calcularNochesViaje("2026-11-03", "2026-11-03")).toBe(0);
  });

  it("devuelve 0 sin fechas completas o con el rango invertido", () => {
    expect(calcularNochesViaje("2026-11-03", "")).toBe(0);
    expect(calcularNochesViaje("2026-11-12", "2026-11-03")).toBe(0);
  });
});

describe("modoRecorrido", () => {
  it("distingue los cuatro modos", () => {
    expect(modoRecorrido([destino("A")], 9)).toBe("unico");
    expect(modoRecorrido([destino("A", 1), destino("B", 1), destino("C", 0)], 2)).toBe("pocasNoches");
    expect(modoRecorrido([destino("A"), destino("B")], 9)).toBe("sinArmar");
    expect(modoRecorrido([destino("A", 3), destino("B")], 9)).toBe("sinArmar");
    expect(modoRecorrido([destino("A", 3), destino("B", 3)], 9)).toBe("armado");
  });
});

describe("calcularTramos", () => {
  it("calcula el rango de tres destinos de 3 noches", () => {
    const tramos = calcularTramos(
      [destino("Mendoza", 3), destino("Salta", 3), destino("Cafayate", 3)],
      "2026-11-03"
    );

    expect(tramos.map((t) => [t.llegada, t.salida])).toEqual([
      ["2026-11-03", "2026-11-06"],
      ["2026-11-06", "2026-11-09"],
      ["2026-11-09", "2026-11-12"],
    ]);
  });

  it("con 1 noche en viaje y salida el lun 9, llega el mar 10", () => {
    const [mendoza, salta] = calcularTramos(
      [destino("Mendoza", 6, 1), destino("Salta", 2)],
      "2026-11-03"
    );

    expect(mendoza.salida).toBe("2026-11-09");
    expect(salta.llegada).toBe("2026-11-10");
    expect(textoTraslado(mendoza)).toBe("Llegan el 10 nov");
  });

  it("con 2 noches en viaje y salida el dom 8, llega el mar 10", () => {
    const [origen, siguiente] = calcularTramos(
      [destino("Mendoza", 5, 2), destino("Salta", 2)],
      "2026-11-03"
    );

    expect(origen.salida).toBe("2026-11-08");
    expect(siguiente.llegada).toBe("2026-11-10");
  });

  it("con 0 noches en viaje sale y llega el mismo día", () => {
    const [origen, siguiente] = calcularTramos(
      [destino("Mendoza", 3), destino("Salta", 3)],
      "2026-11-03"
    );

    expect(siguiente.llegada).toBe(origen.salida);
    expect(textoTraslado(origen)).toBe("Traslado el 6 nov");
  });

  it("recalcula las fechas al cambiar el orden", () => {
    const lista = [destino("Mendoza", 2), destino("Salta", 4)];

    const tramos = calcularTramos(moverDestino(lista, 0, 1), "2026-11-03");

    expect(tramos[0].salida).toBe("2026-11-07");
    expect(tramos[1].salida).toBe("2026-11-09");
  });
});

describe("textos de la vista", () => {
  it("formatea el rango del tramo", () => {
    expect(textoRangoTramo({ llegada: "2026-12-02", salida: "2026-12-04" })).toBe("2 → 4 dic");
    expect(textoRangoTramo({ llegada: "2026-11-28", salida: "2026-12-01" })).toBe("28 nov → 1 dic");
    expect(textoRangoTramo({ llegada: "2026-12-28", salida: "2027-01-03" })).toBe("28 dic → 3 ene");
  });

  it("nombra la píldora del traslado", () => {
    expect(textoPildoraTraslado(0)).toBe("Mismo día");
    expect(textoPildoraTraslado(1)).toBe("1 noche");
    expect(textoPildoraTraslado(2)).toBe("2 noches");
  });

  it("omite de la región lo que repite el nombre", () => {
    expect(textoRegion({ name: "Mendoza", provinceState: "Mendoza", country: "Argentina" })).toBe("Argentina");
    expect(textoRegion({ name: "Bariloche", provinceState: "Río Negro", country: "Argentina" })).toBe(
      "Río Negro, Argentina"
    );
    expect(textoRegion({ name: "Uruguay", country: "uruguay" })).toBe("");
  });
});

describe("resumenRecorrido", () => {
  it("informa en verde cuando están todas repartidas", () => {
    const resumen = resumenRecorrido([destino("A", 4, 1), destino("B", 4)], 9);

    expect(resumen.tono).toBe("success");
    expect(resumen.mensaje).toBe("Las 9 noches están repartidas (1 noche en viaje).");
    expect(resumen.puedeAvanzar).toBe(true);
    expect(resumen.mostrarRepartir).toBe(false);
  });

  it("avisa las noches libres y deja avanzar", () => {
    const resumen = resumenRecorrido([destino("A", 4), destino("B", 3)], 9);

    expect(resumen.tono).toBe("warning");
    expect(resumen.mensaje).toBe("Quedan 2 noches sin destino. Podés seguir igual.");
    expect(resumen.puedeAvanzar).toBe(true);
  });

  it("no deja avanzar con un destino en 0 noches", () => {
    const resumen = resumenRecorrido([destino("Salta", 9), destino("Cafayate", 0)], 9);

    expect(resumen.tono).toBe("info");
    expect(resumen.mensaje).toBe(
      "Cafayate todavía no tiene noches. Sacale noches a otro destino para sumárselas."
    );
    expect(resumen.puedeAvanzar).toBe(false);
    expect(resumen.mostrarRepartir).toBe(true);
  });

  it.each([
    ["10 noches en un viaje de 9", [destino("A", 5), destino("B", 5)], "Hay 1 noche de más."],
    ["8 en destinos y 2 en viaje en un viaje de 9", [destino("A", 4, 2), destino("B", 4)], "Hay 1 noche de más."],
  ])("no deja avanzar con %s", (_, lista, inicio) => {
    const resumen = resumenRecorrido(lista, 9);

    expect(resumen.tono).toBe("danger");
    expect(resumen.mensaje).toContain(inicio);
    expect(resumen.puedeAvanzar).toBe(false);
    expect(resumen.mostrarRepartir).toBe(true);
  });

  it("muestra las noches en viaje y las libres en la barra", () => {
    const { segmentos } = resumenRecorrido([destino("A", 3, 1), destino("B", 3)], 9);

    expect(segmentos.map((s) => [s.tipo, s.noches])).toEqual([
      ["destino", 3],
      ["enViaje", 1],
      ["destino", 3],
      ["libre", 2],
    ]);
  });

  it.each(["unico", "pocasNoches", "sinArmar"])("no bloquea en modo %s", (modo) => {
    const listas = {
      unico: [[destino("A")], 9],
      pocasNoches: [[destino("A", 0), destino("B", 0), destino("C", 0)], 2],
      sinArmar: [[destino("A"), destino("B")], 9],
    };

    const resumen = resumenRecorrido(...listas[modo]);

    expect(resumen.modo).toBe(modo);
    expect(resumen.puedeAvanzar).toBe(true);
    expect(resumen.mensaje).toBeUndefined();
    expect(resumen.segmentos).toEqual([]);
  });
});

describe("destinos sin noches", () => {
  it("indica las noches libres para repartir, descontando las noches en viaje", () => {
    const resumen = resumenRecorrido([destino("A", 4, 1), destino("B", 0)], 9);

    expect(resumen.tono).toBe("info");
    expect(resumen.mensaje).toBe(
      "Indicá cuántas noches pasan en cada destino. Tenés 4 noches para repartir."
    );
    expect(resumen.puedeAvanzar).toBe(false);
    expect(resumen.mostrarRepartir).toBe(true);
  });

  it("usa el singular con 1 noche libre", () => {
    expect(resumenRecorrido([destino("A", 8), destino("B", 0)], 9).mensaje).toBe(
      "Indicá cuántas noches pasan en cada destino. Tenés 1 noche para repartir."
    );
  });

  it("sin noches libres nombra los destinos en plural", () => {
    const resumen = resumenRecorrido([destino("A", 9), destino("Cafayate", 0), destino("Jujuy", 0)], 9);

    expect(resumen.mensaje).toBe(
      "Cafayate y Jujuy todavía no tienen noches. Sacale noches a otro destino para sumárselas."
    );
  });

  it("nombra hasta tres destinos", () => {
    const lista = [destino("A", 9), ...["B", "C", "D", "E"].map((n) => destino(n, 0))];

    expect(resumenRecorrido(lista, 9).mensaje).toMatch(/^B, C y D todavía no tienen noches/);
  });

  it("las noches de más tienen prioridad sobre el destino en 0", () => {
    const resumen = resumenRecorrido([destino("A", 10), destino("B", 0)], 9);

    expect(resumen.tono).toBe("danger");
    expect(resumen.mensaje).toBe("Hay 1 noche de más. Sacá noches para poder seguir.");
  });

  it("el destino en 0 tiene prioridad sobre las noches libres", () => {
    expect(resumenRecorrido([destino("A", 3), destino("B", 0)], 9).tono).toBe("info");
  });
});

describe("avisoCambioFechas", () => {
  const armado = [destino("A", 4, 1), destino("B", 4)];

  it("avisa las noches que sobran, contando las noches en viaje", () => {
    expect(avisoCambioFechas(armado, 11, 9)).toEqual({
      tono: "warning",
      mensaje: "Ahora el viaje tiene 11 noches. Te quedan 2 noches sin destino.",
    });
  });

  it("usa el singular con 1 noche libre", () => {
    expect(avisoCambioFechas(armado, 10, 9).mensaje).toBe(
      "Ahora el viaje tiene 10 noches. Te queda 1 noche sin destino."
    );
  });

  it("marca error si no entran", () => {
    expect(avisoCambioFechas(armado, 5, 9)).toEqual({
      tono: "danger",
      mensaje: "Ahora el viaje tiene 5 noches. Sacá 4 noches de tus destinos para poder guardar.",
    });
  });

  it("usa el singular con 1 noche de más", () => {
    expect(avisoCambioFechas(armado, 8, 9).mensaje).toBe(
      "Ahora el viaje tiene 8 noches. Sacá 1 noche de tus destinos para poder guardar."
    );
  });

  it("no avisa si la cantidad de noches no cambió, aunque haya noches libres", () => {
    expect(avisoCambioFechas([destino("A", 3), destino("B", 3)], 9, 9)).toBeNull();
  });

  it("no avisa si la suma coincide con las noches nuevas", () => {
    expect(avisoCambioFechas(armado, 9, 12)).toBeNull();
  });

  it("no aplica en pocasNoches ni en sinArmar", () => {
    expect(avisoCambioFechas(armado, 1, 9)).toBeNull();
    expect(avisoCambioFechas([destino("A"), destino("B")], 11, 9)).toBeNull();
  });
});

describe("agregarDestino", () => {
  it("el primer destino no lleva noches", () => {
    expect(agregarDestino([], destino("A"))).toEqual([destino("A")]);
  });

  it("de 1 a 2 destinos, los dos quedan en 0", () => {
    expect(noches(agregarDestino([destino("A")], destino("B")))).toEqual([0, 0]);
  });

  it("el destino nuevo entra en 0 aunque haya noches libres", () => {
    const lista = [destino("A", 3, 1), destino("B", 3)];

    expect(noches(agregarDestino(lista, destino("C")))).toEqual([3, 3, 0]);
  });

  it("queda en 0 con el aviso si las 9 noches ya están repartidas", () => {
    const lista = agregarDestino(
      [destino("Mendoza", 5), destino("Salta", 4)],
      destino("Cafayate")
    );

    expect(noches(lista)).toEqual([5, 4, 0]);
    expect(resumenRecorrido(lista, 9).mensaje).toContain("Cafayate todavía no tiene noches");
  });

  it("en un recorrido sin armar el nuevo destino también queda sin noches", () => {
    const lista = agregarDestino([destino("A"), destino("B")], destino("C"));

    expect(noches(lista)).toEqual([null, null, null]);
  });
});

describe("quitarDestino", () => {
  const abc = () => [destino("A", 2, 1), destino("B", 2, 2), destino("C", 2)];

  it("libera las noches del destino quitado", () => {
    const lista = quitarDestino([destino("A", 3), destino("B", 3), destino("C", 3)], 1);

    expect(nombres(lista)).toEqual(["A", "C"]);
    expect(resumenRecorrido(lista, 9).libres).toBe(3);
  });

  it("al quitar B en A-B-C libera A-B y B-C pasa a ser A-C", () => {
    const lista = quitarDestino(abc(), 1);

    expect(nombres(lista)).toEqual(["A", "C"]);
    expect(enViaje(lista)).toEqual([2, 0]);
  });

  it("al quitar el primero libera su traslado saliente", () => {
    const lista = quitarDestino(abc(), 0);

    expect(nombres(lista)).toEqual(["B", "C"]);
    expect(enViaje(lista)).toEqual([2, 0]);
  });

  it("si queda último un destino con noches en viaje, se liberan", () => {
    const lista = quitarDestino(abc(), 2);

    expect(nombres(lista)).toEqual(["A", "B"]);
    expect(enViaje(lista)).toEqual([1, 0]);
  });

  it("al volver a un destino se limpian las noches", () => {
    expect(quitarDestino([destino("A", 4, 1), destino("B", 4)], 1)).toEqual([destino("A")]);
  });
});

describe("moverDestino", () => {
  it("las noches viajan con el destino y las noches en viaje quedan por posición", () => {
    const lista = [destino("A", 1, 1), destino("B", 2, 2), destino("C", 3)];

    const movida = moverDestino(lista, 0, 2);

    expect(nombres(movida)).toEqual(["B", "C", "A"]);
    expect(noches(movida)).toEqual([2, 3, 1]);
    expect(enViaje(movida)).toEqual([1, 2, 0]);
  });

  it("no cambia el total de noches", () => {
    const lista = [destino("A", 3, 1), destino("B", 2, 2), destino("C", 1)];

    const suma = (l) => l.reduce((t, d) => t + d.noches + d.nochesEnViaje, 0);

    expect(suma(moverDestino(lista, 2, 0))).toBe(suma(lista));
  });

  it("devuelve la misma lista si no hay movimiento posible", () => {
    const lista = [destino("A", 3), destino("B", 3)];

    expect(moverDestino(lista, 0, 0)).toBe(lista);
    expect(moverDestino(lista, 0, -1)).toBe(lista);
    expect(moverDestino(lista, 1, 2)).toBe(lista);
  });
});

describe("indiceDeArrastre", () => {
  const posiciones = [
    { y: 0, height: 100 },
    { y: 100, height: 100 },
    { y: 200, height: 100 },
  ];

  it("calcula dónde cae la tarjeta", () => {
    expect(indiceDeArrastre(posiciones, 0, 120)).toBe(1);
    expect(indiceDeArrastre(posiciones, 0, 240)).toBe(2);
    expect(indiceDeArrastre(posiciones, 2, -240)).toBe(0);
  });

  it("no mueve con un arrastre corto", () => {
    expect(indiceDeArrastre(posiciones, 1, 20)).toBe(1);
  });
});

describe("repartirNoches", () => {
  it("con 4 destinos y 9 noches quedan 3, 2, 2 y 2", () => {
    const lista = ["A", "B", "C", "D"].map((n) => destino(n, 0));

    expect(noches(repartirNoches(lista, 9))).toEqual([3, 2, 2, 2]);
  });

  it("con 3 destinos, 9 noches y 1 en viaje quedan 3, 3 y 2", () => {
    const lista = [destino("A", 0, 1), destino("B", 0), destino("C", 0)];

    const repartida = repartirNoches(lista, 9);

    expect(noches(repartida)).toEqual([3, 3, 2]);
    expect(enViaje(repartida)).toEqual([1, 0, 0]);
  });

  it("no toca las noches en viaje aunque no alcance para todos", () => {
    const lista = [destino("A", 0, 3), destino("B", 0), destino("C", 0)];

    const repartida = repartirNoches(lista, 4);

    expect(noches(repartida)).toEqual([1, 0, 0]);
    expect(resumenRecorrido(repartida, 4).puedeAvanzar).toBe(false);
  });
});

describe("contadores", () => {
  it("no bajan de 0", () => {
    const lista = [destino("A", 0), destino("B", 1)];

    expect(noches(cambiarNoches(lista, 0, -1))).toEqual([0, 1]);
    expect(enViaje(cambiarNochesEnViaje(lista, 0, -1))).toEqual([0, 0]);
  });

  it("permiten superar el total para que se vea el aviso", () => {
    const lista = cambiarNoches([destino("A", 5), destino("B", 4)], 1, 1);

    expect(resumenRecorrido(lista, 9).exceso).toBe(1);
  });

  it("al tocar un contador sin armar, los demás pasan a 0", () => {
    const lista = cambiarNoches([destino("A"), destino("B")], 0, 1);

    expect(noches(lista)).toEqual([1, 0]);
    expect(modoRecorrido(lista, 9)).toBe("armado");
  });

  it("tocar las noches en viaje también arma el recorrido", () => {
    const lista = cambiarNochesEnViaje([destino("A"), destino("B")], 0, 1);

    expect(noches(lista)).toEqual([0, 0]);
    expect(enViaje(lista)).toEqual([1, 0]);
  });
});

describe("destinosParaGuardar", () => {
  it("envía orden, noches y noches en viaje de un recorrido armado", () => {
    const lista = destinosParaGuardar([destino("A", 4, 1), destino("B", 4)], 9);

    expect(noches(lista)).toEqual([4, 4]);
    expect(enViaje(lista)).toEqual([1, 0]);
  });

  it("con un destino envía NULL", () => {
    expect(destinosParaGuardar([destino("A", 9)], 9)).toEqual([destino("A")]);
  });

  it("sin armar envía NULL", () => {
    expect(noches(destinosParaGuardar([destino("A"), destino("B", 3)], 9))).toEqual([null, null]);
  });

  it("en pocasNoches envía NULL solo si se guarda en ese modo", () => {
    const lista = [destino("A", 4, 1), destino("B", 4)];

    expect(noches(destinosParaGuardar(lista, 1))).toEqual([null, null]);
    expect(enViaje(destinosParaGuardar(lista, 1))).toEqual([0, 0]);
  });

  it("recupera los valores si las noches vuelven a alcanzar", () => {
    const lista = [destino("A", 4, 1), destino("B", 4)];

    expect(modoRecorrido(lista, 1)).toBe("pocasNoches");
    expect(modoRecorrido(lista, 9)).toBe("armado");
    expect(noches(destinosParaGuardar(lista, 9))).toEqual([4, 4]);
    expect(enViaje(destinosParaGuardar(lista, 9))).toEqual([1, 0]);
  });
});
