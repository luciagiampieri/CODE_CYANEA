import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { validarCategoria } from '../../components/backoffice/FormularioCategoria';
import BackofficeCategoriasScreen, { textoUsos } from '../../screens/backoffice/BackofficeCategoriasScreen';
import {
  actualizarCategoria,
  cambiarEstadoCategoria,
  crearCategoria,
  eliminarCategoria,
  listarCategorias,
} from '../../services/backofficeApi';
import { simularDialogos } from '../helpers/dialogosSimulados';

jest.mock('../../services/backofficeApi', () => ({
  actualizarCategoria: jest.fn(),
  cambiarEstadoCategoria: jest.fn(),
  crearCategoria: jest.fn(),
  eliminarCategoria: jest.fn(),
  listarCategorias: jest.fn(),
}));

function categoria(tipo, id, nombre, cambios = {}) {
  return { id, tipo, nombre, icono: 'tags', activa: true, esSistema: false, cantidadUsos: 0, ...cambios };
}

const LISTADO = {
  gastos: [
    categoria('gastos', 1, 'Comida y Bebida', { icono: 'utensils', cantidadUsos: 4 }),
    categoria('gastos', 2, 'Transporte', { icono: 'car' }),
    categoria('gastos', 3, 'Souvenirs', { activa: false, cantidadUsos: 1 }),
  ],
  documentos: [
    categoria('documentos', 10, 'Vuelos', { icono: 'plane' }),
    categoria('documentos', 11, 'Comprobantes', { icono: 'receipt', esSistema: true, cantidadUsos: 2 }),
  ],
  checklist: [categoria('checklist', 20, 'Documentación', { icono: 'passport', cantidadUsos: 1 })],
};

async function renderizar() {
  await render(<BackofficeCategoriasScreen onVolver={jest.fn()} />);
  await screen.findByText('Comida y Bebida');
}

async function abrirNueva() {
  await fireEvent.press(screen.getByTestId('categorias-nueva'));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  listarCategorias.mockResolvedValue(LISTADO);
});

