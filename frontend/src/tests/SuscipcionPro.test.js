import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import SubscribeProScreen from '../screens/SubscribeProScreen';
import SubscriptionStatusScreen, { INTERVALO_CONSULTA_MS } from '../screens/SubscriptionStatusScreen';
import PlanSubscriptionScreen from '../screens/PlanSubscriptionScreen';
import {
  getAvailablePlans, getSubscriptionManagement, getSubscriptionStatus, getSubscriptionSummary, startSubscription,
} from '../services/api';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => require('react').useEffect(callback, [callback]) }));
jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: 'success' })) }));
jest.mock('../services/api', () => ({
  getAvailablePlans: jest.fn(), getAccountUsage: jest.fn(), getSubscriptionSummary: jest.fn(),
  startSubscription: jest.fn(), getSubscriptionStatus: jest.fn(), getSubscriptionManagement: jest.fn(),
  cancelSubscription: jest.fn(), reactivateSubscription: jest.fn(),
}));

const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popTo: jest.fn() };
const resumen = {
  puedeSuscribirse: true, codigo: null, mensaje: null,
  modalidades: {
    mensual: { precioARS: '4900.00', fechaProximaRenovacion: '2026-11-25T15:00:00Z' },
    anual: { precioARS: '49000.00', fechaProximaRenovacion: '2027-10-25T15:00:00Z' },
  },
};
const estadoBase = { id: 7, modalidad: 'mensual', precioARS: '4900.00', fechaInicio: '2026-10-25T15:00:00Z',
  fechaFin: '2026-11-25T15:00:00Z', fechaProximaRenovacion: null, planActual: 'gratuito' };

beforeEach(() => {
  jest.clearAllMocks();
  getSubscriptionSummary.mockResolvedValue(resumen);
  getSubscriptionManagement.mockResolvedValue({ planActual: 'gratuito', suscripcion: null });
});

async function abrirSuscripcion(params) {
  await render(<SubscribeProScreen navigation={navigation} route={{ params }} />);
  await screen.findByTestId('suscribirse-resumen');
}

test('muestra el resumen de la modalidad elegida antes de confirmar', async () => {
  await abrirSuscripcion();
  expect(screen.getByText('Modalidad: Mensual')).toBeTruthy();
  expect(screen.getByText('Precio: ARS 4.900,00 por mes')).toBeTruthy();
  expect(screen.getByTestId('suscribirse-renovacion').props.children.join('')).toContain('25/11/2026');

  await fireEvent.press(screen.getByTestId('suscribirse-modalidad-anual'));
  expect(screen.getByText('Modalidad: Anual')).toBeTruthy();
  expect(screen.getByText('Precio: ARS 49.000,00 por año')).toBeTruthy();
  expect(screen.getByTestId('suscribirse-renovacion').props.children.join('')).toContain('25/10/2027');
});

