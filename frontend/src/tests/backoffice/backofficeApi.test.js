import {
  actualizarCategoria,
  cambiarEstadoCategoria,
  cerrarSesion,
  configurarUmbralCostoIA,
  crearCategoria,
  eliminarCategoria,
  listarCategorias,
  listarNotificacionesPasarela,
  obtenerMonitoreoIA,
  iniciarSesion,
  listarUsuarios,
  obtenerAdminActual,
  obtenerMetricas,
  obtenerToken,
  obtenerUsuario,
  registrarExpiracionSesion,
} from '../../services/backofficeApi';

const CLAVE_TOKEN = 'cyanea.backoffice.token';
const ADMIN = { id: 1, nombreCompleto: 'Lucía Giampieri', email: 'lucia@cyanea.test' };

function crearAlmacenamiento() {
  const datos = new Map();
  return {
    getItem: (clave) => (datos.has(clave) ? datos.get(clave) : null),
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave),
  };
}

function respuestaFetch(status, cuerpo, headers = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nombre) => headers[nombre] ?? null },
    json: () => (cuerpo === undefined ? Promise.reject(new Error('sin cuerpo')) : Promise.resolve(cuerpo)),
  });
}

function urlLlamada(indice = 0) {
  return fetch.mock.calls[indice][0];
}

function opcionesLlamada(indice = 0) {
  return fetch.mock.calls[indice][1];
}

beforeEach(() => {
  if (typeof window === 'undefined') {
    global.window = global;
  }
  Object.defineProperty(window, 'sessionStorage', {
    value: crearAlmacenamiento(),
    configurable: true,
    writable: true,
  });
  global.fetch = jest.fn();
});

afterEach(() => {
  registrarExpiracionSesion(null);
});

describe('sesión del backoffice', () => {
  test('iniciar sesión guarda el token y devuelve el administrador', async () => {
    fetch
      .mockReturnValueOnce(respuestaFetch(200, { access_token: 'tok-123' }))
      .mockReturnValueOnce(respuestaFetch(200, ADMIN));

    const admin = await iniciarSesion('lucia@cyanea.test', 'Segura123!');

    expect(admin).toEqual(ADMIN);
    expect(obtenerToken()).toBe('tok-123');
    expect(urlLlamada(0)).toMatch(/\/backoffice\/auth\/login$/);
    expect(opcionesLlamada(0).method).toBe('POST');
    expect(JSON.parse(opcionesLlamada(0).body)).toEqual({
      email: 'lucia@cyanea.test',
      password: 'Segura123!',
    });
    expect(opcionesLlamada(0).headers.Authorization).toBeUndefined();
    expect(urlLlamada(1)).toMatch(/\/backoffice\/auth\/me$/);
    expect(opcionesLlamada(1).headers.Authorization).toBe('Bearer tok-123');
  });

  test('credenciales inválidas no guardan token ni disparan la expiración', async () => {
    const alExpirar = jest.fn();
    registrarExpiracionSesion(alExpirar);
    fetch.mockReturnValue(respuestaFetch(401, { detail: 'Credenciales inválidas.' }));

    await expect(iniciarSesion('lucia@cyanea.test', 'mala')).rejects.toMatchObject({
      message: 'Credenciales inválidas.',
      status: 401,
    });
    expect(obtenerToken()).toBeNull();
    expect(alExpirar).not.toHaveBeenCalled();
  });

  test('un 401 en una ruta protegida borra el token y avisa la expiración', async () => {
    const alExpirar = jest.fn();
    registrarExpiracionSesion(alExpirar);
    window.sessionStorage.setItem(CLAVE_TOKEN, 'tok-vencido');
    fetch.mockReturnValue(respuestaFetch(401, { detail: 'La sesión no es válida o expiró.' }));

    await expect(obtenerAdminActual()).rejects.toMatchObject({ status: 401 });
    expect(alExpirar).toHaveBeenCalledTimes(1);
    expect(obtenerToken()).toBeNull();
  });

  test('cerrar sesión borra el token', async () => {
    window.sessionStorage.setItem(CLAVE_TOKEN, 'tok-123');
    fetch.mockReturnValue(respuestaFetch(204));

    await cerrarSesion();

    expect(urlLlamada()).toMatch(/\/backoffice\/auth\/logout$/);
    expect(opcionesLlamada().method).toBe('POST');
    expect(obtenerToken()).toBeNull();
  });

  test('cerrar sesión borra el token aunque falle la red', async () => {
    window.sessionStorage.setItem(CLAVE_TOKEN, 'tok-123');
    fetch.mockReturnValue(Promise.reject(new Error('sin red')));

    await expect(cerrarSesion()).resolves.toBeUndefined();
    expect(obtenerToken()).toBeNull();
  });

  test('un error de red se informa con un mensaje claro', async () => {
    fetch.mockReturnValue(Promise.reject(new Error('sin red')));

    await expect(obtenerAdminActual()).rejects.toThrow('No se pudo conectar con el servidor.');
  });

  test('un error de validación muestra el mensaje del primer campo', async () => {
    fetch.mockReturnValue(
      respuestaFetch(422, { detail: [{ msg: 'Value error, Ingresá el nombre de la categoría.' }] })
    );

    await expect(obtenerAdminActual()).rejects.toMatchObject({
      message: 'Ingresá el nombre de la categoría.',
      status: 422,
    });
  });

  test('un detalle con otra forma se reemplaza por un mensaje genérico', async () => {
    fetch.mockReturnValue(respuestaFetch(500, { detail: { inesperado: true } }));

    await expect(obtenerAdminActual()).rejects.toMatchObject({
      message: 'Ocurrió un error inesperado.',
      status: 500,
    });
  });
});

