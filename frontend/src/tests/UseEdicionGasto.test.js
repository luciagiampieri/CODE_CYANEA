import { act, renderHook } from "@testing-library/react-native";

import { EDICION_GASTO, useEdicionGasto } from "../hooks/useEdicionGasto";

jest.mock("../services/api", () => ({
  getExpenseEditSocketUrl: jest.fn(async (id) => `ws://test/api/v1/gastos/ws/${id}?token=t`),
}));

// WebSocket falso: registra las instancias para simular mensajes del servidor.
class FakeWebSocket {
  static OPEN = 1;
  static instancias = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.enviados = [];
    this.cerrado = false;
    FakeWebSocket.instancias.push(this);
  }

  send(data) {
    this.enviados.push(JSON.parse(data));
  }

  close() {
    this.cerrado = true;
    this.readyState = 3;
  }

  recibir(mensaje) {
    this.onmessage?.({ data: JSON.stringify(mensaje) });
  }

  cortar() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const ultimoSocket = () => FakeWebSocket.instancias[FakeWebSocket.instancias.length - 1];

async function montar(idGasto = 15, activo = true) {
  const hook = await renderHook(({ id, act: a }) => useEdicionGasto(id, a), {
    initialProps: { id: idGasto, act: activo },
  });
  // Deja resolver la URL asíncrona antes de que se cree el socket.
  await act(async () => {});
  return hook;
}

describe("useEdicionGasto", () => {
  const WebSocketOriginal = global.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instancias = [];
    global.WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.WebSocket = WebSocketOriginal;
  });

  it("no se conecta si no está activo", async () => {
    const { result } = await montar(15, false);

    expect(FakeWebSocket.instancias).toHaveLength(0);
    expect(result.current.estado).toBe(EDICION_GASTO.INACTIVA);
    expect(result.current.puedeGuardar).toBe(false);
  });

  it("se conecta al WebSocket del gasto y queda esperando respuesta", async () => {
    const { result } = await montar(15);

    expect(ultimoSocket().url).toBe("ws://test/api/v1/gastos/ws/15?token=t");
    expect(result.current.estado).toBe(EDICION_GASTO.CONECTANDO);
    expect(result.current.puedeGuardar).toBe(false);
  });

  it("habilita guardar cuando el servidor concede la edición", async () => {
    const { result } = await montar();

    await act(async () => {
      ultimoSocket().recibir({ tipo: "edicion_gasto_concedida", idGasto: 15, segundosRenovacion: 30 });
    });

    expect(result.current.estado).toBe(EDICION_GASTO.CONCEDIDA);
    expect(result.current.puedeGuardar).toBe(true);
  });

  it("informa el mensaje cuando otro usuario está editando el gasto", async () => {
    const { result } = await montar();

    await act(async () => {
      ultimoSocket().recibir({
        tipo: "edicion_gasto_rechazada",
        codigo: "EXPENSE_BEING_EDITED",
        mensaje: "El gasto está siendo editado por otro usuario (Carla Test).",
      });
      ultimoSocket().cortar();
    });

    expect(result.current.estado).toBe(EDICION_GASTO.RECHAZADA);
    expect(result.current.codigo).toBe("EXPENSE_BEING_EDITED");
    expect(result.current.mensaje).toBe("El gasto está siendo editado por otro usuario (Carla Test).");
    expect(result.current.puedeGuardar).toBe(false);
  });

  it("renueva la edición periódicamente mientras está abierta", async () => {
    jest.useFakeTimers();
    await montar();

    await act(async () => {
      ultimoSocket().recibir({ tipo: "edicion_gasto_concedida", segundosRenovacion: 30 });
    });
    await act(async () => {
      jest.advanceTimersByTime(65 * 1000);
    });

    expect(ultimoSocket().enviados).toEqual([{ tipo: "renovar" }, { tipo: "renovar" }]);
  });

  it("avisa si perdió la edición por inactividad", async () => {
    const { result } = await montar();

    await act(async () => {
      ultimoSocket().recibir({ tipo: "edicion_gasto_concedida", segundosRenovacion: 30 });
      ultimoSocket().recibir({ tipo: "edicion_gasto_perdida", idGasto: 15 });
    });

    expect(result.current.estado).toBe(EDICION_GASTO.PERDIDA);
    expect(result.current.puedeGuardar).toBe(false);
    expect(result.current.mensaje).toMatch(/Otro usuario tomó la edición/);
  });

  it("si se corta la conexión después de concedida, todavía permite guardar", async () => {
    const { result } = await montar();

    await act(async () => {
      ultimoSocket().recibir({ tipo: "edicion_gasto_concedida", segundosRenovacion: 30 });
      ultimoSocket().cortar();
    });

    expect(result.current.estado).toBe(EDICION_GASTO.DESCONECTADA);
    expect(result.current.puedeGuardar).toBe(true);
  });

  it("si no se puede conectar, no permite guardar y lo informa", async () => {
    const { result } = await montar();

    await act(async () => {
      ultimoSocket().cortar();
    });

    expect(result.current.estado).toBe(EDICION_GASTO.RECHAZADA);
    expect(result.current.mensaje).toMatch(/Revisá tu conexión/);
  });

  it("cierra la conexión (libera la edición) al desactivarse o desmontarse", async () => {
    const { rerender, unmount } = await montar();
    const primero = ultimoSocket();

    await act(async () => {
      rerender({ id: 15, act: false });
    });
    expect(primero.cerrado).toBe(true);

    await act(async () => {
      rerender({ id: 15, act: true });
    });
    await act(async () => {});
    const segundo = ultimoSocket();
    expect(segundo).not.toBe(primero);

    await act(async () => {
      unmount();
    });
    expect(segundo.cerrado).toBe(true);
  });
});