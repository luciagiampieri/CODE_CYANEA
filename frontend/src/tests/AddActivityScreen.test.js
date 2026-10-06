/**
 * Tests de AddActivityScreen
 *  - Formulario base (validaciones, ícono, edición, buscador de ubicación)
 *  - US 98 - Detectar lugares y validar horarios de actividades
 *
 * Contrato que asume el componente para la US 98:
 *   onSubmit(datos, { ignorarAdvertencia })
 *     -> resuelve con  { advertencia: true, mensaje, horariosApertura, nombreLugar }  (incompatibilidad)
 *     -> resuelve con  undefined / { advertencia: false, ... }                          (todo OK / no verificable)
 *     -> rechaza con Error                                                              (falla del análisis)
 *
 * La búsqueda del lugar (por nombre o por ubicación asociada) la hace el backend: el frontend
 * debe enviarle el nombre de la actividad y, si hay, el idLugarInteres.
 */
import { Alert, Platform } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import AddActivityScreen from "../screens/AddActivityScreen";
import { searchTripPlaces, saveActivityLocation, resolveTripPlace } from "../services/api";

jest.mock("../services/api", () => ({
  searchTripPlaces: jest.fn(),
  saveActivityLocation: jest.fn(),
  resolveTripPlace: jest.fn(),
}));

const TITULO_ADVERTENCIA = "Revisá el horario de tu actividad";

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "web";
  // En el entorno jest de React Native `window.alert/confirm` no existen: los mockeamos.
  window.alert = jest.fn();
  window.confirm = jest.fn().mockReturnValue(false);
});

afterEach(() => {
  Platform.OS = "web";
});

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
  id: 5,
  title: "Cena de bienvenida",
  note: "",
  time: "20:00 - 22:00",
  icon: "utensils",
  lugarInteres: { id: 9, name: "Restó La Cyanea" },
};

/* ----------------------------- helpers ----------------------------- */

async function llenarFormularioValido(utils, overrides = {}) {
  const {
    nombre = "Visita al museo",
    inicio = "10:00",
    fin = "12:00",
  } = overrides;

  await act(async () => {
    fireEvent.changeText(utils.getByPlaceholderText("Visita al museo"), nombre);
  });

  await elegirHora(utils, 0, inicio);
  await elegirHora(utils, 1, fin);
}

// En web los horarios se eligen con el <input type="time"> del navegador
// (0 = hora de inicio, 1 = hora de fin).
async function elegirHora(utils, indice, valor) {
  await act(async () => {
    const label = indice === 0 ? "Hora de inicio" : "Hora de fin";
    fireEvent(utils.getByLabelText(label), "change", { target: { value: valor } });
  });
}

async function press(utils, texto) {
  await act(async () => {
    fireEvent.press(utils.getByText(texto));
  });
}

async function pressSubmit(utils, texto = "Agregar actividad") {
  await act(async () => {
    const matches = utils.getAllByText(texto);
    fireEvent.press(matches[matches.length - 1]);
  });
}

async function renderYEnviar(onSubmit, { nombre, inicio, fin } = {}) {
  const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);
  await llenarFormularioValido(utils, { nombre, inicio, fin });
  await pressSubmit(utils);
  return utils;
}

async function renderEdicionYEnviar(onSubmit, activity = actividadEditable) {
  const utils = await render(
    <AddActivityScreen {...baseProps} onSubmit={onSubmit} activityToEdit={activity} />
  );
  await pressSubmit(utils, "Guardar cambios");
  return utils;
}

function mensajeDelConfirm() {
  return window.confirm.mock.calls[0][0];
}

function crearDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/* ------------------------------------------------------------------ */
/*  Formulario base                                                    */
/* ------------------------------------------------------------------ */

