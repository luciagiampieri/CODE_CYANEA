/**
 * US: Recordar la compra de entradas o la reserva en el checklist (frontend).
 *
 * - "Recordármelo" en el diálogo de la recomendación (formulario de actividad y
 *   Explorar → Lugares guardados) crea la tarea con `crearTareaEntradas`.
 * - Al cambiar el lugar de una actividad con tareas pendientes, el backend responde
 *   `confirmarTareasEntradas` sin guardar: se avisa y, si confirma, se reenvía con
 *   `tareasEntradasAEliminar`.
 * - Al eliminar la actividad, el aviso nombra las tareas que también se eliminan.
 * - En el checklist, la tarea muestra el enlace oficial.
 *
 * `appAlert` delega en `Alert.alert` en los tests.
 */
import { Alert, Linking, Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddActivityScreen from "../screens/AddActivityScreen";
import PlaceScheduleSheet from "../components/map/PlaceScheduleSheet";
import ChecklistsByCategory from "../components/trip/ChecklistsByCategory";
import { crearTareaEntradas } from "../services/api";
import {
  agregarTareaAlChecklist,
  avisoTareasAlEliminar,
  mostrarConfirmacionTareasEntradas,
} from "../utils/dialogosActividad";
import { ofreceRecordatorio } from "../utils/recomendacionEntradas";
import { resolveNotificationTarget } from "../utils/notificationTarget";
import { appToast } from "../components/ui/AppDialog";

// El toast de confirmación se espía; el resto de AppDialog es el real.
jest.mock("../components/ui/AppDialog", () => {
  const real = jest.requireActual("../components/ui/AppDialog");
  return { ...real, appToast: jest.fn() };
});

jest.mock("../services/api", () => ({
  searchTripPlaces: jest.fn(),
  saveActivityLocation: jest.fn(),
  resolveTripPlace: jest.fn(),
  crearTareaEntradas: jest.fn(),
}));

const PRADO = {
  tipo: "ENTRADAS_ANTICIPADAS",
  mensaje: "Te recomendamos comprar las entradas antes de tu visita para asegurarte el ingreso.",
  nombreLugar: "Museo del Prado",
  urlSitioOficial: "https://www.museodelprado.es/",
  urlAccion: "https://entradas.museodelprado.es/comprar",
  verificada: true,
};

const TAREA_CREADA = {
  creada: true,
  item: { IdChecklist: 31, Nombre: "Comprar entradas – Museo del Prado", Enlace: PRADO.urlAccion },
};

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  onSubmit: jest.fn(),
  dayLabel: "Día 1 - lunes",
  tripId: 42,
  activityToEdit: null,
  onCancelEdit: jest.fn(),
};

const actividadEditable = {
  id: 7,
  title: "Museo del Prado",
  note: "",
  time: "10:00 - 12:00",
  icon: "camera",
  lugarInteres: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "web";
  window.alert = jest.fn();
  window.confirm = jest.fn().mockReturnValue(true);
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  crearTareaEntradas.mockResolvedValue(TAREA_CREADA);
});

afterEach(() => {
  Platform.OS = "web";
  Linking.openURL.mockRestore?.();
  Alert.alert.mockRestore?.();
});

function dialogo(indice = Alert.alert.mock.calls.length - 1) {
  const [titulo, mensaje, botones, opciones] = Alert.alert.mock.calls[indice];
  return { titulo, mensaje, botones, opciones: opciones || {}, textos: (botones || []).map((b) => b.text) };
}

function boton(texto) {
  return dialogo().botones.find((b) => b.text === texto);
}

async function elegirHora(utils, label, valor) {
  await act(async () => {
    fireEvent(utils.getByLabelText(label), "change", { target: { value: valor } });
  });
}

async function registrar(onSubmit) {
  const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);
  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("Visita al museo"), "Museo del Prado");
  });
  await elegirHora(utils, "Hora de inicio", "10:00");
  await elegirHora(utils, "Hora de fin", "12:00");
  await act(async () => {
    const botones = utils.getAllByText("Agregar actividad");
    fireEvent.press(botones[botones.length - 1]);
  });
  return utils;
}

