import { act, cleanup, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { useInactividad } from '../../hooks/useInactividad';

const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
const TREINTA_MINUTOS = 30 * 60 * 1000;

let ventana;
let ventanaOriginal;

function crearVentana() {
  const oyentes = new Map();
  return {
    addEventListener: jest.fn((evento, funcion) => {
      if (!oyentes.has(evento)) oyentes.set(evento, new Set());
      oyentes.get(evento).add(funcion);
    }),
    removeEventListener: jest.fn((evento, funcion) => {
      oyentes.get(evento)?.delete(funcion);
    }),
    disparar(evento) {
      oyentes.get(evento)?.forEach((funcion) => funcion());
    },
  };
}

async function avanzar(ms) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function renderizar({ activo = true, alExpirar = jest.fn(), milisegundos = 1000 } = {}) {
  return renderHook(
    (props) => useInactividad(props.activo, props.alExpirar, props.milisegundos),
    { initialProps: { activo, alExpirar, milisegundos } }
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'web');
  ventanaOriginal = global.window;
  ventana = crearVentana();
  global.window = ventana;
});

afterEach(() => {
  cleanup();
  global.window = ventanaOriginal;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('useInactividad', () => {
  test('expira después del tiempo sin actividad', async () => {
    const alExpirar = jest.fn();
    await renderizar({ alExpirar });

    await avanzar(999);
    expect(alExpirar).not.toHaveBeenCalled();

    await avanzar(1);
    expect(alExpirar).toHaveBeenCalledTimes(1);
  });

  test('por defecto espera 30 minutos', async () => {
    const alExpirar = jest.fn();
    await renderHook(() => useInactividad(true, alExpirar));

    await avanzar(TREINTA_MINUTOS - 1);
    expect(alExpirar).not.toHaveBeenCalled();

    await avanzar(1);
    expect(alExpirar).toHaveBeenCalledTimes(1);
  });

  test('la actividad reinicia el contador', async () => {
    const alExpirar = jest.fn();
    await renderizar({ alExpirar });

    await avanzar(800);
    await act(async () => {
      ventana.disparar('mousemove');
    });
    await avanzar(800);
    expect(alExpirar).not.toHaveBeenCalled();

    await avanzar(200);
    expect(alExpirar).toHaveBeenCalledTimes(1);
  });

  test('escucha todos los eventos de actividad', async () => {
    await renderizar();

    EVENTOS.forEach((evento) => {
      expect(ventana.addEventListener).toHaveBeenCalledWith(evento, expect.any(Function), {
        passive: true,
      });
    });
  });

  test.each(EVENTOS)('el evento %s cuenta como actividad', async (evento) => {
    const alExpirar = jest.fn();
    await renderizar({ alExpirar });

    await avanzar(900);
    await act(async () => {
      ventana.disparar(evento);
    });
    await avanzar(900);

    expect(alExpirar).not.toHaveBeenCalled();
  });

  test('sin sesión activa no hace nada', async () => {
    const alExpirar = jest.fn();
    await renderizar({ activo: false, alExpirar });

    await avanzar(5000);

    expect(ventana.addEventListener).not.toHaveBeenCalled();
    expect(alExpirar).not.toHaveBeenCalled();
  });

  test('fuera de la web no hace nada', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const alExpirar = jest.fn();
    await renderizar({ alExpirar });

    await avanzar(5000);

    expect(ventana.addEventListener).not.toHaveBeenCalled();
    expect(alExpirar).not.toHaveBeenCalled();
  });

  test('al cerrar la sesión deja de escuchar y cancela el contador', async () => {
    const alExpirar = jest.fn();
    const { rerender } = await renderizar({ alExpirar });

    await rerender({ activo: false, alExpirar, milisegundos: 1000 });
    await avanzar(5000);

    EVENTOS.forEach((evento) => {
      expect(ventana.removeEventListener).toHaveBeenCalledWith(evento, expect.any(Function));
    });
    expect(alExpirar).not.toHaveBeenCalled();
  });

  test('al desmontarse deja de escuchar y cancela el contador', async () => {
    const alExpirar = jest.fn();
    const { unmount } = await renderizar({ alExpirar });

    await unmount();
    avanzar(5000);

    expect(ventana.removeEventListener).toHaveBeenCalledTimes(EVENTOS.length);
    expect(alExpirar).not.toHaveBeenCalled();
  });

  test('usa siempre el callback más reciente sin reiniciar el contador', async () => {
    const original = jest.fn();
    const nuevo = jest.fn();
    const { rerender } = await renderizar({ alExpirar: original });

    await avanzar(600);
    await rerender({ activo: true, alExpirar: nuevo, milisegundos: 1000 });
    await avanzar(400);

    expect(original).not.toHaveBeenCalled();
    expect(nuevo).toHaveBeenCalledTimes(1);
  });
});