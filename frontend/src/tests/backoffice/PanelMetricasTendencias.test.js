import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import PanelMetricas from '../../components/backoffice/PanelMetricas';
import { obtenerMetricas } from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({
  obtenerMetricas: jest.fn(),
}));

const SIN_SUSCRIPCIONES = {
  valor: null,
  error: 'Disponible cuando se implementen las suscripciones Pro.',
};

function respuesta(extra = {}) {
  return {
    desde: '2026-09-22',
    hasta: '2026-10-21',
    historico: false,
    desdeAnterior: '2026-08-23',
    hastaAnterior: '2026-09-21',
    usuariosRegistrados: { valor: 125, anterior: 100 },
    usuariosActivos: { valor: 60 },
    viajesCreados: { valor: 30, anterior: 40 },
    viajesActivos: { valor: 20 },
    suscripcionesProActivas: SIN_SUSCRIPCIONES,
    ingresos: SIN_SUSCRIPCIONES,
    solicitudesIA: { valor: 10, anterior: 10 },
    evolucion: {
      agrupacion: 'dia',
      puntos: [
        { fecha: '2026-10-20', usuarios: 1, viajes: 0, solicitudesIA: 0 },
        { fecha: '2026-10-21', usuarios: 2, viajes: 1, solicitudesIA: 3 },
      ],
    },
    estacionalidad: {
      usuarios: [],
      viajes: [],
      salidas: [{ anio: 2026, meses: [0, 0, 0, 0, 0, 0, 4, 1, 0, 0, 0, 0] }],
    },
    ...extra,
  };
}

describe('PanelMetricas: tendencias y estacionalidad', () => {
  beforeEach(() => {
    obtenerMetricas.mockReset();
  });

  test('muestra la variación de cada métrica contra el período anterior', async () => {
    obtenerMetricas.mockResolvedValue(respuesta());

    await render(<PanelMetricas />);

    expect(await screen.findByText('+25%')).toBeTruthy();
    expect(screen.getByText('-25%')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('Comparado con el 23/08/2026 al 21/09/2026')).toBeTruthy();
  });

  test('"Desde el inicio" pide toda la historia y no compara con un período anterior', async () => {
    obtenerMetricas.mockResolvedValueOnce(respuesta());
    obtenerMetricas.mockResolvedValueOnce(
      respuesta({
        desde: '2025-02-03',
        historico: true,
        desdeAnterior: null,
        hastaAnterior: null,
        usuariosRegistrados: { valor: 125 },
        viajesCreados: { valor: 30 },
        solicitudesIA: { valor: 10 },
      })
    );

    await render(<PanelMetricas />);
    await screen.findByText('+25%');

    await fireEvent.press(screen.getByText('Desde el inicio'));

    await waitFor(() => expect(obtenerMetricas).toHaveBeenLastCalledWith({ historico: true }));
    expect(await screen.findByText('Desde el inicio (03/02/2025) al 21/10/2026')).toBeTruthy();
    expect(screen.queryByTestId('variacion-periodo')).toBeNull();
  });

  test('la estacionalidad destaca el mes más fuerte', async () => {
    obtenerMetricas.mockResolvedValue(respuesta());

    await render(<PanelMetricas />);

    expect(await screen.findByText('Estacionalidad')).toBeTruthy();
    expect(screen.getByText('Julio')).toBeTruthy();
  });

  test('la leyenda del gráfico informa el total y la tendencia de cada serie', async () => {
    obtenerMetricas.mockResolvedValue(respuesta());

    await render(<PanelMetricas />);

    expect(await screen.findByText('Registros · 3 en el período')).toBeTruthy();
    expect(screen.getByText('Viajes creados · 1 en el período')).toBeTruthy();
    expect(screen.getAllByText('Tendencia: En alza (+1 por día)')).toHaveLength(2);
  });
});