import { Platform } from "react-native";
import Constants from "expo-constants";

function isExpoGoAndroid() {
  return Platform.OS === "android" && Constants.appOwnership === "expo";
}

export function getPushAvailabilityReason() {
  if (Platform.OS === "web") return "unsupported_platform";
  if (isExpoGoAndroid()) return "expo_go_android";
  return null;
}

async function loadNotificationsModule() {
  return import("expo-notifications");
}

export async function configureForegroundNotifications() {
  if (getPushAvailabilityReason()) return null;

  const Notifications = await loadNotificationsModule();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  return Notifications;
}

export async function getExpoPushTokenForDevice() {
  const unavailableReason = getPushAvailabilityReason();
  if (unavailableReason) {
    return { token: null, reason: unavailableReason };
  }

  let Notifications;
  try {
    Notifications = await configureForegroundNotifications();
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message.includes("FirebaseApp") ||
      message.includes("Firebase Messaging") ||
      message.includes("googleServicesFile")
    ) {
      return { token: null, reason: "firebase_not_configured" };
    }
    throw error;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("cyanea-trips", {
      name: "Avisos de viajes",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return { token: null, reason: "permission_denied" };
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

  if (!projectId) {
    return { token: null, reason: "project_id_missing" };
  }

  let token;
  try {
    token = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message.includes("FirebaseApp") ||
      message.includes("Firebase Messaging") ||
      message.includes("googleServicesFile")
    ) {
      return { token: null, reason: "firebase_not_configured" };
    }
    throw error;
  }

  return {
    token: token.data,
    plataforma: Platform.OS,
    dispositivoId: Constants.sessionId ?? null,
  };
}
