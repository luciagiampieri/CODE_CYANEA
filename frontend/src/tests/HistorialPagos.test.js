import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { controlDeRefresco } from './helpers/refrescoSimulado';
import { colors } from '../theme/tokens';
import PaymentHistoryScreen from '../screens/PaymentHistoryScreen';
import SubscriptionPanel from '../components/plans/SubscriptionPanel';
import { getAvailablePlans, getSubscriptionManagement, getSubscriptionPayments } from '../services/api';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => require('react').useEffect(callback, [callback]) }));
jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
jest.mock('../services/api', () => ({
  getAvailablePlans: jest.fn(), getSubscriptionManagement: jest.fn(), getSubscriptionPayments: jest.fn(),
  cancelSubscription: jest.fn(), reactivateSubscription: jest.fn(),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const pagos = [
  { id: 3, fecha: '2026-10-26T15:00:00Z', montoARS: '4900.00', estado: 'pendiente', periodoDesde: '2026-10-25T15:00:00Z', periodoHasta: '2026-11-25T15:00:00Z' },
  { id: 2, fecha: '2026-09-25T15:00:00Z', montoARS: '4900.00', estado: 'rechazado', periodoDesde: '2026-09-25T15:00:00Z', periodoHasta: '2026-10-25T15:00:00Z' },
  { id: 1, fecha: '2026-08-25T15:00:00Z', montoARS: '4900.00', estado: 'aprobado', periodoDesde: '2026-08-25T15:00:00Z', periodoHasta: '2026-09-25T15:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  getSubscriptionPayments.mockResolvedValue({ items: pagos });
  getAvailablePlans.mockResolvedValue({ planActual: 'gratuito', ultimaSuscripcion: null });
});

async function abrirHistorial() {
  await render(<PaymentHistoryScreen navigation={navigation} />);
  await screen.findByTestId('historial-pagos');
}

test('CP1: muestra los pagos del más reciente al más antiguo', async () => {
  await abrirHistorial();
  expect(screen.getAllByTestId(/^pago-/).map((fila) => fila.props.testID)).toEqual(['pago-3', 'pago-2', 'pago-1']);
});

test('CP2: cada pago muestra fecha, monto, período y estado', async () => {
  await abrirHistorial();
  expect(screen.getByText('3 pagos · el más reciente primero')).toBeTruthy();
  const aprobado = within(screen.getByTestId('pago-1'));
  expect(aprobado.getByText('ARS 4.900')).toBeTruthy();
  expect(aprobado.getByText('Pagado el 25/08/2026')).toBeTruthy();
  expect(aprobado.getByText('25 ago – 25 sep 2026')).toBeTruthy();
  expect(aprobado.getByText('Aprobado')).toBeTruthy();
});

test('CP3: un pago rechazado muestra su estado y el período que intentaba pagar', async () => {
  await abrirHistorial();
  const rechazado = within(screen.getByTestId('pago-2'));
  expect(rechazado.getByText('Rechazado')).toBeTruthy();
  expect(rechazado.getByText('25 sep – 25 oct 2026')).toBeTruthy();
  expect(rechazado.getByText('Intento del 25/09/2026')).toBeTruthy();
});

test('CP4: un pago pendiente muestra su estado', async () => {
  await abrirHistorial();
  const pendiente = within(screen.getByTestId('pago-3'));
  expect(pendiente.getByText('Pendiente')).toBeTruthy();
  expect(pendiente.getByText('Intento del 26/10/2026')).toBeTruthy();
});

test('un pago histórico sin período lo informa', async () => {
  getSubscriptionPayments.mockResolvedValue({ items: [{ ...pagos[2], periodoDesde: null, periodoHasta: null }] });
  await abrirHistorial();
  expect(screen.getByText('Período no registrado')).toBeTruthy();
  expect(screen.getByText('1 pago · el más reciente primero')).toBeTruthy();
});

test('CP8: sin pagos registrados muestra un mensaje informativo', async () => {
  getSubscriptionPayments.mockResolvedValue({ items: [] });
  await render(<PaymentHistoryScreen navigation={navigation} />);
  expect(await screen.findByText('Todavía no hay pagos')).toBeTruthy();
  expect(screen.getByText('Acá vas a ver los cobros de tu suscripción Pro.')).toBeTruthy();
});

test('si falla la consulta permite reintentar', async () => {
  getSubscriptionPayments.mockRejectedValueOnce(new Error('Sin conexión'));
  await render(<PaymentHistoryScreen navigation={navigation} />);
  expect(await screen.findByText('Sin conexión')).toBeTruthy();

  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByTestId('historial-pagos')).toBeTruthy();
  expect(getSubscriptionPayments).toHaveBeenCalledTimes(2);
});

test('CP6: con la suscripción cancelada se accede al historial desde la gestión', async () => {
  getSubscriptionManagement.mockResolvedValue({
    planActual: 'gratuito',
    suscripcion: {
      id: 7, modalidad: 'mensual', estado: 'cancelada', precioARS: '4900.00', fechaInicio: '2026-08-25T15:00:00Z',
      fechaFin: '2026-09-25T15:00:00Z', fechaProximaRenovacion: null, fechaCancelacion: '2026-09-01T15:00:00Z',
      renovacionAutomatica: false, puedeCancelar: false, puedeReactivar: false, urlMedioPago: null,
    },
  });
  await render(<SubscriptionPanel navigation={navigation} onVerPlanes={jest.fn()} />);

  await fireEvent.press(await screen.findByTestId('mi-suscripcion-historial'));
  expect(navigation.navigate).toHaveBeenCalledWith('HistorialPagos');
});

test('sin suscripción también se ofrece el historial de pagos', async () => {
  getSubscriptionManagement.mockResolvedValue({ planActual: 'gratuito', suscripcion: null });
  await render(<SubscriptionPanel navigation={navigation} onVerPlanes={jest.fn()} />);
  expect(await screen.findByTestId('mi-suscripcion-historial')).toBeTruthy();
});

test('pull-to-refresh vuelve a consultar el historial', async () => {
  await abrirHistorial();
  await act(async () => { controlDeRefresco(screen.toJSON()).props.onRefresh(); });
  expect(getSubscriptionPayments).toHaveBeenCalledTimes(2);
  expect(controlDeRefresco(screen.toJSON()).props.refreshing).toBe(false);
});

test('un pago rechazado muestra el monto en gris', async () => {
  await abrirHistorial();
  const colorDelMonto = (id) => [within(screen.getByTestId(id)).getByText('ARS 4.900').props.style].flat(Infinity)
    .filter(Boolean).reduce((color, estilo) => estilo.color ?? color, null);
  expect(colorDelMonto('pago-2')).toBe(colors.textMuted);
  expect(colorDelMonto('pago-1')).toBe(colors.textPrimary);
});

test('pago pendiente de renovación: un solo aviso con un botón para actualizar el medio de pago', async () => {
  getSubscriptionManagement.mockResolvedValue({
    planActual: 'pro',
    suscripcion: {
      id: 7, modalidad: 'mensual', estado: 'pendiente_pago', precioARS: '4900.00', fechaInicio: '2026-09-25T15:00:00Z',
      fechaFin: '2026-10-25T15:00:00Z', fechaProximaRenovacion: null, fechaCancelacion: null, fechaLimitePago: '2026-10-28T15:00:00Z',
      renovacionAutomatica: true, puedeCancelar: true, puedeReactivar: false, urlMedioPago: 'https://www.mercadopago.com.ar/subscriptions',
    },
  });
  await render(<SubscriptionPanel navigation={navigation} onVerPlanes={jest.fn()} />);
  expect(await screen.findByTestId('mi-suscripcion-aviso-pago')).toBeTruthy();
  expect(screen.getByTestId('mi-suscripcion-medio-pago')).toBeTruthy();
  expect(screen.queryByTestId('mi-suscripcion-suscribirme')).toBeNull();
  expect(screen.getByTestId('mi-suscripcion-cancelar')).toBeTruthy();
});
