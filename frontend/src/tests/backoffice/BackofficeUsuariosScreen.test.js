import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import BackofficeUsuariosScreen, {
  FILTROS_USUARIOS_INICIALES,
} from '../../screens/backoffice/BackofficeUsuariosScreen';
import { listarUsuarios } from '../../services/backofficeApi';

jest.mock('../../services/backofficeApi', () => ({
  listarUsuarios: jest.fn(),
}));

const PLACEHOLDER_BUSQUEDA = 'Buscar por nombre, usuario o correo electrónico';

function usuario(id, cambios = {}) {
  return {
    id,
    nombreCompleto: `Usuario ${id}`,
    nombreUsuario: `usuario${id}`,
    email: `usuario${id}@cyanea.test`,
    plan: 'gratuito',
    estado: 'activa',
    fechaRegistro: '2026-03-15T12:00:00Z',
    ...cambios,
  };
}

function pagina(items, extra = {}) {
  return {
    items,
    total: items.length,
    pagina: 1,
    tamanioPagina: 20,
    totalPaginas: items.length ? 1 : 0,
    ...extra,
  };
}

function Pantalla({ onVerUsuario = () => {}, onVolver = () => {} }) {
  const [filtros, setFiltros] = useState(FILTROS_USUARIOS_INICIALES);
  return (
    <BackofficeUsuariosScreen
      filtros={filtros}
      onCambiarFiltros={setFiltros}
      onVerUsuario={onVerUsuario}
      onVolver={onVolver}
    />
  );
}

async function avanzar(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function renderizar(props = {}) {
  await render(<Pantalla {...props} />);
  await avanzar();
}

async function presionar(texto) {
  await fireEvent.press(screen.getByText(texto));
  await avanzar();
}

beforeEach(() => {
  jest.useFakeTimers();
  listarUsuarios.mockReset();
  listarUsuarios.mockResolvedValue(pagina([usuario(1), usuario(2)]));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('BackofficeUsuariosScreen', () => {
  test('carga el listado con los filtros iniciales', async () => {
    await renderizar();

    expect(listarUsuarios).toHaveBeenCalledWith(FILTROS_USUARIOS_INICIALES);
    expect(screen.getByText('2 usuarios')).toBeTruthy();
  });

  test('muestra los datos de cada usuario', async () => {
    await renderizar();

    expect(screen.getByText('Usuario 1')).toBeTruthy();
    expect(screen.getByText('@usuario1')).toBeTruthy();
    expect(screen.getByText('usuario1@cyanea.test')).toBeTruthy();
    expect(screen.getAllByText('Gratuito · Registro 15/03/2026')).toHaveLength(2);
  });

  test('usa el singular cuando hay un solo usuario', async () => {
    listarUsuarios.mockResolvedValue(pagina([usuario(1)]));

    await renderizar();

    expect(screen.getByText('1 usuario')).toBeTruthy();
  });

  test('la búsqueda espera a que se termine de escribir', async () => {
    await renderizar();

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER_BUSQUEDA), '  lucia ');
    await avanzar(300);
    expect(listarUsuarios).toHaveBeenCalledTimes(1);

    await avanzar(100);
    expect(listarUsuarios).toHaveBeenCalledTimes(2);
    expect(listarUsuarios).toHaveBeenLastCalledWith({ ...FILTROS_USUARIOS_INICIALES, q: 'lucia' });
  });

  test('filtra por estado', async () => {
    await renderizar();
    await presionar('Suspendida');

    expect(listarUsuarios).toHaveBeenLastCalledWith({
      ...FILTROS_USUARIOS_INICIALES,
      estado: 'suspendida',
    });
  });

  test('filtra por plan', async () => {
    await renderizar();
    await presionar('Pro');

    expect(listarUsuarios).toHaveBeenLastCalledWith({ ...FILTROS_USUARIOS_INICIALES, plan: 'pro' });
  });

  test('filtra por método de registro', async () => {
    await renderizar();
    await presionar('Google');

    expect(listarUsuarios).toHaveBeenLastCalledWith({
      ...FILTROS_USUARIOS_INICIALES,
      metodoRegistro: 'google',
    });
  });

  test('limpiar filtros vuelve a los filtros iniciales', async () => {
    await renderizar();
    await presionar('Suspendida');
    await presionar('Limpiar filtros');

    expect(listarUsuarios).toHaveBeenLastCalledWith(FILTROS_USUARIOS_INICIALES);
    expect(screen.queryByText('Limpiar filtros')).toBeNull();
  });

  test('muestra el estado vacío sin opción de limpiar si no hay filtros', async () => {
    listarUsuarios.mockResolvedValue(pagina([]));

    await renderizar();

    expect(screen.getByText('No encontramos usuarios que coincidan con tu búsqueda')).toBeTruthy();
    expect(screen.queryByText('Limpiar filtros')).toBeNull();
  });

  test('el estado vacío ofrece limpiar los filtros aplicados', async () => {
    listarUsuarios
      .mockResolvedValueOnce(pagina([usuario(1)]))
      .mockResolvedValue(pagina([]));

    await renderizar();
    await presionar('Suspendida');

    expect(screen.getByText('No encontramos usuarios que coincidan con tu búsqueda')).toBeTruthy();
    expect(screen.getAllByText('Limpiar filtros')).toHaveLength(2);
  });

  test('si falla la carga permite reintentar', async () => {
    listarUsuarios.mockRejectedValueOnce(new Error('No se pudo conectar con el servidor.'));

    await renderizar();

    expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy();

    await presionar('Reintentar');

    expect(listarUsuarios).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Usuario 1')).toBeTruthy();
  });

  test('al tocar un usuario abre su detalle', async () => {
    const onVerUsuario = jest.fn();
    await renderizar({ onVerUsuario });

    await fireEvent.press(screen.getByText('Usuario 1'));

    expect(onVerUsuario).toHaveBeenCalledWith(1);
  });

  test('pagina los resultados', async () => {
    listarUsuarios.mockResolvedValue(
      pagina([usuario(1), usuario(2)], { total: 25, totalPaginas: 2 })
    );

    await renderizar();

    expect(screen.getByText('25 usuarios')).toBeTruthy();
    expect(screen.getByText('Página 1 de 2')).toBeTruthy();

    await presionar('Anterior');
    expect(listarUsuarios).toHaveBeenCalledTimes(1);

    await presionar('Siguiente');
    expect(listarUsuarios).toHaveBeenLastCalledWith({ ...FILTROS_USUARIOS_INICIALES, pagina: 2 });
  });

  test('no muestra paginación con una sola página', async () => {
    await renderizar();

    expect(screen.queryByText('Siguiente')).toBeNull();
  });

  test('volver lleva al inicio', async () => {
    const onVolver = jest.fn();
    await renderizar({ onVolver });

    await fireEvent.press(screen.getByText('Volver al inicio'));

    expect(onVolver).toHaveBeenCalledTimes(1);
  });
});