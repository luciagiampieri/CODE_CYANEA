import { ImageManipulator } from "expo-image-manipulator";

import {
  MENSAJE_FORMATO_INVALIDO,
  MENSAJE_TAMANIO_EXCEDIDO,
  RECEIPT_MAX_BYTES,
  calcularRedimension,
  comprimirImagenComprobante,
  resolverMime,
  validarImagenComprobante,
} from "../utils/receiptImage";

jest.mock("expo-image-manipulator", () => {
  const saveAsync = jest.fn(async () => ({ uri: "file:///comprimido.jpg", width: 1200, height: 1600 }));
  const contexto = {
    resize: jest.fn(),
    renderAsync: jest.fn(async () => ({ saveAsync })),
  };
  return {
    SaveFormat: { JPEG: "jpeg", PNG: "png" },
    ImageManipulator: { manipulate: jest.fn(() => contexto) },
    __contexto: contexto,
    __saveAsync: saveAsync,
  };
});

const { __contexto: contexto, __saveAsync: saveAsync } = jest.requireMock("expo-image-manipulator");

describe("US 93 - validación de la imagen del comprobante (AC3)", () => {
  it.each([
    [{ uri: "file:///a.jpg", mimeType: "image/jpeg" }],
    [{ uri: "file:///a.png", mimeType: "image/png" }],
    [{ uri: "file:///foto", fileName: "ticket.JPEG" }],
    [{ uri: "data:image/png;base64,AAAA" }],
  ])("acepta JPG, JPEG y PNG %#", (asset) => {
    expect(validarImagenComprobante(asset)).toEqual({ ok: true });
  });

  it.each([
    [{ uri: "file:///a.gif", fileName: "animado.gif" }],
    [{ uri: "file:///doc.pdf", mimeType: "application/pdf" }],
    [{ uri: "data:image/webp;base64,AAAA" }],
  ])("rechaza formatos no soportados %#", (asset) => {
    expect(validarImagenComprobante(asset)).toEqual({ ok: false, message: MENSAJE_FORMATO_INVALIDO });
  });

  it.each([
    [{ uri: "file:///IMG_0001.HEIC", mimeType: "image/heic" }],
    [{ uri: "file:///IMG_0002.heif", fileName: "IMG_0002.heif" }],
  ])("en el celular acepta fotos HEIC/HEIF de iPhone (se convierten a JPEG) %#", (asset) => {
    expect(validarImagenComprobante(asset, "ios")).toEqual({ ok: true });
  });

  it("en web rechaza HEIC porque el navegador no puede convertirlo", () => {
    const asset = { uri: "blob:x", file: { type: "image/heic", size: 1000 } };
    expect(validarImagenComprobante(asset, "web")).toEqual({
      ok: false,
      message: MENSAJE_FORMATO_INVALIDO,
    });
  });

  it("rechaza imágenes de más de 10 MB", () => {
    const asset = { uri: "file:///a.jpg", mimeType: "image/jpeg", fileSize: RECEIPT_MAX_BYTES + 1 };
    expect(validarImagenComprobante(asset)).toEqual({ ok: false, message: MENSAJE_TAMANIO_EXCEDIDO });
  });

  it("acepta exactamente 10 MB", () => {
    const asset = { uri: "file:///a.jpg", mimeType: "image/jpeg", fileSize: RECEIPT_MAX_BYTES };
    expect(validarImagenComprobante(asset).ok).toBe(true);
  });

  it("en web usa el tamaño del File del navegador", () => {
    const asset = { uri: "blob:x", file: { type: "image/png", size: RECEIPT_MAX_BYTES + 10 } };
    expect(validarImagenComprobante(asset).ok).toBe(false);
  });

  it("sin imagen no es válido", () => {
    expect(validarImagenComprobante(undefined).ok).toBe(false);
  });

  it("resuelve el tipo MIME por extensión si el picker no lo informa", () => {
    expect(resolverMime({ uri: "file:///cache/IMG_1.jpg" })).toBe("image/jpeg");
  });
});

describe("US 93 - compresión antes del envío (AC4)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reduce el lado mayor a 1600 px respetando la orientación", () => {
    expect(calcularRedimension(4000, 3000)).toEqual({ width: 1600 });
    expect(calcularRedimension(3000, 4000)).toEqual({ height: 1600 });
  });

  it("no agranda imágenes chicas", () => {
    expect(calcularRedimension(800, 1200)).toBeNull();
  });

  it("guarda siempre como JPEG comprimido", async () => {
    const resultado = await comprimirImagenComprobante({
      uri: "file:///original.png",
      width: 3000,
      height: 4000,
    });

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith("file:///original.png");
    expect(contexto.resize).toHaveBeenCalledWith({ height: 1600 });
    expect(saveAsync).toHaveBeenCalledWith({ compress: 0.7, format: "jpeg" });
    expect(resultado).toEqual(
      expect.objectContaining({ uri: "file:///comprimido.jpg", mimeType: "image/jpeg", fileName: "comprobante.jpg" })
    );
  });

  it("si la imagen ya es chica solo la recomprime", async () => {
    await comprimirImagenComprobante({ uri: "file:///chica.jpg", width: 900, height: 1200 });
    expect(contexto.resize).not.toHaveBeenCalled();
    expect(saveAsync).toHaveBeenCalled();
  });
});
