import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { controlDeRefresco } from './helpers/refrescoSimulado';
import PlanSubscriptionScreen from '../screens/PlanSubscriptionScreen';
import { getAvailablePlans, getAccountUsage, getSubscriptionManagement } from '../services/api';
import { appAlert } from '../components/ui/AppDialog';
import { mostrarLimiteAlcanzado } from '../utils/limitesPlan';
import { navigationRef } from '../services/notificationNavigation';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => require('react').useEffect(callback, [callback]) }));
jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('../services/api', () => ({
  getAvailablePlans: jest.fn(), getAccountUsage: jest.fn(), getSubscriptionManagement: jest.fn(),
  cancelSubscription: jest.fn(), reactivateSubscription: jest.fn(),
}));
jest.mock('../components/ui/AppDialog', () => ({ appAlert: jest.fn() }));
jest.mock('../services/notificationNavigation', () => ({ navigationRef: { isReady: jest.fn(() => true), getRootState: jest.fn(() => ({ routeNames: ['Planes', 'Configuracion'] })), navigate: jest.fn() } }));

const limites = { maxViajesActivos: 5, maxParticipantesViaje: 3, maxSugerenciasDiarias: 10, maxEscaneosMensuales: 3, maxAlmacenamientoMb: 100 };
const datos = { precioMensualARS: '4900', precioAnualARS: '49000', gratuito: limites,
  pro: { maxViajesActivos: 15, maxParticipantesViaje: 10, maxSugerenciasDiarias: 20, maxEscaneosMensuales: 50, maxAlmacenamientoMb: 2048 },
  planActual: 'gratuito', ahorroAnualPorcentaje: '16.67', ultimaSuscripcion: null };
const navigation = { navigate: jest.fn(), goBack: jest.fn() };

async function abrir(tab) {
  return render(<PlanSubscriptionScreen navigation={navigation} route={{ params: tab ? { tab } : undefined }} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  getAvailablePlans.mockResolvedValue(datos);
  getSubscriptionManagement.mockResolvedValue({ planActual: 'gratuito', suscripcion: null });
  const uso = { limite: 5, usoActual: 0, ilimitado: false, porcentajeUso: 0, limiteAlcanzado: false, limiteExcedido: false };
  getAccountUsage.mockResolvedValue({ planActual: 'gratuito', viajesActivos: uso, escaneosMensuales: uso, items: [], totalPaginas: 0, consultadoEl: '2026-10-24T12:00:00Z' });
});

test('CP1 y CP2: compara limites vigentes e identifica el plan gratuito', async () => {
  await abrir('planes');
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
  const vista = await abrir('planes');
  await screen.findByText(/ARS 4\.900,00/);
  getAvailablePlans.mockResolvedValue({ ...datos, precioMensualARS: '6000', pro: { ...datos.pro, maxSugerenciasDiarias: 27 } });
  expect(screen.queryByText('Actualizar precios y límites')).toBeNull();
  await vista.unmount();
  await abrir('planes');
  expect(await screen.findByText(/ARS 6\.000,00/)).toBeTruthy();
  expect(screen.getByTestId('planes-pro-maxSugerenciasDiarias').props.children).toBe('27');
});

test('CP4: el aviso de limite abre la pantalla de planes registrada', () => {
  mostrarLimiteAlcanzado({ message: 'Límite alcanzado', detalle: { tipoLimite: 'viajes_activos' } });
  const botones = appAlert.mock.calls[0][2];
  botones.find((b) => b.text === 'Ver planes').onPress();
  expect(navigationRef.navigate).toHaveBeenCalledWith('Planes');
});

test('CP5: Pro muestra gestion de suscripcion y lleva a la pestaña Mi plan', async () => {
  getAvailablePlans.mockResolvedValue({ ...datos, planActual: 'pro' });
  getSubscriptionManagement.mockResolvedValue({ planActual: 'pro', suscripcion: null });
  await abrir('planes');
  await screen.findByText(/ARS 4\.900,00/);
  expect(screen.queryByTestId('planes-suscribirme')).toBeNull();
  await fireEvent.press(screen.getByTestId('planes-gestionar'));
  expect(await screen.findByTestId('mi-suscripcion')).toBeTruthy();
  expect(screen.getByTestId('plan-tab-mi_plan').props.accessibilityState.selected).toBe(true);
  expect(navigation.navigate).not.toHaveBeenCalledWith('MiSuscripcion');
});

