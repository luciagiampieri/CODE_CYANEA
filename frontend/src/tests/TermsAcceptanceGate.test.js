import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import TermsAcceptanceGate from "../components/legal/TermsAcceptanceGate";
import { getTerms } from "../services/api";
import { acceptTerms, getTermsAcceptance } from "../services/termsAcceptanceApi";

const mockLogout = jest.fn();
let mockAuth = { token: "tok-1", logout: mockLogout };

jest.mock("../context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

jest.mock("../services/api", () => ({
  getTerms: jest.fn(),
}));

jest.mock("../services/termsAcceptanceApi", () => ({
  getTermsAcceptance: jest.fn(),
  acceptTerms: jest.fn(),
}));

const TERMINOS = {
  version: "2027-01-01",
  titulo: "Términos 2027",
  contenido: ["1. Objeto\nTexto de la sección uno.", "2. Uso\nTexto de la sección dos."],
};

async function renderizar() {
  await render(
    <TermsAcceptanceGate>
      <Text>Contenido protegido</Text>
    </TermsAcceptanceGate>
  );
}

async function presionar(testId) {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testId));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { token: "tok-1", logout: mockLogout };
  getTerms.mockResolvedValue(TERMINOS);
  getTermsAcceptance.mockResolvedValue({
    versionVigente: "2027-01-01",
    versionAceptada: "2026-10-03",
    requiereAceptacion: true,
  });
  acceptTerms.mockResolvedValue({ requiereAceptacion: false });
});

describe("US 110 - Aceptar nueva versión de Términos y Condiciones", () => {
  it("sin sesión no verifica nada y muestra la app", async () => {
    mockAuth = { token: null, logout: mockLogout };

    await renderizar();

    expect(screen.getByText("Contenido protegido")).toBeTruthy();
    expect(getTermsAcceptance).not.toHaveBeenCalled();
  });

  it("CP5: si ya aceptó la versión vigente no muestra el modal", async () => {
    getTermsAcceptance.mockResolvedValue({ versionVigente: "2027-01-01", requiereAceptacion: false });

    await renderizar();

    expect(await screen.findByText("Contenido protegido")).toBeTruthy();
    expect(screen.queryByTestId("terms-gate-modal")).toBeNull();
  });

  it("CP1/CP6: con una versión anterior muestra el modal con título y contenido, sin la app", async () => {
    await renderizar();

    expect(await screen.findByText("Términos 2027")).toBeTruthy();
    expect(screen.getByText("Versión 2027-01-01")).toBeTruthy();
    expect(screen.getByText("1. Objeto")).toBeTruthy();
    expect(screen.getByText("Texto de la sección dos.")).toBeTruthy();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("CP2: al aceptar registra la aceptación y habilita la app", async () => {
    await renderizar();
    await screen.findByText("Términos 2027");

    await presionar("terms-gate-accept");

    expect(acceptTerms).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Contenido protegido")).toBeTruthy();
  });

  it("CP3: al rechazar cierra la sesión", async () => {
    await renderizar();
    await screen.findByText("Términos 2027");

    await presionar("terms-gate-reject");

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(acceptTerms).not.toHaveBeenCalled();
  });

  it("si falla el registro de la aceptación muestra el error y mantiene el modal", async () => {
    acceptTerms.mockRejectedValue(new Error("No se pudo registrar tu aceptación"));
    await renderizar();
    await screen.findByText("Términos 2027");

    await presionar("terms-gate-accept");

    expect(await screen.findByText("No se pudo registrar tu aceptación")).toBeTruthy();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("si no se puede cargar el texto permite reintentar", async () => {
    getTerms.mockRejectedValueOnce(new Error("Sin conexión"));
    await renderizar();

    expect(await screen.findByText("Sin conexión")).toBeTruthy();
    await presionar("terms-gate-retry");

    expect(await screen.findByText("Términos 2027")).toBeTruthy();
  });

  it("si falla la verificación no bloquea la app", async () => {
    getTermsAcceptance.mockRejectedValue(new Error("caído"));

    await renderizar();

    await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeTruthy());
  });
});