describe('listado (CA 2)', () => {
  test('agrupa las categorías por tipo con su estado y uso', async () => {
    await renderizar();

    expect(screen.getByTestId('categorias-seccion-gastos')).toBeTruthy();
    expect(screen.getByTestId('categorias-seccion-documentos')).toBeTruthy();
    expect(screen.getByTestId('categorias-seccion-checklist')).toBeTruthy();
    expect(screen.getByText('Tareas del checklist')).toBeTruthy();
    expect(screen.getByText('3 categorías · 2 activas')).toBeTruthy();
    expect(screen.getByText('En uso en 4 gastos')).toBeTruthy();
    expect(screen.getByText('Inactiva')).toBeTruthy();
    expect(screen.getByText('Sistema')).toBeTruthy();
  });

  test('si falla la carga permite reintentar', async () => {
    listarCategorias.mockRejectedValueOnce(new Error('Sin conexión'));
    await render(<BackofficeCategoriasScreen onVolver={jest.fn()} />);

    expect(await screen.findByText('Sin conexión')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(await screen.findByText('Comida y Bebida')).toBeTruthy();
  });

  test('textoUsos usa singular y plural según el tipo', () => {
    expect(textoUsos(0, 'gastos')).toBe('Sin uso');
    expect(textoUsos(1, 'documentos')).toBe('En uso en 1 documento');
    expect(textoUsos(3, 'checklist')).toBe('En uso en 3 tareas');
  });
});

describe('crear (CA 3 y 4)', () => {
  test('CP1: crea una categoría de gastos con nombre e ícono', async () => {
    crearCategoria.mockResolvedValue(categoria('gastos', 4, 'Propinas'));
    await renderizar();
    await abrirNueva();

    await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), '  Propinas ');
    await fireEvent.press(screen.getByTestId('categoria-icono-hand-holding-dollar'));
    await fireEvent.press(screen.getByTestId('categoria-guardar'));

    await waitFor(() =>
      expect(crearCategoria).toHaveBeenCalledWith({
        tipo: 'gastos',
        nombre: 'Propinas',
        icono: 'hand-holding-dollar',
      })
    );
    await waitFor(() => expect(listarCategorias).toHaveBeenCalledTimes(2));
  });

  test('CP2: no permite un nombre existente del mismo tipo sin distinguir mayúsculas ni acentos', async () => {
    await renderizar();
    await abrirNueva();

    await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'TRANSPÓRTE');
    await fireEvent.press(screen.getByTestId('categoria-guardar'));

    expect(screen.getByText('Ya existe una categoría de gastos llamada "Transporte".')).toBeTruthy();
    expect(crearCategoria).not.toHaveBeenCalled();
  });

  test('CP3: permite el mismo nombre en otro tipo', async () => {
    crearCategoria.mockResolvedValue(categoria('documentos', 12, 'Transporte'));
    await renderizar();
    await abrirNueva();

    await fireEvent.press(screen.getByTestId('categoria-tipo-documentos'));
    await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'Transporte');
    await fireEvent.press(screen.getByTestId('categoria-guardar'));

    await waitFor(() =>
      expect(crearCategoria).toHaveBeenCalledWith({ tipo: 'documentos', nombre: 'Transporte', icono: 'tags' })
    );
  });

  test('exige el nombre', async () => {
    await renderizar();
    await abrirNueva();
    await fireEvent.press(screen.getByTestId('categoria-guardar'));

    expect(screen.getByText('Ingresá el nombre de la categoría.')).toBeTruthy();
    expect(crearCategoria).not.toHaveBeenCalled();
  });

  test('muestra el duplicado informado por el backend junto al nombre', async () => {
    const error = Object.assign(new Error('Ya existe una categoría de gastos llamada "Propina".'), {
      codigo: 'CATEGORY_NAME_DUPLICATED',
    });
    crearCategoria.mockRejectedValue(error);
    await renderizar();
    await abrirNueva();

    await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'Propina');
    await fireEvent.press(screen.getByTestId('categoria-guardar'));

    expect(await screen.findByText('Ya existe una categoría de gastos llamada "Propina".')).toBeTruthy();
  });
});

describe('editar (CA 5)', () => {
  test('precarga el nombre y el ícono y guarda los cambios', async () => {
    actualizarCategoria.mockResolvedValue({});
    await renderizar();

    await fireEvent.press(screen.getByTestId('categoria-editar-gastos-2'));
    expect(screen.getByText('Editar categoría')).toBeTruthy();
    expect(screen.getByLabelText('Nombre de la categoría').props.value).toBe('Transporte');

    await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'Movilidad');
    await fireEvent.press(screen.getByTestId('categoria-icono-bus'));
    await fireEvent.press(screen.getByTestId('categoria-guardar'));

    await waitFor(() =>
      expect(actualizarCategoria).toHaveBeenCalledWith('gastos', 2, { nombre: 'Movilidad', icono: 'bus' })
    );
  });

  test('permite conservar el propio nombre cambiando mayúsculas', async () => {
    actualizarCategoria.mockResolvedValue({});
    await renderizar();

    await fireEvent.press(screen.getByTestId('categoria-editar-gastos-2'));
    await fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'TRANSPORTE');
    await fireEvent.press(screen.getByTestId('categoria-guardar'));

    await waitFor(() => expect(actualizarCategoria).toHaveBeenCalled());
  });
});

