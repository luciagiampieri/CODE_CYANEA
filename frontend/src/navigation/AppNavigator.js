import { createNativeStackNavigator } from "@react-navigation/native-stack";
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
import CrearVotacionScreen from "../screens/CrearVotacionScreen";
import FacebookRegisterScreen from "../screens/FacebookRegisterScreen";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { token, isLoading } = useAuth();

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
            name="FacebookRegister"
            component={FacebookRegisterScreen}
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
            name="TripDetail"
            component={TripDetailScreen}
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
            name="Invitaciones"
            component={InvitationsScreen}
            options={{
              title: "Invitaciones",
              headerShown: false,
            }}
          />
        </>
      )}
      
    </Stack.Navigator>
  );
}