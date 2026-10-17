import { render, waitFor } from "@testing-library/react-native";
import { NavigationContainer } from "@react-navigation/native";
import { navigationRef } from "../services/notificationNavigation";

import AppNavigator from "../navigation/AppNavigator";

jest.mock("../context/AuthContext", () => ({
  useAuth: jest.fn(),
}));

const { useAuth } = require("../context/AuthContext");

// Mock de LoginScreen
jest.mock("../screens/LoginScreen", () => {
  const React = require("react");
  const { Text } = require("react-native");

  return function LoginScreen() {
    return React.createElement(Text, null, "Inicio de sesión");
  };
});

// Mock de MainTabs
jest.mock("../navigation/MainTabs", () => {
  const React = require("react");
  const { Text } = require("react-native");

  return function MainTabs() {
    return React.createElement(Text, null, "Gestión de viajes");
  };
});

// Mock del resto de pantallas
jest.mock("../screens/CreateTripScreen", () => () => null);
jest.mock("../screens/EditTripScreen", () => () => null);
jest.mock("../screens/EditProfileScreen", () => () => null);
jest.mock("../screens/SettingScreen", () => () => null);
jest.mock("../screens/TripDetailScreen", () => () => null);
jest.mock("../screens/DocumentsScreen", () => () => null);
jest.mock("../screens/ExplorePlacesScreen", () => () => null);
jest.mock("../screens/AddGastoScreen", () => () => null);
jest.mock("../screens/CreateVotationScreen", () => () => null);
jest.mock("../screens/InformationScreen", () => () => null);
jest.mock("../screens/InvitationsScreen", () => () => null);
jest.mock("../screens/RegisterScreen", () => () => null);
jest.mock("../screens/FacebookRegisterScreen", () => () => null);
jest.mock("../screens/GoogleRegisterScreen", () => () => null);
jest.mock("../screens/RegistrationSuccessScreen", () => () => null);
jest.mock("../screens/EmailConfirmadoScreen", () => () => null);
jest.mock("../screens/JoinTripScreen", () => ({ route }) => {
  const { Text } = require("react-native");
  return <Text>Invitación compartida: {route?.params?.invitationToken}</Text>;
});

describe("US 07 - Cerrar sesión - AppNavigator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redirige al inicio de sesión e impide acceder a funcionalidades autenticadas sin sesión", async () => {
    useAuth.mockReturnValue({
      token: null,
      isLoading: false,
      logout: jest.fn(),
    });

    const { getByText, queryByText } = await render(
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    );

    expect(getByText("Inicio de sesión")).toBeTruthy();
    expect(queryByText("Gestión de viajes")).toBeNull();
  });

  it("el enlace puede abrirse sin sesión", async () => {
    useAuth.mockReturnValue({ token: null, isLoading: false });
    const utils = await render(
      <NavigationContainer initialState={{ routes: [{ name: "UnirseViaje", params: { invitationToken: "shared-token" } }] }}>
        <AppNavigator />
      </NavigationContainer>
    );
    expect(await utils.findByText("Invitación compartida: shared-token")).toBeTruthy();
  });

  it("al iniciar sesión retoma la invitación pendiente en vez de perderla", async () => {
    useAuth.mockReturnValue({ token: null, isLoading: false, pendingInvitation: "shared-token" });
    const tree = <NavigationContainer ref={navigationRef}><AppNavigator /></NavigationContainer>;
    const utils = await render(tree);
    expect(utils.getByText("Inicio de sesión")).toBeTruthy();
    useAuth.mockReturnValue({ token: "auth", isLoading: false, pendingInvitation: "shared-token" });
    await utils.rerender(<NavigationContainer ref={navigationRef}><AppNavigator /></NavigationContainer>);
    await waitFor(() => expect(utils.getByText("Invitación compartida: shared-token")).toBeTruthy());
  });
});
