import { render, screen } from '@testing-library/react-native';

import {
  ETIQUETAS_ESTADO,
  EstadoCuentaBadge,
  formatearFecha,
  obtenerIniciales,
} from '../../components/backoffice/UsuarioPresentacion';

describe('formatearFecha', () => {
  test('formatea con día, mes y año', () => {
    expect(formatearFecha('2026-03-15T12:00:00Z')).toBe('15/03/2026');
  });

  test.each([null, undefined, '', 'no-es-una-fecha'])('devuelve un guion para %p', (valor) => {
    expect(formatearFecha(valor)).toBe('—');
  });
});

describe('obtenerIniciales', () => {
  test.each([
    ['Lucía Giampieri', 'LG'],
    ['ana', 'A'],
    ['Ana María López', 'AM'],
    ['  pedro   gomez ', 'PG'],
    ['', ''],
    [null, ''],
  ])('las iniciales de %p son %p', (nombre, esperado) => {
    expect(obtenerIniciales(nombre)).toBe(esperado);
  });
});

describe('EstadoCuentaBadge', () => {
  test.each(Object.entries(ETIQUETAS_ESTADO))(
    'muestra la etiqueta del estado %s',
    async (estado, etiqueta) => {
      await render(<EstadoCuentaBadge estado={estado} />);
      expect(screen.getByText(etiqueta)).toBeTruthy();
    }
  );

  test('un estado desconocido muestra su valor tal cual', async () => {
    await render(<EstadoCuentaBadge estado="bloqueada" />);
    expect(screen.getByText('bloqueada')).toBeTruthy();
  });
});