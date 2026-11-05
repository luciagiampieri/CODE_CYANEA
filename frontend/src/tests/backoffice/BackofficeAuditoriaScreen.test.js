import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import BackofficeAuditoriaScreen from '../../screens/backoffice/BackofficeAuditoriaScreen';
import { listarAuditoria, obtenerEventoAuditoria, obtenerOpcionesAuditoria } from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({
  listarAuditoria: jest.fn(), obtenerEventoAuditoria: jest.fn(), obtenerOpcionesAuditoria: jest.fn(),
}));
const EVENTO = {
  id: 'plan:7', fechaHora: '2026-11-04T13:30:00Z', tipo: 'cambio_plan', resultado: 'exitoso',
  usuario: { id: 1, nombreCompleto: 'Ana Admin', email: 'ana@test.com', anonimizado: false },
  entidad: { tipo: 'plan', id: 2, nombre: 'Plan Pro' },
};
const PAGINA = { items: [EVENTO], total: 1, pagina: 1, totalPaginas: 1, tamanioPagina: 20, desde: '2026-10-29', hasta: '2026-11-04' };
const DETALLE = { ...EVENTO, descripcion: 'Cambio de planes y límites', cambios: [
  { campo: 'Solicitudes diarias de sugerencias por viaje', valorAnterior: '10', valorNuevo: '25' },
] };

beforeEach(() => {
  jest.clearAllMocks();
  listarAuditoria.mockResolvedValue(PAGINA);
  obtenerEventoAuditoria.mockResolvedValue(DETALLE);
  obtenerOpcionesAuditoria.mockResolvedValue({ tipos: [], administradores: [EVENTO.usuario] });
});

async function abrir() {
  await render(<BackofficeAuditoriaScreen onVolver={jest.fn()} />);
  await screen.findByText('Plan Pro · #2');
}

test('CA2/CA4: consulta el período predeterminado y muestra datos y resultado', async () => {
  await abrir();
  expect(listarAuditoria).toHaveBeenCalledWith(expect.objectContaining({ pagina: 1, desde: '', hasta: '' }));
  expect(screen.getByText(/2026-10-29 al 2026-11-04/)).toBeTruthy();
  expect(screen.getByText('Ana Admin')).toBeTruthy();
  expect(screen.getByText('Exitoso')).toBeTruthy();
  expect(screen.queryByText('Eliminar')).toBeNull();
});

test('CP2: filtra por suspensión y reinicia la página', async () => {
  await abrir();
  await fireEvent.press(screen.getByRole('button', { name: 'Suspensión de usuario' }));
  await waitFor(() => expect(listarAuditoria).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'suspension_usuario', pagina: 1 })));
});

test('CP3: aplica un rango válido y puede restaurar últimos siete días', async () => {
  await abrir();
  await fireEvent.changeText(screen.getByLabelText('Auditoría desde'), '2026-10-01');
  await fireEvent.changeText(screen.getByLabelText('Auditoría hasta'), '2026-10-31');
  await fireEvent.press(screen.getByText('Aplicar fechas'));
  await waitFor(() => expect(listarAuditoria).toHaveBeenLastCalledWith(expect.objectContaining({ desde: '2026-10-01', hasta: '2026-10-31', pagina: 1 })));
  await fireEvent.press(screen.getByText('Restablecer últimos 7 días'));
  await waitFor(() => expect(listarAuditoria).toHaveBeenLastCalledWith(expect.objectContaining({ desde: '', hasta: '', tipo: null })));
});

test('rechaza fechas invertidas antes de consultar', async () => {
  await abrir();
  await fireEvent.changeText(screen.getByLabelText('Auditoría desde'), '2026-11-05');
  await fireEvent.changeText(screen.getByLabelText('Auditoría hasta'), '2026-11-01');
  await fireEvent.press(screen.getByText('Aplicar fechas'));
  expect(screen.getByText(/La fecha hasta debe ser igual o posterior/)).toBeTruthy();
  expect(listarAuditoria).toHaveBeenCalledTimes(1);
});