test('consulta la suscripcion propia y conserva el precio historico', async () => {
  getSubscriptionManagement.mockResolvedValue({ planActual: 'pro', suscripcion: {
    id: 1, modalidad: 'mensual', estado: 'cancelada', precioARS: '3900',
    fechaInicio: '2026-10-01T12:00:00Z', fechaFin: '2027-10-01T12:00:00Z', fechaProximaRenovacion: null,
    fechaCancelacion: '2026-10-10T12:00:00Z', renovacionAutomatica: false,
    puedeCancelar: false, puedeReactivar: true, urlMedioPago: null,
  } });
  await abrir('mi_plan');
  expect(await screen.findByText('ARS 3.900')).toBeTruthy();
  expect(screen.getByText('/mes')).toBeTruthy();
  expect(screen.getByTestId('mi-suscripcion-fecha').props.children).toBe('Pro hasta el 01/10/2027 · no se renueva');
  expect(screen.getByTestId('mi-suscripcion-estado').props.children).toBe('Cancelada');
  expect(screen.getByTestId('mi-suscripcion-reactivar')).toBeTruthy();
});

test('reintenta errores y representa precios y limites no configurados', async () => {
  getAvailablePlans.mockRejectedValueOnce(new Error('Sin conexión'));
  getAvailablePlans.mockResolvedValueOnce({ ...datos, precioAnualARS: null, ahorroAnualPorcentaje: null, pro: { ...datos.pro, maxAlmacenamientoMb: null } });
  await abrir('planes');
  expect(await screen.findByText('Sin conexión')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByText(/Precio por configurar/)).toBeTruthy();
  expect(screen.getByTestId('planes-pro-maxAlmacenamientoMb').props.children).toBe('Sin límite');
  expect(screen.getByTestId('planes-suscribirme').props.accessibilityState.disabled).toBe(true);
});

test('sin pestaña indicada abre Mi plan', async () => {
  await abrir();
  expect(await screen.findByTestId('mi-suscripcion')).toBeTruthy();
  expect(screen.getByTestId('plan-tab-mi_plan').props.accessibilityState.selected).toBe(true);
});

test('desde Mi plan gratuito se puede ir a comparar planes', async () => {
  await abrir('mi_plan');
  await fireEvent.press(await screen.findByTestId('mi-suscripcion-ver-planes'));
  expect(await screen.findByTestId('planes-suscribirme')).toBeTruthy();
  expect(screen.getByTestId('plan-tab-planes').props.accessibilityState.selected).toBe(true);
});

test('la pestaña Consumo muestra el consumo de la cuenta', async () => {
  await abrir('mi_plan');
  await fireEvent.press(screen.getByTestId('plan-tab-consumo'));
  expect(await screen.findByText('El consumo de tu cuenta')).toBeTruthy();
  expect(getAccountUsage).toHaveBeenCalled();
});
test('Pro activa: precio y renovación arriba, acciones secundarias como filas', async () => {
  getSubscriptionManagement.mockResolvedValue({ planActual: 'pro', suscripcion: {
    id: 1, modalidad: 'anual', estado: 'activa', precioARS: '49000.00',
    fechaInicio: '2026-10-01T12:00:00Z', fechaFin: '2027-10-01T12:00:00Z', fechaProximaRenovacion: '2027-10-01T12:00:00Z',
    fechaCancelacion: null, renovacionAutomatica: true, puedeCancelar: true, puedeReactivar: false, urlMedioPago: null,
  } });
  await abrir('mi_plan');
  expect(await screen.findByText('ARS 49.000')).toBeTruthy();
  expect(screen.getByText('/año')).toBeTruthy();
  expect(screen.getByText('Anual')).toBeTruthy();
  expect(screen.getByTestId('mi-suscripcion-fecha').props.children).toBe('Se renueva el 01/10/2027');
  expect(screen.getByTestId('mi-suscripcion-historial')).toBeTruthy();
  expect(screen.getByTestId('mi-suscripcion-cancelar')).toBeTruthy();
  expect(screen.queryByTestId('mi-suscripcion-reactivar')).toBeNull();
  expect(screen.queryByTestId('mi-suscripcion-suscribirme')).toBeNull();
  expect(screen.queryByText('Actualizar información')).toBeNull();
});

test('pull-to-refresh vuelve a consultar Mi plan sin el botón de actualizar', async () => {
  await abrir('mi_plan');
  await screen.findByTestId('mi-suscripcion');
  expect(getSubscriptionManagement).toHaveBeenCalledTimes(1);

  await act(async () => { controlDeRefresco(screen.toJSON()).props.onRefresh(); });
  expect(getSubscriptionManagement).toHaveBeenCalledTimes(2);
  expect(controlDeRefresco(screen.toJSON()).props.refreshing).toBe(false);
});
