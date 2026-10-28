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