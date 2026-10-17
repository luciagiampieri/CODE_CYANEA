import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import JoinTripScreen from "../screens/JoinTripScreen";
import TripInvitationLink from "../components/trip/TripInvitationLink";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import * as Clipboard from "expo-clipboard";

jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@expo/vector-icons", () => ({ FontAwesome6: () => null }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("../services/api", () => ({
  previewSharedInvitation: jest.fn(), joinTripByLink: jest.fn(), getTripDetail: jest.fn(),
  getTripInvitationLink: jest.fn(), createTripInvitationLink: jest.fn(), revokeTripInvitationLink: jest.fn(),
}));

const rememberInvitation = jest.fn();
const navigation = { navigate: jest.fn(), replace: jest.fn() };
const invitationToken = "test-invitation-token";
const preview = { titulo: "Viaje compartido", administrador: "organizador", destinos: ["Córdoba"], fechaInicio: "2099-12-01", fechaFin: "2099-12-10" };
const route = { params: { invitationToken } };
const link = { activo: true, url: "https://cyanea.test/unirse/token", fechaVencimiento: "2099-12-01T00:00:00Z" };

beforeEach(() => {
  jest.resetAllMocks();
  useAuth.mockReturnValue({ token: null, user: null, pendingInvitation: null, rememberInvitation });
  rememberInvitation.mockResolvedValue();
  api.previewSharedInvitation.mockResolvedValue(preview);
  api.joinTripByLink.mockResolvedValue({ idViaje: 12, message: "Te uniste" });
  api.getTripDetail.mockResolvedValue({ id: 12, title: "Viaje compartido" });
  api.getTripInvitationLink.mockResolvedValue({ activo: false });
  api.createTripInvitationLink.mockResolvedValue(link);
  api.revokeTripInvitationLink.mockResolvedValue({ activo: false });
  Clipboard.setStringAsync.mockResolvedValue();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

async function press(utils, label) {
  await act(async () => { await fireEvent.press(await utils.findByText(label)); });
}

async function openInvite(authenticated = true) {
  if (authenticated) useAuth.mockReturnValue({ token: "auth", user: { email: "ana@test.com" }, rememberInvitation });
  const utils = await render(<JoinTripScreen navigation={navigation} route={route} />);
  await utils.findByText("Viaje compartido");
  return utils;
}

it("abrir autenticado muestra el resumen y el administrador sin incorporar", async () => {
  const utils = await openInvite();
  expect(utils.getByText("Administrador: @organizador")).toBeTruthy();
  expect(rememberInvitation).toHaveBeenCalledWith(invitationToken);
  expect(api.joinTripByLink).not.toHaveBeenCalled();
});

it("sin sesión conserva el enlace y redirige automáticamente a Login", async () => {
  await render(<JoinTripScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("Login"));
  expect(rememberInvitation).toHaveBeenLastCalledWith(invitationToken);
  expect(api.previewSharedInvitation).not.toHaveBeenCalled();
  expect(api.joinTripByLink).not.toHaveBeenCalled();
});

it.each(["login", "registro"])("retoma la vista previa tras autenticarse por %s", async () => {
  const utils = await render(<JoinTripScreen navigation={navigation} route={route} />);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("Login"));
  useAuth.mockReturnValue({ token: "nuevo-token", user: { email: "ana@test.com" }, rememberInvitation });
  await utils.rerender(<JoinTripScreen navigation={navigation} route={route} />);
  expect(await utils.findByText("Administrador: @organizador")).toBeTruthy();
  expect(api.joinTripByLink).not.toHaveBeenCalled();
});

it("requiere confirmación y cancelar no incorpora", async () => {
  const utils = await openInvite(true);
  await press(utils, "Unirme al viaje");
  const buttons = Alert.alert.mock.calls[0][2];
  await act(async () => buttons.find((b) => b.style === "cancel").onPress());
  expect(api.joinTripByLink).not.toHaveBeenCalled();
});

it("confirma, muestra éxito y abre el viaje solo al aceptar el aviso", async () => {
  const utils = await openInvite(true);
  await press(utils, "Unirme al viaje");
  await act(async () => Alert.alert.mock.calls[0][2].find((b) => b.text === "Unirme al viaje").onPress());
  expect(api.joinTripByLink).toHaveBeenCalledWith(invitationToken);
  expect(rememberInvitation).toHaveBeenLastCalledWith(null);
  expect(utils.getByText("Te uniste")).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
  const aviso = Alert.alert.mock.calls.find(([titulo]) => titulo === "¡Te uniste al viaje!");
  expect(aviso[1]).toBe("Te uniste");
  await act(async () => aviso[2][0].onPress());
  expect(navigation.replace).toHaveBeenCalledWith("TripDetail", { trip: { id: 12, title: "Viaje compartido" }, initialTab: "grupo" });
});

it("enlace inválido no ofrece incorporarse", async () => {
  api.previewSharedInvitation.mockRejectedValue(new Error("Enlace vencido"));
  useAuth.mockReturnValue({ token: "auth", user: { email: "ana@test.com" }, rememberInvitation });
  const utils = await render(<JoinTripScreen navigation={navigation} route={route} />);
  expect(await utils.findByText("Enlace vencido")).toBeTruthy();
  expect(utils.queryByText("Unirme al viaje")).toBeNull();
  expect(api.joinTripByLink).not.toHaveBeenCalled();
});

it("si el enlace vence al confirmar, muestra el error sin abrir el viaje", async () => {
  api.joinTripByLink.mockRejectedValue(new Error("El enlace fue revocado"));
  const utils = await openInvite(true);
  await press(utils, "Unirme al viaje");
  await act(async () => Alert.alert.mock.calls[0][2].find((b) => b.text === "Unirme al viaje").onPress());
  expect(await utils.findByText("El enlace fue revocado")).toBeTruthy();
  expect(navigation.replace).not.toHaveBeenCalled();
  expect(rememberInvitation).not.toHaveBeenCalledWith(null);
});

it("si falta confirmar el correo, ofrece el reenvío", async () => {
  api.joinTripByLink.mockRejectedValue(Object.assign(new Error("Confirmá tu correo"), { code: "EMAIL_CONFIRMATION_REQUIRED" }));
  const utils = await openInvite(true);
  await press(utils, "Unirme al viaje");
  await act(async () => Alert.alert.mock.calls[0][2].find((b) => b.text === "Unirme al viaje").onPress());
  await press(utils, "Reenviar confirmación de correo");
  expect(navigation.navigate).toHaveBeenCalledWith("ResendConfirmation", { email: "ana@test.com" });
});

it("Ahora no descarta el pendiente", async () => {
  const utils = await openInvite();
  await press(utils, "Ahora no");
  expect(rememberInvitation).toHaveBeenLastCalledWith(null);
  expect(navigation.navigate).toHaveBeenCalledWith("Tabs");
});

it("ya participante se informa como rechazo y no muestra éxito", async () => {
  api.joinTripByLink.mockRejectedValue(Object.assign(new Error("Ya formás parte de este viaje."), { code: "ALREADY_TRIP_PARTICIPANT" }));
  const utils = await openInvite();
  await press(utils, "Unirme al viaje");
  await act(async () => Alert.alert.mock.calls[0][2].find((b) => b.text === "Unirme al viaje").onPress());
  expect(await utils.findByText("Ya formás parte de este viaje.")).toBeTruthy();
  expect(Alert.alert.mock.calls.some(([titulo]) => titulo === "¡Te uniste al viaje!")).toBe(false);
  expect(navigation.replace).not.toHaveBeenCalled();
});

it("el organizador genera y copia el enlace", async () => {
  const utils = await render(<TripInvitationLink tripId={12} />);
  await press(utils, "Invitar con enlace");
  await waitFor(() => expect(api.getTripInvitationLink).toHaveBeenCalledWith(12));
  await press(utils, "Generar enlace");
  expect(api.createTripInvitationLink).toHaveBeenCalledWith(12);
  await press(utils, "Copiar enlace");
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(link.url);
});

it.each([true, false])("renovar=%s requiere confirmar", async (renovar) => {
  api.getTripInvitationLink.mockResolvedValue(link);
  const utils = await render(<TripInvitationLink tripId={12} />);
  await press(utils, "Invitar con enlace");
  await press(utils, renovar ? "Renovar enlace" : "Revocar enlace");
  expect(api.createTripInvitationLink).not.toHaveBeenCalled();
  expect(api.revokeTripInvitationLink).not.toHaveBeenCalled();
  await act(async () => Alert.alert.mock.calls[0][2].find((b) => b.text === (renovar ? "Renovar" : "Revocar")).onPress());
  if (renovar) expect(api.createTripInvitationLink).toHaveBeenCalledWith(12, true);
  else expect(api.revokeTripInvitationLink).toHaveBeenCalledWith(12);
});
