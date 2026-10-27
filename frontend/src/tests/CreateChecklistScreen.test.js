import React from "react";
import { Alert, Keyboard } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import CrearChecklistScreen from "../screens/CreateChecklistScreen";
import {
  createChecklist,
  getChecklistCategories,
  updateChecklist,
} from "../services/api";

jest.mock("../services/api", () => ({
  createChecklist: jest.fn(),
  getChecklistCategories: jest.fn(),
  updateChecklist: jest.fn(),
}));

const categorias = [
  { IdCategoriaChecklist: 1, Nombre: "Documentación" },
  { IdCategoriaChecklist: 2, Nombre: "Transporte" },
];

const participantes = [
  { id: 11, nombreCompleto: "Ana Gómez" },
  { id: 12, nombreCompleto: "Juan Pérez" },
];

const mockOnClose = jest.fn();
const mockOnChecklistGuardado = jest.fn();

async function press(utils, texto) {
  await act(async () => {
    const matches = utils.getAllByText(texto);
    fireEvent.press(matches[matches.length - 1]);
  });
}

async function escribir(utils, placeholder, texto) {
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText(placeholder), texto);
  });
}

async function renderPantallaCargada(props = {}) {
  const utils = await render(
    <CrearChecklistScreen
      visible={true}
      tripId={10}
      onClose={mockOnClose}
      onChecklistGuardado={mockOnChecklistGuardado}
      participantes={participantes}
      {...props}
    />
  );
  await waitFor(() =>
    expect(
      utils.getByText(props.checklistToEdit ? "Documentación" : "Seleccioná una categoría")
    ).toBeTruthy()
  );
  return utils;
}

function contarModales(nodo) {
  if (!nodo) return 0;
  if (Array.isArray(nodo)) return nodo.reduce((total, hijo) => total + contarModales(hijo), 0);
  if (typeof nodo !== "object") return 0;
  return (nodo.type === "Modal" ? 1 : 0) + contarModales(nodo.children);
}

async function seleccionarCategoria(utils, nombre) {
  await press(utils, "Seleccioná una categoría");
  await press(utils, nombre);
}

