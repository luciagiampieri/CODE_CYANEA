import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { FontAwesome6 } from "@expo/vector-icons";
import { Pressable } from "react-native";

import MainTabs from "./MainTabs";
import CreateTripScreen from "../screens/CreateTripScreen";
import { colors } from "../theme/tokens";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.primary
        },
        headerTintColor: colors.surface,
        headerTitleStyle: {
          fontWeight: "800"
        },
        contentStyle: {
          backgroundColor: colors.background
        }
      }}
    >
      <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="NuevoViaje"
        component={CreateTripScreen}
        options={({ navigation }) => ({
          title: "Nuevo Viaje",
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.goBack()}
              style={{
                  paddingLeft: 16,
                  paddingRight: 10
                }}            >
              <FontAwesome6 color={colors.surface} name="arrow-left" size={18} />
            </Pressable>
          )
        })}
      />
    </Stack.Navigator>
  );
}
