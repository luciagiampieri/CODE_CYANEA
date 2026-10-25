import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import FinanzasUsuario from '../../components/backoffice/FinanzasUsuario';
import { obtenerHistorialComercialUsuario, listarPagos } from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({ obtenerHistorialComercialUsuario: jest.fn(), listarPagos: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
const periodo = {
  id: 42, plan: 'pro', tipoPlan: 'anual', estado: 'cancelada',
  fechaInicio: '2026-10-01T12:00:00Z', fechaFin: '2027-10-01T12:00:00Z',
  fechaCancelacion: '2026-10-15T12:00:00Z', precioPeriodoARS: '49000',
  movimiento: 'cambio_periodicidad', planAnterior: 'pro', tipoPlanAnterior: 'mensual',
};
const historial = {
  planActual: 'pro', totalPagadoARS: '53900', pagosAprobados: 2, pagosPendientes: 1, pagosRechazados: 1,
  ultimaSuscripcion: periodo, items: [periodo], total: 21, pagina: 1, totalPaginas: 2,
};
beforeEach(() => {
  jest.resetAllMocks();
  obtenerHistorialComercialUsuario.mockResolvedValue(historial);
  listarPagos.mockResolvedValue({ items: [], total: 0, totalIngresosAprobadosARS: '0' });
});

test('muestra pagos acumulados, cambio de periodicidad y cancelacion registrada', async () => {
  await render(<FinanzasUsuario idUsuario={7} />);
  expect(await screen.findByText('ARS 53.900,00')).toBeTruthy();
  expect(screen.getByText('Cambio de periodicidad: Mensual → Anual')).toBeTruthy();
  expect(screen.getByText('Cancelación: 15/10/2026')).toBeTruthy();
  expect(obtenerHistorialComercialUsuario).toHaveBeenCalledWith(7, 1);
  await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
  await waitFor(() => expect(obtenerHistorialComercialUsuario).toHaveBeenLastCalledWith(7, 2));
});

test('pagos globales y asociados siempre quedan restringidos al usuario', async () => {
  await render(<FinanzasUsuario idUsuario={7} />);
  await screen.findByText('ARS 53.900,00');
  await fireEvent.press(screen.getByRole('button', { name: 'Ver pagos de suscripción #42' }));
  await waitFor(() => expect(listarPagos).toHaveBeenLastCalledWith(expect.objectContaining({ idUsuario: 7, idSuscripcion: 42 })));
  await fireEvent.press(screen.getByRole('button', { name: 'Limpiar filtros' }));
  await waitFor(() => expect(listarPagos).toHaveBeenLastCalledWith(expect.objectContaining({ idUsuario: 7, idSuscripcion: 42 })));
  await fireEvent.press(screen.getByRole('button', { name: 'Todos los pagos del usuario' }));
  await waitFor(() => expect(listarPagos).toHaveBeenLastCalledWith(expect.objectContaining({ idUsuario: 7, idSuscripcion: null })));
});

test('muestra usuario sin historial y permite reintentar errores', async () => {
  obtenerHistorialComercialUsuario.mockRejectedValueOnce(new Error('Sin conexión'));
  obtenerHistorialComercialUsuario.mockResolvedValueOnce({ ...historial, ultimaSuscripcion: null, items: [], total: 0 });
  await render(<FinanzasUsuario idUsuario={7} />);
  expect(await screen.findByText('Sin conexión')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Reintentar historial comercial' }));
  expect(await screen.findByText('Sin suscripciones registradas')).toBeTruthy();
  expect(screen.getByText('Este usuario no tiene suscripciones ni cambios de periodicidad registrados.')).toBeTruthy();
});
