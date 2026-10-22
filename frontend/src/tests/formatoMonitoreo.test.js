import {
  formatearDuracion,
  formatearPorcentaje,
  formatearUSD,
  parsearUmbral,
  tasaDeFallas,
} from '../utils/formatoMonitoreo';

describe('formatearUSD', () => {
  test('usa dos decimales desde 1 USD y cuatro debajo', () => {
    expect(formatearUSD(1234.5)).toBe('USD 1.234,50');
    expect(formatearUSD(0.000925)).toBe('USD 0,0009');
    expect(formatearUSD(0)).toBe('USD 0,00');
    expect(formatearUSD(null)).toBe('—');
  });
});

describe('formatearDuracion', () => {
  test('muestra milisegundos o segundos', () => {
    expect(formatearDuracion(850)).toBe('850 ms');
    expect(formatearDuracion(2400)).toBe('2,4 s');
    expect(formatearDuracion(null)).toBe('—');
  });
});

describe('formatearPorcentaje y tasaDeFallas', () => {
  test('redondea a un decimal', () => {
    expect(formatearPorcentaje(85)).toBe('85%');
    expect(formatearPorcentaje(83.33)).toBe('83,3%');
    expect(tasaDeFallas(1, 3)).toBe(33.3);
    expect(tasaDeFallas(0, 0)).toBeNull();
  });
});

describe('parsearUmbral', () => {
  test.each([
    ['50', 50],
    ['150,5', 150.5],
    ['150.50', 150.5],
    ['1.200', 1200],
    ['1.200,75', 1200.75],
  ])('acepta "%s"', (texto, valor) => {
    expect(parsearUmbral(texto)).toEqual({ valor, error: '' });
  });

  test.each(['', '0', '-5', 'abc', '10,123'])('rechaza "%s"', (texto) => {
    expect(parsearUmbral(texto).valor).toBeNull();
    expect(parsearUmbral(texto).error).not.toBe('');
  });
});
