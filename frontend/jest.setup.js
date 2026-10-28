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

// Los tests no necesitan cargar fuentes reales. Sin este mock, los íconos de
// @expo/vector-icons intentan cargar su fuente al montarse y, desde el SDK 58,
// fallan con "Module X is missing from the asset registry".
jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return {
    ...actual,
    isLoaded: jest.fn(() => true),
    loadAsync: jest.fn(() => Promise.resolve()),
    useFonts: jest.fn(() => [true, null]),
  };
});