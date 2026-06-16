import React, { useEffect } from "react";
import { Alert } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";

import { AuthProvider } from "./src/context/AuthContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { colors } from "./src/theme/tokens";

import { inicializarBaseDeDatos } from "./src/database/database";
import { sincronizarGastosOffline } from "./src/database/gastosLocal";

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
    // 1. Inicializar la DB local al abrir la aplicación
    inicializarBaseDeDatos();

    // 2. Escuchar cambios de red con NetInfo
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const tieneInternet = state.isConnected && state.isInternetReachable;
      
      if (tieneInternet) {
        console.log("📡 Conexión recuperada. Intentando sincronizar gastos...");
        await sincronizarGastosOffline();
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style="light" />
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}