describe('desactivar y eliminar (CA 6 a 9)', () => {
  test('CP4: una categoría en uso no se elimina y se ofrece desactivarla', async () => {
    const { confirmaciones } = simularDialogos({ confirma: true });
    cambiarEstadoCategoria.mockResolvedValue({});
    await renderizar();

    await fireEvent.press(screen.getByTestId('categoria-eliminar-gastos-1'));

    await waitFor(() => expect(cambiarEstadoCategoria).toHaveBeenCalledWith('gastos', 1, false));
    expect(eliminarCategoria).not.toHaveBeenCalled();
    expect(confirmaciones.mock.calls[0][0]).toContain('En uso en 4 gastos'.toLowerCase());
  });

  test('CP5: desactivar una categoría en uso pide confirmación', async () => {
    const { confirmaciones } = simularDialogos({ confirma: true });
    cambiarEstadoCategoria.mockResolvedValue({});
    await renderizar();

    await fireEvent.press(screen.getByTestId('categoria-estado-gastos-1'));

    await waitFor(() => expect(cambiarEstadoCategoria).toHaveBeenCalledWith('gastos', 1, false));
    expect(confirmaciones.mock.calls[0][0]).toContain('Los que ya la usan la conservan');
  });

  test('cancelar la desactivación no llama al backend', async () => {
    simularDialogos({ confirma: false });
    await renderizar();

    await fireEvent.press(screen.getByTestId('categoria-estado-gastos-1'));

    expect(cambiarEstadoCategoria).not.toHaveBeenCalled();
  });

  test('reactivar una categoría no pide confirmación', async () => {
    cambiarEstadoCategoria.mockResolvedValue({});
    await renderizar();

    await fireEvent.press(screen.getByTestId('categoria-estado-gastos-3'));

    await waitFor(() => expect(cambiarEstadoCategoria).toHaveBeenCalledWith('gastos', 3, true));
  });

  test('CP6: "Comprobantes" no se puede desactivar ni eliminar', async () => {
    await renderizar();

    expect(screen.getByTestId('categoria-estado-documentos-11').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('categoria-eliminar-documentos-11').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/La usa el sistema/)).toBeTruthy();
  });

  test('CP7: la última categoría activa de un tipo no se puede desactivar', async () => {
    await renderizar();

    expect(screen.getByTestId('categoria-estado-checklist-20').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('categoria-eliminar-checklist-20').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/Única categoría activa del tipo/)).toBeTruthy();
  });

  test('elimina una categoría sin uso tras confirmar', async () => {
    simularDialogos({ confirma: true });
    eliminarCategoria.mockResolvedValue(null);
    await renderizar();

    await fireEvent.press(screen.getByTestId('categoria-eliminar-gastos-2'));

    await waitFor(() => expect(eliminarCategoria).toHaveBeenCalledWith('gastos', 2));
  });

  test('informa el error del backend', async () => {
    const { avisos } = simularDialogos({ confirma: true });
    eliminarCategoria.mockRejectedValue(new Error('Debe quedar al menos una categoría activa de gastos.'));
    await renderizar();

    await fireEvent.press(screen.getByTestId('categoria-eliminar-gastos-2'));

    await waitFor(() =>
      expect(avisos).toHaveBeenCalledWith(
        'No se pudo completar la acción\n\nDebe quedar al menos una categoría activa de gastos.'
      )
    );
  });
});

describe('validarCategoria', () => {
  const existentes = [{ id: 1, nombre: 'Documentación' }];

  test('normaliza los espacios del nombre', () => {
    expect(validarCategoria({ nombre: '  Mis   cosas ', icono: 'tags', tipo: 'checklist' }, existentes)).toEqual({
      nombre: 'Mis cosas',
      errores: {},
    });
  });

  test('detecta duplicados sin acentos y excluye la categoría editada', () => {
    expect(
      validarCategoria({ nombre: 'documentacion', icono: 'tags', tipo: 'checklist' }, existentes).errores.nombre
    ).toBe('Ya existe una categoría de tareas del checklist llamada "Documentación".');
    expect(
      validarCategoria({ nombre: 'documentacion', icono: 'tags', tipo: 'checklist', idActual: 1 }, existentes)
        .errores
    ).toEqual({});
  });

  test('limita el largo y exige ícono', () => {
    const { errores } = validarCategoria({ nombre: 'x'.repeat(51), icono: '', tipo: 'gastos' });
    expect(errores.nombre).toBe('El nombre puede tener hasta 50 caracteres.');
    expect(errores.icono).toBe('Elegí un ícono.');
  });
});
