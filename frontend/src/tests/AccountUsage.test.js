import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AccountUsage, { UsageMeter } from '../components/plans/AccountUsage';
import { getAccountUsage } from '../services/api';

jest.mock('@react-navigation/native', () => ({ useFocusEffect: (callback) => require('react').useEffect(callback, [callback]) }));
jest.mock('@expo/vector-icons', () => ({ FontAwesome6: () => null }));
jest.mock('../services/api', () => ({ getAccountUsage: jest.fn() }));
const uso = (actual, limite) => ({ usoActual: actual, limite, ilimitado: limite == null,
  porcentajeUso: limite ? actual / limite * 100 : null, limiteAlcanzado: limite != null && actual >= limite,
  limiteExcedido: limite != null && actual > limite, renuevaEl: null });
const datos = { viajesActivos: uso(2, 5), escaneosMensuales: uso(3, 3), total: 7, pagina: 1, totalPaginas: 2,
  consultadoEl: '2026-10-24T12:00:00Z', items: [{ id: 1, titulo: 'Viaje a Mendoza', esAdministrador: false,
    estado: 'activo', planAdministrador: 'pro', participantes: uso(4, 10), sugerenciasDiarias: uso(2, 20), almacenamiento: uso(30, 2048) }] };
beforeEach(() => { jest.resetAllMocks(); getAccountUsage.mockResolvedValue(datos); });

test('muestra consumo de cuenta y limites del administrador del viaje', async () => {
  await render(<AccountUsage />);
  expect(await screen.findByText('2 / 5')).toBeTruthy();
  expect(screen.getByText('3 / 3')).toBeTruthy();
  expect(screen.getByText('Límite alcanzado')).toBeTruthy();
  expect(screen.getByText('Participás · Activo · Plan Pro')).toBeTruthy();
  expect(screen.getByText('4 / 10')).toBeTruthy();
  expect(screen.getByText('30 MB / 2.048 MB')).toBeTruthy();
  await fireEvent.press(screen.getByText('Más viajes'));
  await waitFor(() => expect(getAccountUsage).toHaveBeenLastCalledWith(2));
});

test('representa limites superados e ilimitados sin porcentajes invalidos', async () => {
  await render(<><UsageMeter titulo="Viajes" uso={uso(8, 5)} /><UsageMeter titulo="Archivos" uso={uso(10, null)} /></>);
  expect(screen.getByText('Supera el límite vigente.')).toBeTruthy();
  expect(screen.getByText('10 / Sin límite')).toBeTruthy();
  expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(100);
});

test('reintenta errores de consumo e informa cuenta sin viajes', async () => {
  getAccountUsage.mockRejectedValueOnce(new Error('Sin conexión'));
  getAccountUsage.mockResolvedValueOnce({ ...datos, items: [], totalPaginas: 0 });
  await render(<AccountUsage />);
  expect(await screen.findByText('Sin conexión')).toBeTruthy();
  await fireEvent.press(screen.getByText('Reintentar consumo'));
  expect(await screen.findByText('Todavía no tenés viajes activos ni borradores para mostrar.')).toBeTruthy();
});