describe("US - Gestionar checklist (CreateChecklistScreen)", () => {
  let alertMock;

  beforeEach(() => {
    jest.clearAllMocks();
    getChecklistCategories.mockResolvedValue(categorias);
    alertMock = jest.spyOn(Alert, "alert").mockImplementation((title, message, buttons) => {
      buttons?.[0]?.onPress?.();
    });
  });

  afterEach(() => {
    alertMock.mockRestore();
  });

  it("carga las categorías al abrir el formulario", async () => {
    const utils = await renderPantallaCargada();

    expect(getChecklistCategories).toHaveBeenCalledTimes(1);
    await press(utils, "Seleccioná una categoría");
    expect(utils.getByText("Transporte")).toBeTruthy();
  });

  it("muestra errores de validación si se intenta crear sin completar los campos obligatorios", async () => {
    const utils = await renderPantallaCargada();

    await press(utils, "Crear tarea");

    expect(utils.getByText("El título de la tarea es obligatorio.")).toBeTruthy();
    expect(utils.getByText("Seleccioná una categoría.")).toBeTruthy();
    expect(createChecklist).not.toHaveBeenCalled();
  });

  it("crea una tarea con categoría y responsables seleccionados", async () => {
    const tareaCreada = { IdChecklist: 21, Nombre: "Comprar pasajes" };
    createChecklist.mockResolvedValue({ item: tareaCreada });
    const utils = await renderPantallaCargada();

    await escribir(utils, "Comprar vuelos de ida y vuelta", "Comprar pasajes");
    await seleccionarCategoria(utils, "Transporte");
    // Responsables: misma hoja que la división de un gasto.
    expect(utils.getByText("Sin asignar")).toBeTruthy();
    await act(async () => {
      fireEvent.press(utils.getByTestId("abrir-responsables"));
    });
    await press(utils, "Ana Gómez");
    await press(utils, "Listo");
    expect(utils.getAllByText("Ana Gómez").length).toBeGreaterThan(0);
    await press(utils, "Crear tarea");

    await waitFor(() => expect(createChecklist).toHaveBeenCalledTimes(1));
    expect(createChecklist).toHaveBeenCalledWith(10, {
      Nombre: "Comprar pasajes",
      IdCategoriaChecklist: 2,
      IdsResponsables: [11],
      EsPrivada: false,
    });
    expect(alertMock).toHaveBeenCalledWith(
      "¡Listo!",
      "La tarea se creó correctamente.",
      expect.any(Array)
    );
    expect(mockOnChecklistGuardado).toHaveBeenCalledWith(tareaCreada, false);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("muestra el error del backend si falla la creación", async () => {
    createChecklist.mockRejectedValue(new Error("No se pudo conectar con el servidor."));
    const utils = await renderPantallaCargada();

    await escribir(utils, "Comprar vuelos de ida y vuelta", "Comprar pasajes");
    await seleccionarCategoria(utils, "Documentación");
    await press(utils, "Crear tarea");

    await waitFor(() =>
      expect(alertMock).toHaveBeenCalledWith(
        "Error",
        "No se pudo conectar con el servidor.",
        undefined
      )
    );
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("precarga y actualiza una tarea en modo edición", async () => {
    const tarea = {
      IdChecklist: 31,
      Nombre: "Reservar hotel",
      CategoriaChecklist: { IdCategoriaChecklist: 1, Nombre: "Documentación" },
      Responsables: [{ IdUsuario: 12 }],
    };
    const tareaActualizada = { IdChecklist: 31, Nombre: "Reservar alojamiento" };
    updateChecklist.mockResolvedValue({ item: tareaActualizada });
    const utils = await renderPantallaCargada({ checklistToEdit: tarea });

    expect(utils.getByDisplayValue("Reservar hotel")).toBeTruthy();
    await escribir(utils, "Comprar vuelos de ida y vuelta", "Reservar alojamiento");
    await press(utils, "Guardar cambios");

    await waitFor(() => expect(updateChecklist).toHaveBeenCalledTimes(1));
    expect(updateChecklist).toHaveBeenCalledWith(10, 31, {
      Nombre: "Reservar alojamiento",
      IdCategoriaChecklist: 1,
      IdsResponsables: [12],
      EsPrivada: false,
    });
    expect(mockOnChecklistGuardado).toHaveBeenCalledWith(tareaActualizada, true);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("cierra el formulario al presionar la cruz", async () => {
    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.press(utils.getByTestId("close-checklist-modal"));
    });

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("abre el selector de categorías dentro del mismo modal (en iOS no se puede abrir un segundo Modal)", async () => {
    const utils = await renderPantallaCargada();
    const dismiss = jest.spyOn(Keyboard, "dismiss");

    await press(utils, "Seleccioná una categoría");

    expect(utils.getByText("Seleccionar Categoría")).toBeTruthy();
    expect(contarModales(utils.toJSON())).toBe(1);
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it("cierra el selector de categorías al tocar fuera de la hoja", async () => {
    const utils = await renderPantallaCargada();

    await press(utils, "Seleccioná una categoría");
    await act(async () => {
      fireEvent.press(utils.getByTestId("cerrar-selector-categoria"));
    });

    expect(utils.queryByText("Seleccionar Categoría")).toBeNull();
  });

  it("el título cierra el teclado con la tecla Listo", async () => {
    const utils = await renderPantallaCargada();
    const input = utils.getByPlaceholderText("Comprar vuelos de ida y vuelta");

    expect(input.props.returnKeyType).toBe("done");
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    await act(async () => {
      fireEvent(input, "submitEditing");
    });
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it("no ofrece 'Seleccionar todos': una tarea de todos se deja sin asignar", async () => {
    const utils = await renderPantallaCargada();

    await act(async () => {
      fireEvent.press(utils.getByTestId("abrir-responsables"));
    });

    expect(utils.queryByText("Seleccionar todos")).toBeNull();
    expect(utils.getByText(/dejala sin asignar/)).toBeTruthy();
    await press(utils, "Ana Gómez");
    await press(utils, "Juan Pérez");
    await press(utils, "Listo");
    expect(utils.getByText("2 responsables")).toBeTruthy();
  });
});
