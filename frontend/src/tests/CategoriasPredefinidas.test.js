// US 110: los viajeros ven el ícono configurado en el backoffice y conservan
// las categorías desactivadas en los elementos existentes.
import { fireEvent, render, screen } from '@testing-library/react-native';

import DocumentosPorCategoria from '../components/trip/DocumentsByCategory';
import { iconForCategory } from '../components/trip/ExpenseList';
import { conCategoriaActual } from '../utils/categoriasActuales';
import {
  ICONOS_DISPONIBLES,
  TIPOS_CATEGORIA,
  iconoDeCategoria,
  normalizarNombreCategoria,
} from '../utils/iconosCategorias';

describe('iconoDeCategoria', () => {
  test('usa el ícono configurado y, si falta, el de su nombre', () => {
    expect(iconoDeCategoria(TIPOS_CATEGORIA.GASTOS, 'Propinas', 'gift')).toBe('gift');
    expect(iconoDeCategoria(TIPOS_CATEGORIA.CHECKLIST, 'DOCUMENTACION')).toBe('passport');
    expect(iconoDeCategoria(TIPOS_CATEGORIA.DOCUMENTOS, 'Documentación')).toBe('id-card');
    expect(iconoDeCategoria(TIPOS_CATEGORIA.GASTOS, 'Nueva')).toBe('tags');
  });

  test('iconForCategory de la lista de gastos prioriza el ícono del backend', () => {
    expect(iconForCategory('Transporte', 'bus')).toBe('bus');
    expect(iconForCategory('Transporte')).toBe('car');
  });

  test('normaliza nombres sin acentos ni mayúsculas', () => {
    expect(normalizarNombreCategoria('  Reservas   y ENTRADAS ')).toBe('reservas y entradas');
  });

  test('los íconos ofrecidos no se repiten', () => {
    expect(new Set(ICONOS_DISPONIBLES).size).toBe(ICONOS_DISPONIBLES.length);
  });
});

describe('categorías desactivadas al editar (CA 7)', () => {
  test('un gasto conserva su categoría aunque ya no esté activa', () => {
    const activas = [{ IdCategoria: 1, Nombre: 'Transporte', Icono: 'car' }];
    const actual = { IdCategoria: 9, Nombre: 'Souvenirs', Icono: 'gift' };

    expect(conCategoriaActual(activas, actual, 'IdCategoria')).toEqual([...activas, actual]);
    expect(conCategoriaActual(activas, { IdCategoria: 1 }, 'IdCategoria')).toEqual(activas);
    expect(conCategoriaActual(activas, null, 'IdCategoria')).toEqual(activas);
  });

  test('una tarea y un documento conservan su categoría', () => {
    const tarea = { IdCategoriaChecklist: 5, Nombre: 'Mascotas', Icono: 'paw' };
    expect(conCategoriaActual([], tarea, 'IdCategoriaChecklist')).toEqual([tarea]);

    const documento = { IdCategoriaDocumento: 7, Nombre: 'Visas', Icono: 'passport' };
    const activas = [{ IdCategoriaDocumento: 1, Nombre: 'Vuelos' }];
    expect(conCategoriaActual(activas, documento, 'IdCategoriaDocumento')).toEqual([...activas, documento]);
  });

  test('no modifica la lista recibida', () => {
    const activas = [{ IdCategoria: 1 }];
    conCategoriaActual(activas, { IdCategoria: 2 }, 'IdCategoria');
    expect(activas).toEqual([{ IdCategoria: 1 }]);
  });
});

const DOCUMENTO = {
  IdDocumento: 1,
  IdCategoriaDocumento: 2,
  NombreCategoria: 'Comprobantes',
  IconoCategoria: 'receipt',
  NombreArchivo: 'ticket.jpg',
  NombreUsuarioSubida: 'Ana Test',
  UrlArchivo: 'https://archivos/ticket.jpg',
  FechaSubida: '2026-10-01T12:00:00Z',
  EsPublico: true,
  EsPropio: true,
};

// Las categorías sin documentos se ven en el filtro por categoría.
async function abrirFiltroDeCategorias() {
  await fireEvent.press(screen.getByTestId('documentos-filtros-abrir'));
  await fireEvent.press(screen.getByTestId('documentos-filtro-categorias'));
}

describe('DocumentosPorCategoria', () => {
  test('muestra las categorías activas recibidas y no las desactivadas sin documentos', async () => {
    await render(
      <DocumentosPorCategoria
        categorias={[
          { IdCategoriaDocumento: 1, Nombre: 'Visas', Icono: 'passport' },
          { IdCategoriaDocumento: 2, Nombre: 'Comprobantes', Icono: 'receipt' },
        ]}
        documentos={[DOCUMENTO]}
      />
    );
    await abrirFiltroDeCategorias();

    expect(screen.getByText('Visas')).toBeTruthy();
    expect(screen.queryByText('Vuelos')).toBeNull();
  });

  test('sin categorías del backend usa las categorías base', async () => {
    await render(<DocumentosPorCategoria documentos={[DOCUMENTO]} />);
    await abrirFiltroDeCategorias();

    expect(screen.getByText('Vuelos')).toBeTruthy();
  });
});
