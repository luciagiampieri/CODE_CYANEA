import { resolveNotificationTarget } from "../utils/notificationTarget";

it("abre Grupo desde la incorporación por enlace", () => {
  expect(resolveNotificationTarget({ tripId: 12, eventType: "member_joined" })).toMatchObject({ tripId: 12, initialTab: "grupo" });
});

it("abre Grupo desde el push de transferencia de administración", () => {
  expect(resolveNotificationTarget({ tripId: 12, eventType: "administration_transferred", notificationType: "cambio_viaje" }))
    .toMatchObject({ tripId: 12, initialTab: "grupo" });
});

it("abre Grupo desde la notificación interna del nuevo administrador", () => {
  expect(resolveNotificationTarget({ viajeId: 12, tipo: "nuevo_administrador" }))
    .toMatchObject({ tripId: 12, initialTab: "grupo" });
});
