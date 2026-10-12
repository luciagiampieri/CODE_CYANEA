import { createNavigationContainerRef } from "@react-navigation/native";
import { getTripDetail } from "./api";
import { configureForegroundNotifications, getPushAvailabilityReason } from "./pushNotifications";
import { resolveNotificationTarget } from "../utils/notificationTarget";

export const navigationRef = createNavigationContainerRef();
let pendingNotificationData = null;

export { resolveNotificationTarget };

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