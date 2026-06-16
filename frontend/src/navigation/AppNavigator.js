import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { FontAwesome6 } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, View } from "react-native";

import { useAuth } from "../context/AuthContext";
import MainTabs from "./MainTabs";
import CreateTripScreen from "../screens/CreateTripScreen";
import TripDetailScreen from "../screens/TripDetailScreen";
import LoginScreen from "../screens/LoginScreen";
import { colors } from "../theme/tokens";
import RegisterScreen from "../screens/RegisterScreen";
import EmailConfirmadoScreen from "../screens/EmailConfirmadoScreen";
import RegistrationSuccessScreen from "../screens/RegistrationSuccessScreen";

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
            options={({ navigation }) => ({
              title: "Nuevo Viaje",
              headerLeft: () => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.goBack()}
                  style={{ paddingLeft: 16, paddingRight: 10 }}
                >
                  <FontAwesome6
                    color={colors.surface}
                    name="arrow-left"
                    size={18}
                  />
                </Pressable>
              ),
            })}
          />
          {/* US-16: Detalle de viaje (activo y finalizado) */}
          <Stack.Screen
            name="TripDetail"
            component={TripDetailScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              animation: "slide_from_right",
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}