import React, { useEffect } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";

import { AuthProvider } from "./src/context/AuthContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { colors } from "./src/theme/tokens";
import { injectWebFocusStyles } from "./src/theme/webFocusStyles";

import { inicializarBaseDeDatos } from "./src/database/database";
import { sincronizarGastosOffline } from "./src/database/gastosLocal";
import {
  flushPendingNotificationNavigation,
  navigationRef,
  subscribeNotificationResponses,
} from "./src/services/notificationNavigation";

injectWebFocusStyles();
SplashScreen.preventAutoHideAsync().catch(() => {});

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    primary: colors.primary,
    text: colors.textPrimary,
    border: colors.border,
  },
};

export default function App() {
  useEffect(() => {
    const splashFallback = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 1500);
    const notificationSubscription = subscribeNotificationResponses();

    // 1. Inicializar la DB local al abrir la aplicación
    inicializarBaseDeDatos();

    sincronizarGastosOffline();

    // 2. Escuchar cambios de red con NetInfo
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const tieneInternet = state.isConnected && state.isInternetReachable;
      
      if (tieneInternet) {
        console.log("📡 Conexión recuperada. Intentando sincronizar gastos...");
        await sincronizarGastosOffline();
      }
    });

    return () => {
      clearTimeout(splashFallback);
      unsubscribe();
      notificationSubscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer
          ref={navigationRef}
          theme={navigationTheme}
          onReady={() => {
            SplashScreen.hideAsync().catch(() => {});
            flushPendingNotificationNavigation();
          }}
        >
          <StatusBar style="light" />
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
