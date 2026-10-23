import {
  actualizarTermino,
  crearTermino,
  eliminarTermino,
  listarTerminos,
  obtenerTermino,
  publicarTermino,
} from '../../services/backofficeApi';

function respuestaFetch(status, cuerpo, headers = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nombre) => headers[nombre] ?? null },
    json: () => (cuerpo === undefined ? Promise.reject(new Error('sin cuerpo')) : Promise.resolve(cuerpo)),
  });
}

beforeEach(() => {
  if (typeof window === 'undefined') {
    global.window = global;
  }
  Object.defineProperty(window, 'sessionStorage', {
    value: { getItem: () => 'tok', setItem: () => {}, removeItem: () => {} },
    configurable: true,
    writable: true,
  });
  global.fetch = jest.fn();
});

describe('términos y condiciones (US 109)', () => {
  test('lista y consulta versiones', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { versiones: [] }));

    await listarTerminos();
    await obtenerTermino(4);

    expect(fetch.mock.calls[0][0]).toMatch(/\/backoffice\/terminos$/);
    expect(fetch.mock.calls[1][0]).toMatch(/\/backoffice\/terminos\/4$/);
  });

  test('crea una versión con número, título y contenido', async () => {
    fetch.mockReturnValue(respuestaFetch(201, { id: 9 }));

    await crearTermino({ numero: '2027-01-01', titulo: 'T', contenido: 'C' });

    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      numero: '2027-01-01',
      titulo: 'T',
      contenido: 'C',
    });
  });

  test('edita, elimina y publica por id', async () => {
    fetch
      .mockReturnValueOnce(respuestaFetch(200, {}))
      .mockReturnValueOnce(respuestaFetch(204))
      .mockReturnValueOnce(respuestaFetch(200, {}));

    await actualizarTermino(3, { numero: 'N', titulo: 'T', contenido: 'C' });
    await eliminarTermino(3);
    await publicarTermino(3);

    expect(fetch.mock.calls[0][1].method).toBe('PUT');
    expect(fetch.mock.calls[1][1].method).toBe('DELETE');
    expect(fetch.mock.calls[2][0]).toMatch(/\/backoffice\/terminos\/3\/publicar$/);
    expect(fetch.mock.calls[2][1].method).toBe('POST');
  });

  test('propaga el código de error del backend', async () => {
    fetch.mockReturnValue(
      respuestaFetch(409, { detail: 'Ya existe.' }, { 'X-Error-Code': 'TERMS_VERSION_NUMBER_DUPLICATED' })
    );

    await expect(crearTermino({ numero: 'N', titulo: 'T', contenido: 'C' })).rejects.toMatchObject({
      status: 409,
      codigo: 'TERMS_VERSION_NUMBER_DUPLICATED',
    });
  });
});