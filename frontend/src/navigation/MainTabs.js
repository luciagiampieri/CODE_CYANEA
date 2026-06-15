import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { FontAwesome6 } from "@expo/vector-icons";

import HomeScreen from "../screens/HomeScreen";
import PlaceholderScreen from "../screens/PlaceholderScreen";
import { colors } from "../theme/tokens";

const Tab = createBottomTabNavigator();

const tabs = [
  {
    name: "Viajes",
    component: HomeScreen,
    icon: "route"
  },
  {
    name: "Explorar",
    component: PlaceholderScreen,
    icon: "magnifying-glass",
    params: {
      title: "Explorar",
      message: "Espacio reservado para destinos, ideas y descubrimientos."
    }
  },
  {
    name: "Itinerarios",
    component: PlaceholderScreen,
    icon: "list-check",
    params: {
      title: "Itinerarios",
      message: "La agenda detallada del viaje se integrara en esta seccion."
    }
  },
  {
    name: "Guardados",
    component: PlaceholderScreen,
    icon: "bookmark",
    params: {
      title: "Guardados",
      message: "Aqui podran quedar destinos, alojamientos o ideas favoritas."
    }
  },
  {
    name: "Perfil",
    component: PlaceholderScreen,
    icon: "user",
    params: {
      title: "Perfil",
      message: "Perfil y preferencias del usuario en una proxima iteracion."
    }
  }
];

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: colors.surface,
          borderTopColor: colors.border
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700"
        },
        tabBarIcon: ({ color, size }) => {
          const currentTab = tabs.find((tab) => tab.name === route.name);
          return <FontAwesome6 color={color} name={currentTab.icon} size={size} />;
        }
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
            tabBarLabel: tab.name
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