async function editar(onSubmit) {
  const utils = await render(
    <AddActivityScreen {...baseProps} onSubmit={onSubmit} activityToEdit={actividadEditable} />
  );
  await act(async () => {
    fireEvent.press(utils.getByText("Guardar cambios"));
  });
  return utils;
}

/* ---------------------------- Recordármelo ---------------------------- */

describe("Recordármelo en la recomendación", () => {
  it("se ofrece para reservas (obligatorias, recomendadas o posibles) y compras anticipadas, no para boletería", () => {
    expect(ofreceRecordatorio({ tipo: "RESERVA" })).toBe(true);
    expect(ofreceRecordatorio({ tipo: "RESERVA_DISPONIBLE" })).toBe(true);
    expect(ofreceRecordatorio({ tipo: "ENTRADAS_ANTICIPADAS" })).toBe(true);
    expect(ofreceRecordatorio({ tipo: "ENTRADAS_PRESENCIALES" })).toBe(false);
    expect(ofreceRecordatorio(null)).toBe(false);
  });

  it("crea la tarea con el enlace oficial y la actividad guardada, y confirma", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ IdActividad: 7, RecomendacionEntradas: PRADO });
    await registrar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dialogo().textos).toEqual(["Ahora no", "Recordármelo", "Comprar entradas"]);

    await act(async () => {
      await boton("Recordármelo").onPress();
    });

    expect(crearTareaEntradas).toHaveBeenCalledWith(42, 7, {
      tipo: "ENTRADAS_ANTICIPADAS",
      enlace: "https://entradas.museodelprado.es/comprar",
      nombreLugar: "Museo del Prado",
    });
    expect(baseProps.onClose).toHaveBeenCalled(); // el formulario ya se cerró
    expect(Linking.openURL).not.toHaveBeenCalled();
    // Se confirma con un aviso breve, sin otro diálogo que haya que cerrar.
    expect(appToast).toHaveBeenCalledWith("Listo, lo agregamos a tu checklist", { icono: "circle-check" });
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it("en una edición usa el id de la actividad editada", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ RecomendacionEntradas: { ...PRADO, tipo: "RESERVA" } });
    await editar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await act(async () => {
      await boton("Recordármelo").onPress();
    });

    expect(crearTareaEntradas).toHaveBeenCalledWith(42, 7, expect.objectContaining({ tipo: "RESERVA" }));
  });

  it("'Ahora no' no crea ninguna tarea", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ IdActividad: 7, RecomendacionEntradas: PRADO });
    await registrar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await act(async () => {
      boton("Ahora no").onPress?.();
    });

    expect(crearTareaEntradas).not.toHaveBeenCalled();
    expect(appToast).not.toHaveBeenCalled();
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("abrir el enlace oficial no crea ninguna tarea", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ IdActividad: 7, RecomendacionEntradas: PRADO });
    await registrar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await act(async () => {
      await boton("Comprar entradas").onPress();
    });

    expect(Linking.openURL).toHaveBeenCalledWith(PRADO.urlAccion);
    expect(crearTareaEntradas).not.toHaveBeenCalled();
  });

  it("en boletería no se ofrece Recordármelo", async () => {
    const onSubmit = jest.fn().mockResolvedValue({
      IdActividad: 7,
      RecomendacionEntradas: { ...PRADO, tipo: "ENTRADAS_PRESENCIALES", urlAccion: null },
    });
    await registrar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(dialogo().textos).toEqual(["Ver sitio oficial", "Entendido"]);
    expect(dialogo().textos).not.toContain("Recordármelo");
  });

  it("sin enlace oficial crea la tarea sin enlace", async () => {
    const onSubmit = jest.fn().mockResolvedValue({
      IdActividad: 7,
      RecomendacionEntradas: { ...PRADO, urlAccion: null, urlSitioOficial: null },
    });
    await registrar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    await act(async () => {
      await boton("Recordármelo").onPress();
    });

    expect(crearTareaEntradas).toHaveBeenCalledWith(42, 7, expect.objectContaining({ enlace: null }));
  });

  it("si la tarea ya existía lo informa", async () => {
    crearTareaEntradas.mockResolvedValue({ ...TAREA_CREADA, creada: false });

    await act(async () => {
      await agregarTareaAlChecklist(PRADO, { tripId: 42, activityId: 7 }, PRADO.urlAccion);
    });

    expect(appToast).toHaveBeenCalledWith("Ya estaba en tu checklist", { icono: "list-check" });
  });

  it("si falla la creación informa el error y la actividad queda guardada", async () => {
    crearTareaEntradas.mockRejectedValue(new Error("Sin conexión"));

    let resultado;
    await act(async () => {
      resultado = await agregarTareaAlChecklist(PRADO, { tripId: 42, activityId: 7 }, PRADO.urlAccion);
    });

    expect(resultado).toBeNull();
    expect(dialogo().titulo).toBe("No se pudo agregar la tarea");
    expect(dialogo().mensaje).toContain("Sin conexión");
    expect(dialogo().mensaje).toContain("La actividad quedó guardada igual.");
  });

  it("nunca manda enlaces que no sean web", async () => {
    await act(async () => {
      await agregarTareaAlChecklist(PRADO, { tripId: 42, activityId: 7 }, "javascript:alert(1)");
    });

    expect(crearTareaEntradas).toHaveBeenCalledWith(42, 7, expect.objectContaining({ enlace: null }));
  });
});

