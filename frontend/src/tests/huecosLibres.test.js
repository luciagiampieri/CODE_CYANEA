import {
  aHora,
  aMinutos,
  acotarFranja,
  calcularHuecosLibres,
  primerHuecoLibre,
} from "../utils/huecosLibres";

function actividad(horaInicio, horaFin) {
  return { horaInicio, horaFin };
}

describe("aMinutos", () => {
  it.each([
    ["09:30", 570],
    ["09:30:00", 570],
    ["00:00", 0],
    ["23:59", 1439],
    [null, null],
    ["", null],
    [undefined, null],
    ["abc", null],
    ["9", null],
  ])("convierte %p en %p", (entrada, esperado) => {
    expect(aMinutos(entrada)).toBe(esperado);
  });
});

describe("aHora", () => {
  it.each([
    [570, "09:30"],
    [0, "00:00"],
    [65, "01:05"],
    [-10, "00:00"],
    [2000, "23:59"],
  ])("convierte %p en %p", (minutos, esperado) => {
    expect(aHora(minutos)).toBe(esperado);
  });
});

describe("calcularHuecosLibres", () => {
  it("sin actividades devuelve el día completo", () => {
    expect(calcularHuecosLibres([])).toEqual([{ desde: "09:00", hasta: "23:00", minutos: 840 }]);
    expect(calcularHuecosLibres(null)).toEqual([{ desde: "09:00", hasta: "23:00", minutos: 840 }]);
  });

  it("ordena las actividades y detecta los huecos entre ellas", () => {
    const huecos = calcularHuecosLibres([actividad("14:00", "16:00"), actividad("10:00", "12:00")]);

    expect(huecos).toEqual([
      { desde: "09:00", hasta: "10:00", minutos: 60 },
      { desde: "12:00", hasta: "14:00", minutos: 120 },
      { desde: "16:00", hasta: "23:00", minutos: 420 },
    ]);
  });

  it("ignora los huecos más cortos que el mínimo", () => {
    const huecos = calcularHuecosLibres([actividad("09:30", "12:00")]);

    expect(huecos).toEqual([{ desde: "12:00", hasta: "23:00", minutos: 660 }]);
  });

  it("no genera huecos falsos con actividades superpuestas", () => {
    const huecos = calcularHuecosLibres([actividad("10:00", "13:00"), actividad("11:00", "12:00")]);

    expect(huecos).toEqual([
      { desde: "09:00", hasta: "10:00", minutos: 60 },
      { desde: "13:00", hasta: "23:00", minutos: 600 },
    ]);
  });

  it("descarta actividades sin horario o con horario inválido", () => {
    const huecos = calcularHuecosLibres([
      actividad(null, "12:00"),
      actividad("12:00", "11:00"),
      actividad("10:00", "10:00"),
    ]);

    expect(huecos).toEqual([{ desde: "09:00", hasta: "23:00", minutos: 840 }]);
  });

  it("corta en el fin del día aunque una actividad termine después", () => {
    const huecos = calcularHuecosLibres([actividad("22:30", "23:30")]);

    expect(huecos).toEqual([{ desde: "09:00", hasta: "22:30", minutos: 810 }]);
  });

  it("respeta el inicio, el fin y el mínimo personalizados", () => {
    const huecos = calcularHuecosLibres([actividad("09:00", "11:30")], {
      inicioDia: "08:00",
      finDia: "12:00",
      minimo: 30,
    });

    expect(huecos).toEqual([
      { desde: "08:00", hasta: "09:00", minutos: 60 },
      { desde: "11:30", hasta: "12:00", minutos: 30 },
    ]);
  });

  it("un día completo no tiene huecos", () => {
    expect(calcularHuecosLibres([actividad("09:00", "23:00")])).toEqual([]);
  });
});

describe("acotarFranja", () => {
  it("devuelve null sin franja", () => {
    expect(acotarFranja(null)).toBeNull();
  });

  it("acota una franja larga a 4 horas", () => {
    expect(acotarFranja({ inicio: "09:00", fin: "23:00" })).toEqual({ inicio: "09:00", fin: "13:00" });
  });

  it("deja igual una franja corta", () => {
    expect(acotarFranja({ inicio: "10:00", fin: "11:00" })).toEqual({ inicio: "10:00", fin: "11:00" });
  });

  it("acepta un máximo personalizado", () => {
    expect(acotarFranja({ inicio: "10:00", fin: "12:00" }, 30)).toEqual({ inicio: "10:00", fin: "10:30" });
  });

  it("devuelve la misma franja si los horarios no son válidos", () => {
    const franja = { inicio: "x", fin: "y" };

    expect(acotarFranja(franja)).toBe(franja);
  });
});

describe("primerHuecoLibre", () => {
  it("sin actividades sugiere desde el inicio del día, acotado a 4 horas", () => {
    expect(primerHuecoLibre([])).toEqual({ inicio: "09:00", fin: "13:00" });
  });

  it("devuelve null si el día está completo", () => {
    expect(primerHuecoLibre([actividad("09:00", "23:00")])).toBeNull();
  });

  it("usa las opciones recibidas", () => {
    expect(primerHuecoLibre([actividad("09:00", "10:00")], { finDia: "11:00" })).toEqual({
      inicio: "10:00",
      fin: "11:00",
    });
  });
});