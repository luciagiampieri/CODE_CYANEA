import {
  obtenerHistorialSuspensiones,
  reactivarUsuario,
  suspenderUsuario,
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

describe('suspensión de usuarios (US 108)', () => {
  test('suspender envía el motivo por POST', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { estado: 'suspendida' }));

    await suspenderUsuario(7, 'Uso indebido');

    expect(fetch.mock.calls[0][0]).toMatch(/\/backoffice\/usuarios\/7\/suspender$/);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ motivo: 'Uso indebido' });
  });

  test('reactivar usa POST sin cuerpo', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { estado: 'activa' }));

    await reactivarUsuario(7);

    expect(fetch.mock.calls[0][0]).toMatch(/\/backoffice\/usuarios\/7\/reactivar$/);
    expect(fetch.mock.calls[0][1].method).toBe('POST');
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  test('consulta el historial de suspensiones', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { suspendida: false, historial: [] }));

    const datos = await obtenerHistorialSuspensiones(7);

    expect(fetch.mock.calls[0][0]).toMatch(/\/backoffice\/usuarios\/7\/suspensiones$/);
    expect(datos).toEqual({ suspendida: false, historial: [] });
  });

  test('propaga el código de error del backend', async () => {
    fetch.mockReturnValue(
      respuestaFetch(403, { detail: 'No se puede suspender.' }, { 'X-Error-Code': 'ADMIN_PROTECTED' })
    );

    await expect(suspenderUsuario(1, 'x')).rejects.toMatchObject({
      status: 403,
      codigo: 'ADMIN_PROTECTED',
    });
  });
});