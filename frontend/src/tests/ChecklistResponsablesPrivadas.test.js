import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import CrearChecklistScreen from "../screens/CreateChecklistScreen";
import ChecklistsByCategory, { detalleTarea } from "../components/trip/ChecklistsByCategory";
import { createChecklist, getChecklistCategories, updateChecklist } from "../services/api";

jest.mock("../services/api", () => ({
  createChecklist: jest.fn(),
  getChecklistCategories: jest.fn(),
  updateChecklist: jest.fn(),
}));

const categorias = [{ IdCategoriaChecklist: 1, Nombre: "Documentación" }];
const participantes = [
  { id: 11, nombreCompleto: "Ana Gómez" },
  { id: 12, nombreCompleto: "Lucía Pérez" },
];

function tarea(cambios = {}) {
  return {
    IdChecklist: 5,
    Nombre: "Comprar vuelos",
    Completada: false,
    EsPropio: false,
    Responsables: [],
    CategoriaChecklist: { IdCategoriaChecklist: 1, Nombre: "Documentación" },
    PuedeCompletar: true,
    PuedeSerPrivada: true,
    EsPrivada: false,
    ...cambios,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getChecklistCategories.mockResolvedValue(categorias);
  createChecklist.mockResolvedValue({ item: tarea() });
  updateChecklist.mockResolvedValue({ item: tarea() });
  jest.spyOn(Alert, "alert").mockImplementation((titulo, mensaje, botones) => botones?.[0]?.onPress?.());
});

afterEach(() => {
  Alert.alert.mockRestore();
});

async function abrirFormulario(props = {}) {
  const utils = await render(
    <CrearChecklistScreen
      visible
      tripId={10}
      onClose={jest.fn()}
      onChecklistGuardado={jest.fn()}
      participantes={participantes}
      currentUserId={11}
      {...props}
    />
  );
  await waitFor(() => expect(getChecklistCategories).toHaveBeenCalled());
  return utils;
}

async function presionar(utils, texto) {
  await act(async () => {
    const elementos = utils.getAllByText(texto);
    fireEvent.press(elementos[elementos.length - 1]);
  });
}

/* --------------------------- Formulario --------------------------- */

describe("Visibilidad pública o privada en el formulario de tareas", () => {
  it("es pública por defecto y muestra los responsables", async () => {
    const utils = await abrirFormulario();

    expect(utils.getByText("Visibilidad")).toBeTruthy();
    expect(utils.getByTestId("visibilidad-publica").props.accessibilityState.selected).toBe(true);
    expect(utils.getByText("Visible para todos los participantes del viaje.")).toBeTruthy();
    expect(utils.getByText("Responsables (opcional)")).toBeTruthy();
  });

  it("al elegir 'Privada' oculta los responsables y crea la tarea privada", async () => {
    const utils = await abrirFormulario();
    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Comprar vuelos de ida y vuelta"), "Llevar mis remedios");
    });
    await act(async () => fireEvent.press(utils.getByTestId("visibilidad-privada")));

    expect(utils.queryByText("Responsables (opcional)")).toBeNull();
    expect(utils.getByText("Solo vos vas a poder verla. Queda asignada a vos.")).toBeTruthy();

    await presionar(utils, "Seleccioná una categoría");
    await presionar(utils, "Documentación");
    await presionar(utils, "Crear tarea");

    await waitFor(() => expect(createChecklist).toHaveBeenCalled());
    expect(createChecklist).toHaveBeenCalledWith(10, {
      Nombre: "Llevar mis remedios",
      IdCategoriaChecklist: 1,
      IdsResponsables: [],
      EsPrivada: true,
    });
  });

  it("no deja hacer privada una tarea asignada a otro integrante hasta quitarlo", async () => {
    const utils = await abrirFormulario({
      checklistToEdit: tarea({ EsPropio: true, Responsables: [{ IdUsuario: 12, NombreCompleto: "Lucía Pérez" }] }),
    });

    expect(
      utils.getByText("Visible para todos. Para hacerla privada, primero quitá a los otros responsables.")
    ).toBeTruthy();
    expect(utils.getByTestId("visibilidad-privada").props.accessibilityState.disabled).toBe(true);

    await act(async () => fireEvent.press(utils.getByTestId("abrir-responsables")));
    await presionar(utils, "Lucía Pérez"); // se quita a Lucía
    await presionar(utils, "Listo");
    expect(utils.getByTestId("visibilidad-privada").props.accessibilityState.disabled).toBe(false);
  });

  it("una tarea de «Recordármelo» no se puede hacer privada", async () => {
    const utils = await abrirFormulario({
      checklistToEdit: tarea({ EsPropio: true, PuedeSerPrivada: false }),
    });

    expect(utils.getByTestId("visibilidad-privada").props.accessibilityState.disabled).toBe(true);
    expect(utils.getByText("Las tareas creadas con «Recordármelo» son del grupo.")).toBeTruthy();

    await presionar(utils, "Guardar cambios");
    await waitFor(() => expect(updateChecklist).toHaveBeenCalled());
    expect(updateChecklist.mock.calls[0][2]).not.toHaveProperty("EsPrivada");
  });

  it("al editar una tarea privada la mantiene privada", async () => {
    const utils = await abrirFormulario({
      checklistToEdit: tarea({ EsPropio: true, EsPrivada: true, Responsables: [{ IdUsuario: 11, NombreCompleto: "Ana Gómez" }] }),
    });

    expect(utils.getByTestId("visibilidad-privada").props.accessibilityState.selected).toBe(true);
    await presionar(utils, "Guardar cambios");

    await waitFor(() => expect(updateChecklist).toHaveBeenCalled());
    expect(updateChecklist.mock.calls[0][2]).toEqual(expect.objectContaining({ EsPrivada: true, IdsResponsables: [] }));
  });
});

