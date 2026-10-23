from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.auditoria_terminos import AuditoriaTerminos
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.usuario import Usuario
from app.models.version_terminos import VersionTerminos

URL = "/api/v1/backoffice/terminos"
LOGIN_BO = "/api/v1/backoffice/auth/login"
TERMS = "/api/v1/legal/terms"
ACEPTACION = "/api/v1/legal/terms/acceptance"
ACEPTAR = "/api/v1/legal/terms/accept"
PASS = "Segura123!"
CONTENIDO = "1. Objeto\nTexto de la sección uno.\n\n2. Uso\nTexto de la sección dos."


@pytest.fixture(autouse=True)
def roles_sistema(db_session):
    if db_session.get(RolSistema, ROL_VIAJERO) is None:
        db_session.add_all([
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
        ])
        db_session.commit()


def _crear_usuario(db_session, email, rol=ROL_VIAJERO, **campos):
    datos = {
        "Email": email,
        "Nombre": "Nombre",
        "Apellido": "Apellido",
        "NombreUsuario": email.split("@")[0],
        "HashedPassword": hash_password(PASS),
        "Activo": True,
        "EmailConfirmado": True,
        "IdRolSistema": rol,
    }
    datos.update(campos)
    usuario = Usuario(**datos)
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


@pytest.fixture
def admin(db_session):
    return _crear_usuario(db_session, "admin@cyanea.test", ROL_ADMIN_SISTEMA)