describe("AddActivityScreen", () => {
  it("muestra error si se intenta guardar sin nombre", async () => {
    const onSubmit = jest.fn();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await pressSubmit(utils, "Agregar actividad");

    expect(utils.getByText("El nombre de la actividad es obligatorio.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra error si los horarios no tienen formato HH:MM", async () => {
    const onSubmit = jest.fn();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils, { inicio: "10hs", fin: "12hs" });
    await pressSubmit(utils, "Agregar actividad");

    expect(utils.getByText("Ingresá los horarios en formato HH:MM.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra error si la hora de fin no es posterior a la de inicio", async () => {
    const onSubmit = jest.fn();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils, { inicio: "12:00", fin: "10:00" });
    await pressSubmit(utils, "Agregar actividad");

    expect(
      utils.getByText("La hora de fin debe ser posterior a la hora de inicio (dentro del mismo día).")
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("camino feliz: crea la actividad con los datos completados y muestra éxito", async () => {
    const onSubmit = jest.fn().mockResolvedValue();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils);
    await pressSubmit(utils, "Agregar actividad");

    // El éxito ahora se informa con un alert (window.alert en web), no con un texto en pantalla.
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls[0][0]).toContain("Éxito");
    expect(window.alert.mock.calls[0][0]).toContain("Actividad registrada correctamente.");

    // onSubmit recibe ahora un segundo argumento con { ignorarAdvertencia }.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Visita al museo",
        horaInicio: "10:00:00",
        horaFin: "12:00:00",
        icono: "camera",
        idLugarInteres: null,
      }),
      { ignorarAdvertencia: false }
    );
  });

  it("muestra el mensaje de error que devuelve onSubmit si falla el guardado", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("El servidor no responde."));
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils);
    await pressSubmit(utils, "Agregar actividad");

    await waitFor(() => expect(utils.getByText("El servidor no responde.")).toBeTruthy());
  });

  it("detecta automáticamente el ícono según el nombre de la actividad", async () => {
    const onSubmit = jest.fn().mockResolvedValue();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await llenarFormularioValido(utils, { nombre: "Cena en el restaurante" });
    await pressSubmit(utils, "Agregar actividad");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ icono: "utensils" }),
      { ignorarAdvertencia: false }
    );
  });

  it("permite elegir un ícono manualmente y deja de autodetectarlo", async () => {
    const onSubmit = jest.fn().mockResolvedValue();
    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    // Abrir selector de íconos
    await press(utils, "Otro");

    // Elegir Hotel
    await press(utils, "Hotel");

    await llenarFormularioValido(utils, { nombre: "Cena en el restaurante" });

    await pressSubmit(utils, "Agregar actividad");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ icono: "building" }),
      { ignorarAdvertencia: false }
    );
  });

  it("precarga los datos de la actividad cuando se edita una existente", async () => {
    const activityToEdit = {
      id: 5,
      title: "Cena de bienvenida",
      note: "Reservar mesa para 6",
      time: "20:00 - 22:00",
      icon: "utensils",
      lugarInteres: { id: 9, name: "Restó La Cyanea" },
    };

    const utils = await render(
      <AddActivityScreen {...baseProps} activityToEdit={activityToEdit} />
    );

    expect(utils.getByDisplayValue("Cena de bienvenida")).toBeTruthy();
    expect(utils.getByDisplayValue("Reservar mesa para 6")).toBeTruthy();
    // En web los horarios se muestran como texto sobre el selector del navegador.
    expect(utils.getByText("20:00")).toBeTruthy();
    expect(utils.getByText("22:00")).toBeTruthy();
    expect(utils.getByText("Restó La Cyanea")).toBeTruthy();
    expect(utils.getByText("Guardar cambios")).toBeTruthy();
  });

  it("busca lugares al escribir en el buscador y permite seleccionar uno", async () => {
    searchTripPlaces.mockResolvedValue([
      {
        placeId: "p1",
        name: "Museo del Prado",
        address: "Calle Ruiz de Alarcón, Madrid",
      },
    ]);

    resolveTripPlace.mockResolvedValue({
      placeId: "p1",
      name: "Museo del Prado",
      address: "Calle Ruiz de Alarcón, Madrid",
      lat: 40.415,
      lng: -3.693,
      category: "museum",
      metadata: { types: ["museum"] },
    });

    saveActivityLocation.mockResolvedValue({
      id: 99,
      name: "Museo del Prado",
    });

    const utils = await render(<AddActivityScreen {...baseProps} />);

    await press(utils, "Seleccionar ubicación");

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar un lugar..."), "Museo");
    });

    await waitFor(() => expect(utils.getByText("Museo del Prado")).toBeTruthy());

    expect(searchTripPlaces).toHaveBeenCalledWith(42, "Museo");

    await press(utils, "Museo del Prado");

    await waitFor(() => expect(resolveTripPlace).toHaveBeenCalledWith(42, "p1"));

    expect(saveActivityLocation).toHaveBeenCalledWith(42, {
      placeId: "p1",
      name: "Museo del Prado",
      address: "Calle Ruiz de Alarcón, Madrid",
      lat: 40.415,
      lng: -3.693,
      category: "museum",
      metadata: { types: ["museum"] },
    });
  });

  it("muestra error si falla la búsqueda de lugares", async () => {
    searchTripPlaces.mockRejectedValue(new Error("No se pudieron buscar lugares."));

    const utils = await render(<AddActivityScreen {...baseProps} />);

    await press(utils, "Seleccionar ubicación");

    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar un lugar..."), "Museo");
    });

    await waitFor(() => expect(utils.getByText("No se pudieron buscar lugares.")).toBeTruthy());
  });
});