describe('usuarios', () => {
  test('listar usuarios envía todos los filtros', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { items: [] }));

    await listarUsuarios({
      q: '  lucia ',
      estado: 'activa',
      plan: 'pro',
      metodoRegistro: 'google',
      pagina: 3,
    });

    expect(urlLlamada()).toMatch(
      /\/backoffice\/usuarios\?q=lucia&estado=activa&plan=pro&metodoRegistro=google&pagina=3$/
    );
  });

  test('listar usuarios omite los filtros vacíos', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { items: [] }));

    await listarUsuarios({ q: '   ', estado: null });

    expect(urlLlamada()).toMatch(/\/backoffice\/usuarios\?pagina=1$/);
  });

  test('obtener un usuario usa su id en la URL', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { id: 42 }));

    const usuario = await obtenerUsuario(42);

    expect(urlLlamada()).toMatch(/\/backoffice\/usuarios\/42$/);
    expect(usuario).toEqual({ id: 42 });
  });

  test('las rutas protegidas envían el token guardado', async () => {
    window.sessionStorage.setItem(CLAVE_TOKEN, 'tok-123');
    fetch.mockReturnValue(respuestaFetch(200, { items: [] }));

    await listarUsuarios();

    expect(opcionesLlamada().headers.Authorization).toBe('Bearer tok-123');
  });
});

describe('métricas', () => {
  test('arma la URL con el rango de fechas', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { desde: '2026-10-01' }));

    const datos = await obtenerMetricas({ desde: '2026-10-01', hasta: '2026-10-16' });

    expect(urlLlamada()).toMatch(/\/backoffice\/metricas\?desde=2026-10-01&hasta=2026-10-16$/);
    expect(datos).toEqual({ desde: '2026-10-01' });
  });

  test('sin fechas no agrega parámetros', async () => {
    fetch.mockReturnValue(respuestaFetch(200, {}));

    await obtenerMetricas();

    expect(urlLlamada()).toMatch(/\/backoffice\/metricas$/);
  });

  test('propaga el mensaje y el estado de un error de validación', async () => {
    fetch.mockReturnValue(respuestaFetch(422, { detail: 'El rango no puede superar un año.' }));

    await expect(
      obtenerMetricas({ desde: '2025-01-01', hasta: '2026-10-16' })
    ).rejects.toMatchObject({ message: 'El rango no puede superar un año.', status: 422 });
  });
});

