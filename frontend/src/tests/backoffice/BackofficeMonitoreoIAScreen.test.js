import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import BackofficeMonitoreoIAScreen from '../../screens/backoffice/BackofficeMonitoreoIAScreen';
import { configurarUmbralCostoIA, obtenerMonitoreoIA } from '../../services/backofficeApi';
import { rangoUltimosDias } from '../../utils/formatoMetricas';

jest.mock('../../services/backofficeApi', () => ({
  configurarUmbralCostoIA: jest.fn(),
  obtenerMonitoreoIA: jest.fn(),
}));

function fila(servicio, nombre, cambios = {}) {
  return { servicio, nombre, solicitudes: 0, fallidas: 0, tiempoPromedioMs: null, costoEstimadoUSD: 0, ...cambios };
}

function umbral(cambios = {}) {
  return {
    periodo: '2026-10',
    umbralMensualUSD: null,
    costoMesActualUSD: 0.5,
    porcentajeUsado: null,
    nivel: 'sin_umbral',
    fechaActualizacion: null,
    fechaUltimaAlerta: null,
    ...cambios,
  };
}

function respuesta(cambios = {}) {
  return {
    desde: '2026-09-23',
    hasta: '2026-10-22',
    funcionalidades: [
      fila('sugerencia_actividades', 'Sugerencias de actividades', {
        solicitudes: 40,
        fallidas: 2,
        tiempoPromedioMs: 2400,
        costoEstimadoUSD: 1.25,
      }),
      fila('escaneo_comprobantes', 'Escaneo de comprobantes', {
        solicitudes: 12,
        tiempoPromedioMs: 850,
        costoEstimadoUSD: 0.0123,
      }),
      fila('deteccion_gastos_documentos', 'Detección de gastos en documentos'),
      fila('generacion_portadas', 'Generación de portadas', { solicitudes: 3, costoEstimadoUSD: 0.0033 }),
      fila('analisis_horarios', 'Validación de horarios', { solicitudes: 5, fallidas: 1, tiempoPromedioMs: 600 }),
    ],
    totales: { solicitudes: 60, fallidas: 3, tiempoPromedioMs: 1900, costoEstimadoUSD: 1.2656 },
    umbral: umbral(),
    ...cambios,
  };
}

async function renderizar() {
  await render(<BackofficeMonitoreoIAScreen onVolver={jest.fn()} />);
  await screen.findByText('Sugerencias de actividades');
}

beforeEach(() => {
  jest.clearAllMocks();
  obtenerMonitoreoIA.mockResolvedValue(respuesta());
});