/* ------------------------------ Tarjeta ------------------------------ */

describe("Tarea en el checklist", () => {
  async function mostrar(lista, onToggle = jest.fn()) {
    const utils = await render(
      <ChecklistsByCategory checklists={lista} onToggle={onToggle} puedeCompletar currentUserId={11} />
    );
    return { utils, onToggle };
  }

  it("si está asignada a otra persona, la casilla está deshabilitada y dice a quién", async () => {
    const { utils, onToggle } = await mostrar([
      tarea({ PuedeCompletar: false, Responsables: [{ IdUsuario: 12, NombreCompleto: "Lucía Pérez" }] }),
    ]);

    expect(utils.getByText("Asignada a Lucía")).toBeTruthy();
    const casilla = utils.getByTestId("toggle-checklist-5");
    expect(casilla.props.accessibilityState.disabled).toBe(true);
    await act(async () => fireEvent.press(casilla));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("el responsable puede marcarla", async () => {
    const { utils, onToggle } = await mostrar([
      tarea({ PuedeCompletar: true, Responsables: [{ IdUsuario: 11, NombreCompleto: "Ana Gómez" }] }),
    ]);

    await act(async () => fireEvent.press(utils.getByTestId("toggle-checklist-5")));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("una tarea hecha muestra quién la completó", async () => {
    const { utils } = await mostrar([
      tarea({
        Completada: true,
        NombreUsuarioCompletada: "Lucía Pérez",
        Responsables: [{ IdUsuario: 12, NombreCompleto: "Lucía Pérez" }],
      }),
    ]);

    expect(utils.getByText("Hecha por Lucía")).toBeTruthy();
  });

  it("una tarea privada se distingue con un candado", async () => {
    const { utils } = await mostrar([tarea({ EsPrivada: true, Nombre: "Llevar mis remedios" })]);

    expect(utils.getByTestId("privada-checklist-5")).toBeTruthy();
    expect(utils.getByText("Solo para vos")).toBeTruthy();
  });

  it("arma el detalle de cada tarea", () => {
    expect(detalleTarea(tarea())).toBeNull();
    expect(
      detalleTarea(
        tarea({
          Responsables: [
            { IdUsuario: 1, NombreCompleto: "Ana Gómez" },
            { IdUsuario: 2, NombreCompleto: "Lucía Pérez" },
            { IdUsuario: 3, NombreCompleto: "Bruno Díaz" },
          ],
        })
      ).texto
    ).toBe("Asignada a Ana, Lucía y Bruno");
    expect(detalleTarea(tarea({ Completada: true, NombreUsuarioCompletada: "Bruno Díaz" })).texto).toBe(
      "Hecha por Bruno"
    );
  });
});
