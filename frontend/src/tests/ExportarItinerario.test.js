import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import ExportarItinerarioModal from "../components/trip/ExportarItinerarioModal";
import {
  MENSAJE_SIN_CONTENIDO,
  diasExportables,
  errorReintentable,
  mensajeErrorExportacion,
  nombreArchivoItinerario,
  tieneContenido,
} from "../utils/exportarItinerario";

const DIAS = [
  { dayId: 1, dayIndex: 1, dayDateTextCorta: "Mar 10 Nov", actividades: [{ id: 7 }] },
  { dayId: 2, dayIndex: 2, dayDateTextCorta: "Mié 11 Nov", actividades: [] },
  { dayId: 3, dayIndex: 3, dayDateTextCorta: "Jue 12 Nov", actividades: [{ id: 8 }] },
];

async function renderModal({ exportar, compartir, dias = DIAS } = {}) {
  const props = {
    exportar: exportar ?? jest.fn().mockResolvedValue({ uri: "file:///cache/itinerario" }),
    compartir: compartir ?? jest.fn().mockResolvedValue(true),
    onClose: jest.fn(),
  };
  await render(
    <ExportarItinerarioModal visible tripId={5} tripTitle="Escapada" dias={dias} {...props} />
  );
  return props;
}

describe("utilidades de exportación", () => {
  it("arma el nombre del archivo sin caracteres inválidos", () => {
    expect(nombreArchivoItinerario("Escapada", "pdf")).toBe("Itinerario - Escapada.pdf");
    expect(nombreArchivoItinerario('Viaje: "Europa"/26', "ics")).toBe("Itinerario - Viaje Europa 26.ics");
  });

  it("detecta si los días elegidos tienen algo para exportar", () => {
    const opciones = diasExportables(DIAS);
    expect(tieneContenido(opciones, [])).toBe(true);
    expect(tieneContenido(opciones, [2])).toBe(false);
    expect(tieneContenido(opciones, [2, 3])).toBe(true);
  });

  it("traduce los errores del backend y decide si se puede reintentar", () => {
    const vacio = Object.assign(new Error("x"), { code: "ITINERARY_EMPTY" });
    const fallo = Object.assign(new Error("No se pudo generar el archivo."), { code: "EXPORT_FAILED" });
    expect(mensajeErrorExportacion(vacio)).toBe(MENSAJE_SIN_CONTENIDO);
    expect(errorReintentable(vacio)).toBe(false);
    expect(errorReintentable(fallo)).toBe(true);
    expect(mensajeErrorExportacion(new TypeError("Network request failed"))).toMatch(/conexión/);
  });
});

describe("Modal de exportar itinerario", () => {
  it("avisa que el archivo refleja el itinerario actual", async () => {
    await renderModal();

    expect(screen.getByText(/refleja el itinerario de este momento/)).toBeTruthy();
  });

  it("exporta el viaje completo en PDF y lo comparte", async () => {
    const { exportar, compartir, onClose } = await renderModal();

    await fireEvent.press(screen.getByText("Exportar"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(exportar).toHaveBeenCalledWith(5, {
      formato: "pdf",
      dias: [],
      nombreArchivo: "Itinerario - Escapada.pdf",
    });
    expect(compartir).toHaveBeenCalledWith("file:///cache/itinerario", "pdf");
  });

  it("exporta a calendario solo los días elegidos", async () => {
    const { exportar } = await renderModal();

    await fireEvent.press(screen.getByTestId("exportar-formato-ics"));
    await fireEvent.press(screen.getByTestId("exportar-modo-dias"));
    await fireEvent.press(screen.getByTestId("exportar-dia-3"));
    await fireEvent.press(screen.getByText("Exportar"));

    await waitFor(() =>
      expect(exportar).toHaveBeenCalledWith(5, {
        formato: "ics",
        dias: [3],
        nombreArchivo: "Itinerario - Escapada.ics",
      })
    );
  });

  it("no genera el archivo si los días elegidos están vacíos", async () => {
    const { exportar } = await renderModal();

    await fireEvent.press(screen.getByTestId("exportar-modo-dias"));
    await fireEvent.press(screen.getByTestId("exportar-dia-2"));
    await fireEvent.press(screen.getByText("Exportar"));

    expect(screen.getByText(MENSAJE_SIN_CONTENIDO)).toBeTruthy();
    expect(screen.queryByTestId("exportar-reintentar")).toBeNull();
    expect(exportar).not.toHaveBeenCalled();
  });

  it("pide elegir al menos un día", async () => {
    const { exportar } = await renderModal();

    await fireEvent.press(screen.getByTestId("exportar-modo-dias"));
    await fireEvent.press(screen.getByText("Exportar"));

    expect(screen.getByText("Elegí al menos un día.")).toBeTruthy();
    expect(exportar).not.toHaveBeenCalled();
  });

  it("si falla muestra el error y permite reintentar", async () => {
    const exportar = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("No se pudo generar el archivo. Intentá de nuevo."), { code: "EXPORT_FAILED" })
      )
      .mockResolvedValueOnce({ uri: "file:///cache/itinerario" });
    const { onClose } = await renderModal({ exportar });

    await fireEvent.press(screen.getByText("Exportar"));
    await waitFor(() => expect(screen.getByTestId("exportar-error")).toBeTruthy());
    expect(screen.getByText("No se pudo generar el archivo. Intentá de nuevo.")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("exportar-reintentar"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(exportar).toHaveBeenCalledTimes(2);
  });
});