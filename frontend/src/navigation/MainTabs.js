import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { FontAwesome6 } from "@expo/vector-icons";

import HomeScreen from "../screens/HomeScreen";
import PlaceholderScreen from "../screens/PlaceholderScreen";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

const Tab = createBottomTabNavigator();

const tabs = [
  {
    name: "Inicio",
    component: HomeScreen,
    icon: "house",
  },
  {
    name: "Historial",
    component: PlaceholderScreen,
    icon: "clock-rotate-left",
    params: {
      title: "Historial",
      message: "Viajes pasados, acciones recientes y movimientos del grupo.",
    },
  },
  {
    name: "Explorar",
    component: PlaceholderScreen,
    icon: "location-dot",
    params: {
      title: "Explorar",
      message: "Espacio reservado para ideas, destinos y descubrimientos.",
    },
  },
  {
    name: "Perfil",
    component: PlaceholderScreen,
    icon: "user",
    params: {
      title: "Perfil",
      message: "Perfil y preferencias del usuario en una próxima iteración.",
    },
  },
];

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          position: "absolute",
          left: spacing.md,
          right: spacing.md,
          bottom: spacing.md,
          height: 74,
          paddingTop: 10,
          paddingBottom: 12,
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          borderRadius: radii.lg,
          shadowColor: colors.shadow,
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 10,
        },
        sceneStyle: {
          backgroundColor: colors.background,
        },
        tabBarLabelStyle: {
          ...textStyles.nav,
          marginTop: 2,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const currentTab = tabs.find((tab) => tab.name === route.name);
          return (
            <FontAwesome6
              color={color}
              name={currentTab.icon}
              size={focused ? size + 1 : size}
            />
          );
        },
      })}
    >
      {tabs.map((tab) => (
        <Tab.Screen
          key={tab.name}
          component={tab.component}
          initialParams={tab.params}
          name={tab.name}
          options={{
            title: "Cyanea",
            tabBarLabel: tab.name,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