test('CA4: selecciona administrador y conserva los demás filtros', async () => {
  await abrir();
  await fireEvent.press(screen.getByLabelText('Seleccionar administrador'));
  await fireEvent.changeText(screen.getByLabelText('Buscar administrador'), 'Ana');
  await fireEvent.press(screen.getByLabelText('Filtrar por administrador 1'));
  await waitFor(() => expect(listarAuditoria).toHaveBeenLastCalledWith(expect.objectContaining({ idAdministrador: 1, pagina: 1 })));
});

test('CP4: detalle con valores anteriores y nuevos y regreso conserva filtros', async () => {
  await abrir();
  await fireEvent.press(screen.getByRole('button', { name: 'Cambio de planes y límites' }));
  await screen.findByLabelText('Ver evento plan:7');
  await fireEvent.press(screen.getByLabelText('Ver evento plan:7'));
  expect(await screen.findByText('Solicitudes diarias de sugerencias por viaje')).toBeTruthy();
  expect(screen.getByText('10')).toBeTruthy();
  expect(screen.getByText('25')).toBeTruthy();
  expect(screen.getByText('Registro de solo lectura.')).toBeTruthy();
  expect(obtenerEventoAuditoria).toHaveBeenCalledWith('plan:7');
  await fireEvent.press(screen.getByText('Volver al registro'));
  expect(screen.getByLabelText('Ver evento plan:7')).toBeTruthy();
  expect(listarAuditoria).toHaveBeenLastCalledWith(expect.objectContaining({ tipo: 'cambio_plan' }));
});

test('CP5/CP9: resultado fallido y mensaje sin coincidencias', async () => {
  listarAuditoria.mockResolvedValueOnce({ ...PAGINA, items: [{ ...EVENTO, resultado: 'fallido' }] })
    .mockResolvedValue({ ...PAGINA, items: [], total: 0, totalPaginas: 0 });
  await abrir();
  expect(screen.getByText('Fallido')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Inicio de sesión en backoffice' }));
  expect(await screen.findByText('No se encontraron eventos de auditoría para los filtros aplicados.')).toBeTruthy();
});

test('CA5: pagina de veinte en veinte y deshabilita extremos', async () => {
  listarAuditoria.mockResolvedValueOnce({ ...PAGINA, total: 21, totalPaginas: 2 })
    .mockResolvedValue({ ...PAGINA, pagina: 2, total: 21, totalPaginas: 2 });
  await abrir();
  expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  await fireEvent.press(screen.getByText('Siguiente'));
  await waitFor(() => expect(listarAuditoria).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 })));
  expect(await screen.findByText('Página 2 de 2 · 21 resultados')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
});

test('error de listado permite reintentar sin mostrar datos viejos', async () => {
  listarAuditoria.mockRejectedValueOnce(new Error('Servidor no disponible'));
  await render(<BackofficeAuditoriaScreen onVolver={jest.fn()} />);
  await screen.findByText('Servidor no disponible');
  await fireEvent.press(screen.getByText('Reintentar consulta'));
  expect(await screen.findByText('Plan Pro · #2')).toBeTruthy();
});

test('error del detalle permite reintentar', async () => {
  obtenerEventoAuditoria.mockRejectedValueOnce(new Error('Detalle no disponible'));
  await abrir();
  await fireEvent.press(screen.getByLabelText('Ver evento plan:7'));
  await screen.findByText('Detalle no disponible');
  await fireEvent.press(screen.getByText('Reintentar detalle'));
  expect(await screen.findByText('Valor anterior')).toBeTruthy();
});

test('descarta respuestas anteriores cuando cambian filtros', async () => {
  let resolver;
  listarAuditoria.mockReturnValueOnce(new Promise((r) => { resolver = r; }))
    .mockResolvedValue({ ...PAGINA, items: [], total: 0 });
  await render(<BackofficeAuditoriaScreen onVolver={jest.fn()} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Suspensión de usuario' }));
  await screen.findByText('No se encontraron eventos de auditoría para los filtros aplicados.');
  await act(async () => resolver(PAGINA));
  expect(screen.queryByText('Plan Pro · #2')).toBeNull();
});
