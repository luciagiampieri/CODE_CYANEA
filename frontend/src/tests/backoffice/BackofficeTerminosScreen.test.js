import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { validarTermino } from '../../components/backoffice/FormularioTermino';
import BackofficeTerminosScreen, {
  contenidoAParrafos,
} from '../../screens/backoffice/BackofficeTerminosScreen';
import {
  crearTermino,
  eliminarTermino,
  listarTerminos,
  obtenerTermino,
  publicarTermino,
} from '../../services/backofficeApi';
import { simularDialogos } from '../helpers/dialogosSimulados';

jest.mock('../../services/backofficeApi', () => ({
  actualizarTermino: jest.fn(),
  crearTermino: jest.fn(),
  eliminarTermino: jest.fn(),
  listarTerminos: jest.fn(),
  obtenerTermino: jest.fn(),
  publicarTermino: jest.fn(),
}));

jest.mock('../../components/legal/TermsModal', () => ({
  __esModule: true,
  default: ({ visible, previewTerms }) => {
    const { Text } = require('react-native');
    return visible && previewTerms
      ? require('react').createElement(Text, null, `Preview ${previewTerms.titulo}`)
      : null;
  },
}));

const LISTADO = {
  versionVigente: '2026-10-03',
  usuariosAceptaronVigente: 12,
  versiones: [
    {
      id: 1,
      numero: '2026-10-03',
      titulo: 'Términos vigentes',
      estado: 'vigente',
      fechaCreacion: '2026-10-03T12:00:00Z',
      fechaPublicacion: '2026-10-03T12:00:00Z',
    },
    {
      id: 2,
      numero: '2027-01-01',
      titulo: 'Borrador nuevo',
      estado: 'borrador',
      fechaCreacion: '2026-12-01T12:00:00Z',
      fechaPublicacion: null,
    },
    {
      id: 3,
      numero: '2025-01-01',
      titulo: 'Versión vieja',
      estado: 'historica',
      fechaCreacion: '2025-01-01T12:00:00Z',
      fechaPublicacion: '2025-01-01T12:00:00Z',
    },
  ],
};

async function renderizar() {
  await render(<BackofficeTerminosScreen onVolver={jest.fn()} />);
  await screen.findByText('Borrador nuevo');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  listarTerminos.mockResolvedValue(LISTADO);
});

