import { render, screen } from '@testing-library/react-native';
import SubscriptionPanel from '../components/plans/SubscriptionPanel';
import { getAvailablePlans, getSubscriptionManagement } from '../services/api';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => require('react').useEffect(callback, [callback]) }));
jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
jest.mock('../services/api', () => ({
  getAvailablePlans: jest.fn(), getSubscriptionManagement: jest.fn(),
  cancelSubscription: jest.fn(), reactivateSubscription: jest.fn(),
}));

const navigation = { navigate: jest.fn() };
const base = {
  id: 7, modalidad: 'mensual', precioARS: '4900.00', fechaInicio: '2026-09-25T15:00:00Z', fechaFin: '2026-10-25T15:00:00Z',
  fechaProximaRenovacion: null, fechaCancelacion: null, renovacionAutomatica: true, puedeCancelar: false, puedeReactivar: false,
};

function conSuscripcion(suscripcion, planActual = 'pro') {
  getSubscriptionManagement.mockResolvedValue({ planActual, suscripcion: { ...base, ...suscripcion } });
}

beforeEach(() => {
  jest.clearAllMocks();
  getAvailablePlans.mockResolvedValue({ planActual: 'pro', ultimaSuscripcion: null });
});

test('renovación rechazada: informa la fecha límite antes de que venza', async () => {
  conSuscripcion({ estado: 'pendiente_pago', fechaLimitePago: '2026-10-28T15:00:00Z', urlMedioPago: 'https://www.mercadopago.com.ar/subscriptions' });
  await render(<SubscriptionPanel navigation={navigation} onVerPlanes={jest.fn()} />);

  expect((await screen.findByTestId('mi-suscripcion-estado')).props.children).toBe('Pendiente de pago');
  const texto = screen.getByTestId('mi-suscripcion-fecha').props.children;
  expect(screen.getByText('No pudimos cobrar la renovación')).toBeTruthy();
  expect(texto).toContain('Tenés hasta el 28/10/2026');
  expect(texto).toContain('volvés al plan gratuito');
  expect(screen.getByTestId('mi-suscripcion-medio-pago')).toBeTruthy();
});

test('sin fecha límite informada usa un plazo genérico', async () => {
  conSuscripcion({ estado: 'pendiente_pago', fechaLimitePago: null, urlMedioPago: 'https://www.mercadopago.com.ar/subscriptions' });
  await render(<SubscriptionPanel navigation={navigation} onVerPlanes={jest.fn()} />);

  expect((await screen.findByTestId('mi-suscripcion-fecha')).props.children).toContain('en los próximos días');
});

test('al vencer por falta de pago lo informa y ofrece volver a suscribirse', async () => {
  conSuscripcion({ estado: 'vencida', fechaLimitePago: null, urlMedioPago: null }, 'gratuito');
  getAvailablePlans.mockResolvedValue({ planActual: 'gratuito', ultimaSuscripcion: null });
  await render(<SubscriptionPanel navigation={navigation} onVerPlanes={jest.fn()} />);

  expect((await screen.findByTestId('mi-suscripcion-estado')).props.children).toBe('Vencida');
  expect(screen.getByTestId('mi-suscripcion-fecha').props.children).toBe('Venció el 25/10/2026');
  expect(screen.queryByTestId('mi-suscripcion-medio-pago')).toBeNull();
  expect(screen.getByTestId('mi-suscripcion-suscribirme')).toBeTruthy();
});
