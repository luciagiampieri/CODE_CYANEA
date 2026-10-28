const mockDb = {
  execSync: jest.fn(),
  runSync: jest.fn(),
  getAllSync: jest.fn(() => []),
  getFirstSync: jest.fn(() => null),
};
const mockBorrados = [];

jest.mock("../database/database", () => ({ __esModule: true, default: mockDb }));

jest.mock("../services/api", () => ({
  getStoredToken: jest.fn(() => Promise.resolve("token-test")),
  getTripDetail: jest.fn(),
  getTripDocuments: jest.fn(),
  resolveApiBaseUrl: jest.fn(() => "http://api.test/api/v1"),
}));

jest.mock("expo-file-system", () => {
  const unir = (partes) => partes.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
  class MockDirectory {
    constructor(...partes) {
      this.uri = unir(partes);
      this.exists = true;
    }
    create() {}
    delete() {
      mockBorrados.push(this.uri);
    }
  }
  class MockFile {
    constructor(...partes) {
      this.uri = unir(partes);
      this.exists = true;
    }
    delete() {
      mockBorrados.push(this.uri);
    }
  }
  MockFile.downloadFileAsync = jest.fn(async (url, destino) => ({ uri: destino.uri, size: 2048 }));
  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { document: { uri: "file:///docs" }, availableDiskSpace: 50000000 },
  };
});

const { Platform } = require("react-native");
const { File, Paths } = require("expo-file-system");
const api = require("../services/api");
const offline = require("../database/offlineViajes");

const VIAJE_ACTIVO = { id: 5, title: "Viaje a Salta", status: "activo", hasLeft: false, cronograma: [] };

function fila(idDocumento, version) {
  return {
    id_documento: idDocumento,
    id_viaje: 5,
    datos: JSON.stringify({ IdDocumento: idDocumento, IdViaje: 5, NombreArchivo: `doc${idDocumento}.pdf` }),
    uri: `file:///docs/viajes-offline/5/${idDocumento}-doc${idDocumento}.pdf`,
    tamano_bytes: 10,
    version,
    guardado_en: "2026-10-01T00:00:00.000Z",
  };
}

function llamadaRun(fragmento) {
  return mockDb.runSync.mock.calls.find(([sql]) => sql.includes(fragmento));
}

