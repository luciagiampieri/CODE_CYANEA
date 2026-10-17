import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import ResendConfirmationForm from "../components/ui/ResendConfirmationForm";
import RegistrationSuccessScreen from "../screens/RegistrationSuccessScreen";
import EmailConfirmadoScreen from "../screens/EmailConfirmadoScreen";
import ResendConfirmationScreen from "../screens/ResendConfirmationScreen";
import { resendConfirmation } from "../services/api";

jest.mock("../services/api", () => ({ resendConfirmation: jest.fn() }));
jest.mock("@expo/vector-icons", () => ({ FontAwesome6: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => jest.useRealTimers());

it("valida el email sin enviar solicitudes invalidas", async () => {
  await render(<ResendConfirmationForm />);
  await act(async () => { await fireEvent.press(screen.getByTestId("resend-confirmation-button")); });
  expect(screen.getByText("Ingresá un correo electrónico válido.")).toBeTruthy();
  expect(resendConfirmation).not.toHaveBeenCalled();
});

it("reenvia desde el registro al email mostrado y aplica espera", async () => {
  resendConfirmation.mockResolvedValue({ message: "Solicitud recibida" });
  await render(<RegistrationSuccessScreen navigation={{ replace: jest.fn() }} route={{ params: { email: "ana@test.com" } }} />);
  expect(screen.queryByTestId("confirmation-email-input")).toBeNull();
  await act(async () => { await fireEvent.press(screen.getByTestId("resend-confirmation-button")); });
  await waitFor(() => expect(screen.getByText("Solicitud recibida")).toBeTruthy());
  expect(resendConfirmation).toHaveBeenCalledWith("ana@test.com");
  expect(screen.getByText("Podés reenviar en 60s")).toBeTruthy();
  await act(async () => { await fireEvent.press(screen.getByTestId("resend-confirmation-button")); });
  expect(resendConfirmation).toHaveBeenCalledTimes(1);
});

it("respeta Retry-After y vuelve a habilitar el envio", async () => {
  jest.useFakeTimers();
  resendConfirmation.mockRejectedValue(Object.assign(new Error("Esperá"), { status: 429, retryAfter: 120 }));
  await render(<ResendConfirmationForm initialEmail="ana@test.com" />);
  await act(async () => { await fireEvent.press(screen.getByTestId("resend-confirmation-button")); });
  expect(screen.getByText("Podés reenviar en 120s")).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(120000); });
  expect(screen.getByText("Reenviar correo de confirmación")).toBeTruthy();
});

it("un error de red permite volver a intentar", async () => {
  resendConfirmation.mockRejectedValue(new Error("Sin conexión"));
  await render(<ResendConfirmationScreen navigation={{ navigate: jest.fn() }} route={{ params: { email: "ana@test.com" } }} />);
  await act(async () => { await fireEvent.press(screen.getByTestId("resend-confirmation-button")); });
  await waitFor(() => expect(screen.getByText("Sin conexión")).toBeTruthy());
  expect(screen.getByDisplayValue("ana@test.com")).toBeTruthy();
  expect(screen.getByText("Reenviar correo de confirmación")).toBeTruthy();
});

it("un enlace vencido lleva al reenvio en lugar del registro", async () => {
  const navigation = { replace: jest.fn() };
  await render(<EmailConfirmadoScreen navigation={navigation} route={{ params: { status: "error" } }} />);
  await act(async () => { await fireEvent.press(await screen.findByText("Solicitar un nuevo enlace")); });
  expect(navigation.replace).toHaveBeenCalledWith("ResendConfirmation");
  expect(screen.queryByText("Volver al registro")).toBeNull();
});
