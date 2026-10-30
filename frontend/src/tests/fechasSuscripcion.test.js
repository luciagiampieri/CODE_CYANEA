import { fechaCorta, formatearPeriodo } from '../utils/fechasSuscripcion';

test('fechaCorta usa dd/mm/aaaa en hora de Argentina', () => {
  expect(fechaCorta('2026-10-25T15:00:00Z')).toBe('25/10/2026');
  expect(fechaCorta('2026-10-26T02:00:00Z')).toBe('25/10/2026');
});

test('con el mismo año lo muestra una sola vez', () => {
  expect(formatearPeriodo('2026-10-25T15:00:00Z', '2026-11-25T15:00:00Z')).toBe('25 oct – 25 nov 2026');
});

test('con años distintos muestra los dos', () => {
  expect(formatearPeriodo('2026-12-25T15:00:00Z', '2027-01-25T15:00:00Z')).toBe('25 dic 2026 – 25 ene 2027');
});

test('toma el día de Argentina aunque en UTC ya sea el día siguiente', () => {
  expect(formatearPeriodo('2026-12-01T01:30:00Z', '2027-01-01T01:30:00Z')).toBe('30 nov – 31 dic 2026');
});

test('sin alguna de las fechas devuelve null', () => {
  expect(formatearPeriodo(null, '2026-11-25T15:00:00Z')).toBeNull();
  expect(formatearPeriodo('2026-10-25T15:00:00Z', undefined)).toBeNull();
});
