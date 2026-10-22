import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import TripAssistantPanel from "../components/assistant/TripAssistantPanel";
import { sendTripAssistantMessage, updateAssistantConsent } from "../services/api";

jest.mock("../services/api", () => ({
  sendTripAssistantMessage: jest.fn(),
  updateAssistantConsent: jest.fn(),
}));

const SALUDO =
  "Decime que queres organizar del viaje. Puedo sugerir actividades, tareas, votaciones o rutas, y te voy a pedir confirmacion antes de cambiar algo.";
const ACCION = {
  id: "accion-1",
  type: "crear_checklist",
  label: "Crear tarea: Pasaportes",
  payload: { nombre: "Pasaportes" },
};
const PENDIENTE = "Hay una accion pendiente de confirmacion.";

beforeEach(() => {
  jest.clearAllMocks();
});

async function renderizar(props = {}) {
  const handlers = {
    onClose: jest.fn(),
    onConsentUpdated: jest.fn(),
    onActionExecuted: jest.fn(),
  };
  const utils = await render(
    <TripAssistantPanel
      visible
      tripId={7}
      currentUser={{ consienteAsistenteIA: true }}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
}

async function presionar(elemento) {
  await act(async () => {
    await fireEvent.press(elemento);
  });
}

async function enviar(utils, texto) {
  await fireEvent.changeText(utils.getByPlaceholderText("Pedile algo del viaje..."), texto);
  await presionar(utils.getByLabelText("Enviar"));
}

async function mostrarAccion(utils, accion = ACCION) {
  sendTripAssistantMessage.mockResolvedValueOnce({ message: "Puedo crear la tarea.", suggestedAction: accion });
  await enviar(utils, "agregá una tarea");
  await utils.findByText(accion.label || "Ejecutar accion propuesta");
}

describe("consentimiento", () => {
  it.each([[{ consienteAsistenteIA: false }], [null]])("con el usuario %p pide activar el asistente", async (usuario) => {
    const utils = await renderizar({ currentUser: usuario });

    expect(utils.getByText("Activar asistente")).toBeTruthy();
    expect(utils.queryByPlaceholderText("Pedile algo del viaje...")).toBeNull();
  });

  it("activa el asistente al aceptar", async () => {
    updateAssistantConsent.mockResolvedValue({ consienteAsistenteIA: true });
    const utils = await renderizar({ currentUser: { consienteAsistenteIA: false } });

    await presionar(utils.getByText("Aceptar y continuar"));

    expect(updateAssistantConsent).toHaveBeenCalledWith(true);
    expect(utils.onConsentUpdated).toHaveBeenCalledWith({ consienteAsistenteIA: true });
  });

  it.each([
    ["Sin conexión", "Sin conexión"],
    ["", "No se pudo activar el asistente."],
  ])("si falla con '%s' muestra '%s'", async (mensaje, esperado) => {
    updateAssistantConsent.mockRejectedValue(new Error(mensaje));
    const utils = await renderizar({ currentUser: { consienteAsistenteIA: false } });

    await presionar(utils.getByText("Aceptar y continuar"));

    expect(utils.getByText(esperado)).toBeTruthy();
    expect(utils.onConsentUpdated).not.toHaveBeenCalled();
  });
});

describe("chat", () => {
  it("muestra el saludo y se cierra con la cruz", async () => {
    const utils = await renderizar();

    expect(utils.getByText(SALUDO)).toBeTruthy();
    await presionar(utils.getByLabelText("Cerrar"));
    expect(utils.onClose).toHaveBeenCalled();
  });

  it("no envía mensajes vacíos", async () => {
    const utils = await renderizar();

    await enviar(utils, "   ");

    expect(sendTripAssistantMessage).not.toHaveBeenCalled();
  });

  it("envía el mensaje con la conversación previa y muestra la respuesta", async () => {
    sendTripAssistantMessage.mockResolvedValue({ message: "Te sugiero la Catedral." });
    const utils = await renderizar();

    await enviar(utils, "  ¿qué visito?  ");

    expect(sendTripAssistantMessage).toHaveBeenCalledWith(7, {
      message: "¿qué visito?",
      conversation: [{ role: "assistant", text: SALUDO }],
    });
    expect(utils.getByText("¿qué visito?")).toBeTruthy();
    expect(utils.getByPlaceholderText("Pedile algo del viaje...").props.value).toBe("");
    expect(await utils.findByText("Te sugiero la Catedral.")).toBeTruthy();
  });

  it("muestra completas las respuestas largas", async () => {
    const largo = "Para aprovechar el viaje conviene arrancar temprano por el casco histórico. ".repeat(4).trim();
    sendTripAssistantMessage.mockResolvedValue({ message: largo });
    const utils = await renderizar();

    await enviar(utils, "recomendaciones");

    expect(await utils.findByText(largo, {}, { timeout: 4000 })).toBeTruthy();
  });

  it.each([
    ["El asistente no está disponible", "El asistente no está disponible"],
    ["", "No se pudo contactar al asistente."],
  ])("si falla el envío con '%s' muestra '%s'", async (mensaje, esperado) => {
    sendTripAssistantMessage.mockRejectedValue(new Error(mensaje));
    const utils = await renderizar();

    await enviar(utils, "hola");

    expect(utils.getByText(esperado)).toBeTruthy();
  });
});

describe("acciones propuestas", () => {
  it("muestra la acción propuesta y el aviso de pendiente", async () => {
    const utils = await renderizar();

    await mostrarAccion(utils);

    expect(utils.getByText("Confirmar")).toBeTruthy();
    expect(utils.getByText("Descartar")).toBeTruthy();
    expect(utils.getByText(PENDIENTE)).toBeTruthy();
  });

  it("usa una etiqueta genérica si la acción no trae una", async () => {
    const utils = await renderizar();

    await mostrarAccion(utils, { id: "accion-2", type: "crear_checklist" });

    expect(utils.getByText("Ejecutar accion propuesta")).toBeTruthy();
  });

  it("confirma la acción, avisa y no vuelve a ofrecerla", async () => {
    const utils = await renderizar();
    await mostrarAccion(utils);
    const respuesta = { message: "Tarea creada.", suggestedAction: ACCION, result: { idChecklist: 1 } };
    sendTripAssistantMessage.mockResolvedValueOnce(respuesta);

    await presionar(utils.getByText("Confirmar"));

    expect(sendTripAssistantMessage).toHaveBeenLastCalledWith(7, { confirmActionId: "accion-1" });
    expect(utils.onActionExecuted).toHaveBeenCalledWith(respuesta);
    expect(await utils.findByText("Tarea creada.")).toBeTruthy();
    expect(utils.queryByText("Confirmar")).toBeNull();
    expect(utils.queryByText(PENDIENTE)).toBeNull();
  });

  it.each([
    ["La accion ya fue procesada.", "La accion ya fue procesada."],
    ["", "No se pudo ejecutar la accion."],
  ])("si falla la confirmación con '%s' muestra '%s'", async (mensaje, esperado) => {
    const utils = await renderizar();
    await mostrarAccion(utils);
    sendTripAssistantMessage.mockRejectedValueOnce(new Error(mensaje));

    await presionar(utils.getByText("Confirmar"));

    expect(utils.getByText(esperado)).toBeTruthy();
    expect(utils.onActionExecuted).not.toHaveBeenCalled();
  });

  it("descartar oculta la acción sin llamar al backend", async () => {
    const utils = await renderizar();
    await mostrarAccion(utils);

    await presionar(utils.getByText("Descartar"));

    expect(utils.queryByText(ACCION.label)).toBeNull();
    expect(utils.queryByText(PENDIENTE)).toBeNull();
    expect(sendTripAssistantMessage).toHaveBeenCalledTimes(1);
  });

  it("escribir otro mensaje deja sin efecto la acción pendiente", async () => {
    const utils = await renderizar();
    await mostrarAccion(utils);
    sendTripAssistantMessage.mockResolvedValueOnce({ message: "Listo." });

    await enviar(utils, "mejor no");

    expect(utils.queryByText(ACCION.label)).toBeNull();
    expect(sendTripAssistantMessage).toHaveBeenLastCalledWith(7, {
      message: "mejor no",
      conversation: [
        { role: "assistant", text: SALUDO },
        { role: "user", text: "agregá una tarea" },
        { role: "assistant", text: "Puedo crear la tarea." },
      ],
    });
  });
});