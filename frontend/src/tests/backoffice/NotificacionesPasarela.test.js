import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import BackofficeSuscripcionesScreen from '../../screens/backoffice/BackofficeSuscripcionesScreen';
import { listarNotificacionesPasarela, obtenerResumenFinanciero } from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({
  listarPagos: jest.fn(), listarSuscripciones: jest.fn(), obtenerSuscripcion: jest.fn(),
  obtenerResumenFinanciero: jest.fn(() => new Promise(() => {})), listarNotificacionesPasarela: jest.fn(),
}));

const NOTIFICACIONES = [
  { id: 2, tipo: 'subscription_authorized_payment', idRecurso: 'cobro-1', idSolicitud: 'req-b', estado: 'procesada', error: null, fechaRecepcion: '2026-10-27T15:05:00Z' },
  { id: 1, tipo: 'subscription_authorized_payment', idRecurso: 'cobro-1', idSolicitud: 'req-a', estado: 'error', error: 'RuntimeError: caída', fechaRecepcion: '2026-10-27T15:00:00Z' },
];
const pagina = (items, extra = {}) => ({
  items, total: items.length, pagina: 1, tamanioPagina: 20, totalPaginas: items.length ? 1 : 0,
  totalesPorEstado: { procesada: 1, ignorada: 0, error: 1 }, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  listarNotificacionesPasarela.mockResolvedValue(pagina(NOTIFICACIONES));
});

async function abrir() {
  await render(<BackofficeSuscripcionesScreen onVolver={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Notificaciones de la pasarela' }));
  await screen.findByText('RuntimeError: caída');
}

test('lista cada notificación recibida con su resultado y los totales', async () => {
  await abrir();
  expect(obtenerResumenFinanciero).toHaveBeenCalled();
  expect(listarNotificacionesPasarela).toHaveBeenCalledWith({ estado: null, pagina: 1 });
  expect(screen.getAllByText('Cobro de suscripción')).toHaveLength(2);
  expect(screen.getAllByText('Recurso: cobro-1')).toHaveLength(2);
  expect(screen.getByText('Solicitud: req-b')).toBeTruthy();
  expect(screen.getAllByText('Procesada').length).toBeGreaterThan(0);
  expect(screen.getByTestId('notificaciones-totales').props.children.join('')).toBe('1 procesadas · 0 ignoradas · 1 con error');
});

test('filtra las notificaciones con error y reinicia la página', async () => {
  await abrir();
  listarNotificacionesPasarela.mockResolvedValue(pagina([NOTIFICACIONES[1]]));
  await fireEvent.press(screen.getByRole('button', { name: 'Con error' }));
  await waitFor(() => expect(listarNotificacionesPasarela).toHaveBeenLastCalledWith({ estado: 'error', pagina: 1 }));
  expect(await screen.findByText('RuntimeError: caída')).toBeTruthy();
  expect(screen.queryByText('Solicitud: req-b')).toBeNull();
});

test('sin notificaciones informa el vacío', async () => {
  listarNotificacionesPasarela.mockResolvedValue(pagina([], { totalesPorEstado: { procesada: 0, ignorada: 0, error: 0 } }));
  await render(<BackofficeSuscripcionesScreen onVolver={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Notificaciones de la pasarela' }));
  expect(await screen.findByText('No se recibieron notificaciones para el filtro aplicado.')).toBeTruthy();
});

test('si falla la consulta permite reintentar', async () => {
  listarNotificacionesPasarela.mockRejectedValueOnce(new Error('Sin conexión con el servidor.'));
  await render(<BackofficeSuscripcionesScreen onVolver={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Notificaciones de la pasarela' }));
  expect(await screen.findByText('Sin conexión con el servidor.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Reintentar notificaciones' }));
  expect(await screen.findByText('RuntimeError: caída')).toBeTruthy();
  expect(listarNotificacionesPasarela).toHaveBeenCalledTimes(2);
});