describe('categorías (US 110)', () => {
  test('lista las categorías agrupadas', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { gastos: [], documentos: [], checklist: [] }));

    const datos = await listarCategorias();

    expect(urlLlamada()).toMatch(/\/backoffice\/categorias$/);
    expect(datos).toEqual({ gastos: [], documentos: [], checklist: [] });
  });

  test('crea una categoría con tipo, nombre e ícono', async () => {
    fetch.mockReturnValue(respuestaFetch(201, { id: 9 }));

    await crearCategoria({ tipo: 'gastos', nombre: 'Propinas', icono: 'gift' });

    expect(urlLlamada()).toMatch(/\/backoffice\/categorias$/);
    expect(opcionesLlamada().method).toBe('POST');
    expect(JSON.parse(opcionesLlamada().body)).toEqual({ tipo: 'gastos', nombre: 'Propinas', icono: 'gift' });
  });

  test('edita, cambia el estado y elimina por tipo e id', async () => {
    fetch
      .mockReturnValueOnce(respuestaFetch(200, {}))
      .mockReturnValueOnce(respuestaFetch(200, {}))
      .mockReturnValueOnce(respuestaFetch(204));

    await actualizarCategoria('documentos', 3, { nombre: 'Visas', icono: 'passport' });
    await cambiarEstadoCategoria('documentos', 3, false);
    await eliminarCategoria('documentos', 3);

    expect(urlLlamada(0)).toMatch(/\/backoffice\/categorias\/documentos\/3$/);
    expect(opcionesLlamada(0).method).toBe('PUT');
    expect(urlLlamada(1)).toMatch(/\/backoffice\/categorias\/documentos\/3\/estado$/);
    expect(JSON.parse(opcionesLlamada(1).body)).toEqual({ activa: false });
    expect(opcionesLlamada(2).method).toBe('DELETE');
  });

  test('propaga el código de error del backend', async () => {
    fetch.mockReturnValue(
      respuestaFetch(409, { detail: 'La categoría está en uso.' }, { 'X-Error-Code': 'CATEGORY_IN_USE' })
    );

    await expect(eliminarCategoria('gastos', 1)).rejects.toMatchObject({
      message: 'La categoría está en uso.',
      status: 409,
      codigo: 'CATEGORY_IN_USE',
    });
  });
});

describe('monitoreo de IA (US 114)', () => {
  test('consulta el consumo con el rango de fechas', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { funcionalidades: [] }));

    await obtenerMonitoreoIA({ desde: '2026-10-01', hasta: '2026-10-20' });

    expect(urlLlamada()).toMatch(/\/backoffice\/monitoreo-ia\?desde=2026-10-01&hasta=2026-10-20$/);
  });

  test('configura y quita el umbral mensual', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { nivel: 'normal' }));

    await configurarUmbralCostoIA(50);
    await configurarUmbralCostoIA(null);

    expect(urlLlamada(0)).toMatch(/\/backoffice\/monitoreo-ia\/umbral$/);
    expect(opcionesLlamada(0).method).toBe('PUT');
    expect(JSON.parse(opcionesLlamada(0).body)).toEqual({ umbralMensualUSD: 50 });
    expect(JSON.parse(opcionesLlamada(1).body)).toEqual({ umbralMensualUSD: null });
  });
});

describe('notificaciones de la pasarela (US 117)', () => {
  test('consulta la página y el filtro por resultado', async () => {
    fetch.mockReturnValue(respuestaFetch(200, { items: [], total: 0 }));

    await listarNotificacionesPasarela();
    await listarNotificacionesPasarela({ estado: 'error', pagina: 2 });

    expect(urlLlamada(0)).toMatch(/\/backoffice\/pagos\/notificaciones\?pagina=1$/);
    expect(urlLlamada(1)).toMatch(/\/backoffice\/pagos\/notificaciones\?pagina=2&estado=error$/);
  });
});
