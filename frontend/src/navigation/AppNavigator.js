import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect } from "react";
import JoinTripScreen from "../screens/JoinTripScreen";
import { navigationRef } from "../services/notificationNavigation";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../context/AuthContext";
import MainTabs from "./MainTabs";
import CreateTripScreen from "../screens/CreateTripScreen";
import EditTripScreen from "../screens/EditTripScreen";
import LoginScreen from "../screens/LoginScreen";
import { colors } from "../theme/tokens";
import RegisterScreen from "../screens/RegisterScreen";
import EmailConfirmadoScreen from "../screens/EmailConfirmadoScreen";
import RegistrationSuccessScreen from "../screens/RegistrationSuccessScreen";
import TripDetailScreen from "../screens/TripDetailScreen";
import AddGastoScreen from "../screens/AddGastoScreen";
import InvitationsScreen from "../screens/InvitationsScreen";
import CrearVotacionScreen from "../screens/CreateVotationScreen.js";
import FacebookRegisterScreen from "../screens/FacebookRegisterScreen";
import GoogleRegisterScreen from "../screens/GoogleRegisterScreen";
import DocumentsScreen from "../screens/DocumentsScreen";
import GuardarInformacionScreen from "../screens/InformationScreen";
import ExplorePlacesScreen from "../screens/ExplorePlacesScreen";
import DaySuggestionsScreen from "../screens/DaySuggestionsScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import SettingsScreen from "../screens/SettingScreen";
import EditDocumentScreen from "../screens/EditDocumentScreen";
import NotificationPreferencesScreen from "../screens/NotificationPreferencesScreen";
import PrivacyPreferencesScreen from "../screens/PrivacyPreferencesScreen";
import ChangePasswordScreen from "../screens/ChangePasswordScreen";
import PlanningPreferencesListScreen from "../screens/PlanningPreferencesListScreen";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import ResendConfirmationScreen from "../screens/ResendConfirmationScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import TermsAcceptanceGate from "../components/legal/TermsAcceptanceGate";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { token, isLoading, pendingInvitation } = useAuth();
  useEffect(() => {
    if (!token || isLoading || !pendingInvitation) return undefined;
    const resume = () => {
      if (!navigationRef.isReady()) return false;
      if (navigationRef.getCurrentRoute()?.name !== "UnirseViaje") {
        navigationRef.navigate("UnirseViaje", { invitationToken: pendingInvitation });
      }
      return true;
    };
    const timer = setInterval(() => { if (resume()) clearInterval(timer); }, 100);
    return () => clearInterval(timer);
  }, [token, isLoading, pendingInvitation]);

  if (isLoading) {
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

  return (
    <TermsAcceptanceGate>
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: "800" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {!token ? (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="FacebookRegister"
            component={FacebookRegisterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="GoogleRegister"
            component={GoogleRegisterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="RegistrationSuccess"
            component={RegistrationSuccessScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EmailConfirmado"
            component={EmailConfirmadoScreen}
            options={{ headerShown: false }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="Tabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="NuevoViaje"
            component={CreateTripScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EditarViaje"
            component={EditTripScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="EditarPerfil"
            component={EditProfileScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="Configuracion"
            component={SettingsScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="CambiarPassword"
            component={ChangePasswordScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="TripDetail"
            component={TripDetailScreen}
            getId={({ params }) => {
              const id = params?.trip?.id ?? params?.trip?.IdViaje;
              return id != null ? String(id) : undefined;
            }}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="Documents"
            component={DocumentsScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="EditDocument"
            component={EditDocumentScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="ExplorePlaces"
            component={ExplorePlacesScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="SugerenciasDia"
            component={DaySuggestionsScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="AddGasto"
            component={AddGastoScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="CrearVotacion"
            component={CrearVotacionScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="GuardarInformacion"
            component={GuardarInformacionScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="Invitaciones"
            component={InvitationsScreen}
            options={{
              title: "Invitaciones",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="PreferenciasNotificaciones"
            component={NotificationPreferencesScreen}
            options={{
              title: "Notificaciones",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="PreferenciasPrivacidad"
            component={PrivacyPreferencesScreen}
            options={{
              title: "Privacidad",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="PreferenciasPlanificacion"
            component={PlanningPreferencesListScreen}
            options={{
              title: "Planificación de viajes",
              headerShown: false,
            }}
          />
        </>
      )}

      <Stack.Screen name="UnirseViaje" component={JoinTripScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ResendConfirmation" component={ResendConfirmationScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
    </TermsAcceptanceGate>
  );
}