test('sin aceptar la renovación automática no se puede continuar', async () => {
  await abrirSuscripcion();
  const confirmar = screen.getByTestId('suscribirse-confirmar');
  expect(confirmar.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(confirmar);
  expect(startSubscription).not.toHaveBeenCalled();
});

test('al confirmar redirige a Mercado Pago y luego muestra el estado del pago', async () => {
  startSubscription.mockResolvedValue({ id: 7, urlPago: 'https://www.mercadopago.com.ar/checkout?x=1', urlRetorno: 'cyanea://suscripcion/retorno' });
  await abrirSuscripcion({ modalidad: 'anual' });
  await fireEvent.press(screen.getByTestId('suscribirse-acepta'));
  await fireEvent.press(screen.getByTestId('suscribirse-confirmar'));
  expect(startSubscription).toHaveBeenCalledWith({ modalidad: 'anual', aceptaRenovacionAutomatica: true });
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith('https://www.mercadopago.com.ar/checkout?x=1', 'cyanea://suscripcion/retorno');
  expect(navigation.replace).toHaveBeenCalledWith('SuscripcionEstado');
});

test('con un pago pendiente de confirmación no permite iniciar otra suscripción', async () => {
  getSubscriptionSummary.mockResolvedValue({ ...resumen, puedeSuscribirse: false, codigo: 'SUBSCRIPTION_PAYMENT_PENDING',
    mensaje: 'Tenés un pago pendiente de confirmación. La suscripción se activará al acreditarse el pago.' });
  await render(<SubscribeProScreen navigation={navigation} route={{}} />);
  expect(await screen.findByTestId('suscribirse-bloqueo')).toBeTruthy();
  expect(screen.getByText(/se activará al acreditarse el pago/)).toBeTruthy();
  expect(screen.queryByTestId('suscribirse-confirmar')).toBeNull();
  await fireEvent.press(screen.getByTestId('suscribirse-ver-estado'));
  expect(navigation.replace).toHaveBeenCalledWith('SuscripcionEstado');
});

test('con una suscripción activa informa que ya es Pro', async () => {
  getSubscriptionSummary.mockResolvedValue({ ...resumen, puedeSuscribirse: false, codigo: 'SUBSCRIPTION_ALREADY_ACTIVE', mensaje: 'Ya tenés una suscripción Pro activa.' });
  await render(<SubscribeProScreen navigation={navigation} route={{}} />);
  expect(await screen.findByText('Ya tenés una suscripción Pro activa.')).toBeTruthy();
  expect(screen.queryByTestId('suscribirse-confirmar')).toBeNull();
});

test('muestra el error del backend si no se pudo iniciar', async () => {
  const error = new Error('No pudimos comunicarnos con Mercado Pago.');
  error.code = 'PAYMENT_GATEWAY_ERROR';
  startSubscription.mockRejectedValue(error);
  await abrirSuscripcion();
  await fireEvent.press(screen.getByTestId('suscribirse-acepta'));
  await fireEvent.press(screen.getByTestId('suscribirse-confirmar'));
  expect(await screen.findByText('No pudimos comunicarnos con Mercado Pago.')).toBeTruthy();
  expect(WebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
});

test('pago aprobado: informa que ya es Pro y la próxima renovación', async () => {
  getSubscriptionStatus.mockResolvedValue({ ...estadoBase, estado: 'activa', planActual: 'pro', fechaProximaRenovacion: '2026-11-25T15:00:00Z' });
  await render(<SubscriptionStatusScreen navigation={navigation} />);
  expect(await screen.findByText('¡Ya sos Pro!')).toBeTruthy();
  expect(screen.getByText(/Próxima renovación: 25\/11\/2026/)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('suscripcion-ver'));
  expect(navigation.replace).toHaveBeenCalledWith('MiSuscripcion');
});

test('volver atrás desde el estado regresa a Planes sin duplicar pantallas', async () => {
  getSubscriptionStatus.mockResolvedValue({ ...estadoBase, estado: 'sin_pago' });
  await render(<SubscriptionStatusScreen navigation={navigation} />);
  await fireEvent.press(await screen.findByLabelText('Volver a planes'));
  expect(navigation.popTo).toHaveBeenCalledWith('Planes');
  expect(navigation.navigate).not.toHaveBeenCalledWith('Planes');
});

test('pago pendiente: informa que se activará al acreditarse y no ofrece reintentar', async () => {
  getSubscriptionStatus.mockResolvedValue({ ...estadoBase, estado: 'pago_en_proceso' });
  await render(<SubscriptionStatusScreen navigation={navigation} />);
  expect(await screen.findByText(/se activará al acreditarse el pago/)).toBeTruthy();
  expect(screen.queryByTestId('suscripcion-reintentar')).toBeNull();
});

test('pago rechazado: lo informa y permite reintentar con la misma modalidad', async () => {
  getSubscriptionStatus.mockResolvedValue({ ...estadoBase, estado: 'pago_rechazado', modalidad: 'anual' });
  await render(<SubscriptionStatusScreen navigation={navigation} />);
  expect(await screen.findByText('Tu pago fue rechazado')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('suscripcion-reintentar'));
  expect(navigation.replace).toHaveBeenCalledWith('SuscribirsePro', { modalidad: 'anual' });
});

test('mientras espera la confirmación vuelve a consultar hasta que se activa', async () => {
  jest.useFakeTimers();
  try {
    getSubscriptionStatus
      .mockResolvedValueOnce({ ...estadoBase, estado: 'sin_pago' })
      .mockResolvedValueOnce({ ...estadoBase, estado: 'activa', planActual: 'pro', fechaProximaRenovacion: '2026-11-25T15:00:00Z' });
    await render(<SubscriptionStatusScreen navigation={navigation} />);
    expect(await screen.findByText('Todavía no recibimos la confirmación de tu pago')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(INTERVALO_CONSULTA_MS); });
    expect(await screen.findByText('¡Ya sos Pro!')).toBeTruthy();
    expect(getSubscriptionStatus).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});

test('Mi plan ofrece ver el estado de un pago pendiente', async () => {
  getAvailablePlans.mockResolvedValue({ planActual: 'gratuito', precioMensualARS: '4900', precioAnualARS: '49000',
    ultimaSuscripcion: { id: 7, tipoPlan: 'mensual', estado: 'pendiente_pago', fechaInicio: '2026-10-25T15:00:00Z',
      fechaFin: '2026-11-25T15:00:00Z', fechaCancelacion: null, precioPeriodoARS: '4900' } });
  await render(<PlanSubscriptionScreen navigation={navigation} route={{ params: { tab: 'mi_plan' } }} />);
  await fireEvent.press(await screen.findByTestId('mi-suscripcion-estado-pago'));
  expect(navigation.navigate).toHaveBeenCalledWith('SuscripcionEstado');
  expect(screen.queryByTestId('mi-suscripcion-suscribirme')).toBeNull();
});