import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import BackofficeSuscripcionesScreen from '../../screens/backoffice/BackofficeSuscripcionesScreen';
import { listarPagos, listarSuscripciones, obtenerSuscripcion, obtenerResumenFinanciero } from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({
  listarPagos: jest.fn(), listarSuscripciones: jest.fn(), obtenerSuscripcion: jest.fn(), obtenerResumenFinanciero: jest.fn(),
}));

const USUARIO = { id: 7, nombreCompleto: 'Luciano Correa', nombreUsuario: 'luciano', email: 'luciano@test.com' };
const SUSCRIPCION = {
  id: 12, usuario: USUARIO, plan: 'pro', tipoPlan: 'mensual', estado: 'activa',
  fechaInicio: '2026-10-01T03:00:00Z', fechaFin: '2026-11-01T03:00:00Z',
  fechaProximaRenovacion: '2026-11-01T03:00:00Z', precioPeriodoARS: '4900.00',
};
const PAGOS = [{ id: 1, idSuscripcion: 12, usuario: USUARIO, fecha: '2026-10-01T03:00:00Z', montoARS: '4900.00', estado: 'aprobado', idOperacionPasarela: 'op-prueba-1' }];
const pagina = (items, extra = {}) => ({ items, total: items.length, pagina: 1, tamanioPagina: 20, totalPaginas: items.length ? 1 : 0, ...extra });
const RESUMEN = {
  desde: '2026-10-01', hasta: '2026-10-24', anteriorDesde: '2026-09-07', anteriorHasta: '2026-09-30',
  ingresosARS: '4900', ingresosAnterioresARS: '4000', variacionPorcentaje: '22.50',
  pagosAprobados: 1, pagosPendientes: 2, pendientesARS: '9800', pagosRechazados: 1,
  tasaAprobacion: '25', suscripcionesActivasHoy: 8,
  periodos: [{ periodo: '2026-10', desde: '2026-10-01', hasta: '2026-10-24', ingresosARS: '4900',
    mensualARS: '4900', anualARS: '0', sinPeriodicidadARS: '0', aprobados: 1, pendientesARS: '9800', pendientes: 2, rechazados: 1 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  obtenerResumenFinanciero.mockResolvedValue(RESUMEN);
  listarSuscripciones.mockResolvedValue(pagina([SUSCRIPCION]));
  obtenerSuscripcion.mockResolvedValue(SUSCRIPCION);
  listarPagos.mockResolvedValue(pagina(PAGOS, { totalIngresosAprobadosARS: '4900.00' }));
});

async function abrir() {
  await render(<BackofficeSuscripcionesScreen onVolver={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Suscripciones' }));
  await screen.findByText('Luciano Correa');
}

async function pagosGlobales() {
  await abrir();
  await fireEvent.press(screen.getByRole('button', { name: 'Pagos' }));
  await screen.findByText('Operación: op-prueba-1');
}

test('CP1: muestra usuario, plan, estado y fechas de la suscripción', async () => {
  await abrir();
  expect(screen.getByText('Pro · Mensual')).toBeTruthy();
  expect(screen.getAllByText('Activa')).toHaveLength(2);
  expect(screen.getByText('Próxima renovación')).toBeTruthy();
  expect(screen.getByText(/luciano@test.com/)).toBeTruthy();
});

test('CP2: filtra pendientes de pago y reinicia la página', async () => {
  await abrir();
  await fireEvent.press(screen.getByRole('button', { name: 'Pendiente de pago' }));
  await waitFor(() => expect(listarSuscripciones).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'pendiente_pago', pagina: 1, soloUltima: true })));
});

test('CP3: abre el detalle y pide solo los pagos de la suscripción', async () => {
  await abrir();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver detalle y pagos · #12' }));
  await screen.findByText('Historial de pagos de la suscripción');
  expect(obtenerSuscripcion).toHaveBeenCalledWith(12);
  await waitFor(() => expect(listarPagos).toHaveBeenLastCalledWith(expect.objectContaining({ idSuscripcion: 12 })));
  expect(await screen.findByText('Operación: op-prueba-1')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Volver a suscripciones' }));
  expect(await screen.findByText('Suscripciones y pagos')).toBeTruthy();
});

test('CP4: combina estado rechazado y rango de fechas', async () => {
  await pagosGlobales();
  await fireEvent.press(screen.getByRole('button', { name: 'Rechazado' }));
  await fireEvent.changeText(screen.getByLabelText('Pagos desde'), '2026-10-01');
  await fireEvent.changeText(screen.getByLabelText('Pagos hasta'), '2026-10-24');
  await fireEvent.press(screen.getByRole('button', { name: 'Aplicar fechas' }));
  await waitFor(() => expect(listarPagos).toHaveBeenLastCalledWith({ estado: 'rechazado', desde: '2026-10-01', hasta: '2026-10-24', pagina: 1, idSuscripcion: null }));
});

test('CP5: muestra el total aprobado del filtro informado por el servidor', async () => {
  listarPagos.mockResolvedValue(pagina(PAGOS, { totalIngresosAprobadosARS: '9800.50', total: 21, totalPaginas: 2 }));
  await pagosGlobales();
  expect(screen.getByText('ARS 9.800,50')).toBeTruthy();
  expect(screen.getByText(/todas las páginas/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
  await waitFor(() => expect(listarPagos).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 })));
});

