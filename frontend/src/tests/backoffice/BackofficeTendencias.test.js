import { escalaRedonda } from '../../utils/formatoMetricas';
import {
  describirTendencia,
  lineaTendencia,
  mesDestacado,
  regresionLineal,
  variacion,
} from '../../utils/tendencias';

describe('regresionLineal', () => {
  it('calcula la recta de una serie creciente', () => {
    expect(regresionLineal([1, 2, 3])).toEqual({ pendiente: 1, ordenada: 1 });
  });

  it('necesita al menos dos puntos', () => {
    expect(regresionLineal([5])).toBeNull();
    expect(regresionLineal([])).toBeNull();
  });
});

describe('lineaTendencia', () => {
  it('una serie constante tiene tendencia plana', () => {
    expect(lineaTendencia([2, 2, 2])).toEqual([2, 2, 2]);
  });
});

describe('variacion', () => {
  it('informa subas y bajas en porcentaje', () => {
    expect(variacion(120, 100)).toEqual({ porcentaje: 20, direccion: 'sube' });
    expect(variacion(80, 100)).toEqual({ porcentaje: -20, direccion: 'baja' });
  });

  it('sin base anterior no se puede calcular', () => {
    expect(variacion(5, 0)).toBeNull();
    expect(variacion(5, null)).toBeNull();
    expect(variacion(0, 0)).toEqual({ porcentaje: 0, direccion: 'igual' });
  });
});

describe('describirTendencia', () => {
  it('describe series en alza, en baja y estables', () => {
    expect(describirTendencia([1, 2, 3, 4], 'dia')).toMatch(/^En alza.*por día\)$/);
    expect(describirTendencia([4, 3, 2, 1], 'mes')).toMatch(/^En baja.*por mes\)$/);
    expect(describirTendencia([3, 3, 3], 'dia')).toBe('Estable');
    expect(describirTendencia([3], 'dia')).toBe('Sin datos suficientes');
  });
});

describe('mesDestacado', () => {
  it('suma todos los años y devuelve el mes más fuerte', () => {
    const vacio = Array(12).fill(0);
    const filas = [
      { anio: 2025, meses: [1, 0, ...vacio.slice(2)] },
      { anio: 2026, meses: [2, 5, ...vacio.slice(2)] },
    ];
    expect(mesDestacado(filas)).toEqual({ mes: 1, total: 5 });
  });

  it('sin actividad no hay mes destacado', () => {
    expect(mesDestacado([])).toBeNull();
    expect(mesDestacado([{ anio: 2026, meses: Array(12).fill(0) }])).toBeNull();
  });
});

describe('escalaRedonda', () => {
  it('redondea el tope del eje', () => {
    expect(escalaRedonda(3)).toBe(4);
    expect(escalaRedonda(7.3)).toBe(8);
    expect(escalaRedonda(37)).toBe(40);
    expect(escalaRedonda(230)).toBe(300);
  });
});