import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import {
  DefaultTheme,
  NavigationContainer,
  getStateFromPath as getStateFromPathPorDefecto,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { DialogHost } from "./src/components/ui/AppDialog";
import { colors } from "./src/theme/tokens";
import { injectWebFocusStyles } from "./src/theme/webFocusStyles";
import { instalarAjusteViewport } from "./src/utils/viewportWeb";

import { inicializarBaseDeDatos } from "./src/database/database";
import { sincronizarGastosOffline } from "./src/database/gastosLocal";
import { sincronizarOffline } from "./src/database/offlineViajes";
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

const PREFIJOS = [
  "cyanea://",
  "https://code-cyanea.fafafacultad.workers.dev",
  "http://127.0.0.1:8081",
  "http://localhost:8081",
];


const PANTALLAS = {
  Register: "registro",
  EmailConfirmado: "email-confirmado",
  ResendConfirmation: "reenviar-confirmacion",
  UnirseViaje: "unirse/:invitationToken",
  Invitaciones: "invitaciones/:token",
  ForgotPassword: "olvide-contrasena",
  ResetPassword: "restablecer-contrasena",
  SuscripcionEstado: "suscripcion/retorno",
  TripDetail: "viaje/:tripId",
  SugerenciasDia: "viaje/:tripId/sugerencias/:dayId",
};


function pantallasDebajo(ruta) {
  const debajo = [{ name: "Tabs" }];
  if (ruta.name === "SugerenciasDia" && ruta.params?.tripId != null) {
    debajo.push({ name: "TripDetail", params: { tripId: ruta.params.tripId } });
  }
  return debajo;
}

function PantallaCargando() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}


function Navegacion() {
  const { token, isLoading } = useAuth();
  const conSesionRef = useRef(Boolean(token));
  conSesionRef.current = Boolean(token);

  const linking = useMemo(
    () => ({
      prefixes: PREFIJOS,
      config: { screens: PANTALLAS },
      getStateFromPath(path, options) {
        const state = getStateFromPathPorDefecto(path, options);
        if (!conSesionRef.current || !state?.routes?.length) return state;
        if (state.routes[0].name === "Tabs") return state;
        const debajo = pantallasDebajo(state.routes[0]);
        return {
          ...state,
          index: debajo.length + state.routes.length - 1,
          routes: [...debajo, ...state.routes],
        };
      },
    }),
    []
  );

  if (isLoading) return <PantallaCargando />;

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      linking={linking}
      onReady={() => {
        SplashScreen.hideAsync().catch(() => {});
        flushPendingNotificationNavigation();
      }}
    >
      <StatusBar style="light" />
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    return instalarAjusteViewport();
  }, []);

  useEffect(() => {
    const splashFallback = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 1500);
    const notificationSubscription = subscribeNotificationResponses();

    inicializarBaseDeDatos();

    sincronizarGastosOffline();
    sincronizarOffline();

    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const tieneInternet = state.isConnected && state.isInternetReachable;

      if (tieneInternet) {
        console.log("📡 Conexión recuperada. Intentando sincronizar gastos...");
        await sincronizarGastosOffline();
        await sincronizarOffline();
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
        <Navegacion />
        <DialogHost root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}