test('CA9: informa ausencia de suscripciones y pagos', async () => {
  listarSuscripciones.mockResolvedValue(pagina([]));
  listarPagos.mockResolvedValue(pagina([], { totalIngresosAprobadosARS: '0.00' }));
  await render(<BackofficeSuscripcionesScreen onVolver={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Suscripciones' }));
  expect(await screen.findByText('No se encontraron suscripciones para los filtros aplicados.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Pagos' }));
  expect(await screen.findByText('No se encontraron pagos para los filtros aplicados.')).toBeTruthy();
  expect(screen.getByText('ARS 0,00')).toBeTruthy();
});

test('rechaza un rango invertido sin consultar pagos nuevamente', async () => {
  await pagosGlobales();
  const cantidad = listarPagos.mock.calls.length;
  await fireEvent.changeText(screen.getByLabelText('Pagos desde'), '2026-10-24');
  await fireEvent.changeText(screen.getByLabelText('Pagos hasta'), '2026-10-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Aplicar fechas' }));
  expect(screen.getByText('La fecha hasta debe ser igual o posterior a desde.')).toBeTruthy();
  expect(listarPagos).toHaveBeenCalledTimes(cantidad);
});

test('conserva el filtro de suscripciones al volver del detalle', async () => {
  await abrir();
  await fireEvent.press(screen.getByRole('button', { name: 'Activa' }));
  await screen.findByText('Luciano Correa');
  await fireEvent.press(screen.getByRole('button', { name: 'Ver detalle y pagos · #12' }));
  await screen.findByText('Historial de pagos de la suscripción');
  await fireEvent.press(screen.getByRole('button', { name: 'Volver a suscripciones' }));
  expect(screen.getByRole('button', { name: 'Activa' }).props.accessibilityState.selected).toBe(true);
});

test('permite reintentar si falla la consulta de pagos', async () => {
  listarPagos.mockRejectedValueOnce(new Error('Sin conexión'));
  await abrir();
  await fireEvent.press(screen.getByRole('button', { name: 'Pagos' }));
  expect(await screen.findByText('Sin conexión')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Reintentar pagos' }));
  expect(await screen.findByText('Operación: op-prueba-1')).toBeTruthy();
});

test('abre en resumen ejecutivo y pasa el periodo al detalle de cobros', async () => {
  await render(<BackofficeSuscripcionesScreen onVolver={jest.fn()} />);
  expect(await screen.findByText('Evolución de ingresos')).toBeTruthy();
  expect(screen.getByText('+22,5 %')).toBeTruthy();
  expect(listarSuscripciones).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Ver pagos' }));
  await screen.findByText('Operación: op-prueba-1');
  expect(listarPagos).toHaveBeenLastCalledWith(expect.objectContaining({ desde: '2026-10-01', hasta: '2026-10-24' }));
});

test('busca usuarios y combina periodicidad e historial', async () => {
  await abrir();
  await fireEvent.changeText(screen.getByLabelText('Buscar suscripciones'), 'Luciano');
  await fireEvent.press(screen.getByRole('button', { name: 'Buscar' }));
  await waitFor(() => expect(listarSuscripciones).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Luciano', pagina: 1 })));
  await fireEvent.press(screen.getByRole('button', { name: 'Anual' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Historial completo' }));
  await waitFor(() => expect(listarSuscripciones).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Luciano', tipoPlan: 'anual', soloUltima: false, pagina: 1 })));
});

test('reintenta resumen y valida rango antes de consultar', async () => {
  obtenerResumenFinanciero.mockRejectedValueOnce(new Error('Resumen sin conexión'));
  await render(<BackofficeSuscripcionesScreen onVolver={jest.fn()} />);
  expect(await screen.findByText('Resumen sin conexión')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Reintentar resumen' }));
  await screen.findByText('Evolución de ingresos');
  const cantidad = obtenerResumenFinanciero.mock.calls.length;
  await fireEvent.changeText(screen.getByLabelText('Resumen desde'), '2026-11-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Actualizar resumen' }));
  expect(screen.getByText('La fecha hasta debe ser igual o posterior a desde.')).toBeTruthy();
  expect(obtenerResumenFinanciero).toHaveBeenCalledTimes(cantidad);
});
