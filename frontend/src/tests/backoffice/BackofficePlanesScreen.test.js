import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import BackofficePlanesScreen from '../../screens/backoffice/BackofficePlanesScreen';
import { guardarPlanes, obtenerAuditoriaPlanes, obtenerPlanes } from '../../services/backofficeApi';
import { simularDialogos } from '../helpers/dialogosSimulados';

jest.mock('../../services/backofficeApi', () => ({
  guardarPlanes: jest.fn(), obtenerAuditoriaPlanes: jest.fn(), obtenerPlanes: jest.fn(),
}));

const DATOS = {
  precioMensualARS: '4900.00', precioAnualARS: '49000.00',
  gratuito: { maxViajesActivos: 5, maxParticipantesViaje: 3, maxSugerenciasDiarias: 10, maxEscaneosMensuales: 3, maxAlmacenamientoMb: 100 },
  pro: { maxViajesActivos: 15, maxParticipantesViaje: 10, maxSugerenciasDiarias: 20, maxEscaneosMensuales: 50, maxAlmacenamientoMb: 2048 },
};

beforeEach(() => {
  jest.restoreAllMocks(); jest.clearAllMocks();
  obtenerPlanes.mockResolvedValue(DATOS);
  obtenerAuditoriaPlanes.mockResolvedValue([]);
  guardarPlanes.mockImplementation(async (payload) => payload);
});

async function abrir() {
  await render(<BackofficePlanesScreen onVolver={jest.fn()} />);
  await screen.findByDisplayValue('4900.00');
}

test('CP1/CA7: confirma el cambio de precio antes de enviarlo', async () => {
  const dialogos = simularDialogos({ confirma: true });
  await abrir();
  await fireEvent.changeText(screen.getByLabelText('Precio mensual Pro (ARS)'), '5900,50');
  await fireEvent.press(screen.getByText('Guardar cambios'));
  await waitFor(() => expect(guardarPlanes).toHaveBeenCalledWith(expect.objectContaining({ precioMensualARS: '5900.50' })));
  expect(dialogos.confirmaciones).toHaveBeenCalledWith(expect.stringContaining('períodos en curso conservarán su precio'));
  expect(await screen.findByText('Los cambios se guardaron y quedaron registrados en la auditoría.')).toBeTruthy();
});

test('cancelar la confirmación no guarda', async () => {
  simularDialogos({ confirma: false });
  await abrir();
  await fireEvent.changeText(screen.getByLabelText('Precio mensual Pro (ARS)'), '5900');
  await fireEvent.press(screen.getByText('Guardar cambios'));
  expect(guardarPlanes).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('5900')).toBeTruthy();
});

test.each(['0', '-1', 'abc', '1.999'])('CP2: rechaza el precio %s sin pedir confirmación', async (precio) => {
  const dialogos = simularDialogos({ confirma: true });
  await abrir();
  await fireEvent.changeText(screen.getByLabelText('Precio mensual Pro (ARS)'), precio);
  await fireEvent.press(screen.getByText('Guardar cambios'));
  expect(screen.getByText(/ingresá un número mayor a cero/)).toBeTruthy();
  expect(dialogos.confirmaciones).not.toHaveBeenCalled();
  expect(guardarPlanes).not.toHaveBeenCalled();
});

test('CP4: impide guardar un límite Pro inferior al gratuito', async () => {
  await abrir();
  await fireEvent.changeText(screen.getByTestId('pro-maxSugerenciasDiarias'), '5');
  await fireEvent.press(screen.getByText('Guardar cambios'));
  expect(screen.getByText(/el límite de Pro debe ser mayor o igual/)).toBeTruthy();
  expect(guardarPlanes).not.toHaveBeenCalled();
});

test('CP6: muestra los valores anterior y nuevo de la auditoría', async () => {
  obtenerAuditoriaPlanes.mockResolvedValue([{ id: 1, idPlan: 2, campo: 'PrecioMensualARS', valorAnterior: '4900', valorNuevo: '5900', idAdministrador: 7, fechaHora: '2026-10-24T12:00:00Z' }]);
  await abrir();
  expect(screen.getByText(/ARS 4.900,00 → ARS 5.900,00/)).toBeTruthy();
  expect(screen.getByText(/Administrador #7/)).toBeTruthy();
});

test('un error al guardar conserva los datos editados para reintentar', async () => {
  simularDialogos({ confirma: true });
  guardarPlanes.mockRejectedValueOnce(new Error('Sin conexión'));
  await abrir();
  await fireEvent.changeText(screen.getByLabelText('Precio mensual Pro (ARS)'), '5900');
  await fireEvent.press(screen.getByText('Guardar cambios'));
  expect(await screen.findByText('Sin conexión')).toBeTruthy();
  expect(screen.getByDisplayValue('5900')).toBeTruthy();
});

test('si falla la carga permite reintentar', async () => {
  obtenerPlanes.mockRejectedValueOnce(new Error('No disponible'));
  await render(<BackofficePlanesScreen onVolver={jest.fn()} />);
  await screen.findByText('Reintentar');
  await fireEvent.press(screen.getByText('Reintentar'));
  expect(await screen.findByDisplayValue('4900.00')).toBeTruthy();
});