@pytest.fixture
def headers_admin(client, admin):
    token = client.post(LOGIN_BO, json={"email": admin.Email, "password": PASS}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _crear(client, headers, numero="2027-01-01", titulo="Nuevos términos", contenido=CONTENIDO):
    return client.post(
        URL, json={"numero": numero, "titulo": titulo, "contenido": contenido}, headers=headers
    )


def _publicar(client, headers, id_version):
    return client.post(f"{URL}/{id_version}/publicar", headers=headers)


def _estados(client, headers):
    return {v["numero"]: v["estado"] for v in client.get(URL, headers=headers).json()["versiones"]}


# Solo administradores 

def test_viajero_no_puede_gestionar_terminos(client, db_session):
    viajero = _crear_usuario(db_session, "viajero@cyanea.test")
    token = create_access_token({"sub": viajero.Email, "user_id": viajero.IdUsuario})
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get(URL, headers=headers).status_code == 401
    assert _crear(client, headers).status_code == 401


def test_sin_token_no_puede_gestionar_terminos(client):
    assert client.get(URL).status_code == 401
    assert client.post(f"{URL}/1/publicar").status_code == 401


# Listado 

def test_listado_incluye_la_version_inicial_vigente(client, headers_admin):
    datos = client.get(URL, headers=headers_admin).json()
    assert datos["versionVigente"] == settings.terms_version
    assert len(datos["versiones"]) == 1
    inicial = datos["versiones"][0]
    assert inicial["numero"] == settings.terms_version
    assert inicial["estado"] == "vigente"
    assert inicial["titulo"]
    assert inicial["fechaPublicacion"] is not None


# Crear 

def test_cp1_crear_version_en_borrador(client, headers_admin):
    r = _crear(client, headers_admin, numero="  2027-01-01  ", titulo="  Nuevos   términos ")
    assert r.status_code == 201, r.text
    creada = r.json()
    assert creada["numero"] == "2027-01-01"
    assert creada["titulo"] == "Nuevos términos"
    assert creada["estado"] == "borrador"
    assert creada["fechaPublicacion"] is None
    assert creada["contenido"] == CONTENIDO


def test_cp2_no_permite_numero_repetido(client, headers_admin):
    assert _crear(client, headers_admin).status_code == 201
    for numero in ("2027-01-01", " 2027-01-01 ", settings.terms_version):
        r = _crear(client, headers_admin, numero=numero)
        assert r.status_code == 409
        assert r.headers["X-Error-Code"] == "TERMS_VERSION_NUMBER_DUPLICATED"


@pytest.mark.parametrize(
    "payload",
    [
        {"numero": "  ", "titulo": "T", "contenido": "C"},
        {"numero": "N" * 31, "titulo": "T", "contenido": "C"},
        {"numero": "N", "titulo": "   ", "contenido": "C"},
        {"numero": "N", "titulo": "T", "contenido": "   "},
        {"titulo": "T", "contenido": "C"},
    ],
)
def test_crear_valida_los_datos(client, headers_admin, payload):
    assert client.post(URL, json=payload, headers=headers_admin).status_code == 422


# Editar y eliminar solo borradores 

def test_cp3_editar_un_borrador(client, headers_admin):
    id_version = _crear(client, headers_admin).json()["id"]
    r = client.put(
        f"{URL}/{id_version}",
        json={"numero": "2027-02-01", "titulo": "Otro título", "contenido": "1. A\nB"},
        headers=headers_admin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["numero"] == "2027-02-01"
    assert r.json()["titulo"] == "Otro título"
    assert r.json()["contenido"] == "1. A\nB"


def test_editar_conservando_el_propio_numero(client, headers_admin):
    id_version = _crear(client, headers_admin).json()["id"]
    r = client.put(
        f"{URL}/{id_version}",
        json={"numero": "2027-01-01", "titulo": "Cambio", "contenido": CONTENIDO},
        headers=headers_admin,
    )
    assert r.status_code == 200


def test_editar_no_permite_el_numero_de_otra_version(client, headers_admin):
    _crear(client, headers_admin, numero="A")
    id_b = _crear(client, headers_admin, numero="B").json()["id"]
    r = client.put(
        f"{URL}/{id_b}", json={"numero": "a", "titulo": "T", "contenido": "C"}, headers=headers_admin
    )
    assert r.status_code == 409


def test_cp4_no_se_edita_una_version_vigente(client, headers_admin):
    vigente = client.get(URL, headers=headers_admin).json()["versiones"][0]
    r = client.put(
        f"{URL}/{vigente['id']}",
        json={"numero": "X", "titulo": "T", "contenido": "C"},
        headers=headers_admin,
    )
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == "TERMS_VERSION_NOT_DRAFT"


def test_no_se_edita_ni_elimina_una_version_historica(client, headers_admin):
    id_inicial = client.get(URL, headers=headers_admin).json()["versiones"][0]["id"]
    nueva = _crear(client, headers_admin).json()["id"]
    _publicar(client, headers_admin, nueva)

    assert _estados(client, headers_admin)[settings.terms_version] == "historica"
    r_put = client.put(
        f"{URL}/{id_inicial}", json={"numero": "X", "titulo": "T", "contenido": "C"}, headers=headers_admin
    )
    assert r_put.status_code == 409
    assert client.delete(f"{URL}/{id_inicial}", headers=headers_admin).status_code == 409


def test_se_elimina_un_borrador(client, db_session, headers_admin):
    id_version = _crear(client, headers_admin).json()["id"]
    assert client.delete(f"{URL}/{id_version}", headers=headers_admin).status_code == 204
    assert db_session.get(VersionTerminos, id_version) is None


def test_no_se_elimina_la_version_vigente(client, headers_admin):
    vigente = client.get(URL, headers=headers_admin).json()["versiones"][0]
    r = client.delete(f"{URL}/{vigente['id']}", headers=headers_admin)
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == "TERMS_VERSION_NOT_DRAFT"


def test_version_inexistente(client, headers_admin):
    assert client.get(f"{URL}/9999", headers=headers_admin).status_code == 404
    assert client.delete(f"{URL}/9999", headers=headers_admin).status_code == 404
    assert _publicar(client, headers_admin, 9999).status_code == 404


# Previsualizar (detalle con contenido) 

def test_detalle_devuelve_el_contenido(client, headers_admin):
    id_version = _crear(client, headers_admin).json()["id"]
    r = client.get(f"{URL}/{id_version}", headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["contenido"] == CONTENIDO


# Publicar 

def test_cp5_publicar_pasa_la_anterior_a_historica(client, headers_admin):
    id_version = _crear(client, headers_admin).json()["id"]
    r = _publicar(client, headers_admin, id_version)
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "vigente"
    assert r.json()["fechaPublicacion"] is not None

    estados = _estados(client, headers_admin)
    assert estados["2027-01-01"] == "vigente"
    assert estados[settings.terms_version] == "historica"
    assert list(estados.values()).count("vigente") == 1


def test_cp8_get_terms_devuelve_la_nueva_version(client, headers_admin):
    id_version = _crear(client, headers_admin, titulo="Términos 2027").json()["id"]
    _publicar(client, headers_admin, id_version)

    r = client.get(TERMS)
    assert r.status_code == 200
    assert r.json()["version"] == "2027-01-01"
    assert r.json()["titulo"] == "Términos 2027"
    assert r.json()["contenido"] == ["1. Objeto\nTexto de la sección uno.", "2. Uso\nTexto de la sección dos."]


def test_solo_se_publica_un_borrador(client, headers_admin):
    vigente = client.get(URL, headers=headers_admin).json()["versiones"][0]
    r = _publicar(client, headers_admin, vigente["id"])
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == "TERMS_VERSION_NOT_DRAFT"

    id_version = _crear(client, headers_admin).json()["id"]
    assert _publicar(client, headers_admin, id_version).status_code == 200
    assert _publicar(client, headers_admin, id_version).status_code == 409


def test_la_base_impide_dos_versiones_vigentes(db_session):
    ahora = datetime.now(timezone.utc)
    db_session.add_all([
        VersionTerminos(Numero="A", Titulo="t", Contenido="c", Estado="vigente", FechaCreacion=ahora),
        VersionTerminos(Numero="B", Titulo="t", Contenido="c", Estado="vigente", FechaCreacion=ahora),
    ])
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


# Los usuarios deben aceptar la nueva versión 

def test_cp6_los_usuarios_deben_aceptar_la_nueva_version(
    client, db_session, headers_admin, auth_headers, usuario_activo
):
    usuario_activo.AceptaTerminos = True
    usuario_activo.VersionTerminosAceptada = settings.terms_version
    db_session.commit()

    r = client.get(ACEPTACION, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["requiereAceptacion"] is False

    id_version = _crear(client, headers_admin).json()["id"]
    _publicar(client, headers_admin, id_version)

    r = client.get(ACEPTACION, headers=auth_headers)
    assert r.json()["requiereAceptacion"] is True
    assert r.json()["versionVigente"] == "2027-01-01"
    assert r.json()["versionAceptada"] == settings.terms_version

    r = client.post(ACEPTAR, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["requiereAceptacion"] is False
    db_session.refresh(usuario_activo)
    assert usuario_activo.VersionTerminosAceptada == "2027-01-01"
    assert usuario_activo.FechaAceptacionTerminos is not None


def test_aceptacion_requiere_autenticacion(client):
    assert client.get(ACEPTACION).status_code == 401
    assert client.post(ACEPTAR).status_code == 401


def test_un_usuario_que_nunca_acepto_debe_aceptar(client, auth_headers):
    r = client.get(ACEPTACION, headers=auth_headers)
    assert r.json()["requiereAceptacion"] is True
    assert r.json()["versionAceptada"] is None


def test_el_registro_guarda_la_version_vigente(client, db_session, headers_admin):
    id_version = _crear(client, headers_admin).json()["id"]
    _publicar(client, headers_admin, id_version)

    r = client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Nuevo",
            "apellido": "Usuario",
            "nombreUsuario": "nuevo_usuario",
            "email": "nuevo@test.com",
            "password": "Password123!",
            "aceptaTerminos": True,
        },
    )
    assert r.status_code == 201, r.text
    creado = db_session.query(Usuario).filter_by(Email="nuevo@test.com").one()
    assert creado.VersionTerminosAceptada == "2027-01-01"


# Cantidad de usuarios que aceptaron la vigente 

def test_cantidad_de_usuarios_que_aceptaron_la_vigente(client, db_session, headers_admin, admin):
    v = settings.terms_version
    _crear_usuario(db_session, "a@cyanea.test", AceptaTerminos=True, VersionTerminosAceptada=v)
    _crear_usuario(db_session, "b@cyanea.test", AceptaTerminos=True, VersionTerminosAceptada=v)
    _crear_usuario(db_session, "vieja@cyanea.test", AceptaTerminos=True, VersionTerminosAceptada="2000-01-01")
    _crear_usuario(db_session, "nunca@cyanea.test")
    _crear_usuario(
        db_session, "baja@cyanea.test", AceptaTerminos=True, VersionTerminosAceptada=v,
        FechaBaja=datetime.now(timezone.utc),
    )
    admin.AceptaTerminos = True
    admin.VersionTerminosAceptada = v
    db_session.commit()

    assert client.get(URL, headers=headers_admin).json()["usuariosAceptaronVigente"] == 2

    id_version = _crear(client, headers_admin).json()["id"]
    _publicar(client, headers_admin, id_version)
    assert client.get(URL, headers=headers_admin).json()["usuariosAceptaronVigente"] == 0


# Auditoría 

def test_la_publicacion_queda_auditada(client, db_session, headers_admin, admin):
    id_version = _crear(client, headers_admin).json()["id"]
    _publicar(client, headers_admin, id_version)

    filas = db_session.query(AuditoriaTerminos).all()
    assert len(filas) == 1
    assert filas[0].Accion == "PUBLICACION"
    assert filas[0].NumeroVersion == "2027-01-01"
    assert filas[0].IdVersionTerminos == id_version
    assert filas[0].IdAdministrador == admin.IdUsuario
    assert filas[0].FechaHora is not None


def test_las_operaciones_rechazadas_no_se_auditan(client, db_session, headers_admin):
    vigente = client.get(URL, headers=headers_admin).json()["versiones"][0]
    _publicar(client, headers_admin, vigente["id"])
    assert db_session.query(AuditoriaTerminos).count() == 0