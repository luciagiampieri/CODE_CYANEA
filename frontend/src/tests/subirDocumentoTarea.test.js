// US: Subir las entradas o la reserva al completar una tarea de compra o reserva.
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import ChecklistsByCategory from "../components/trip/ChecklistsByCategory";
import DayAgenda from "../components/trip/DayAgenda";
import DocumentsScreen from "../screens/DocumentsScreen";
import { getDocumentCategories, getSugerenciaDocumentoTarea, getTripStorage, uploadTripDocument } from "../services/api";
import { datosSubidaDesdeTarea, ofrecerSubirDocumentoTarea } from "../utils/documentosTareas";

const mockGetDocumentAsync = jest.fn();

jest.mock("../services/api", () => ({
  getDocumentCategories: jest.fn(),
  getTripStorage: jest.fn(),
  uploadTripDocument: jest.fn(),
  getSugerenciaDocumentoTarea: jest.fn(),
}));

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: (...args) => mockGetDocumentAsync(...args),
}));

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  })),
}));

const SUGERENCIA = {
  sugerir: true,
  tipo: "ENTRADAS",
  documento: "las entradas",
  titulo: "¿Subís las entradas?",
  mensaje: "Así las tienen todos a mano durante el viaje. Si querés, también podés subir el comprobante de pago.",
  IdCategoriaDocumento: 7,
  NombreCategoriaDocumento: "Reservas y entradas",
  EsPublico: true,
  NombreSugerido: "Entradas – Museo del Prado",
};

const DOCUMENTO = {
  IdDocumento: 30,
  NombreArchivo: "Entradas – Museo del Prado.pdf",
  UrlArchivo: "https://storage.test/entradas.pdf",
  IdCategoriaDocumento: 7,
  NombreCategoria: "Reservas y entradas",
  IconoCategoria: "ticket",
  EsPublico: true,
  EsPropio: false,
  NombreUsuarioSubida: "Lucía Pérez",
};

function tarea(cambios = {}) {
  return {
    IdChecklist: 5,
    Nombre: "Comprar entradas – Museo del Prado",
    Completada: true,
    NombreUsuarioCompletada: "Ana Gómez",
    EsPropio: false,
    Responsables: [],
    CategoriaChecklist: { IdCategoriaChecklist: 1, Nombre: "Reservas y entradas" },
    PuedeCompletar: true,
    EsPrivada: false,
    IdActividad: 40,
    Documentos: [],
    ...cambios,
  };
}

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  Alert.alert.mockRestore();
});

function botonDelAlert(titulo, texto) {
  const llamada = [...Alert.alert.mock.calls].reverse().find(([t]) => t === titulo);
  return llamada[2].find((b) => b.text === texto);
}

// ---------------------------------------------------------------------------
// Sugerencia al marcar la tarea como hecha
// ---------------------------------------------------------------------------

