import {
  getInfoEditableUntil,
  getTripLock,
  isTripFinished,
  isTripFinishedError,
} from "../utils/tripLock";

const HOY = new Date("2026-09-16T10:00:00");

describe("isTripFinished", () => {
  test("usa el estado del backend cuando viene", () => {
    expect(isTripFinished({ status: "finalizado", endDate: "2099-01-01" }, HOY)).toBe(true);
    // El backend es la fuente de verdad: si dice activo, está activo.
    expect(isTripFinished({ status: "activo", endDate: "2020-01-01" }, HOY)).toBe(false);
    expect(isTripFinished({ status: "cancelado", endDate: "2020-01-01" }, HOY)).toBe(false);
  });

  test("sin estado, compara la fecha de fin: el último día todavía no terminó", () => {
    expect(isTripFinished({ endDate: "2026-09-16" }, HOY)).toBe(false);
    expect(isTripFinished({ endDate: "2026-09-15" }, HOY)).toBe(true);
    expect(isTripFinished({ endDate: "" }, HOY)).toBe(false);
    expect(isTripFinished(null, HOY)).toBe(false);
  });
});

describe("getTripLock", () => {
  test("viaje activo: todo editable y sin candados", () => {
    const lock = getTripLock({ status: "activo" }, HOY);
    expect(lock.readOnly).toBe(false);
    ["itinerario", "participantes", "checklist", "votaciones", "documentos", "gastos"].forEach(
      (section) => expect(lock.canEdit(section)).toBe(true)
    );
    expect(lock.isTabLocked("itinerario")).toBe(false);
  });

  test("viaje finalizado: solo Gastos sigue editable", () => {
    const lock = getTripLock({ status: "finalizado", endDate: "2026-09-10" }, HOY);
    expect(lock.isFinished).toBe(true);
    expect(lock.readOnly).toBe(true);
    expect(lock.canEdit("gastos")).toBe(true);
    ["itinerario", "participantes", "checklist", "votaciones", "documentos"].forEach((section) =>
      expect(lock.canEdit(section)).toBe(false)
    );
    expect(lock.endDateLabel).toBe("10 de septiembre");
  });

  test("viaje finalizado: candado en las pestañas bloqueadas, no en Resumen ni Gastos", () => {
    const lock = getTripLock({ status: "finalizado" }, HOY);
    ["itinerario", "docs", "checklist", "votar", "grupo"].forEach((tab) =>
      expect(lock.isTabLocked(tab)).toBe(true)
    );
    expect(lock.isTabLocked("resumen")).toBe(false);
    expect(lock.isTabLocked("gastos")).toBe(false);
  });

  test("si el usuario dejó el viaje, nada es editable (ni Gastos) y no se muestran candados", () => {
    const lock = getTripLock({ status: "finalizado", hasLeft: true }, HOY);
    expect(lock.canEdit("gastos")).toBe(false);
    expect(lock.canEdit("itinerario")).toBe(false);
    expect(lock.isTabLocked("itinerario")).toBe(false);
  });

  test("sin viaje cargado no se puede editar nada", () => {
    expect(getTripLock(null, HOY).canEdit("gastos")).toBe(false);
  });
});

describe("isTripFinishedError", () => {
  test("reconoce el código o, si no llegó el header, el 409 con el mensaje", () => {
    expect(isTripFinishedError({ code: "TRIP_FINISHED" })).toBe(true);
    expect(
      isTripFinishedError({ status: 409, message: "El viaje ya finalizó: la checklist no se puede modificar." })
    ).toBe(true);
    expect(isTripFinishedError({ status: 409, message: "Otro conflicto" })).toBe(false);
    expect(isTripFinishedError(null)).toBe(false);
  });
});

describe("plazo para editar los datos del viaje", () => {
  test("usa infoEditableUntil del backend, inclusive el último día", () => {
    const trip = { status: "finalizado", endDate: "2026-09-01", infoEditableUntil: "2026-09-16" };
    expect(getTripLock(trip, HOY).canEdit("viaje")).toBe(true);
    expect(getTripLock(trip, new Date("2026-09-17T09:00:00")).canEdit("viaje")).toBe(false);
    expect(getTripLock(trip, HOY).infoEditableUntilLabel).toBe("16 de septiembre");
  });

  test("un viaje finalizado dentro del mes sigue permitiendo editar sus datos, no el resto", () => {
    const lock = getTripLock({ status: "finalizado", endDate: "2026-09-10" }, HOY);
    expect(lock.canEdit("viaje")).toBe(true);
    expect(lock.canEdit("itinerario")).toBe(false);
  });

  test("sin infoEditableUntil calcula fin + 1 mes, ajustando meses cortos", () => {
    const trip = { status: "finalizado", endDate: "2027-01-31" };
    expect(getInfoEditableUntil(trip).toDateString()).toBe(new Date(2027, 1, 28).toDateString());
    expect(getTripLock(trip, new Date("2027-02-28T12:00:00")).canEdit("viaje")).toBe(true);
    expect(getTripLock(trip, new Date("2027-03-01T12:00:00")).canEdit("viaje")).toBe(false);

    const diciembre = { status: "finalizado", endDate: "2026-12-31" };
    expect(getInfoEditableUntil(diciembre).toDateString()).toBe(new Date(2027, 0, 31).toDateString());
  });

  test("quien dejó el viaje no puede editar sus datos", () => {
    const trip = { status: "activo", hasLeft: true, infoEditableUntil: "2099-01-01" };
    expect(getTripLock(trip, HOY).canEdit("viaje")).toBe(false);
  });
});