import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useInactividad } from '../../hooks/useInactividad';
import BackofficeApp from '../../navigation/BackofficeApp';
import {
  cerrarSesion,
  iniciarSesion,
  obtenerAdminActual,
  obtenerToken,
  registrarExpiracionSesion,
} from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({
  cerrarSesion: jest.fn(),
  iniciarSesion: jest.fn(),
  obtenerAdminActual: jest.fn(),
  obtenerToken: jest.fn(),
  registrarExpiracionSesion: jest.fn(),
}));

jest.mock('../../hooks/useInactividad', () => ({
  useInactividad: jest.fn(),
}));

jest.mock('../../screens/backoffice/BackofficeLoginScreen', () => ({
  __esModule: true,
  default: require('./pantallasFalsas').LoginFalso,
}));

jest.mock('../../screens/backoffice/BackofficeHomeScreen', () => ({
  __esModule: true,
  default: require('./pantallasFalsas').HomeFalso,
}));

jest.mock('../../screens/backoffice/BackofficeUsuariosScreen', () => ({
  __esModule: true,
  default: require('./pantallasFalsas').UsuariosFalso,
  FILTROS_USUARIOS_INICIALES: { q: '', estado: null, plan: null, metodoRegistro: null, pagina: 1 },
}));

jest.mock('../../screens/backoffice/BackofficeUsuarioDetalleScreen', () => ({
  __esModule: true,
  default: require('./pantallasFalsas').DetalleFalso,
}));

const ADMIN = { id: 1, nombreCompleto: 'Lucía Giampieri', email: 'lucia@cyanea.test' };
const INICIO = 'Inicio de Lucía Giampieri';
const LOGIN = 'Pantalla de login';

async function iniciarConSesion() {
  obtenerToken.mockReturnValue('token');
  obtenerAdminActual.mockResolvedValue(ADMIN);
  const resultado = await render(<BackofficeApp />);
  await screen.findByText(INICIO);
  return resultado;
}

async function presionar(texto) {
  await fireEvent.press(screen.getByText(texto));
}

beforeEach(() => {
  jest.clearAllMocks();
  obtenerToken.mockReturnValue(null);
  cerrarSesion.mockResolvedValue();
});

describe('BackofficeApp', () => {
  test('sin sesión guardada muestra el login', async () => {
    await render(<BackofficeApp />);

    expect(await screen.findByText(LOGIN)).toBeTruthy();
    expect(obtenerAdminActual).not.toHaveBeenCalled();
  });

  test('con una sesión guardada válida entra directo al inicio', async () => {
    await iniciarConSesion();

    expect(useInactividad).toHaveBeenLastCalledWith(true, expect.any(Function));
  });

  test('con una sesión guardada inválida muestra el login', async () => {
    obtenerToken.mockReturnValue('token-vencido');
    obtenerAdminActual.mockRejectedValue(new Error('La sesión no es válida o expiró.'));

    await render(<BackofficeApp />);

    expect(await screen.findByText(LOGIN)).toBeTruthy();
    expect(useInactividad).toHaveBeenLastCalledWith(false, expect.any(Function));
  });

  test('iniciar sesión lleva al inicio', async () => {
    iniciarSesion.mockResolvedValue(ADMIN);
    await render(<BackofficeApp />);
    await screen.findByText(LOGIN);

    await presionar('Ingresar');

    expect(await screen.findByText(INICIO)).toBeTruthy();
    expect(iniciarSesion).toHaveBeenCalledWith('admin@cyanea.test', 'Segura123!');
  });

  test('navega entre usuarios y detalle conservando los filtros', async () => {
    await iniciarConSesion();

    await presionar('Ir a usuarios');
    expect(screen.getByText('Usuarios q=')).toBeTruthy();

    await presionar('Filtrar');
    expect(screen.getByText('Usuarios q=lucia')).toBeTruthy();

    await presionar('Ver usuario 7');
    expect(screen.getByText('Detalle 7')).toBeTruthy();

    await presionar('Volver al listado');
    expect(screen.getByText('Usuarios q=lucia')).toBeTruthy();

    await presionar('Volver');
    expect(screen.getByText(INICIO)).toBeTruthy();
  });

  test('la marca del encabezado vuelve al inicio', async () => {
    await iniciarConSesion();
    await presionar('Ir a usuarios');

    await presionar('Cyanea');

    expect(screen.getByText(INICIO)).toBeTruthy();
  });

  test('salir cierra la sesión sin mostrar avisos', async () => {
    await iniciarConSesion();

    await presionar('Salir');

    expect(await screen.findByText(LOGIN)).toBeTruthy();
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sesión/)).toBeNull();
  });

  test('la inactividad cierra la sesión con un aviso', async () => {
    await iniciarConSesion();
    const manejarInactividad = useInactividad.mock.calls.at(-1)[1];

    await act(async () => {
      await manejarInactividad();
    });

    expect(screen.getByText(LOGIN)).toBeTruthy();
    expect(screen.getByText('Tu sesión se cerró por 30 minutos de inactividad.')).toBeTruthy();
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
  });

  test('una sesión expirada vuelve al login con un aviso', async () => {
    await iniciarConSesion();
    const alExpirar = registrarExpiracionSesion.mock.calls[0][0];

    await act(async () => {
      alExpirar();
    });

    expect(screen.getByText(LOGIN)).toBeTruthy();
    expect(screen.getByText('Tu sesión expiró. Iniciá sesión nuevamente.')).toBeTruthy();
  });

  test('al volver a ingresar los filtros arrancan de cero', async () => {
    iniciarSesion.mockResolvedValue(ADMIN);
    await iniciarConSesion();
    await presionar('Ir a usuarios');
    await presionar('Filtrar');

    await presionar('Salir');
    await screen.findByText(LOGIN);
    await presionar('Ingresar');
    await screen.findByText(INICIO);
    await presionar('Ir a usuarios');

    expect(screen.getByText('Usuarios q=')).toBeTruthy();
  });

  test('al desmontarse deja de escuchar la expiración de sesión', async () => {
    const { unmount } = await iniciarConSesion();

    await unmount();

    expect(registrarExpiracionSesion).toHaveBeenLastCalledWith(null);
  });
});