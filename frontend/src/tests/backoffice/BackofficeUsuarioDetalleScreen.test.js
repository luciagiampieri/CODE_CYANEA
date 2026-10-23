import { fireEvent, render, screen } from '@testing-library/react-native';

import BackofficeUsuarioDetalleScreen from '../../screens/backoffice/BackofficeUsuarioDetalleScreen';
import { obtenerUsuario } from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({
  obtenerUsuario: jest.fn(),
  obtenerHistorialSuspensiones: jest.fn(() => Promise.resolve({ historial: [] })),
  suspenderUsuario: jest.fn(),
  reactivarUsuario: jest.fn()
}));

function detalle(cambios = {}) {
  return {
    id: 7,
    nombreCompleto: 'Lucía Giampieri',
    nombreUsuario: 'lucia_g',
    email: 'lucia@cyanea.test',
    plan: 'gratuito',
    estado: 'activa',
    fechaRegistro: '2026-03-15T12:00:00Z',
    nombre: 'Lucía',
    apellido: 'Giampieri',
    fotoUrl: null,
    metodoRegistro: 'google',
    emailConfirmado: true,
    fechaBaja: null,
    anonimizado: false,
    cantidadViajes: 3,
    estadoSuscripcion: null,
    ...cambios,
  };
}

async function renderizar({ idUsuario = 7, onVolver = jest.fn() } = {}) {
  const resultado = await render(
    <BackofficeUsuarioDetalleScreen idUsuario={idUsuario} onVolver={onVolver} />
  );
  return resultado;
}

beforeEach(() => {
  obtenerUsuario.mockReset();
  obtenerUsuario.mockResolvedValue(detalle());
});

describe('BackofficeUsuarioDetalleScreen', () => {
  test('pide el usuario por su id', async () => {
    await renderizar();
    await screen.findByText('Lucía Giampieri');

    expect(obtenerUsuario).toHaveBeenCalledWith(7);
  });

  test('mientras carga no muestra datos', async () => {
    obtenerUsuario.mockReturnValue(new Promise(() => {}));

    await renderizar();

    expect(screen.getByText('Volver a usuarios')).toBeTruthy();
    expect(screen.queryByText('Lucía Giampieri')).toBeNull();
  });

  test('muestra el encabezado del usuario', async () => {
    await renderizar();
    await screen.findByText('Lucía Giampieri');

    expect(screen.getByText('LG')).toBeTruthy();
    expect(screen.getAllByText('@lucia_g')).toHaveLength(2);
    expect(screen.getByText('Activa')).toBeTruthy();
  });

  test('muestra el resumen de la cuenta', async () => {
    await renderizar();
    await screen.findByText('Lucía Giampieri');

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Viajes en los que participa')).toBeTruthy();
    expect(screen.getByText('Gratuito')).toBeTruthy();
    expect(screen.getByText('Sin suscripción')).toBeTruthy();
  });

  test('muestra los datos de la cuenta', async () => {
    await renderizar();
    await screen.findByText('Lucía Giampieri');

    expect(screen.getByText('Lucía')).toBeTruthy();
    expect(screen.getByText('Giampieri')).toBeTruthy();
    expect(screen.getByText('lucia@cyanea.test')).toBeTruthy();
    expect(screen.getByText('Google')).toBeTruthy();
    expect(screen.getByText('Sí')).toBeTruthy();
    expect(screen.getByText('15/03/2026')).toBeTruthy();
  });

  test('muestra valores alternativos', async () => {
    obtenerUsuario.mockResolvedValue(
      detalle({ metodoRegistro: 'apple', emailConfirmado: false, estadoSuscripcion: 'activa' })
    );

    await renderizar();
    await screen.findByText('Lucía Giampieri');

    expect(screen.getByText('apple')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
    expect(screen.getByText('activa')).toBeTruthy();
  });

  test('los datos vacíos se muestran con un guion', async () => {
    obtenerUsuario.mockResolvedValue(detalle({ apellido: '' }));

    await renderizar();
    await screen.findByText('Lucía Giampieri');

    expect(screen.getByText('—')).toBeTruthy();
  });

  test('una cuenta dada de baja se muestra anonimizada', async () => {
    obtenerUsuario.mockResolvedValue(
      detalle({
        anonimizado: true,
        estado: 'inactiva',
        nombreCompleto: 'Usuario eliminado',
        nombre: 'Usuario',
        apellido: 'eliminado',
        nombreUsuario: 'eliminado_7',
        email: 'eliminado_7@anonimo',
        fechaBaja: '2026-10-01T12:00:00Z',
      })
    );

    await renderizar();
    await screen.findByText('Usuario eliminado');

    expect(screen.getByText(/dada de baja el 01\/10\/2026/)).toBeTruthy();
    expect(screen.getByText('Inactiva')).toBeTruthy();
    expect(screen.queryByText('UE')).toBeNull();
  });

  test('una cuenta activa no muestra el aviso de baja', async () => {
    await renderizar();
    await screen.findByText('Lucía Giampieri');

    expect(screen.queryByText(/dada de baja/)).toBeNull();
  });

  test('muestra el error si no se puede cargar', async () => {
    obtenerUsuario.mockRejectedValue(new Error('Usuario no encontrado.'));

    await renderizar();

    expect(await screen.findByText('Usuario no encontrado.')).toBeTruthy();
  });

  test('un error sin mensaje muestra uno genérico', async () => {
    obtenerUsuario.mockRejectedValue({});

    await renderizar();

    expect(await screen.findByText('No se pudo cargar el usuario.')).toBeTruthy();
  });

  test('al cambiar de usuario vuelve a cargar', async () => {
    const onVolver = jest.fn();
    const { rerender } = await renderizar({ onVolver });
    await screen.findByText('Lucía Giampieri');

    obtenerUsuario.mockResolvedValue(detalle({ id: 8, nombreCompleto: 'Pedro Gómez' }));
    await rerender(<BackofficeUsuarioDetalleScreen idUsuario={8} onVolver={onVolver} />);

    expect(await screen.findByText('Pedro Gómez')).toBeTruthy();
    expect(obtenerUsuario).toHaveBeenLastCalledWith(8);
  });

  test('volver lleva al listado', async () => {
    const onVolver = jest.fn();
    await renderizar({ onVolver });

    await fireEvent.press(screen.getByText('Volver a usuarios'));

    expect(onVolver).toHaveBeenCalledTimes(1);
  });
});