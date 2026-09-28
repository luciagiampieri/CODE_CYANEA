import { createNavigationContainerRef } from "@react-navigation/native";
import { getTripDetail } from "./api";
import { configureForegroundNotifications, getPushAvailabilityReason } from "./pushNotifications";

export const navigationRef = createNavigationContainerRef();
let pendingNotificationData = null;

export function resolveNotificationTarget(data = {}) {
  const tripId = data.tripId ?? data.idViaje ?? data.IdViaje;
  if (!tripId) return null;

  const eventType = data.eventType ?? data.tipo;
  const notificationType = data.notificationType;
  let initialTab = "resumen";

  if (
    [
      "activity_created",
      "activity_updated",
      "activity_deleted",
      "activity_reminder",
    ].includes(eventType)
  ) {
    initialTab = "itinerario";
  } else if (eventType === "expense_created" || notificationType === "nuevo_gasto") {
    initialTab = "gastos";
  } else if (eventType === "voting_created" || notificationType === "nueva_votacion") {
    initialTab = "votar";
  }

  return {
    tripId,
    initialTab,
    activityId: data.activityId,
    dayId: data.dayId,
    expenseId: data.expenseId,
    votingId: data.votingId,
  };
}

export async function openNotificationTarget(data) {
  const target = resolveNotificationTarget(data);
  if (!target) return false;

  if (!navigationRef.isReady()) {
    pendingNotificationData = data;
    return false;
  }

  const trip = await getTripDetail(target.tripId);
  navigationRef.navigate("TripDetail", {
    trip,
    initialTab: target.initialTab,
    notificationTarget: target,
  });
  return true;
}

export async function flushPendingNotificationNavigation() {
  if (!pendingNotificationData || !navigationRef.isReady()) return false;
  const data = pendingNotificationData;
  pendingNotificationData = null;
  return openNotificationTarget(data);
}

export async function handleNotificationResponse(response) {
  const data = response?.notification?.request?.content?.data ?? {};
  return openNotificationTarget(data);
}

export function subscribeNotificationResponses() {
  if (getPushAvailabilityReason()) {
    return { remove: () => {} };
  }

  let subscription = { remove: () => {} };

  configureForegroundNotifications()
    .then((Notifications) => {
      if (!Notifications) return;

      subscription = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          handleNotificationResponse(response).catch((error) => {
            console.warn("No se pudo abrir la notificacion", error);
          });
        }
      );

      return Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) return handleNotificationResponse(response);
          return false;
        })
        .catch((error) => {
          console.warn("No se pudo procesar la notificacion inicial", error);
        });
    })
    .catch((error) => {
      console.warn("No se pudo inicializar notificaciones push", error);
    });

  return {
    remove: () => subscription.remove(),
  };
}
