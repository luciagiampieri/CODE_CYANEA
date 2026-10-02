import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";

import ReceiptScanButton, {
  MENSAJE_PERMISO_CAMARA,
  MENSAJE_SIN_CONEXION,
  MENSAJE_SIN_CONSENTIMIENTO,
  MENSAJE_TIEMPO_AGOTADO,
  MENSAJE_VIAJE_FINALIZADO,
  mensajeParaError,
} from "../components/trip/ReceiptScanButton";
import { getCurrentUser, scanReceipt, updateAiConsent } from "../services/api";
import { MENSAJE_FORMATO_INVALIDO, MENSAJE_TAMANIO_EXCEDIDO } from "../utils/receiptImage";

jest.mock("../services/api", () => ({
  getCurrentUser: jest.fn(),
  scanReceipt: jest.fn(),
  updateAiConsent: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("expo-image-manipulator", () => {
  const saveAsync = jest.fn(async () => ({ uri: "file:///comprimido.jpg", width: 1200, height: 1600 }));
  return {
    SaveFormat: { JPEG: "jpeg" },
    ImageManipulator: {
      manipulate: jest.fn(() => ({ resize: jest.fn(), renderAsync: jest.fn(async () => ({ saveAsync })) })),
    },
  };
});

const DATOS = {
  Nombre: "Café Martínez",
  MontoOriginal: "15230.50",
  MonedaOriginal: "ARS",
  FechaGasto: "2026-09-28",
  IdCategoria: 1,
  CamposBajaConfianza: [],
};

const FOTO = {
  canceled: false,
  assets: [{ uri: "file:///foto.jpg", mimeType: "image/jpeg", fileSize: 3_000_000, width: 3000, height: 4000 }],
};

function errorApi(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

async function presionar(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}

async function escanearDesde(utils, origen = "Tomar foto") {
  await act(async () => {
    fireEvent.press(utils.getByTestId("receipt-scan-button"));
  });
  await presionar(utils, origen);
}

describe("US 93 - ReceiptScanButton", () => {
  let onScanned;

  beforeEach(() => {
    jest.clearAllMocks();
    onScanned = jest.fn();
    getCurrentUser.mockResolvedValue({ consienteProcesamientoIA: true });
    updateAiConsent.mockResolvedValue({ consienteProcesamientoIA: true });
    scanReceipt.mockResolvedValue(DATOS);
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchCameraAsync.mockResolvedValue(FOTO);
    ImagePicker.launchImageLibraryAsync.mockResolvedValue(FOTO);
  });

  function renderizar(props = {}) {
    return render(<ReceiptScanButton tripId={10} onScanned={onScanned} {...props} />);
  }

  it("CP1: escanea con la cámara y entrega los datos para precargar", async () => {
    const utils = await renderizar();

    await escanearDesde(utils, "Tomar foto");

    await waitFor(() => expect(onScanned).toHaveBeenCalledWith(DATOS, expect.objectContaining({ uri: expect.any(String) })));
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
    // Se envía la imagen comprimida, no la original (AC4).
    expect(scanReceipt).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ uri: "file:///comprimido.jpg", mimeType: "image/jpeg" })
    );
  });

  it("CP2: escanea una imagen de la galería", async () => {
    const utils = await renderizar();

    await escanearDesde(utils, "Elegir de la galería");

    await waitFor(() => expect(onScanned).toHaveBeenCalledWith(DATOS, expect.objectContaining({ uri: expect.any(String) })));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it("CP2: en iPhone pide la foto en formato compatible y acepta HEIC de la galería", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: "file:///IMG_1234.HEIC", mimeType: "image/heic", fileSize: 2_500_000, width: 3024, height: 4032 },
      ],
    });
    const utils = await renderizar();

    await escanearDesde(utils, "Elegir de la galería");

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ preferredAssetRepresentationMode: "compatible" })
    );
    await waitFor(() => expect(onScanned).toHaveBeenCalledWith(DATOS, expect.objectContaining({ uri: expect.any(String) })));
    // Lo que se envía es el JPEG comprimido, no el HEIC original.
    expect(scanReceipt).toHaveBeenCalledWith(10, expect.objectContaining({ mimeType: "image/jpeg" }));
  });

  it("CP4: rechaza un formato no soportado sin llamar al servicio", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///animado.gif", mimeType: "image/gif", fileSize: 1000 }],
    });
    const utils = await renderizar();

    await escanearDesde(utils, "Elegir de la galería");

    expect(utils.getByText(MENSAJE_FORMATO_INVALIDO)).toBeTruthy();
    expect(scanReceipt).not.toHaveBeenCalled();
  });

  it("CP5: rechaza una imagen de más de 10 MB sin llamar al servicio", async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///foto.jpg", mimeType: "image/jpeg", fileSize: 11 * 1024 * 1024 }],
    });
    const utils = await renderizar();

    await escanearDesde(utils, "Elegir de la galería");

    expect(utils.getByText(MENSAJE_TAMANIO_EXCEDIDO)).toBeTruthy();
    expect(scanReceipt).not.toHaveBeenCalled();
  });

  it("CP6: el primer uso sin otorgar consentimiento no escanea", async () => {
    getCurrentUser.mockResolvedValue({ consienteProcesamientoIA: false });
    const utils = await renderizar();

    await escanearDesde(utils);

    expect(utils.getByTestId("receipt-consent-dialog")).toBeTruthy();
    expect(utils.getByText(/servicio externo de inteligencia/)).toBeTruthy();
    await presionar(utils, "Ahora no");

    expect(utils.getByText(MENSAJE_SIN_CONSENTIMIENTO)).toBeTruthy();
    expect(updateAiConsent).not.toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(scanReceipt).not.toHaveBeenCalled();
  });

  it("al aceptar el consentimiento lo guarda y continúa el escaneo", async () => {
    getCurrentUser.mockResolvedValue({ consienteProcesamientoIA: false });
    const utils = await renderizar();

    await escanearDesde(utils);
    await presionar(utils, "Aceptar y continuar");

    await waitFor(() => expect(onScanned).toHaveBeenCalledWith(DATOS, expect.objectContaining({ uri: expect.any(String) })));
    expect(updateAiConsent).toHaveBeenCalledWith(true);
  });

  it("una vez otorgado, el consentimiento no se vuelve a consultar", async () => {
    const utils = await renderizar();

    await escanearDesde(utils);
    await waitFor(() => expect(onScanned).toHaveBeenCalledTimes(1));
    await escanearDesde(utils);
    await waitFor(() => expect(onScanned).toHaveBeenCalledTimes(2));

    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("si el backend informa que falta el consentimiento, lo vuelve a pedir", async () => {
    scanReceipt.mockRejectedValueOnce(errorApi(403, "Falta consentimiento", "AI_CONSENT_REQUIRED"));
    const utils = await renderizar();

    await escanearDesde(utils);

    await waitFor(() => expect(utils.getByTestId("receipt-consent-dialog")).toBeTruthy());
  });

  it("CP7: si la imagen no es un comprobante informa el mensaje y ofrece la carga manual", async () => {
    const mensaje =
      "La imagen no corresponde a un comprobante de pago o no se puede leer. Probá con otra foto o cargá el gasto manualmente.";
    scanReceipt.mockRejectedValue(errorApi(422, mensaje, "RECEIPT_NOT_RECOGNIZED"));
    const utils = await renderizar();

    await escanearDesde(utils);

    await waitFor(() => expect(utils.getByText(mensaje)).toBeTruthy());
    expect(onScanned).not.toHaveBeenCalled();

    await presionar(utils, "Completar manualmente");
    expect(utils.queryByTestId("receipt-scan-error")).toBeNull();
  });

  it("CP9: si la IA no está disponible informa el error y ofrece la carga manual", async () => {
    const mensaje = "El servicio de inteligencia artificial no está disponible en este momento. Podés cargar el gasto manualmente.";
    scanReceipt.mockRejectedValue(errorApi(503, mensaje, "AI_UNAVAILABLE"));
    const utils = await renderizar();

    await escanearDesde(utils);

    await waitFor(() => expect(utils.getByText(mensaje)).toBeTruthy());
    expect(utils.getByText("Completar manualmente")).toBeTruthy();
    expect(onScanned).not.toHaveBeenCalled();
  });

  it("sin conexión informa el error y ofrece la carga manual", async () => {
    scanReceipt.mockRejectedValue(new TypeError("Network request failed"));
    const utils = await renderizar();

    await escanearDesde(utils);

    await waitFor(() => expect(utils.getByText(MENSAJE_SIN_CONEXION)).toBeTruthy());
  });

  it("AC15: muestra el indicador de progreso mientras procesa", async () => {
    let resolver;
    scanReceipt.mockReturnValue(new Promise((resolve) => (resolver = resolve)));
    const utils = await renderizar();

    await escanearDesde(utils);

    await waitFor(() => expect(utils.getByTestId("receipt-scan-progress")).toBeTruthy());
    expect(utils.getByText("Leyendo el comprobante…")).toBeTruthy();

    await act(async () => resolver(DATOS));
    await waitFor(() => expect(utils.queryByTestId("receipt-scan-progress")).toBeNull());
    expect(onScanned).toHaveBeenCalledWith(DATOS, expect.objectContaining({ uri: expect.any(String) }));
  });

  it("AC15: si supera el tiempo máximo corta la espera y ofrece la carga manual", async () => {
    scanReceipt.mockReturnValue(new Promise(() => {}));
    const utils = await renderizar({ timeoutMs: 50 });

    await escanearDesde(utils);

    await waitFor(() => expect(utils.getByText(MENSAJE_TIEMPO_AGOTADO)).toBeTruthy());
    expect(utils.queryByTestId("receipt-scan-progress")).toBeNull();
    expect(onScanned).not.toHaveBeenCalled();
  });

  it("sin permiso de cámara no abre la cámara", async () => {
    ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    const utils = await renderizar();

    await escanearDesde(utils);

    expect(utils.getByText(MENSAJE_PERMISO_CAMARA)).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it("si el usuario cancela la cámara no pasa nada", async () => {
    ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null });
    const utils = await renderizar();

    await escanearDesde(utils);

    expect(scanReceipt).not.toHaveBeenCalled();
    expect(utils.queryByTestId("receipt-scan-error")).toBeNull();
  });

  it("deshabilitado no abre el selector", async () => {
    const utils = await renderizar({ disabled: true });

    await act(async () => {
      fireEvent.press(utils.getByTestId("receipt-scan-button"));
    });

    expect(utils.queryByText("Tomar foto")).toBeNull();
  });
});

describe("US 93 - mensajeParaError", () => {
  it("usa el mensaje del backend cuando existe", () => {
    expect(mensajeParaError(errorApi(503, "Mensaje del servidor", "AI_UNAVAILABLE"))).toBe("Mensaje del servidor");
  });

  it("CP11: viaje finalizado", () => {
    expect(mensajeParaError(errorApi(409, "otro texto", "TRIP_FINISHED"))).toBe(MENSAJE_VIAJE_FINALIZADO);
  });
});
