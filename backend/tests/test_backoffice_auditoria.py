"""US 132: contratos, permisos, historial real, filtros y privacidad."""
from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import create_access_token, hash_password
from app.models.auditoria_acceso_backoffice import AuditoriaAccesoBackoffice as Acceso
from app.models.auditoria_plan import AuditoriaPlan
from app.models.auditoria_suspension_usuario import AuditoriaSuspensionUsuario
from app.models.auditoria_terminos import AuditoriaTerminos
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.usuario import Usuario
from app.services import terminos_service
from app.services.backoffice import auditoria_service

BASE = "/api/v1/backoffice"
URL = BASE + "/auditoria"
PASS = "Segura123!"


@pytest.fixture
def contexto(client, db_session):
    db_session.add_all([RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
                        RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema")])
    admin = Usuario(Nombre="Ana", Apellido="Admin", NombreUsuario="auditoria_admin",
                    Email="auditoria@cyanea.test", HashedPassword=hash_password(PASS),
                    Activo=True, EmailConfirmado=True, IdRolSistema=ROL_ADMIN_SISTEMA)
    viajero = Usuario(Nombre="Beto", Apellido="Viajero", NombreUsuario="auditoria_viajero",
                      Email="viajero@cyanea.test", HashedPassword=hash_password(PASS),
                      Activo=True, EmailConfirmado=True, IdRolSistema=ROL_VIAJERO)
    db_session.add_all([admin, viajero]); db_session.commit()
    token = client.post(BASE + "/auth/login", json={"email": admin.Email, "password": PASS}).json()["access_token"]
    return admin, viajero, {"Authorization": f"Bearer {token}"}


def _plan(db, admin, fecha=None, **valores):
    evento = AuditoriaPlan(IdPlan=2, IdAdministrador=admin.IdUsuario,
                          Campo="MaxSugerenciasDiarias", ValorAnterior="10", ValorNuevo="20",
                          FechaHora=fecha or datetime.now(timezone.utc))
    for k, v in valores.items():
        setattr(evento, k, v)
    db.add(evento); db.commit(); db.refresh(evento)
    return evento


def test_cp1_consulta_y_rango_predeterminado(client, contexto):
    respuesta = client.get(URL, headers=contexto[2])
    assert respuesta.headers["Cache-Control"] == "no-store"
    datos = respuesta.json()
    assert datos["total"] == 1
    assert datos["tamanioPagina"] == 20
    assert datos["desde"] == str(auditoria_service.hoy() - timedelta(days=6))
    assert datos["hasta"] == str(auditoria_service.hoy())
    evento = datos["items"][0]
    assert evento["tipo"] == "inicio_sesion" and evento["resultado"] == "exitoso"
    assert evento["usuario"]["nombreCompleto"] == "Ana Admin"
    assert evento["entidad"]["tipo"] == "backoffice"


def test_cp2_suspension_y_reactivacion_reales(client, db_session, contexto):
    _, viajero, headers = contexto
    assert client.post(f"{BASE}/usuarios/{viajero.IdUsuario}/suspender", headers=headers,
                       json={"motivo": "Incumplimiento de las normas"}).status_code == 200
    datos = client.get(URL, headers=headers, params={"tipo": "suspension_usuario"}).json()
    assert datos["total"] == 1
    assert datos["items"][0]["entidad"]["nombre"] == "Beto Viajero"
    assert client.post(f"{BASE}/usuarios/{viajero.IdUsuario}/reactivar", headers=headers).status_code == 200
    assert client.get(URL, headers=headers, params={"tipo": "reactivacion_usuario"}).json()["total"] == 1


def test_cp3_rango_inclusivo_en_hora_argentina(client, db_session, contexto):
    admin, _, headers = contexto
    # UTC 03:00 es el inicio del dia argentino. UTC 02:59 pertenece al dia anterior.
    for hora in [datetime(2026, 10, 2, 2, 59, tzinfo=timezone.utc),
                 datetime(2026, 10, 2, 3, tzinfo=timezone.utc),
                 datetime(2026, 10, 3, 2, 59, 59, 999999, tzinfo=timezone.utc),
                 datetime(2026, 10, 3, 3, tzinfo=timezone.utc)]:
        _plan(db_session, admin, hora)
    datos = client.get(URL, headers=headers, params={"desde": "2026-10-02", "hasta": "2026-10-02"}).json()
    assert datos["total"] == 2
    assert datos["items"][0]["fechaHora"].startswith("2026-10-03T02:59:59")


def test_cp4_detalle_cambio_real_de_limites(client, contexto):
    headers = contexto[2]
    configuracion = client.get(BASE + "/planes", headers=headers).json()
    configuracion.update(precioMensualARS="4900", precioAnualARS="49000")
    configuracion["pro"]["maxSugerenciasDiarias"] = 25
    assert client.put(BASE + "/planes", headers=headers, json=configuracion).status_code == 200
    filas = client.get(URL, headers=headers, params={"tipo": "cambio_plan"}).json()["items"]
    detalles = [client.get(URL + "/" + fila["id"], headers=headers).json() for fila in filas]
    cambio = next(c for d in detalles for c in d["cambios"] if c["campo"] == "Solicitudes diarias de sugerencias por viaje")
    assert cambio == {"campo": "Solicitudes diarias de sugerencias por viaje", "valorAnterior": "20", "valorNuevo": "25"}


def test_publicacion_de_terminos_real(client, db_session, contexto):
    admin, _, headers = contexto
    version = terminos_service.crear(db_session, "132.0", "Términos", "Contenido legal", admin.IdUsuario)
    assert client.post(f"{BASE}/terminos/{version.id}/publicar", headers=headers).status_code == 200
    filas = client.get(URL, headers=headers, params={"tipo": "publicacion_terminos"}).json()["items"]
    assert len(filas) == 1
    detalle = client.get(URL + "/" + filas[0]["id"], headers=headers).json()
    assert detalle["entidad"]["id"] == version.id
    assert "Contenido legal" not in str(detalle)


def test_cp5_login_fallido_y_usuario_desconocido(client, contexto):
    admin, _, headers = contexto
    for email in [admin.Email, "inexistente@cyanea.test"]:
        assert client.post(BASE + "/auth/login", json={"email": email, "password": "incorrecta"}).status_code == 401
    datos = client.get(URL, headers=headers).json()
    fallidos = [e for e in datos["items"] if e["resultado"] == "fallido"]
    assert len(fallidos) == 2
    assert any(e["usuario"]["id"] == admin.IdUsuario for e in fallidos)
    assert any(e["usuario"]["nombreCompleto"] == "Usuario no identificado" for e in fallidos)


def test_intento_durante_bloqueo_conserva_administrador(client, contexto):
    admin, _, headers = contexto
    for _ in range(5):
        client.post(BASE + "/auth/login", json={"email": admin.Email, "password": "incorrecta"})
    assert client.post(BASE + "/auth/login", json={"email": admin.Email, "password": PASS}).status_code == 429
    filas = client.get(URL, headers=headers, params={"idAdministrador": admin.IdUsuario}).json()["items"]
    assert len(filas) == 8  # login inicial, 5 fallos, bloqueo e intento bloqueado
    assert all(f["usuario"]["id"] == admin.IdUsuario for f in filas)


def test_anonimiza_administrador_en_opciones_y_eventos(client, db_session, contexto):
    admin, _, headers = contexto
    otro = Usuario(Nombre="Dato", Apellido="Privado", NombreUsuario="admin_baja", Email="privado@cyanea.test",
                   HashedPassword=hash_password(PASS), Activo=False, EmailConfirmado=True,
                   IdRolSistema=ROL_ADMIN_SISTEMA, FechaBaja=datetime.now(timezone.utc))
    db_session.add(otro); db_session.commit()
    _plan(db_session, otro)
    opciones = client.get(URL + "/opciones", headers=headers).json()
    fila = client.get(URL, headers=headers, params={"idAdministrador": otro.IdUsuario}).json()["items"][0]
    assert fila["usuario"]["anonimizado"] is True
    assert "Privado" not in str(opciones) + str(fila)
    assert "privado@cyanea.test" not in str(opciones) + str(fila)


@pytest.mark.parametrize("ruta", ["", "/opciones", "/plan:1"])
def test_cp6_cp7_viajero_y_anonimo_rechazados(client, contexto, ruta):
    viajero = contexto[1]
    token = create_access_token({"sub": viajero.Email, "user_id": viajero.IdUsuario})
    assert client.get(URL + ruta, headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert client.get(URL + ruta).status_code == 401


@pytest.mark.parametrize("metodo", ["put", "patch", "delete", "post"])
def test_cp8_sin_operaciones_mutantes(client, db_session, contexto, metodo):
    evento = _plan(db_session, contexto[0])
    assert getattr(client, metodo)(f"{URL}/plan:{evento.IdAuditoriaPlan}", headers=contexto[2]).status_code == 405
    db_session.refresh(evento)
    assert evento.ValorNuevo == "20"


def test_cp9_sin_resultados_y_fuera_de_pagina(client, contexto):
    datos = client.get(URL, headers=contexto[2], params={"tipo": "cambio_plan"}).json()
    assert datos["items"] == [] and datos["total"] == 0
    assert client.get(URL, headers=contexto[2], params={"pagina": 999}).json()["items"] == []


def test_cp10_no_expone_secretos_ni_email_historico(client, db_session, contexto):
    admin, viajero, headers = contexto
    evento = Acceso(Email="correo_original_secreto@cyanea.test", IdUsuario=viajero.IdUsuario,
                    Exitoso=False, Motivo="TOKEN_HISTORICO", DireccionIp="ip_secreta",
                    UserAgent="Bearer token-secreto", FechaHora=datetime.now(timezone.utc))
    db_session.add(evento)
    viajero.FechaBaja = datetime.now(timezone.utc)  # defensa aun con datos mal anonimizados
    db_session.commit()
    suspension = AuditoriaSuspensionUsuario(IdUsuario=viajero.IdUsuario, IdAdministrador=admin.IdUsuario,
        Accion="SUSPENSION", Motivo="Contenido privado de un viaje", FechaHora=datetime.now(timezone.utc))
    db_session.add(suspension); db_session.commit()
    filas = client.get(URL, headers=headers).json()["items"]
    texto = str(filas)
    for fila in filas:
        texto += str(client.get(URL + "/" + fila["id"], headers=headers).json())
    for secreto in ["correo_original_secreto", "TOKEN_HISTORICO", "ip_secreta", "token-secreto",
                    "Contenido privado", "Beto", viajero.Email, "HashedPassword", "access_token", PASS]:
        assert secreto not in texto
    assert "Usuario anonimizado" in texto


def test_orden_y_paginacion_global_de_origenes_distintos(client, db_session, contexto):
    admin, _, headers = contexto
    fecha = datetime.now(timezone.utc)
    ids = [_plan(db_session, admin, fecha).IdAuditoriaPlan for _ in range(25)]
    primera = client.get(URL, headers=headers).json()
    segunda = client.get(URL, headers=headers, params={"pagina": 2}).json()
    assert primera["total"] == 26 and primera["totalPaginas"] == 2
    assert len(primera["items"]) == 20 and len(segunda["items"]) == 6
    assert [e["id"] for e in primera["items"]] == [f"plan:{i}" for i in reversed(ids[5:])]
    assert not set(e["id"] for e in primera["items"]) & set(e["id"] for e in segunda["items"])


def test_filtra_por_administrador_y_devuelve_opciones(client, db_session, contexto):
    admin, viajero, headers = contexto
    _plan(db_session, admin)
    assert client.get(URL, headers=headers, params={"tipo": "cambio_plan", "idAdministrador": admin.IdUsuario}).json()["total"] == 1
    assert client.get(URL, headers=headers, params={"idAdministrador": viajero.IdUsuario}).json()["total"] == 0
    opciones = client.get(URL + "/opciones", headers=headers).json()
    assert len(opciones["tipos"]) == 5
    assert [a["id"] for a in opciones["administradores"]] == [admin.IdUsuario]


@pytest.mark.parametrize("params", [
    {"desde": "2026-10-03", "hasta": "2026-10-02"}, {"desde": "no-fecha"},
    {"tipo": "otro"}, {"idAdministrador": 0}, {"pagina": 0},
])
def test_filtros_invalidos(client, contexto, params):
    assert client.get(URL, headers=contexto[2], params=params).status_code == 422


@pytest.mark.parametrize("id_evento", ["otro:1", "plan:0", "plan:99999", "plan:9999999999999999999999999"])
def test_detalle_inexistente(client, contexto, id_evento):
    assert client.get(URL + "/" + id_evento, headers=contexto[2]).status_code == 404
