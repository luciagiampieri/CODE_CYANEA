import { act, fireEvent, render, screen } from '@testing-library/react-native';

import PanelMetricas from '../../components/backoffice/PanelMetricas';
import { obtenerMetricas } from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({
  obtenerMetricas: jest.fn(),
}));

const SIN_SUSCRIPCIONES = 'Disponible cuando se implementen las suscripciones Pro.';

function respuesta(cambios = {}) {
  return {
    desde: '2026-09-17',
    hasta: '2026-10-16',
    usuariosRegistrados: { valor: 128, error: null },
    usuariosActivos: { valor: 64, error: null },
    viajesCreados: { valor: 37, error: null },
    viajesActivos: { valor: 21, error: null },
    suscripcionesProActivas: { valor: null, error: SIN_SUSCRIPCIONES },
    ingresos: { valor: null, error: SIN_SUSCRIPCIONES },
    solicitudesIA: { valor: 503, error: null },
    evolucion: {
      agrupacion: 'dia',
      puntos: [
        { fecha: '2026-10-15', usuarios: 3, viajes: 2 },
        { fecha: '2026-10-16', usuarios: 5, viajes: 1 },
      ],
      error: null,
    },
    ...cambios,
  };
}

function errorConEstado(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

async function avanzar() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1000);
  });
}

async function renderizar() {
  await render(<PanelMetricas />);
  await avanzar();
}

async function presionar(texto) {
  await fireEvent.press(screen.getByText(texto));
  await avanzar();
}

async function aplicarRango(desde, hasta) {
  await presionar('Personalizado');
  const [campoDesde, campoHasta] = screen.getAllByPlaceholderText('AAAA-MM-DD');
  await fireEvent.changeText(campoDesde, desde);
  await fireEvent.changeText(campoHasta, hasta);
  await presionar('Aplicar');
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 16, 12, 0, 0) });
  obtenerMetricas.mockReset();
  obtenerMetricas.mockResolvedValue(respuesta());
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PanelMetricas', () => {
  test('carga por defecto los últimos 30 días', async () => {
    await renderizar();

    expect(obtenerMetricas).toHaveBeenCalledTimes(1);
    expect(obtenerMetricas).toHaveBeenCalledWith({ desde: '2026-09-17', hasta: '2026-10-16' });
    expect(screen.getByText('Del 17/09/2026 al 16/10/2026')).toBeTruthy();
  });

  test('muestra el valor de cada métrica', async () => {
    await renderizar();

    ['128', '64', '37', '21', '503'].forEach((valor) => {
      expect(screen.getByText(valor)).toBeTruthy();
    });
    expect(screen.getByText('+8 nuevos en el período')).toBeTruthy();
    expect(screen.getByText('50% de los registrados · últimos 30 días')).toBeTruthy();
  });

  test('el gráfico muestra los totales del período', async () => {
    await renderizar();

    expect(screen.getByText('Evolución diaria')).toBeTruthy();
    expect(screen.getByText('Registros · 8 en el período')).toBeTruthy();
    expect(screen.getByText('Viajes creados · 3 en el período')).toBeTruthy();
  });

  test('elegir un rango rápido recalcula las métricas', async () => {
    await renderizar();
    await presionar('7 días');

    expect(obtenerMetricas).toHaveBeenCalledTimes(2);
    expect(obtenerMetricas).toHaveBeenLastCalledWith({ desde: '2026-10-10', hasta: '2026-10-16' });
  });

  test('un rango personalizado válido recalcula las métricas', async () => {
    await renderizar();
    await aplicarRango('2026-08-01', '2026-08-31');

    expect(obtenerMetricas).toHaveBeenLastCalledWith({ desde: '2026-08-01', hasta: '2026-08-31' });
  });

  test('no permite una fecha de fin anterior a la de inicio', async () => {
    await renderizar();
    await aplicarRango('2026-10-10', '2026-10-01');

    expect(
      screen.getByText('La fecha de fin no puede ser anterior a la fecha de inicio.')
    ).toBeTruthy();
    expect(obtenerMetricas).toHaveBeenCalledTimes(1);
  });

  test('no permite una fecha de fin posterior a hoy', async () => {
    await renderizar();
    await aplicarRango('2026-10-01', '2026-10-20');

    expect(screen.getByText('La fecha de fin no puede ser posterior a hoy.')).toBeTruthy();
    expect(obtenerMetricas).toHaveBeenCalledTimes(1);
  });

  test('muestra el error de validación que devuelve el servidor', async () => {
    obtenerMetricas
      .mockResolvedValueOnce(respuesta())
      .mockRejectedValueOnce(errorConEstado('El rango no puede superar un año.', 422));

    await renderizar();
    await aplicarRango('2025-01-01', '2026-10-16');

    expect(screen.getByText('El rango no puede superar un año.')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
  });

  test('un error en una métrica no impide ver las demás', async () => {
    obtenerMetricas.mockResolvedValue(
      respuesta({ viajesCreados: { valor: null, error: 'No se pudo obtener esta métrica.' } })
    );

    await renderizar();

    expect(screen.getByText('No se pudo obtener esta métrica.')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('21')).toBeTruthy();
    expect(screen.getByText('503')).toBeTruthy();
  });

  test('suscripciones e ingresos se informan como no disponibles', async () => {
    await renderizar();

    expect(screen.getAllByText(SIN_SUSCRIPCIONES)).toHaveLength(2);
  });

  test('un período sin registros muestra el estado vacío del gráfico', async () => {
    obtenerMetricas.mockResolvedValue(
      respuesta({
        evolucion: {
          agrupacion: 'dia',
          puntos: [
            { fecha: '2026-10-15', usuarios: 0, viajes: 0 },
            { fecha: '2026-10-16', usuarios: 0, viajes: 0 },
          ],
          error: null,
        },
      })
    );

    await renderizar();

    expect(screen.getByText('Sin movimiento en este período')).toBeTruthy();
  });

  test('si falla la carga permite reintentar', async () => {
    obtenerMetricas.mockRejectedValueOnce(errorConEstado('No se pudo conectar con el servidor.'));

    await renderizar();

    expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy();

    await presionar('Reintentar');

    expect(obtenerMetricas).toHaveBeenCalledTimes(2);
    expect(screen.getByText('128')).toBeTruthy();
  });
});