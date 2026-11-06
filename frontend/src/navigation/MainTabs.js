import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import FloatingTabBar from "../components/navigation/FloatingTabBar";
import HomeScreen from "../screens/HomeScreen";
import MyTripsScreen from "../screens/MyTripsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import { colors } from "../theme/tokens";

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

const ICONOS = Object.fromEntries(tabs.map((tab) => [tab.name, tab.icon]));

export default function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} iconos={ICONOS} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
      }}
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