/* ------------------------------------------------------------------ */
/*  US 98 - Detectar lugares y validar horarios                        */
/* ------------------------------------------------------------------ */

describe("US 98 - análisis a partir del nombre de la actividad", () => {
  it("envía el nombre de la actividad al backend para que busque el lugar (sin ignorar la advertencia)", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderYEnviar(onSubmit, { nombre: "Visita al Museo del Prado" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Visita al Museo del Prado" }),
      { ignorarAdvertencia: false }
    );
  });

  it("recorta los espacios del nombre antes de enviarlo al análisis", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderYEnviar(onSubmit, { nombre: "   Museo del Prado   " });

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].nombre).toBe("Museo del Prado");
  });

  it("detecta el lugar sin ubicación asociada: envía idLugarInteres null y el nombre", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderYEnviar(onSubmit, { nombre: "Cena en Don Julio" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Cena en Don Julio", idLugarInteres: null }),
      expect.any(Object)
    );
    // El frontend no busca el lugar por su cuenta: delega el análisis en el backend.
    expect(searchTripPlaces).not.toHaveBeenCalled();
    expect(resolveTripPlace).not.toHaveBeenCalled();
  });

  it("envía la hora de inicio y fin con segundos para que el backend las compare con la apertura", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderYEnviar(onSubmit, { inicio: "09:30", fin: "11:45" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ horaInicio: "09:30:00", horaFin: "11:45:00" }),
      expect.any(Object)
    );
  });
});