describe('listado (CA 2 y 9)', () => {
  test('muestra número, título, estado y fecha de publicación', async () => {
    await renderizar();

    expect(screen.getByText('Términos vigentes')).toBeTruthy();
    expect(screen.getByText('Vigente')).toBeTruthy();
    expect(screen.getByText('Borrador')).toBeTruthy();
    expect(screen.getByText('Histórica')).toBeTruthy();
    expect(screen.getByText('Sin publicar')).toBeTruthy();
    expect(screen.getByText('Publicada el 03/10/2026')).toBeTruthy();
  });

  test('muestra cuántos usuarios aceptaron la versión vigente', async () => {
    await renderizar();

    expect(screen.getByText('12 usuarios aceptaron la versión vigente')).toBeTruthy();
  });

  test('si falla la carga permite reintentar', async () => {
    listarTerminos.mockRejectedValueOnce(new Error('Sin conexión'));
    await render(<BackofficeTerminosScreen onVolver={jest.fn()} />);

    expect(await screen.findByText('Sin conexión')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(await screen.findByText('Borrador nuevo')).toBeTruthy();
  });
});

describe('acciones según el estado (CA 4 y 8)', () => {
  test('solo un borrador se puede editar, eliminar o publicar', async () => {
    await renderizar();

    expect(screen.getByTestId('termino-editar-2')).toBeTruthy();
    expect(screen.getByTestId('termino-eliminar-2')).toBeTruthy();
    expect(screen.getByTestId('termino-publicar-2')).toBeTruthy();

    for (const id of [1, 3]) {
      expect(screen.queryByTestId(`termino-editar-${id}`)).toBeNull();
      expect(screen.queryByTestId(`termino-eliminar-${id}`)).toBeNull();
      expect(screen.queryByTestId(`termino-publicar-${id}`)).toBeNull();
      expect(screen.getByTestId(`termino-previsualizar-${id}`)).toBeTruthy();
    }
  });
});

describe('crear (CA 3)', () => {
  test('crea una versión en borrador con los datos ingresados', async () => {
    crearTermino.mockResolvedValue({ id: 4 });
    await renderizar();

    await fireEvent.press(screen.getByTestId('termino-nueva'));
    await fireEvent.changeText(screen.getByLabelText('Número de versión'), ' 2027-02-01 ');
    await fireEvent.changeText(screen.getByLabelText('Título'), 'Nuevos términos');
    await fireEvent.changeText(screen.getByLabelText('Contenido'), '1. Objeto\nTexto');
    await fireEvent.press(screen.getByTestId('termino-guardar'));

    await waitFor(() =>
      expect(crearTermino).toHaveBeenCalledWith({
        numero: '2027-02-01',
        titulo: 'Nuevos términos',
        contenido: '1. Objeto\nTexto',
      })
    );
    await waitFor(() => expect(listarTerminos).toHaveBeenCalledTimes(2));
  });

  test('exige número, título y contenido', async () => {
    await renderizar();

    await fireEvent.press(screen.getByTestId('termino-nueva'));
    await fireEvent.press(screen.getByTestId('termino-guardar'));

    expect(screen.getByText('Ingresá el número de versión.')).toBeTruthy();
    expect(screen.getByText('Ingresá el título.')).toBeTruthy();
    expect(screen.getByText('Ingresá el contenido.')).toBeTruthy();
    expect(crearTermino).not.toHaveBeenCalled();
  });

  test('muestra junto al número el duplicado informado por el backend', async () => {
    const error = Object.assign(new Error('Ya existe una versión con el número "2027-01-01".'), {
      codigo: 'TERMS_VERSION_NUMBER_DUPLICATED',
    });
    crearTermino.mockRejectedValue(error);
    await renderizar();

    await fireEvent.press(screen.getByTestId('termino-nueva'));
    await fireEvent.changeText(screen.getByLabelText('Número de versión'), '2027-01-01');
    await fireEvent.changeText(screen.getByLabelText('Título'), 'T');
    await fireEvent.changeText(screen.getByLabelText('Contenido'), 'C');
    await fireEvent.press(screen.getByTestId('termino-guardar'));

    expect(await screen.findByText('Ya existe una versión con el número "2027-01-01".')).toBeTruthy();
  });
});

describe('previsualizar (CA 5)', () => {
  test('abre la versión como la verán los usuarios', async () => {
    obtenerTermino.mockResolvedValue({
      id: 2,
      numero: '2027-01-01',
      titulo: 'Borrador nuevo',
      contenido: '1. A\nTexto\n\n2. B\nOtro',
    });
    await renderizar();

    await fireEvent.press(screen.getByTestId('termino-previsualizar-2'));

    expect(await screen.findByText('Preview Borrador nuevo')).toBeTruthy();
    expect(obtenerTermino).toHaveBeenCalledWith(2);
  });
});

describe('publicar (CA 6)', () => {
  test('pide confirmación advirtiendo que todos deberán aceptar y publica', async () => {
    const { confirmaciones } = simularDialogos({ confirma: true });
    publicarTermino.mockResolvedValue({});
    await renderizar();

    await fireEvent.press(screen.getByTestId('termino-publicar-2'));

    await waitFor(() => expect(publicarTermino).toHaveBeenCalledWith(2));
    expect(String(confirmaciones.mock.calls[0][0])).toContain('deberán aceptar');
    await waitFor(() => expect(listarTerminos).toHaveBeenCalledTimes(2));
  });

  test('si se cancela la confirmación no publica', async () => {
    simularDialogos({ confirma: false });
    await renderizar();

    await fireEvent.press(screen.getByTestId('termino-publicar-2'));

    expect(publicarTermino).not.toHaveBeenCalled();
  });
});

describe('eliminar (CA 4)', () => {
  test('elimina un borrador tras confirmar', async () => {
    simularDialogos({ confirma: true });
    eliminarTermino.mockResolvedValue(null);
    await renderizar();

    await fireEvent.press(screen.getByTestId('termino-eliminar-2'));

    await waitFor(() => expect(eliminarTermino).toHaveBeenCalledWith(2));
  });
});

describe('utilidades', () => {
  test('contenidoAParrafos separa las secciones por líneas en blanco', () => {
    expect(contenidoAParrafos('1. A\nTexto\n\n\n2. B\nOtro\n')).toEqual(['1. A\nTexto', '2. B\nOtro']);
    expect(contenidoAParrafos('')).toEqual([]);
  });

  test('validarTermino normaliza y valida los campos', () => {
    expect(validarTermino({ numero: ' 1 ', titulo: '  Mi   título ', contenido: ' texto ' })).toEqual({
      valores: { numero: '1', titulo: 'Mi título', contenido: 'texto' },
      errores: {},
    });
    expect(validarTermino({ numero: '', titulo: ' ', contenido: '' }).errores).toEqual({
      numero: 'Ingresá el número de versión.',
      titulo: 'Ingresá el título.',
      contenido: 'Ingresá el contenido.',
    });
  });
});