import React, { useEffect } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";

import { AuthProvider } from "./src/context/AuthContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { DialogHost } from "./src/components/ui/AppDialog";
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

const linkingConfig = {
  prefixes: ["cyanea://", "http://127.0.0.1:8081", "http://localhost:8081"],
  config: {
    screens: {
      EmailConfirmado: "email-confirmado",
      Invitaciones: "invitaciones/:token",
      ForgotPassword: "olvide-contrasena",
      ResetPassword: "restablecer-contrasena",
    },
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
          linking={linkingConfig}
          onReady={() => {
            SplashScreen.hideAsync().catch(() => {});
            flushPendingNotificationNavigation();
          }}
        >
          <StatusBar style="light" />
          <AppNavigator />
        </NavigationContainer>
        {/* Diálogo estándar para appAlert(): va después del navegador para quedar arriba */}
        <DialogHost root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}