describe("US 98 - ubicación asociada como referencia principal", () => {
  it("envía el idLugarInteres de la ubicación seleccionada manualmente junto con el nombre", async () => {
    searchTripPlaces.mockResolvedValue([
      { placeId: "p1", name: "Museo del Prado", address: "Calle Ruiz de Alarcón, Madrid" },
    ]);
    resolveTripPlace.mockResolvedValue({
      placeId: "p1",
      name: "Museo del Prado",
      address: "Calle Ruiz de Alarcón, Madrid",
      lat: 40.415,
      lng: -3.693,
      category: "museum",
      metadata: {},
    });
    saveActivityLocation.mockResolvedValue({ id: 99, name: "Museo del Prado", address: "Calle Ruiz de Alarcón, Madrid" });
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.press(utils.getByText("Seleccionar ubicación"));
    });
    await act(async () => {
      fireEvent.changeText(utils.getByPlaceholderText("Buscar un lugar..."), "Museo");
    });
    await waitFor(() => expect(utils.getByText("Museo del Prado")).toBeTruthy());
    await act(async () => {
      fireEvent.press(utils.getByText("Museo del Prado"));
    });
    await waitFor(() => expect(saveActivityLocation).toHaveBeenCalled());

    await llenarFormularioValido(utils, { nombre: "Visita guiada" });
    await pressSubmit(utils);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Visita guiada", idLugarInteres: 99 }),
      { ignorarAdvertencia: false }
    );
  });

  it("al editar una actividad con ubicación, envía su idLugarInteres y el nombre", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderEdicionYEnviar(onSubmit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        nombre: "Cena de bienvenida",
        idLugarInteres: 9,
        horaInicio: "20:00:00",
        horaFin: "22:00:00",
      }),
      { ignorarAdvertencia: false }
    );
  });

  it("si se quita la ubicación asociada, deja de enviar idLugarInteres (el análisis vuelve a basarse en el nombre)", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });
    const utils = await render(
      <AddActivityScreen {...baseProps} onSubmit={onSubmit} activityToEdit={actividadEditable} />
    );
    expect(utils.getByText("Restó La Cyanea")).toBeTruthy();

    await act(async () => {
      // Requiere accessibilityLabel="Quitar ubicación" en el Pressable de AddActivityScreen.js
      fireEvent.press(utils.getByLabelText("Quitar ubicación"));
    });
    expect(utils.getByText("Seleccionar ubicación")).toBeTruthy();

    await pressSubmit(utils, "Guardar cambios");

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Cena de bienvenida", idLugarInteres: null }),
      expect.any(Object)
    );
  });
});

describe("US 98 - horario dentro del horario de apertura", () => {
  it("no muestra advertencia y registra la actividad cuando el backend no informa incompatibilidad", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderYEnviar(onSubmit);

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.alert.mock.calls[0][0]).toContain("Actividad registrada correctamente.");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("tampoco muestra advertencia si onSubmit resuelve sin payload (undefined)", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);

    await renderYEnviar(onSubmit);

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("al editar, el mensaje de éxito indica que la actividad fue editada", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderEdicionYEnviar(onSubmit);

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.alert.mock.calls[0][0]).toContain("Actividad editada correctamente.");
  });
});

