jest.mock("../services/pushNotifications", () => ({
  configureForegroundNotifications: jest.fn(() => Promise.resolve(null)),
  getPushAvailabilityReason: jest.fn(() => "expo_go_android"),
}));

jest.mock("../services/api", () => ({
  getTripDetail: jest.fn(),
}));

import { resolveNotificationTarget } from "../services/notificationNavigation";

describe("notificationNavigation", () => {
  it("resuelve actividades al tab de itinerario", () => {
    expect(
      resolveNotificationTarget({ tripId: 12, eventType: "activity_reminder", activityId: 4 })
    ).toEqual(
      expect.objectContaining({ tripId: 12, initialTab: "itinerario", activityId: 4 })
    );
  });

  it("resuelve nuevos gastos al tab de gastos", () => {
    expect(
      resolveNotificationTarget({ tripId: 12, notificationType: "nuevo_gasto", expenseId: 9 })
    ).toEqual(
      expect.objectContaining({ tripId: 12, initialTab: "gastos", expenseId: 9 })
    );
  });

    it("resuelve gastos modificados al tab de gastos (US 79)", () => {
    expect(
      resolveNotificationTarget({ tripId: 12, eventType: "expense_updated", expenseId: 15 })
    ).toEqual(
      expect.objectContaining({ tripId: 12, initialTab: "gastos", expenseId: 15 })
    );
    expect(
      resolveNotificationTarget({ tripId: 12, notificationType: "gasto_modificado", expenseId: 15 })
    ).toEqual(expect.objectContaining({ initialTab: "gastos" }));
  });

  it("resuelve la liquidación actualizada al tab de gastos", () => {
    expect(
      resolveNotificationTarget({ tripId: 12, eventType: "settlement_updated" })
    ).toEqual(expect.objectContaining({ tripId: 12, initialTab: "gastos" }));
    expect(
      resolveNotificationTarget({ tripId: 12, notificationType: "liquidacion_actualizada" })
    ).toEqual(expect.objectContaining({ initialTab: "gastos" }));
  });

  it("resuelve votaciones al tab votar", () => {
    expect(
      resolveNotificationTarget({ tripId: 12, eventType: "voting_created", votingId: 3 })
    ).toEqual(
      expect.objectContaining({ tripId: 12, initialTab: "votar", votingId: 3 })
    );
  });

  it("resuelve las notificaciones de la lista de la app por su tipo", () => {
    const tab = (tipo) => resolveNotificationTarget({ viajeId: 12, tipo })?.initialTab;

    expect(tab("gasto_creado")).toBe("gastos");
    expect(tab("gasto_modificado")).toBe("gastos");
    expect(tab("liquidacion_actualizada")).toBe("gastos");
    expect(tab("actividad_creada")).toBe("itinerario");
    expect(tab("actividad_actualizada")).toBe("itinerario");
    expect(tab("actividad_eliminada")).toBe("itinerario");
    expect(tab("recordatorio_actividad")).toBe("itinerario");
    expect(tab("nueva_votacion")).toBe("votar");
    expect(tab("nuevo_administrador")).toBe("grupo");
    expect(tab("participante_salio")).toBe("grupo");
    expect(tab("viaje_actualizado")).toBe("resumen");
  });

  it("el push usa su eventType aunque el tipo sea otro", () => {
    expect(
      resolveNotificationTarget({ tripId: 12, tipo: "gasto_creado", eventType: "expense_created" })
    ).toEqual(expect.objectContaining({ tripId: 12, initialTab: "gastos" }));
  });

  it("una invitación cancelada no abre el viaje", () => {
    expect(resolveNotificationTarget({ viajeId: 12, tipo: "invitacion_cancelada" })).toBeNull();
  });

  it("ignora payloads sin viaje", () => {
    expect(resolveNotificationTarget({ eventType: "activity_reminder" })).toBeNull();
  });
});