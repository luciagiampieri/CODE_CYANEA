"""Invitación por mail a alguien sin cuenta: al registrarse/loguearse debe
aparecerle la invitación en sus invitaciones pendientes."""

from datetime import datetime, timedelta

from app.core.security import create_access_token, hash_password
from app.models.estado_invitacion import EstadoInvitacion
from app.models.invitacion_viaje import InvitacionViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario


def _crear_invitacion(db_session, viaje, admin, email, vence_en_dias=7):
    pendiente = db_session.query(EstadoInvitacion).filter_by(Nombre="pendiente").first()
    invitacion = InvitacionViaje(
        IdViaje=viaje.IdViaje,
        EmailInvitado=email,
        TokenInvitacion=f"token-{email}",
        FechaVencimiento=datetime.now() + timedelta(days=vence_en_dias),
        IdEstadoInvitacion=pendiente.IdEstadoInvitacion,
        InvitadoPor=admin.IdUsuario,
    )
    db_session.add(invitacion)
    db_session.commit()
    return invitacion


def _pendientes(client, usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    response = client.get(
        "/api/v1/trips/invitations/pending",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def test_registro_vincula_invitacion_por_mail(client, db_session, viaje_con_admin):
    viaje, admin = viaje_con_admin
    _crear_invitacion(db_session, viaje, admin, "nueva@afuera.com")

    response = client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Nueva",
            "apellido": "Persona",
            "nombreUsuario": "nueva_persona",
            "email": "Nueva@Afuera.com",
            "password": "Password123!",
            "confirmPassword": "Password123!",
            "aceptaTerminos": True,
        },
    )
    assert response.status_code == 201, response.text

    nueva = db_session.query(Usuario).filter_by(Email="nueva@afuera.com").first()
    pendientes = _pendientes(client, nueva)
    assert [p["tripId"] for p in pendientes] == [viaje.IdViaje]

    invitacion = db_session.query(InvitacionViaje).filter_by(EmailInvitado="nueva@afuera.com").first()
    assert invitacion.IdUsuarioRegistrado == nueva.IdUsuario
    assert invitacion.EstadoInvitacion.Nombre == "aceptada"


def test_login_vincula_invitaciones_de_cuentas_ya_registradas(client, db_session, viaje_con_admin):
    """Quien se registró antes del arreglo recupera la invitación al loguearse."""
    viaje, admin = viaje_con_admin
    _crear_invitacion(db_session, viaje, admin, "vieja@afuera.com")
    vieja = Usuario(
        Nombre="Vieja",
        Apellido="Cuenta",
        NombreUsuario="vieja_cuenta",
        Email="vieja@afuera.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(vieja)
    db_session.commit()

    assert _pendientes(client, vieja) == []

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "vieja@afuera.com", "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    assert [p["tripId"] for p in _pendientes(client, vieja)] == [viaje.IdViaje]

    # Loguearse de nuevo no duplica la participación.
    client.post("/api/v1/auth/login", json={"email": "vieja@afuera.com", "password": "Password123!"})
    assert (
        db_session.query(ParticipanteViaje)
        .filter_by(IdViaje=viaje.IdViaje, IdUsuario=vieja.IdUsuario)
        .count()
        == 1
    )


def test_invitacion_vencida_no_se_vincula(client, db_session, viaje_con_admin):
    viaje, admin = viaje_con_admin
    _crear_invitacion(db_session, viaje, admin, "tarde@afuera.com", vence_en_dias=-1)
    tarde = Usuario(
        Nombre="Tarde",
        Apellido="Cuenta",
        NombreUsuario="tarde_cuenta",
        Email="tarde@afuera.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(tarde)
    db_session.commit()

    client.post("/api/v1/auth/login", json={"email": "tarde@afuera.com", "password": "Password123!"})
    assert _pendientes(client, tarde) == []