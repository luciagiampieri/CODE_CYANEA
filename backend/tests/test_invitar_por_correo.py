"""US 134: invitar participantes mediante correo electrónico."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest

from app.api.routes import auth as auth_module
from app.api.routes import trips as trips_module
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.estado_invitacion import EstadoInvitacion
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.invitacion_viaje import InvitacionViaje
from app.models.notificacion import Notificacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.services.auth.google_auth_service import GoogleIdentity
from app.services.mail import get_mail_service
from app.services.notifications import dispatcher


class _Correo:
    def __init__(self):
        self.falla = False
        self.enviados = []

    def send_template(self, **kwargs):
        if self.falla:
            raise RuntimeError("SMTP caído")
        self.enviados.append(kwargs)
        return True

    def send_html(self, **kwargs):
        return self.send_template(**kwargs)


@pytest.fixture(autouse=True)
def _sin_envios_externos(monkeypatch):
    monkeypatch.setattr(trips_module.manager, "broadcast_to_trip", AsyncMock())
    monkeypatch.setattr(trips_module.manager, "broadcast_to_user", AsyncMock())
    monkeypatch.setattr(dispatcher, "_send_email_notifications", AsyncMock())
    monkeypatch.setattr(dispatcher, "_send_push_notifications", AsyncMock())


@pytest.fixture
def correo(client):
    servicio = _Correo()
    app.dependency_overrides[get_mail_service] = lambda: servicio
    return servicio


def _url(viaje):
    return f"/api/v1/trips/{viaje.IdViaje}/participants"


def _headers(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _usuario(db_session, nombre, email=None):
    usuario = Usuario(
        Nombre=nombre.capitalize(),
        Apellido="Test",
        NombreUsuario=nombre,
        Email=email or f"{nombre}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _participar(db_session, viaje, usuario, estado="aceptado"):
    db_session.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=db_session.query(RolParticipante)
            .filter_by(Nombre="participante").one().IdRolParticipante,
            IdEstadoParticipacion=db_session.query(EstadoParticipacion)
            .filter_by(Nombre=estado).one().IdEstadoParticipacion,
        )
    )
    db_session.commit()


def _pendientes(client, usuario):
    response = client.get("/api/v1/trips/invitations/pending", headers=_headers(usuario))
    assert response.status_code == 200
    return [item["tripId"] for item in response.json()]


def _cambiar_estado_viaje(db_session, viaje, nombre):
    viaje.IdEstadoViaje = db_session.query(EstadoViaje).filter_by(Nombre=nombre).one().IdEstadoViaje
    db_session.commit()


def test_cp1_invitar_correo_no_registrado_envia_el_correo(client, db_session, auth_headers, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    response = client.post(_url(viaje), json={"email": "Nueva@Afuera.com"}, headers=auth_headers)

    assert response.status_code == 201, response.text
    assert len(correo.enviados) == 1
    enviado = correo.enviados[0]
    assert enviado["to"] == ["nueva@afuera.com"]
    assert enviado["template_name"] == "invite_trip.html"
    assert enviado["context"]["trip_title"] == viaje.Titulo
    assert enviado["context"]["accept_url"].endswith(
        "/registro?email=nueva%40afuera.com&invitacion=1"
    )
    invitacion = db_session.query(InvitacionViaje).filter_by(EmailInvitado="nueva@afuera.com").one()
    assert invitacion.EstadoInvitacion.Nombre == "pendiente"


def test_cp2_registro_por_correo_muestra_la_invitacion_pendiente(client, db_session, auth_headers, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    client.post(_url(viaje), json={"email": "nueva@afuera.com"}, headers=auth_headers)

    response = client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Nueva",
            "apellido": "Persona",
            "nombreUsuario": "nueva_persona",
            "email": "nueva@afuera.com",
            "password": "Password123!",
            "aceptaTerminos": True,
        },
    )
    assert response.status_code == 201, response.text

    nueva = db_session.query(Usuario).filter_by(Email="nueva@afuera.com").one()
    assert _pendientes(client, nueva) == [viaje.IdViaje]


def test_cp3_registro_con_google_muestra_la_invitacion_pendiente(
    client, db_session, auth_headers, viaje_con_admin, correo, monkeypatch
):
    viaje, _ = viaje_con_admin
    client.post(_url(viaje), json={"email": "invitada@gmail.com"}, headers=auth_headers)
    monkeypatch.setattr(
        auth_module.google_auth_service,
        "verify_id_token",
        lambda _token: GoogleIdentity(
            sub="google-invitada",
            email="invitada@gmail.com",
            email_verified=True,
            given_name="Invi",
            family_name="Tada",
            name="Invi Tada",
            picture=None,
        ),
    )

    response = client.post(
        "/api/v1/auth/register/google",
        json={"idToken": "token-google", "aceptaTerminos": True},
    )
    assert response.status_code == 200, response.text

    invitada = db_session.query(Usuario).filter_by(Email="invitada@gmail.com").one()
    assert _pendientes(client, invitada) == [viaje.IdViaje]


def test_cp4_correo_registrado_se_asocia_a_la_cuenta_y_se_notifica(
    client, db_session, auth_headers, viaje_con_admin, correo
):
    viaje, _ = viaje_con_admin
    registrado = _usuario(db_session, "registrado")

    response = client.post(_url(viaje), json={"email": registrado.Email}, headers=auth_headers)

    assert response.status_code == 201, response.text
    assert correo.enviados == []
    assert _pendientes(client, registrado) == [viaje.IdViaje]
    assert db_session.query(InvitacionViaje).count() == 0
    assert (
        db_session.query(Notificacion)
        .filter_by(IdUsuario=registrado.IdUsuario, Tipo="invitacion_viaje")
        .count()
        == 1
    )


def test_invitar_por_usuario_tambien_notifica(client, db_session, auth_headers, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    registrado = _usuario(db_session, "por_usuario")

    response = client.post(_url(viaje), json={"userId": registrado.IdUsuario}, headers=auth_headers)

    assert response.status_code == 201
    assert (
        db_session.query(Notificacion)
        .filter_by(IdUsuario=registrado.IdUsuario, Tipo="invitacion_viaje")
        .count()
        == 1
    )


@pytest.mark.parametrize("email", ["sin-arroba.com", "nombre@dominio", "con espacio@test.com"])
def test_cp5_correo_con_formato_invalido(client, db_session, auth_headers, viaje_con_admin, correo, email):
    viaje, _ = viaje_con_admin
    response = client.post(_url(viaje), json={"email": email}, headers=auth_headers)

    assert response.status_code == 422
    assert correo.enviados == []
    assert db_session.query(InvitacionViaje).count() == 0


def test_cp6_correo_de_un_participante_actual(client, db_session, auth_headers, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    participante = _usuario(db_session, "ya_participa")
    _participar(db_session, viaje, participante)

    response = client.post(_url(viaje), json={"email": participante.Email}, headers=auth_headers)

    assert response.status_code == 409


def test_cp7_correo_con_invitacion_pendiente(client, db_session, auth_headers, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    assert client.post(_url(viaje), json={"email": "repetido@afuera.com"}, headers=auth_headers).status_code == 201

    response = client.post(_url(viaje), json={"email": "repetido@afuera.com"}, headers=auth_headers)

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "INVITATION_ALREADY_PENDING"
    assert len(correo.enviados) == 1


def test_cp8_usuario_no_administrador(client, db_session, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    participante = _usuario(db_session, "no_admin")
    _participar(db_session, viaje, participante)

    response = client.post(_url(viaje), json={"email": "otro@afuera.com"}, headers=_headers(participante))

    assert response.status_code == 403
    assert correo.enviados == []


def test_cp9_viaje_finalizado(client, db_session, auth_headers, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    _cambiar_estado_viaje(db_session, viaje, "finalizado")

    response = client.post(_url(viaje), json={"email": "tarde@afuera.com"}, headers=auth_headers)

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "TRIP_FINISHED"


def test_viaje_cancelado_no_admite_invitaciones(client, db_session, auth_headers, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    _cambiar_estado_viaje(db_session, viaje, "cancelado")

    response = client.post(_url(viaje), json={"email": "tarde@afuera.com"}, headers=auth_headers)

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "TRIP_NOT_ACTIVE"


def test_cp10_superar_el_limite_diario(client, db_session, auth_headers, viaje_con_admin, correo):
    viaje, _ = viaje_con_admin
    for numero in range(20):
        response = client.post(_url(viaje), json={"email": f"persona{numero}@afuera.com"}, headers=auth_headers)
        assert response.status_code == 201, response.text

    response = client.post(_url(viaje), json={"email": "persona21@afuera.com"}, headers=auth_headers)

    assert response.status_code == 429
    assert response.headers["X-Error-Code"] == "EMAIL_INVITATION_LIMIT_REACHED"
    assert len(correo.enviados) == 20
    assert db_session.query(InvitacionViaje).count() == 20


def test_cp11_aceptar_invitacion_por_correo_con_el_viaje_completo(
    client, db_session, auth_headers, viaje_con_admin, correo
):
    viaje, _ = viaje_con_admin
    client.post(_url(viaje), json={"email": "ultima@afuera.com"}, headers=auth_headers)
    _participar(db_session, viaje, _usuario(db_session, "segundo"))
    _participar(db_session, viaje, _usuario(db_session, "tercero"))
    invitada = _usuario(db_session, "ultima", email="ultima@afuera.com")
    login = client.post("/api/v1/auth/login", json={"email": invitada.Email, "password": "Password123!"})
    assert login.status_code == 200, login.text

    response = client.post(
        f"/api/v1/trips/invitations/{viaje.IdViaje}/respond",
        json={"decision": "aceptar"},
        headers=_headers(invitada),
    )

    assert response.status_code == 409
    assert response.headers["X-Error-Code"] == "TRIP_PARTICIPANT_LIMIT_REACHED"


def test_fallo_del_envio_descarta_la_invitacion_y_permite_reintentar(
    client, db_session, auth_headers, viaje_con_admin, correo
):
    viaje, _ = viaje_con_admin
    correo.falla = True

    response = client.post(_url(viaje), json={"email": "reintento@afuera.com"}, headers=auth_headers)

    assert response.status_code == 502
    assert response.headers["X-Error-Code"] == "INVITATION_EMAIL_FAILED"
    assert "Intentá nuevamente" in response.json()["detail"]
    assert db_session.query(InvitacionViaje).count() == 0

    correo.falla = False
    response = client.post(_url(viaje), json={"email": "reintento@afuera.com"}, headers=auth_headers)

    assert response.status_code == 201
    assert db_session.query(InvitacionViaje).count() == 1


def test_volver_a_invitar_un_correo_con_invitacion_vencida(
    client, db_session, auth_headers, viaje_con_admin, usuario_activo, correo
):
    viaje, _ = viaje_con_admin
    vencida = db_session.query(EstadoInvitacion).filter_by(Nombre="vencida").one()
    db_session.add(
        InvitacionViaje(
            IdViaje=viaje.IdViaje,
            EmailInvitado="vuelve@afuera.com",
            TokenInvitacion="token-viejo",
            FechaVencimiento=datetime.now(timezone.utc) - timedelta(days=1),
            IdEstadoInvitacion=vencida.IdEstadoInvitacion,
            InvitadoPor=usuario_activo.IdUsuario,
        )
    )
    db_session.commit()

    response = client.post(_url(viaje), json={"email": "vuelve@afuera.com"}, headers=auth_headers)

    assert response.status_code == 201, response.text
    invitacion = db_session.query(InvitacionViaje).filter_by(EmailInvitado="vuelve@afuera.com").one()
    db_session.refresh(invitacion)
    assert invitacion.EstadoInvitacion.Nombre == "pendiente"
    assert invitacion.TokenInvitacion != "token-viejo"


def test_la_invitacion_por_correo_aparece_en_invitaciones_enviadas(
    client, db_session, auth_headers, viaje_con_admin, correo
):
    viaje, _ = viaje_con_admin
    client.post(_url(viaje), json={"email": "listada@afuera.com"}, headers=auth_headers)

    response = client.get(f"/api/v1/trips/{viaje.IdViaje}/invitations/sent", headers=auth_headers)

    assert response.status_code == 200
    [invitacion] = response.json()
    assert invitacion["tipo"] == "correo"
    assert invitacion["email"] == "listada@afuera.com"
    assert invitacion["status"] == "pendiente"
    assert invitacion["userId"] is None

    aceptadas = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/invitations/sent?estado=aceptada", headers=auth_headers
    )
    assert aceptadas.json() == []