describe("US 98 - horario fuera del horario de apertura", () => {
  const advertenciaFueraDeHorario = {
    advertencia: true,
    nombreLugar: "Museo del Prado",
    horariosApertura: "10:00 - 18:00",
    mensaje: "",
  };

  it("muestra la advertencia con el nombre del lugar, el horario de apertura y el horario de la actividad", async () => {
    const onSubmit = jest.fn().mockResolvedValue(advertenciaFueraDeHorario);

    await renderYEnviar(onSubmit, { inicio: "20:00", fin: "22:00" });

    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    const mensaje = mensajeDelConfirm();
    expect(mensaje).toContain(TITULO_ADVERTENCIA);
    expect(mensaje).toContain("Museo del Prado");
    expect(mensaje).toContain("no se encuentra abierto durante el horario seleccionado");
    expect(mensaje).toContain("Horario del establecimiento: 10:00 a 18:00");
    expect(mensaje).toContain("Horario de tu actividad: 20:00 a 22:00");
  });

  it("sugiere modificar el horario de la actividad", async () => {
    const onSubmit = jest.fn().mockResolvedValue(advertenciaFueraDeHorario);

    await renderYEnviar(onSubmit, { inicio: "20:00", fin: "22:00" });

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    const mensaje = mensajeDelConfirm();
    expect(mensaje).toContain("Podés modificar el horario de la actividad o registrarla igualmente.");
    expect(mensaje).toContain("Cancelar: modificar el horario.");
    expect(mensaje).toContain("Aceptar: registrar igual.");
  });

  it("muestra todos los tramos cuando el lugar tiene horario cortado o especial", async () => {
    const onSubmit = jest.fn().mockResolvedValue({
      ...advertenciaFueraDeHorario,
      horariosApertura: "09:00 - 13:00, 16:00 - 20:00",
    });

    await renderYEnviar(onSubmit, { inicio: "14:00", fin: "15:00" });

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(mensajeDelConfirm()).toContain("Horario del establecimiento: 09:00 a 13:00, 16:00 a 20:00");
  });

  it("al editar, la advertencia ofrece 'guardarla igualmente' en lugar de 'registrarla'", async () => {
    const onSubmit = jest.fn().mockResolvedValue(advertenciaFueraDeHorario);

    await renderEdicionYEnviar(onSubmit);

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    const mensaje = mensajeDelConfirm();
    expect(mensaje).toContain("Podés modificar el horario de la actividad o guardarla igualmente.");
    expect(mensaje).toContain("Aceptar: guardar igual.");
  });

  it("no registra la actividad ni cierra el formulario mientras el usuario no confirme", async () => {
    const onSubmit = jest.fn().mockResolvedValue(advertenciaFueraDeHorario);

    await renderYEnviar(onSubmit);

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(window.alert).not.toHaveBeenCalled(); // sin mensaje de éxito
    expect(baseProps.onClose).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("usa el nombre de la ubicación asociada si el backend no devuelve nombreLugar", async () => {
    const onSubmit = jest.fn().mockResolvedValue({
      advertencia: true,
      horariosApertura: "09:00 - 17:00",
    });

    await renderEdicionYEnviar(onSubmit);

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(mensajeDelConfirm()).toContain("Restó La Cyanea");
  });

  it("si no hay nombre de lugar ni ubicación, usa el nombre de la actividad en la advertencia", async () => {
    const onSubmit = jest.fn().mockResolvedValue({
      advertencia: true,
      horariosApertura: "09:00 - 17:00",
    });

    await renderYEnviar(onSubmit, { nombre: "Visita al museo" });

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(mensajeDelConfirm()).toContain("el lugar de Visita al museo");
  });
});

describe("US 98 - establecimiento cerrado el día de la actividad", () => {
  it("informa el cierre usando el mensaje del backend cuando no hay horarios de apertura para ese día", async () => {
    const onSubmit = jest.fn().mockResolvedValue({
      advertencia: true,
      nombreLugar: "Museo del Prado",
      horariosApertura: "",
      mensaje: "El lugar permanece cerrado los lunes.",
    });

    await renderYEnviar(onSubmit);

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    const mensaje = mensajeDelConfirm();
    expect(mensaje).toContain("Museo del Prado");
    expect(mensaje).toContain("El lugar permanece cerrado los lunes.");
    expect(mensaje).not.toContain("Horario del establecimiento:");
    expect(mensaje).toContain("Horario de tu actividad: 10:00 a 12:00");
  });

  it("también permite registrar igualmente cuando el lugar está cerrado ese día", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce({ advertencia: true, nombreLugar: "Museo", horariosApertura: "", mensaje: "Cerrado los lunes." })
      .mockResolvedValueOnce({ advertencia: false });
    window.confirm.mockReturnValue(true);

    await renderYEnviar(onSubmit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][1]).toEqual({ ignorarAdvertencia: true });
  });
});

describe("US 98 - nombre sin lugar identificable", () => {
  it("si el backend no identifica un lugar, no hay advertencia de horarios y la actividad se registra", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderYEnviar(onSubmit, { nombre: "Descansar un rato" });

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(window.alert.mock.calls[0][0]).toContain("Actividad registrada correctamente.");
  });
});

describe("US 98 - sin información confiable de horarios", () => {
  it("no muestra advertencia de cierre ni asume que el lugar está cerrado", async () => {
    const onSubmit = jest.fn().mockResolvedValue({
      advertencia: false,
      mensaje: "No fue posible verificar la disponibilidad horaria del lugar.",
    });

    await renderYEnviar(onSubmit);

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.confirm).not.toHaveBeenCalled();
    const textoMostrado = window.alert.mock.calls.map((c) => c[0]).join(" ");
    expect(textoMostrado).not.toContain("no se encuentra abierto");
  });
});