describe('consumo por funcionalidad (CA 2 a 5)', () => {
  test('CP1: muestra el consumo de los últimos 30 días por funcionalidad', async () => {
    await renderizar();

    expect(obtenerMonitoreoIA).toHaveBeenCalledWith(rangoUltimosDias(30));
    for (const nombre of [
      'Sugerencias de actividades',
      'Escaneo de comprobantes',
      'Detección de gastos en documentos',
      'Generación de portadas',
      'Validación de horarios',
    ]) {
      expect(screen.getByText(nombre)).toBeTruthy();
    }
    expect(screen.getByText('Del 23/09/2026 al 22/10/2026')).toBeTruthy();
  });

  test('muestra solicitudes, fallidas, tiempo promedio y costo estimado', async () => {
    await renderizar();

    expect(screen.getByText('60')).toBeTruthy();
    expect(screen.getByText('5% del total')).toBeTruthy();
    expect(screen.getByText('1,9 s')).toBeTruthy();
    expect(screen.getByText('USD 1,27')).toBeTruthy();
    expect(screen.getByText('2,4 s')).toBeTruthy();
    expect(screen.getByText('850 ms')).toBeTruthy();
    expect(screen.getByText('USD 0,0123')).toBeTruthy();
  });

  test('CP3: filtra por los últimos 7 días', async () => {
    await renderizar();

    await fireEvent.press(screen.getByTestId('monitoreo-periodo-7'));

    await waitFor(() => expect(obtenerMonitoreoIA).toHaveBeenLastCalledWith(rangoUltimosDias(7)));
  });

  test('CP3: filtra por un rango personalizado', async () => {
    await renderizar();

    await fireEvent.press(screen.getByTestId('monitoreo-periodo-personalizado'));
    await fireEvent.changeText(screen.getByLabelText('Desde'), '2026-10-01');
    await fireEvent.changeText(screen.getByLabelText('Hasta'), '2026-10-10');
    await fireEvent.press(screen.getByTestId('monitoreo-aplicar-rango'));

    await waitFor(() =>
      expect(obtenerMonitoreoIA).toHaveBeenLastCalledWith({ desde: '2026-10-01', hasta: '2026-10-10' })
    );
  });

  test('valida el rango antes de consultar', async () => {
    await renderizar();
    const llamadas = obtenerMonitoreoIA.mock.calls.length;

    await fireEvent.press(screen.getByTestId('monitoreo-periodo-personalizado'));
    await fireEvent.changeText(screen.getByLabelText('Desde'), '2026-10-10');
    await fireEvent.changeText(screen.getByLabelText('Hasta'), '2026-10-01');
    await fireEvent.press(screen.getByTestId('monitoreo-aplicar-rango'));

    expect(screen.getByText('La fecha de fin no puede ser anterior a la fecha de inicio.')).toBeTruthy();
    expect(obtenerMonitoreoIA).toHaveBeenCalledTimes(llamadas);
  });

  test('si falla la carga permite reintentar', async () => {
    obtenerMonitoreoIA.mockRejectedValueOnce(new Error('Sin conexión'));
    await render(<BackofficeMonitoreoIAScreen onVolver={jest.fn()} />);

    expect(await screen.findByText('Sin conexión')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(await screen.findByText('Sugerencias de actividades')).toBeTruthy();
  });
});

describe('umbral de costo (CA 6 y 7)', () => {
  test('sin superar el 80% no muestra alerta', async () => {
    obtenerMonitoreoIA.mockResolvedValue(
      respuesta({ umbral: umbral({ umbralMensualUSD: 10, porcentajeUsado: 50, nivel: 'normal' }) })
    );
    await renderizar();

    expect(screen.queryByTestId('monitoreo-alerta')).toBeNull();
  });

  test('CP4: al superar el 80% muestra una alerta visible', async () => {
    obtenerMonitoreoIA.mockResolvedValue(
      respuesta({
        umbral: umbral({ umbralMensualUSD: 10, costoMesActualUSD: 8.5, porcentajeUsado: 85, nivel: 'advertencia' }),
      })
    );
    await renderizar();

    expect(screen.getByTestId('monitoreo-alerta')).toBeTruthy();
    expect(screen.getByText('El consumo superó el 80% del umbral mensual')).toBeTruthy();
  });

  test('CP5: al superar el umbral informa que se avisó por correo', async () => {
    obtenerMonitoreoIA.mockResolvedValue(
      respuesta({
        umbral: umbral({ umbralMensualUSD: 10, costoMesActualUSD: 12, porcentajeUsado: 120, nivel: 'superado' }),
      })
    );
    await renderizar();

    expect(screen.getByText('Se superó el umbral de costo mensual')).toBeTruthy();
    expect(screen.getByText(/Se avisó por correo a los administradores del sistema/)).toBeTruthy();
  });

  test('configura el umbral mensual y actualiza la alerta', async () => {
    configurarUmbralCostoIA.mockResolvedValue(
      umbral({ umbralMensualUSD: 0.6, costoMesActualUSD: 0.5, porcentajeUsado: 83.3, nivel: 'advertencia' })
    );
    await renderizar();

    await fireEvent.changeText(screen.getByLabelText('Umbral de costo mensual en USD'), '0,60');
    await fireEvent.press(screen.getByTestId('monitoreo-guardar-umbral'));

    await waitFor(() => expect(configurarUmbralCostoIA).toHaveBeenCalledWith(0.6));
    expect(await screen.findByTestId('monitoreo-alerta')).toBeTruthy();
  });

  test('no envía un umbral inválido', async () => {
    await renderizar();

    await fireEvent.changeText(screen.getByLabelText('Umbral de costo mensual en USD'), '0');
    await fireEvent.press(screen.getByTestId('monitoreo-guardar-umbral'));

    expect(screen.getByText('Ingresá un umbral mayor a cero.')).toBeTruthy();
    expect(configurarUmbralCostoIA).not.toHaveBeenCalled();
  });

  test('permite quitar el umbral', async () => {
    obtenerMonitoreoIA.mockResolvedValue(
      respuesta({ umbral: umbral({ umbralMensualUSD: 10, porcentajeUsado: 5, nivel: 'normal' }) })
    );
    configurarUmbralCostoIA.mockResolvedValue(umbral());
    await renderizar();

    await fireEvent.press(screen.getByTestId('monitoreo-quitar-umbral'));

    await waitFor(() => expect(configurarUmbralCostoIA).toHaveBeenCalledWith(null));
  });
});

describe('privacidad (CA 8)', () => {
  test('CP6: aclara que no se guarda el contenido de las solicitudes', async () => {
    await renderizar();

    expect(screen.getByText(/No se guarda el contenido de las solicitudes ni datos de los usuarios/)).toBeTruthy();
  });
});
