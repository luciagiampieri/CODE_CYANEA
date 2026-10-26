import { fireEvent, render, screen } from '@testing-library/react-native';
import PlansScreen from '../screens/PlansScreen';
import MySubscriptionScreen from '../screens/MySubscriptionScreen';
import { getAvailablePlans, getAccountUsage } from '../services/api';
import { appAlert } from '../components/ui/AppDialog';
import { mostrarLimiteAlcanzado } from '../utils/limitesPlan';
import { navigationRef } from '../services/notificationNavigation';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => require('react').useEffect(callback, [callback]) }));
jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
jest.mock('../services/api', () => ({ getAvailablePlans: jest.fn(), getAccountUsage: jest.fn() }));
jest.mock('../components/ui/AppDialog', () => ({ appAlert: jest.fn() }));
jest.mock('../services/notificationNavigation', () => ({ navigationRef: { isReady: jest.fn(() => true), getRootState: jest.fn(() => ({ routeNames: ['Planes', 'Configuracion'] })), navigate: jest.fn() } }));

const limites = { maxViajesActivos: 5, maxParticipantesViaje: 3, maxSugerenciasDiarias: 10, maxEscaneosMensuales: 3, maxAlmacenamientoMb: 100 };
const datos = { precioMensualARS: '4900', precioAnualARS: '49000', gratuito: limites,
  pro: { maxViajesActivos: 15, maxParticipantesViaje: 10, maxSugerenciasDiarias: 20, maxEscaneosMensuales: 50, maxAlmacenamientoMb: 2048 },
  planActual: 'gratuito', ahorroAnualPorcentaje: '16.67', ultimaSuscripcion: null };
const navigation = { navigate: jest.fn(), goBack: jest.fn() };
async function abrirComparacion() {
  const vista = await render(<PlansScreen navigation={navigation} />);
  await fireEvent.press(screen.getByText('Comparar planes'));
  return vista;
}
beforeEach(() => {
  jest.clearAllMocks(); getAvailablePlans.mockResolvedValue(datos);
  const uso = { limite: 5, usoActual: 0, ilimitado: false, porcentajeUso: 0, limiteAlcanzado: false, limiteExcedido: false };
  getAccountUsage.mockResolvedValue({ viajesActivos: uso, escaneosMensuales: uso, items: [], totalPaginas: 0, consultadoEl: '2026-10-24T12:00:00Z' });
});

test('CP1 y CP2: compara limites vigentes e identifica el plan gratuito', async () => {
  await abrirComparacion();
  expect(await screen.findByText(/ARS 4\.900,00/)).toBeTruthy();
  expect(screen.getByText('Ahorrás 16,67 % con el plan anual')).toBeTruthy();
  expect(screen.getByTestId('planes-pro-maxAlmacenamientoMb').props.children).toBe('2.048 MB');
  expect(screen.getByTestId('planes-gratuito-maxViajesActivos').props.children).toBe('5');
  expect(screen.getAllByText('Tu plan actual')).toHaveLength(1);
  expect(screen.getByTestId('planes-suscribirme')).toBeTruthy();
  expect(screen.queryByTestId('planes-gestionar')).toBeNull();
  await fireEvent.press(screen.getByTestId('planes-suscribirme'));
  // US 116: la contratación abre el flujo de suscripción.
  expect(navigation.navigate).toHaveBeenCalledWith('SuscribirsePro');
  expect(screen.queryByText(/próximamente/)).toBeNull();
});

test('CP3: actualiza precios y limites sin conservar valores anteriores', async () => {
  const vista = await abrirComparacion();
  await screen.findByText(/ARS 4\.900,00/);
  getAvailablePlans.mockResolvedValue({ ...datos, precioMensualARS: '6000', pro: { ...datos.pro, maxSugerenciasDiarias: 27 } });
  expect(screen.queryByText('Actualizar precios y límites')).toBeNull();
  await vista.unmount();
  await abrirComparacion();
  expect(await screen.findByText(/ARS 6\.000,00/)).toBeTruthy();
  expect(screen.getByTestId('planes-pro-maxSugerenciasDiarias').props.children).toBe('27');
});

test('CP4: el aviso de limite abre la pantalla de planes registrada', () => {
  mostrarLimiteAlcanzado({ message: 'Límite alcanzado', detalle: { tipoLimite: 'viajes_activos' } });
  const botones = appAlert.mock.calls[0][2];
  botones.find((b) => b.text === 'Ver planes').onPress();
  expect(navigationRef.navigate).toHaveBeenCalledWith('Planes');
});

test('CP5: Pro muestra gestion de suscripcion y no contratacion', async () => {
  getAvailablePlans.mockResolvedValue({ ...datos, planActual: 'pro' });
  await abrirComparacion();
  await screen.findByText(/ARS 4\.900,00/);
  expect(screen.queryByTestId('planes-suscribirme')).toBeNull();
  await fireEvent.press(screen.getByTestId('planes-gestionar'));
  expect(navigation.navigate).toHaveBeenCalledWith('MiSuscripcion');
});

test('consulta la suscripcion propia y conserva el precio historico', async () => {
  getAvailablePlans.mockResolvedValue({ ...datos, planActual: 'pro', ultimaSuscripcion: { id: 1, tipoPlan: 'mensual', estado: 'cancelada',
    fechaInicio: '2026-10-01T12:00:00Z', fechaFin: '2027-10-01T12:00:00Z', precioPeriodoARS: '3900', fechaCancelacion: '2026-10-10T12:00:00Z' } });
  await render(<MySubscriptionScreen navigation={navigation} />);
  expect(await screen.findByText('Importe del período: ARS 3.900,00')).toBeTruthy();
  expect(screen.getByText('Estado del último período: Cancelada')).toBeTruthy();
});

test('reintenta errores y representa precios y limites no configurados', async () => {
  getAvailablePlans.mockRejectedValueOnce(new Error('Sin conexión'));
  getAvailablePlans.mockRejectedValueOnce(new Error('Sin conexión'));
  getAvailablePlans.mockResolvedValueOnce({ ...datos, precioAnualARS: null, ahorroAnualPorcentaje: null, pro: { ...datos.pro, maxAlmacenamientoMb: null } });
  await abrirComparacion();
  expect(await screen.findByText('Sin conexión')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText(/Precio por configurar/)).toBeTruthy();
  expect(screen.getByTestId('planes-pro-maxAlmacenamientoMb').props.children).toBe('Sin límite');
  expect(screen.getByTestId('planes-suscribirme').props.accessibilityState.disabled).toBe(true);
});