describe("US 98 - la advertencia no impide registrar o modificar", () => {
  const advertencia = {
    advertencia: true,
    nombreLugar: "Museo del Prado",
    horariosApertura: "10:00 - 18:00",
  };

  it("si el usuario acepta, reenvía la actividad con ignorarAdvertencia=true y completa el registro", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce(advertencia)
      .mockResolvedValueOnce({ advertencia: false });
    window.confirm.mockReturnValue(true);

    await renderYEnviar(onSubmit, { inicio: "20:00", fin: "22:00" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[0][1]).toEqual({ ignorarAdvertencia: false });
    expect(onSubmit.mock.calls[1][1]).toEqual({ ignorarAdvertencia: true });
    // Mismos datos en ambos envíos
    expect(onSubmit.mock.calls[1][0]).toEqual(onSubmit.mock.calls[0][0]);

    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls[0][0]).toContain("Actividad registrada correctamente.");
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it("al editar, aceptar la advertencia guarda los cambios igualmente", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce(advertencia)
      .mockResolvedValueOnce({ advertencia: false });
    window.confirm.mockReturnValue(true);

    await renderEdicionYEnviar(onSubmit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual(expect.objectContaining({ id: 5 }));
    expect(onSubmit.mock.calls[1][1]).toEqual({ ignorarAdvertencia: true });
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls[0][0]).toContain("Actividad editada correctamente.");
  });

  it("si el usuario elige modificar el horario, no se reenvía y puede corregir y volver a enviar", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce(advertencia)
      .mockResolvedValueOnce({ advertencia: false });
    window.confirm.mockReturnValue(false);

    const utils = await renderYEnviar(onSubmit, { inicio: "20:00", fin: "22:00" });
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // El formulario sigue editable y el botón vuelve a estar disponible.
    expect(utils.getAllByText("Agregar actividad").length).toBeGreaterThan(0);
    await elegirHora(utils, 0, "11:00");
    await elegirHora(utils, 1, "13:00");
    await pressSubmit(utils);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual(
      expect.objectContaining({ horaInicio: "11:00:00", horaFin: "13:00:00" })
    );
    expect(onSubmit.mock.calls[1][1]).toEqual({ ignorarAdvertencia: false });
  });
});

describe("US 98 - advertencia en dispositivos nativos (Alert.alert)", () => {
  // En nativo la advertencia usa Alert.alert con dos botones. Para no depender del DateTimePicker,
  // se edita una actividad que ya trae horario y se renderiza directamente como android.
  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    Platform.OS = "android";
  });

  afterEach(() => {
    Alert.alert.mockRestore();
  });

  const advertencia = {
    advertencia: true,
    nombreLugar: "Restó La Cyanea",
    horariosApertura: "12:00 - 16:00",
  };

  it("muestra Alert con el título, el horario de apertura y los botones 'Modificar horario' / 'Guardar igual'", async () => {
    const onSubmit = jest.fn().mockResolvedValue(advertencia);

    await renderEdicionYEnviar(onSubmit);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    const [titulo, mensaje, botones] = Alert.alert.mock.calls[0];
    expect(titulo).toBe(TITULO_ADVERTENCIA);
    expect(mensaje).toContain("Restó La Cyanea");
    expect(mensaje).toContain("Horario del establecimiento: 12:00 a 16:00");
    expect(mensaje).toContain("Horario de tu actividad: 20:00 a 22:00");
    expect(botones.map((b) => b.text)).toEqual(["Modificar horario", "Guardar igual"]);
    expect(botones[0].style).toBe("cancel");
  });

  it("'Modificar horario' no reenvía la actividad", async () => {
    const onSubmit = jest.fn().mockResolvedValue(advertencia);

    await renderEdicionYEnviar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    const botonModificar = Alert.alert.mock.calls[0][2][0];
    expect(botonModificar.onPress).toBeUndefined();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("'Guardar igual' reenvía con ignorarAdvertencia=true y luego muestra el éxito", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce(advertencia)
      .mockResolvedValueOnce({ advertencia: false });

    await renderEdicionYEnviar(onSubmit);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    const botonGuardar = Alert.alert.mock.calls[0][2][1];
    await act(async () => {
      botonGuardar.onPress();
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][1]).toEqual({ ignorarAdvertencia: true });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(2));
    expect(Alert.alert.mock.calls[1][0]).toBe("Éxito");
    expect(Alert.alert.mock.calls[1][1]).toBe("Actividad editada correctamente.");
  });

  it("sin incompatibilidad no aparece la advertencia, sólo el mensaje de éxito", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderEdicionYEnviar(onSubmit);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(Alert.alert.mock.calls[0][0]).toBe("Éxito");
  });
});

