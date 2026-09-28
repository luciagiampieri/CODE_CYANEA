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

  it("resuelve votaciones al tab votar", () => {
    expect(
      resolveNotificationTarget({ tripId: 12, eventType: "voting_created", votingId: 3 })
    ).toEqual(
      expect.objectContaining({ tripId: 12, initialTab: "votar", votingId: 3 })
    );
  });

  it("ignora payloads sin viaje", () => {
    expect(resolveNotificationTarget({ eventType: "activity_reminder" })).toBeNull();
  });
});
