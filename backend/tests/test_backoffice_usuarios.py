import pytest

from app.core.security import create_access_token, hash_password
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.usuario import Usuario

URL = "/api/v1/backoffice/usuarios"
LOGIN = "/api/v1/backoffice/auth/login"
PASS = "Segura123!"


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
def headers_admin(client, db_session):
    _crear_usuario(db_session, "admin@cyanea.test", ROL_ADMIN_SISTEMA)
    token = client.post(
        LOGIN, json={"email": "admin@cyanea.test", "password": PASS}
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _emails(respuesta):
    return {u["email"] for u in respuesta.json()["items"]}


def test_buscar_por_nombre_de_usuario(client, db_session, headers_admin):
    _crear_usuario(db_session, "lucia_g@cyanea.test")
    _crear_usuario(db_session, "pedro@cyanea.test")
    r = client.get(URL, params={"q": "lucia_g"}, headers=headers_admin)
    assert r.status_code == 200
    assert _emails(r) == {"lucia_g@cyanea.test"}


def test_buscar_por_email(client, db_session, headers_admin):
    _crear_usuario(db_session, "lucia@cyanea.test")
    _crear_usuario(db_session, "pedro@cyanea.test")
    r = client.get(URL, params={"q": "PEDRO@cyanea"}, headers=headers_admin)
    assert _emails(r) == {"pedro@cyanea.test"}


def test_buscar_por_nombre_completo(client, db_session, headers_admin):
    _crear_usuario(db_session, "ana@cyanea.test", Nombre="Ana", Apellido="Gomez")
    _crear_usuario(db_session, "pedro@cyanea.test")
    r = client.get(URL, params={"q": "ana gom"}, headers=headers_admin)
    assert _emails(r) == {"ana@cyanea.test"}


def test_filtrar_por_plan(client, db_session, headers_admin):
    _crear_usuario(db_session, "lucia@cyanea.test")
    r_pro = client.get(URL, params={"plan": "pro"}, headers=headers_admin)
    r_gratuito = client.get(URL, params={"plan": "gratuito"}, headers=headers_admin)
    assert r_pro.status_code == 200
    assert r_pro.json()["total"] == 0
    assert _emails(r_gratuito) == {"lucia@cyanea.test"}


def test_plan_asignado_en_bd_se_refleja_en_listado_y_detalle(client, db_session, headers_admin):
    usuario = _crear_usuario(db_session, "pro@cyanea.test", IdPlan=2)
    listado = client.get(URL, params={"plan": "pro"}, headers=headers_admin)
    assert _emails(listado) == {"pro@cyanea.test"}
    assert listado.json()["items"][0]["plan"] == "pro"
    assert client.get(f"{URL}/{usuario.IdUsuario}", headers=headers_admin).json()["plan"] == "pro"


def test_combinar_estado_y_metodo_de_registro(client, db_session, headers_admin):
    _crear_usuario(
        db_session, "google_pend@cyanea.test",
        ProveedorAutenticacion="google", EmailConfirmado=False,
    )
    _crear_usuario(db_session, "google_activo@cyanea.test", ProveedorAutenticacion="google")
    _crear_usuario(db_session, "local_pend@cyanea.test", EmailConfirmado=False)
    r = client.get(
        URL,
        params={"estado": "pendiente", "metodoRegistro": "google"},
        headers=headers_admin,
    )
    assert _emails(r) == {"google_pend@cyanea.test"}


def test_listado_muestra_campos_requeridos(client, db_session, headers_admin):
    _crear_usuario(db_session, "lucia@cyanea.test")
    item = client.get(URL, headers=headers_admin).json()["items"][0]
    assert set(item) == {
        "id", "nombreCompleto", "nombreUsuario", "email",
        "plan", "estado", "fechaRegistro",
    }


def test_detalle_no_expone_contenido_de_viajes(client, db_session, headers_admin):
    usuario = _crear_usuario(db_session, "lucia@cyanea.test")
    r = client.get(f"{URL}/{usuario.IdUsuario}", headers=headers_admin)
    assert r.status_code == 200
    assert set(r.json()) == {
        "id", "nombreCompleto", "nombreUsuario", "email", "plan", "estado",
        "fechaRegistro", "nombre", "apellido", "fotoUrl", "metodoRegistro",
        "emailConfirmado", "fechaBaja", "anonimizado", "cantidadViajes",
        "estadoSuscripcion",
    }
    assert r.json()["cantidadViajes"] == 0


def test_usuario_dado_de_baja_se_muestra_anonimizado(client, db_session, headers_admin):
    usuario = _crear_usuario(db_session, "baja@cyanea.test", Nombre="Lucia", Apellido="Real")
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    r_baja = client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": PASS},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r_baja.status_code == 204

    detalle = client.get(f"{URL}/{usuario.IdUsuario}", headers=headers_admin).json()
    assert detalle["anonimizado"] is True
    assert detalle["estado"] == "inactiva"
    assert "baja@cyanea.test" not in str(detalle)
    assert "Lucia" not in str(detalle)

    r_busqueda = client.get(URL, params={"q": "baja@cyanea"}, headers=headers_admin)
    assert r_busqueda.json()["total"] == 0


def test_viajero_no_puede_consultar_usuarios(client, db_session):
    viajero = _crear_usuario(db_session, "viajero@cyanea.test")
    token = create_access_token({"sub": viajero.Email, "user_id": viajero.IdUsuario})
    r = client.get(URL, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


def test_sin_token_no_puede_consultar_usuarios(client):
    assert client.get(URL).status_code == 401


def test_busqueda_sin_resultados(client, db_session, headers_admin):
    _crear_usuario(db_session, "lucia@cyanea.test")
    r = client.get(URL, params={"q": "zzz_inexistente"}, headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 0


def test_paginacion_de_a_20(client, db_session, headers_admin):
    for i in range(25):
        _crear_usuario(db_session, f"usuario{i}@cyanea.test")
    pagina_1 = client.get(URL, headers=headers_admin).json()
    pagina_2 = client.get(URL, params={"pagina": 2}, headers=headers_admin).json()
    assert len(pagina_1["items"]) == 20
    assert len(pagina_2["items"]) == 5
    assert pagina_1["totalPaginas"] == 2


def test_admins_no_aparecen_en_el_listado(client, db_session, headers_admin):
    r = client.get(URL, params={"q": "admin@cyanea"}, headers=headers_admin)
    assert r.json()["total"] == 0


def test_detalle_de_usuario_inexistente(client, headers_admin):
    assert client.get(f"{URL}/99999", headers=headers_admin).status_code == 404