describe("US 98 - errores durante el análisis", () => {
  it("muestra el error y no cierra el formulario cuando falla el análisis", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error("El servidor no responde."));

    const utils = await renderYEnviar(onSubmit);

    await waitFor(() => expect(utils.getByText("El servidor no responde.")).toBeTruthy());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(baseProps.onClose).not.toHaveBeenCalled();
  });

  it("después de un error el usuario puede reintentar y registrar la actividad normalmente", async () => {
    const onSubmit = jest
      .fn()
      .mockRejectedValueOnce(new Error("Falló la consulta del lugar."))
      .mockResolvedValueOnce({ advertencia: false });

    const utils = await renderYEnviar(onSubmit);
    await waitFor(() => expect(utils.getByText("Falló la consulta del lugar.")).toBeTruthy());

    await pressSubmit(utils);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(window.alert).toHaveBeenCalled());
    expect(window.alert.mock.calls[0][0]).toContain("Actividad registrada correctamente.");
    expect(utils.queryByText("Falló la consulta del lugar.")).toBeNull();
  });

  it("usa un mensaje genérico de creación si el error no trae mensaje", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error(""));

    const utils = await renderYEnviar(onSubmit);

    await waitFor(() => expect(utils.getByText("No se pudo crear la actividad.")).toBeTruthy());
  });

  it("usa un mensaje genérico de edición si el error no trae mensaje al modificar", async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error(""));

    const utils = await renderEdicionYEnviar(onSubmit);

    await waitFor(() => expect(utils.getByText("No se pudo editar la actividad.")).toBeTruthy());
  });

  it("si falla el reenvío tras aceptar la advertencia, informa el error", async () => {
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce({ advertencia: true, nombreLugar: "Museo", horariosApertura: "10:00 - 18:00" })
      .mockRejectedValueOnce(new Error("No se pudo guardar."));
    window.confirm.mockReturnValue(true);

    const utils = await renderYEnviar(onSubmit);

    await waitFor(() => expect(utils.getByText("No se pudo guardar.")).toBeTruthy());
  });
});