describe("Recordármelo desde Explorar → Lugares guardados", () => {
  const days = [{ IdDiaCronograma: 7, IndiceDia: 1, Fecha: "2026-12-01" }];
  const place = { id: 3, name: "Museo del Prado", address: "Paseo del Prado" };

  it("ofrece Recordármelo y crea la tarea de la actividad agregada", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ IdActividad: 15, RecomendacionEntradas: PRADO });
    const utils = await render(
      <PlaceScheduleSheet days={days} place={place} tripId={42} visible onClose={jest.fn()} onSubmit={onSubmit} />
    );
    await elegirHora(utils, "Hora de inicio", "10:00");
    await elegirHora(utils, "Hora de fin", "12:00");
    await act(async () => {
      const botones = utils.getAllByText("Agregar al itinerario");
      fireEvent.press(botones[botones.length - 1]);
    });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(dialogo().textos).toEqual(["Ahora no", "Recordármelo", "Comprar entradas"]);

    await act(async () => {
      await boton("Recordármelo").onPress();
    });

    expect(crearTareaEntradas).toHaveBeenCalledWith(42, 15, expect.objectContaining({ tipo: "ENTRADAS_ANTICIPADAS" }));
  });
});

/* ----------------------- Cambio de lugar y borrado ----------------------- */

const CONFIRMACION = {
  confirmarTareasEntradas: true,
  mensaje: "Al cambiar el lugar de la actividad, se eliminará la tarea «Comprar entradas – Museo del Prado» del checklist.",
  tareas: [{ idChecklist: 31, nombre: "Comprar entradas – Museo del Prado" }],
};