describe("offlineViajes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBorrados.length = 0;
    mockDb.getAllSync.mockImplementation(() => []);
    mockDb.getFirstSync.mockImplementation(() => null);
    Paths.availableDiskSpace = 50000000;
    Platform.OS = "ios";
    global.fetch = jest.fn();
  });

  it("guarda el itinerario de un viaje activo", () => {
    offline.guardarItinerarioOffline(VIAJE_ACTIVO);

    const llamada = llamadaRun("INSERT OR REPLACE INTO itinerarios_offline");
    expect(llamada).toBeTruthy();
    expect(llamada[1][0]).toBe(5);
    expect(llamada[1][1]).toBe("Viaje a Salta");
    expect(JSON.parse(llamada[1][2])).toEqual(VIAJE_ACTIVO);
  });

  it("no guarda un viaje finalizado y borra su copia local", () => {
    offline.guardarItinerarioOffline({ ...VIAJE_ACTIVO, status: "finalizado" });

    expect(llamadaRun("INSERT OR REPLACE INTO itinerarios_offline")).toBeUndefined();
    expect(llamadaRun("DELETE FROM itinerarios_offline")[1]).toEqual([5]);
  });

  it("no guarda el viaje de alguien que lo abandonó", () => {
    offline.guardarItinerarioOffline({ ...VIAJE_ACTIVO, hasLeft: true });

    expect(llamadaRun("INSERT OR REPLACE INTO itinerarios_offline")).toBeUndefined();
  });

  it("devuelve el itinerario guardado con la fecha de sincronización", () => {
    mockDb.getFirstSync.mockReturnValue({
      detalle: JSON.stringify(VIAJE_ACTIVO),
      sincronizado_en: "2026-10-28T14:32:00.000Z",
    });

    expect(offline.obtenerItinerarioOffline(5)).toEqual({
      detalle: VIAJE_ACTIVO,
      sincronizadoEn: "2026-10-28T14:32:00.000Z",
    });
  });

  it("devuelve null si el viaje nunca se guardó", () => {
    expect(offline.obtenerItinerarioOffline(5)).toBeNull();
  });

  it("descarga el documento con el token y guarda su versión", async () => {
    const documento = {
      IdDocumento: 9,
      IdViaje: 5,
      NombreArchivo: "Pasaje ida.pdf",
      TamanoBytes: 1000,
      FechaSubida: "2026-10-01T10:00:00Z",
      FechaActualizacion: "2026-10-02T10:00:00Z",
    };

    await offline.guardarDocumentoOffline(documento);

    expect(File.downloadFileAsync).toHaveBeenCalledWith(
      "http://api.test/api/v1/trips/5/documents/9/download",
      expect.objectContaining({ uri: "file:///docs/viajes-offline/5/9-Pasaje_ida.pdf" }),
      expect.objectContaining({ headers: { Authorization: "Bearer token-test" } })
    );
    const llamada = llamadaRun("INSERT OR REPLACE INTO documentos_offline");
    expect(llamada[1][0]).toBe(9);
    expect(llamada[1][5]).toBe("2026-10-02T10:00:00Z");
  });

  it("no descarga si no hay espacio suficiente", async () => {
    Paths.availableDiskSpace = 100;

    await expect(
      offline.guardarDocumentoOffline({ IdDocumento: 9, IdViaje: 5, NombreArchivo: "a.pdf", TamanoBytes: 1000 })
    ).rejects.toMatchObject({ code: "ESPACIO_INSUFICIENTE" });
    expect(File.downloadFileAsync).not.toHaveBeenCalled();
    expect(llamadaRun("INSERT OR REPLACE INTO documentos_offline")).toBeUndefined();
  });

  it("en web no permite guardar documentos sin conexión", async () => {
    Platform.OS = "web";

    await expect(
      offline.guardarDocumentoOffline({ IdDocumento: 9, IdViaje: 5, NombreArchivo: "a.pdf" })
    ).rejects.toMatchObject({ code: "NO_DISPONIBLE" });
    expect(offline.guardarItinerarioOffline(VIAJE_ACTIVO)).toBeNull();
    expect(mockDb.runSync).not.toHaveBeenCalled();
  });

  it("al sincronizar actualiza los documentos reemplazados y quita los eliminados", async () => {
    mockDb.getAllSync.mockImplementation((sql) =>
      sql.includes("FROM documentos_offline") ? [fila(1, "v-vieja"), fila(2, "v")] : []
    );
    mockDb.getFirstSync.mockImplementation((sql, params) =>
      sql.includes("documentos_offline") ? fila(params[0], "v-vieja") : null
    );
    api.getTripDetail.mockResolvedValue(VIAJE_ACTIVO);
    api.getTripDocuments.mockResolvedValue([
      { IdDocumento: 1, IdViaje: 5, NombreArchivo: "doc1.pdf", FechaActualizacion: "v-nueva" },
    ]);

    await offline.sincronizarViajeOffline(5);

    expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
    expect(mockBorrados).toContain("file:///docs/viajes-offline/5/2-doc2.pdf");
    expect(mockBorrados).not.toContain("file:///docs/viajes-offline/5/1-doc1.pdf");
    expect(
      mockDb.runSync.mock.calls.some(
        ([sql, params]) => sql.includes("DELETE FROM documentos_offline WHERE id_documento") && params[0] === 2
      )
    ).toBe(true);
  });

  it("si perdió el acceso al viaje, borra todo lo guardado", async () => {
    api.getTripDetail.mockRejectedValue(Object.assign(new Error("No tienes permisos"), { status: 403 }));

    await offline.sincronizarViajeOffline(5);

    expect(llamadaRun("DELETE FROM itinerarios_offline")[1]).toEqual([5]);
    expect(llamadaRun("DELETE FROM documentos_offline WHERE id_viaje")[1]).toEqual([5]);
  });

  it("la sincronización general purga los viajes sin acceso y actualiza el resto", async () => {
    mockDb.getAllSync.mockImplementation((sql) =>
      sql.includes("UNION") ? [{ id_viaje: 5 }, { id_viaje: 7 }] : []
    );
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ IdsViajes: [5] }) });
    api.getTripDetail.mockResolvedValue(VIAJE_ACTIVO);

    await offline.sincronizarOffline();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/v1/offline/access",
      expect.objectContaining({ headers: { Authorization: "Bearer token-test" } })
    );
    expect(api.getTripDetail).toHaveBeenCalledTimes(1);
    expect(api.getTripDetail).toHaveBeenCalledWith(5);
    expect(
      mockDb.runSync.mock.calls.some(
        ([sql, params]) => sql.includes("DELETE FROM itinerarios_offline") && params[0] === 7
      )
    ).toBe(true);
  });

  it("al cerrar sesión borra la carpeta y las tablas offline", () => {
    offline.eliminarTodoOffline();

    expect(mockDb.execSync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM documentos_offline")
    );
    expect(mockDb.execSync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM itinerarios_offline")
    );
    expect(mockBorrados).toContain("file:///docs/viajes-offline");
  });

  it("distingue los errores de red de los rechazos del backend", () => {
    expect(offline.esErrorDeRed(new TypeError("Network request failed"))).toBe(true);
    expect(offline.esErrorDeRed(Object.assign(new Error("No autenticado"), { status: 401 }))).toBe(false);
    expect(offline.esErrorDeRed(new Error("401"))).toBe(false);
  });
});