describe("US 98 - validación de horarios inválidos (no llega al análisis)", () => {
  it("no envía nada al backend si el inicio es posterior al fin", async () => {
    const onSubmit = jest.fn();

    const utils = await renderYEnviar(onSubmit, { inicio: "15:00", fin: "10:00" });

    expect(
      utils.getByText("La hora de fin debe ser posterior a la hora de inicio (dentro del mismo día).")
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("no envía nada si inicio y fin son iguales", async () => {
    const onSubmit = jest.fn();

    const utils = await renderYEnviar(onSubmit, { inicio: "10:00", fin: "10:00" });

    expect(utils.getByText("La hora de inicio y fin no pueden ser iguales.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("no envía nada si el fin es 00:00 y sugiere usar 23:59", async () => {
    const onSubmit = jest.fn();

    const utils = await renderYEnviar(onSubmit, { inicio: "22:00", fin: "00:00" });

    expect(
      utils.getByText("Para el fin del día usá 23:59. Las 00:00 cuentan como el día siguiente.")
    ).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("no envía nada si el nombre está vacío o son sólo espacios", async () => {
    const onSubmit = jest.fn();

    const utils = await renderYEnviar(onSubmit, { nombre: "   " });

    expect(utils.getByText("El nombre de la actividad es obligatorio.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("no envía nada si los horarios no tienen formato HH:MM (ej. 25:00)", async () => {
    const onSubmit = jest.fn();

    const utils = await renderYEnviar(onSubmit, { inicio: "25:00", fin: "26:00" });

    expect(utils.getByText("Ingresá los horarios en formato HH:MM.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("acepta el límite 23:59 como fin de día", async () => {
    const onSubmit = jest.fn().mockResolvedValue({ advertencia: false });

    await renderYEnviar(onSubmit, { inicio: "22:00", fin: "23:59" });

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({ horaInicio: "22:00:00", horaFin: "23:59:00" })
    );
  });
});

describe("US 98 - estado de carga durante el análisis", () => {
  it("muestra el popup 'Validando horarios' mientras se analiza y lo oculta al terminar", async () => {
    const deferred = crearDeferred();
    const onSubmit = jest.fn(() => deferred.promise);

    const utils = await renderYEnviar(onSubmit);

    expect(utils.getByText("Validando horarios")).toBeTruthy();
    expect(
      utils.getByText("Estamos validando los horarios del lugar. Esto puede demorar unos segundos.")
    ).toBeTruthy();

    await act(async () => {
      deferred.resolve({ advertencia: false });
    });

    await waitFor(() => expect(utils.queryByText("Validando horarios")).toBeNull());
  });

  it("oculta el popup al recibir una advertencia (para poder mostrar el aviso)", async () => {
    const deferred = crearDeferred();
    const onSubmit = jest.fn(() => deferred.promise);

    const utils = await renderYEnviar(onSubmit);
    expect(utils.getByText("Validando horarios")).toBeTruthy();

    await act(async () => {
      deferred.resolve({ advertencia: true, nombreLugar: "Museo", horariosApertura: "10:00 - 18:00" });
    });

    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(utils.queryByText("Validando horarios")).toBeNull();
  });

  it("oculta el popup si el análisis falla", async () => {
    const deferred = crearDeferred();
    const onSubmit = jest.fn(() => deferred.promise);

    const utils = await renderYEnviar(onSubmit);
    expect(utils.getByText("Validando horarios")).toBeTruthy();

    await act(async () => {
      deferred.reject(new Error("Timeout"));
    });

    await waitFor(() => expect(utils.getByText("Timeout")).toBeTruthy());
    expect(utils.queryByText("Validando horarios")).toBeNull();
  });

  it("no permite enviar dos veces la actividad mientras el análisis está en curso", async () => {
    const deferred = crearDeferred();
    const onSubmit = jest.fn(() => deferred.promise);

    const utils = await render(<AddActivityScreen {...baseProps} onSubmit={onSubmit} />);
    await llenarFormularioValido(utils);

    const botones = utils.getAllByText("Agregar actividad");
    const boton = botones[botones.length - 1];
    await act(async () => {
      fireEvent.press(boton);
    });
    await act(async () => {
      fireEvent.press(boton);
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ advertencia: false });
    });
  });

  it("no muestra el popup de validación al reenviar tras aceptar la advertencia (ya no se vuelve a analizar)", async () => {
    const deferred = crearDeferred();
    const onSubmit = jest
      .fn()
      .mockResolvedValueOnce({ advertencia: true, nombreLugar: "Museo", horariosApertura: "10:00 - 18:00" })
      .mockImplementationOnce(() => deferred.promise);
    window.confirm.mockReturnValue(true);

    const utils = await renderYEnviar(onSubmit);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(utils.queryByText("Validando horarios")).toBeNull();

    await act(async () => {
      deferred.resolve({ advertencia: false });
    });
  });
});