describe("Cambio de lugar de una actividad con tareas pendientes", () => {
  it("avisa antes de guardar y, si confirma, reenvía aceptando eliminar las tareas", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce(CONFIRMACION)
      .mockResolvedValueOnce({ IdActividad: 7, RecomendacionEntradas: null });

    await editar(onSubmit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("«Comprar entradas – Museo del Prado»"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Si cancelás, no se guardan los cambios."));
    expect(onSubmit.mock.calls[0][0].tareasEntradasAEliminar).toBeUndefined();
    expect(onSubmit.mock.calls[1][0].tareasEntradasAEliminar).toEqual([31]);
  });

  it("si cancela no guarda nada y el formulario sigue abierto", async () => {
    window.confirm.mockReturnValue(false);
    const onSubmit = jest.fn().mockResolvedValueOnce(CONFIRMACION);

    await editar(onSubmit);

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it("con advertencia de horario mantiene las tareas aceptadas al confirmar", async () => {
    const advertencia = {
      advertencia: true,
      tipo: "fuera_de_horario",
      mensaje: "",
      horariosApertura: "10:00 - 18:00",
      resumen: "Fuera de horario",
      googlePlaceIdEntradas: "ChIJreina",
    };
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce(CONFIRMACION)
      .mockResolvedValueOnce(advertencia)
      .mockResolvedValueOnce({ IdActividad: 7, RecomendacionEntradas: null });

    await editar(onSubmit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls[2][0]).toEqual(
      expect.objectContaining({ tareasEntradasAEliminar: [31], googlePlaceIdEntradas: "ChIJreina" })
    );
    expect(onSubmit.mock.calls[2][1]).toEqual({ ignorarAdvertencia: true });
  });

  it("en nativo usa el diálogo de la app con 'Cancelar' y 'Cambiar lugar'", () => {
    Platform.OS = "android";
    const onConfirmar = jest.fn();

    mostrarConfirmacionTareasEntradas(CONFIRMACION, { onConfirmar });

    expect(dialogo().titulo).toBe("¿Cambiar el lugar de la actividad?");
    expect(dialogo().textos).toEqual(["Cancelar", "Cambiar lugar"]);
    boton("Cambiar lugar").onPress();
    expect(onConfirmar).toHaveBeenCalledWith([31]);
  });
});

describe("Aviso al eliminar una actividad", () => {
  it("nombra las tareas pendientes que también se eliminan", () => {
    expect(avisoTareasAlEliminar([])).toBe("");
    expect(avisoTareasAlEliminar([{ idChecklist: 1, nombre: "Reservar – Don Julio" }])).toBe(
      "\n\nTambién se eliminará la tarea «Reservar – Don Julio» del checklist."
    );
    expect(
      avisoTareasAlEliminar([
        { idChecklist: 1, nombre: "A" },
        { idChecklist: 2, nombre: "B" },
      ])
    ).toContain("se eliminarán estas tareas del checklist: «A», «B».");
  });
});

/* ------------------------------ Checklist ------------------------------ */

describe("Tarea en el checklist", () => {
  const tareaConEnlace = {
    IdChecklist: 31,
    Nombre: "Comprar entradas – Museo del Prado",
    Completada: false,
    EsPropio: true,
    Responsables: [],
    CategoriaChecklist: { IdCategoriaChecklist: 10, Nombre: "Reservas y entradas" },
    Enlace: "https://entradas.museodelprado.es/comprar",
    IdActividad: 7,
  };

  it("muestra el enlace oficial y lo abre", async () => {
    const utils = await render(
      <ChecklistsByCategory checklists={[tareaConEnlace]} onToggleTarea={jest.fn()} puedeCompletar />
    );

    expect(utils.getByText("entradas.museodelprado.es")).toBeTruthy();
    await act(async () => {
      fireEvent.press(utils.getByTestId("enlace-checklist-31"));
    });
    expect(Linking.openURL).toHaveBeenCalledWith("https://entradas.museodelprado.es/comprar");
  });

  it("no muestra enlaces que no sean web", async () => {
    const utils = await render(
      <ChecklistsByCategory
        checklists={[{ ...tareaConEnlace, Enlace: "javascript:alert(1)" }]}
        onToggleTarea={jest.fn()}
        puedeCompletar
      />
    );

    expect(utils.queryByTestId("enlace-checklist-31")).toBeNull();
  });
});

describe("Notificaciones de las tareas", () => {
  it.each([
    ["tarea_entradas_creada"],
    ["tarea_entradas_asignada"],
    ["tarea_entradas_eliminada"],
  ])("%s abre el checklist del viaje", (tipo) => {
    expect(resolveNotificationTarget({ viajeId: 4, tipo }).initialTab).toBe("checklist");
  });

  it("el push abre el checklist", () => {
    expect(resolveNotificationTarget({ tripId: 4, eventType: "checklist_task_created" }).initialTab).toBe(
      "checklist"
    );
  });
});
