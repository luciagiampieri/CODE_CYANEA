import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View } from "react-native";
import { Feather } from "@expo/vector-icons";

import HomeScreen from "../screens/HomeScreen";
import MyTripsScreen from "../screens/MyTripsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import { colors, radii, spacing, textStyles } from "../theme/tokens";

const Tab = createBottomTabNavigator();

const tabs = [
  {
    name: "Inicio",
    component: HomeScreen,
    icon: "home",
  },
  {
    name: "Mis Viajes",
    component: MyTripsScreen,
    icon: "briefcase",
  },
  {
    name: "Perfil",
    component: ProfileScreen,
    icon: "user",
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
          height: 74,
          paddingTop: 10,
          paddingBottom: 12,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          shadowColor: colors.shadow,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
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
            <View
              style={[
                {
                  width: 44,
                  height: 32,
                  borderRadius: radii.pill,
                  alignItems: "center",
                  justifyContent: "center",
                },
                focused && { backgroundColor: "rgba(30, 62, 123, 0.12)" },
              ]}
            >
              <Feather
                color={color}
                name={currentTab.icon}
                size={focused ? size + 1 : size}
              />
            </View>
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