describe("ofrecerSubirDocumentoTarea", () => {
  it("muestra el diálogo con Subir y Ahora no, y Subir abre el formulario con la sugerencia", async () => {
    jest.useFakeTimers();
    getSugerenciaDocumentoTarea.mockResolvedValue(SUGERENCIA);
    const onSubir = jest.fn();

    const mostrada = await ofrecerSubirDocumentoTarea({ tripId: 10, tarea: tarea(), onSubir });

    expect(mostrada).toBe(true);
    expect(getSugerenciaDocumentoTarea).toHaveBeenCalledWith(10, 5);
    expect(Alert.alert).toHaveBeenCalledWith(
      "¿Subís las entradas?",
      expect.stringContaining("comprobante de pago"),
      [expect.objectContaining({ text: "Ahora no", style: "cancel" }), expect.objectContaining({ text: "Subir" })],
      expect.anything()
    );

    botonDelAlert("¿Subís las entradas?", "Subir").onPress();
    jest.runAllTimers();
    expect(onSubir).toHaveBeenCalledWith(SUGERENCIA);
  });

  it("si la tarea no es de compra no muestra nada", async () => {
    getSugerenciaDocumentoTarea.mockResolvedValue({ sugerir: false });

    expect(await ofrecerSubirDocumentoTarea({ tripId: 10, tarea: tarea(), onSubir: jest.fn() })).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("un error al analizar no muestra nada (la tarea ya quedó hecha)", async () => {
    getSugerenciaDocumentoTarea.mockRejectedValue(new Error("sin conexión"));

    expect(await ofrecerSubirDocumentoTarea({ tripId: 10, tarea: tarea(), onSubir: jest.fn() })).toBe(false);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("no consulta si la tarea ya tiene documentos o el usuario no puede subir", async () => {
    await ofrecerSubirDocumentoTarea({ tripId: 10, tarea: tarea({ Documentos: [DOCUMENTO] }) });
    await ofrecerSubirDocumentoTarea({ tripId: 10, tarea: tarea(), puedeSubir: false });

    expect(getSugerenciaDocumentoTarea).not.toHaveBeenCalled();
  });
});

describe("datosSubidaDesdeTarea", () => {
  it("usa la categoría, la visibilidad y el nombre sugeridos", () => {
    expect(datosSubidaDesdeTarea(tarea(), SUGERENCIA)).toEqual({
      IdChecklist: 5,
      Nombre: "Comprar entradas – Museo del Prado",
      IdActividad: 40,
      IdCategoriaDocumento: 7,
      EsPublico: true,
      NombreSugerido: "Entradas – Museo del Prado",
    });
  });

  it("al agregar otro documento repite la categoría del último y no propone nombre", () => {
    const datos = datosSubidaDesdeTarea(tarea({ Documentos: [DOCUMENTO], EsPrivada: true }));

    expect(datos.IdCategoriaDocumento).toBe(7);
    expect(datos.NombreSugerido).toBeNull();
    expect(datos.EsPublico).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Documentos en la tarjeta de la tarea
// ---------------------------------------------------------------------------

describe("documentos en el checklist", () => {
  async function mostrar(lista, props = {}) {
    return render(<ChecklistsByCategory checklists={lista} onToggle={jest.fn()} puedeCompletar {...props} />);
  }

  it("muestra cuántos documentos tiene y la hoja permite abrirlos y agregar otro", async () => {
    const onAbrirDocumento = jest.fn();
    const onAgregarDocumento = jest.fn();
    const utils = await mostrar(
      [tarea({ Documentos: [DOCUMENTO, { ...DOCUMENTO, IdDocumento: 31, NombreArchivo: "Comprobante.pdf", EsPublico: false, EsPropio: true }] })],
      { onAbrirDocumento, onAgregarDocumento }
    );

    expect(utils.getByText("2 documentos")).toBeTruthy();
    await act(async () => fireEvent.press(utils.getByTestId("documentos-checklist-5")));

    expect(utils.getByTestId("documentos-tarea-sheet")).toBeTruthy();
    expect(utils.getByText("Reservas y entradas · Subido por Lucía")).toBeTruthy();
    expect(utils.getByText("Reservas y entradas · Privado")).toBeTruthy();

    await act(async () => fireEvent.press(utils.getByTestId("documento-tarea-30")));
    expect(onAbrirDocumento).toHaveBeenCalledWith(DOCUMENTO);

    jest.useFakeTimers();
    await act(async () => fireEvent.press(utils.getByTestId("documentos-tarea-agregar")));
    await act(async () => jest.runAllTimers());
    expect(onAgregarDocumento).toHaveBeenCalledWith(expect.objectContaining({ IdChecklist: 5 }));
  });

  it("una tarea hecha sin documentos ofrece adjuntar uno; una pendiente no", async () => {
    const onAgregarDocumento = jest.fn();
    const utils = await mostrar(
      [tarea(), tarea({ IdChecklist: 6, Nombre: "Reservar hotel", Completada: false, NombreUsuarioCompletada: null })],
      { onAgregarDocumento }
    );

    expect(utils.queryByTestId("adjuntar-checklist-6")).toBeNull();
    await act(async () => fireEvent.press(utils.getByTestId("adjuntar-checklist-5")));
    expect(onAgregarDocumento).toHaveBeenCalledWith(expect.objectContaining({ IdChecklist: 5 }));
  });

  it("sin permiso para subir no se ofrece adjuntar", async () => {
    const utils = await mostrar([tarea()]);

    expect(utils.queryByTestId("adjuntar-checklist-5")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Formulario de subida desde la tarea
// ---------------------------------------------------------------------------

describe("DocumentsScreen desde una tarea", () => {
  const categorias = [
    { IdCategoriaDocumento: 1, Nombre: "Vuelos" },
    { IdCategoriaDocumento: 7, Nombre: "Reservas y entradas" },
  ];

  beforeEach(() => {
    getDocumentCategories.mockResolvedValue(categorias);
    getTripStorage.mockResolvedValue(null);
    mockGetDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ name: "IMG_2041.pdf", uri: "file:///img.pdf", size: 2048, mimeType: "application/pdf" }],
    });
  });

  async function abrir(datosTarea) {
    const onClose = jest.fn();
    const onDocumentoSubido = jest.fn();
    const utils = await render(
      <DocumentsScreen visible tripId={10} onClose={onClose} onDocumentoSubido={onDocumentoSubido} tarea={datosTarea} />
    );
    await waitFor(() => expect(utils.getByText("Seleccionar archivo")).toBeTruthy());
    return { utils, onClose, onDocumentoSubido };
  }

  it("preselecciona la categoría, propone el nombre y vincula el documento a la tarea", async () => {
    uploadTripDocument.mockResolvedValue({ message: "ok", IdDocumento: 30, IdChecklist: 5 });
    const { utils, onDocumentoSubido } = await abrir(datosSubidaDesdeTarea(tarea(), SUGERENCIA));

    expect(utils.getByTestId("documentos-tarea")).toBeTruthy();
    expect(utils.getByText("Reservas y entradas")).toBeTruthy();

    await act(async () => fireEvent.press(utils.getByText("Seleccionar archivo")));
    expect(utils.getByDisplayValue("Entradas – Museo del Prado")).toBeTruthy();

    await act(async () => {
      const botones = utils.getAllByText("Subir documento");
      fireEvent.press(botones[botones.length - 1]);
    });

    await waitFor(() =>
      expect(uploadTripDocument).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ name: "IMG_2041.pdf" }),
        7,
        "Entradas – Museo del Prado.pdf",
        true,
        5
      )
    );
    expect(onDocumentoSubido).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Documento guardado",
      "Lo guardamos en la tarea «Comprar entradas – Museo del Prado».",
      expect.arrayContaining([expect.objectContaining({ text: "Subir otro" })])
    );
  });

  it("«Subir otro» deja el formulario listo para el comprobante, sin repetir el nombre", async () => {
    uploadTripDocument.mockResolvedValue({ message: "ok", IdDocumento: 30, IdChecklist: 5 });
    const { utils } = await abrir(datosSubidaDesdeTarea(tarea(), SUGERENCIA));
    await act(async () => fireEvent.press(utils.getByText("Seleccionar archivo")));
    await act(async () => {
      const botones = utils.getAllByText("Subir documento");
      fireEvent.press(botones[botones.length - 1]);
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await act(async () => botonDelAlert("Documento guardado", "Subir otro").onPress());
    await act(async () => fireEvent.press(utils.getByText("Seleccionar archivo")));

    expect(utils.getByDisplayValue("IMG_2041")).toBeTruthy();
    expect(utils.getByText("Reservas y entradas")).toBeTruthy();
  });

  it("una tarea privada propone el documento como privado", async () => {
    const { utils } = await abrir(datosSubidaDesdeTarea(tarea({ EsPrivada: true })));

    expect(utils.getByText("Solo vos vas a poder verlo.")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Documentos desde la actividad
// ---------------------------------------------------------------------------

describe("documentos en la actividad", () => {
  it("la actividad muestra las entradas subidas desde su tarea y las abre", async () => {
    const onAbrirDocumento = jest.fn();
    const documento = {
      idDocumento: 30,
      idChecklist: 5,
      nombreArchivo: "Entradas – Museo del Prado.pdf",
      urlArchivo: "https://storage.test/entradas.pdf",
      esPublico: true,
    };
    const utils = await render(
      <DayAgenda
        fecha="2026-12-07"
        actividades={[{ id: 40, title: "Museo del Prado", horaInicio: "10:00", horaFin: "12:00", documentosReserva: [documento] }]}
        onAbrirDocumento={onAbrirDocumento}
      />
    );

    await act(async () => fireEvent.press(utils.getByTestId("agenda-documento-30")));

    expect(utils.getByText("Entradas – Museo del Prado.pdf")).toBeTruthy();
    expect(onAbrirDocumento).toHaveBeenCalledWith(documento);
  });
});
