jest.mock("@react-native-community/netinfo", () => {
  const estado = { isConnected: true, isInternetReachable: true, type: "wifi" };
  const fetch = jest.fn(() => Promise.resolve(estado));
  const addEventListener = jest.fn(() => jest.fn());
  const useNetInfo = jest.fn(() => estado);
  return {
    __esModule: true,
    default: { fetch, addEventListener, useNetInfo },
    fetch,
    addEventListener,
    useNetInfo,
  };
});

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  })),
}));


jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return {
    ...actual,
    isLoaded: jest.fn(() => true),
    loadAsync: jest.fn(() => Promise.resolve()),
    useFonts: jest.fn(() => [true, null]),
  };
});

jest.mock("@react-navigation/bottom-tabs", () => {
  const React = require("react");
  const BottomTabBarHeightContext = React.createContext(undefined);
  const Navigator = ({ children }) => React.createElement(React.Fragment, null, children);
  const Screen = () => null;

  return {
    BottomTabBarHeightContext,
    createBottomTabNavigator: jest.fn(() => ({ Navigator, Screen })),
  };
});

jest.mock("./src/components/profile/MapaPaises", () => ({
  __esModule: true,
  default: () => null,
  banderaDe: () => null,
}));


jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);