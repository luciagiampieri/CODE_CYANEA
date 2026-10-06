import { getNextTripId, getTripBadges, getTripPhase, toDayKey } from "../utils/tripPhase";

const HOY = "2026-10-06";

describe("utils/tripPhase", () => {
  it("un viaje que termina hoy sigue en curso (el último día cuenta)", () => {
    expect(getTripPhase({ startDate: "2026-10-01", endDate: "2026-10-06" }, HOY)).toBe("en_curso");
  });

  it("un viaje que empieza hoy está en curso", () => {
    expect(getTripPhase({ startDate: "2026-10-06", endDate: "2026-10-10" }, HOY)).toBe("en_curso");
  });

  it("un viaje que empieza mañana es próximo", () => {
    expect(getTripPhase({ startDate: "2026-10-07", endDate: "2026-10-10" }, HOY)).toBe("proximo");
  });

  it("un viaje que terminó ayer es pasado", () => {
    expect(getTripPhase({ startDate: "2026-10-01", endDate: "2026-10-05" }, HOY)).toBe("pasado");
  });

  it("abandonado o finalizado/cancelado por el backend es pasado aunque las fechas digan otra cosa", () => {
    const futuro = { startDate: "2026-12-01", endDate: "2026-12-10" };
    expect(getTripPhase({ ...futuro, hasLeft: true }, HOY)).toBe("pasado");
    expect(getTripPhase({ ...futuro, status: "Cancelado" }, HOY)).toBe("pasado");
    expect(getTripPhase({ ...futuro, status: "finalizado" }, HOY)).toBe("pasado");
  });

  it("acepta fechas con hora y Dates locales sin correrse de día", () => {
    expect(toDayKey("2026-10-06T00:00:00")).toBe("2026-10-06");
    expect(toDayKey(new Date(2026, 9, 6, 23, 30))).toBe("2026-10-06");
  });

  it("de noche (después de las 21 hs) no cambia la fase por la diferencia con UTC", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 6, 23, 30)); // 6/10 23:30 local
    try {
      expect(getTripPhase({ startDate: "2026-10-01", endDate: "2026-10-06" })).toBe("en_curso");
      expect(getTripPhase({ startDate: "2026-10-07", endDate: "2026-10-09" })).toBe("proximo");
    } finally {
      jest.useRealTimers();
    }
  });

  it("el badge 'Próximo' va solo al próximo viaje que arranca primero", () => {
    const trips = [
      { id: 1, startDate: "2026-11-01", endDate: "2026-11-05" },
      { id: 2, startDate: "2026-10-20", endDate: "2026-10-22" },
      { id: 3, startDate: "2026-10-01", endDate: "2026-10-10" }, // en curso
    ];
    expect(getNextTripId(trips, HOY)).toBe(2);
  });

  it("los badges son los mismos para Home y Mis viajes", () => {
    expect(getTripBadges({ phase: "en_curso" })).toEqual([{ tone: "activo", label: "En curso" }]);
    expect(getTripBadges({ phase: "proximo", isNext: true }).map((b) => b.label)).toEqual([
      "Próximo",
      "Planificando",
    ]);
    expect(getTripBadges({ phase: "proximo" }).map((b) => b.label)).toEqual(["Planificando"]);
    expect(getTripBadges({ phase: "pasado" }).map((b) => b.label)).toEqual(["Finalizado"]);
    expect(getTripBadges({ phase: "proximo", hasLeft: true }).map((b) => b.label)).toEqual(["Saliste"]);
  });
});