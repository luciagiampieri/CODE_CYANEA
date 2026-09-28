"""Tests del listado de gastos del viaje (con filtro por categoría)."""

from datetime import date
from decimal import Decimal

from app.core.security import create_access_token, hash_password
from app.models.categorias_gastos import CategoriasGastos
from app.models.estado_participacion import EstadoParticipacion
from app.models.gasto import Gasto
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario


def _url(viaje):
    return f"/api/v1/gastos/trips/{viaje.IdViaje}"


def _crear_usuario(db_session, nombre_usuario):
    usuario = Usuario(
        Nombre=nombre_usuario.capitalize(),
        Apellido="Test",
        NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _token_de(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _agregar_participante(db_session, viaje, usuario):
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado.IdEstadoParticipacion,
    )
    db_session.add(participacion)
    db_session.commit()
    db_session.refresh(participacion)
    return participacion


def _categorias(db_session):
    comida = CategoriasGastos(Nombre="Comida y Bebida", Activo=True)
    transporte = CategoriasGastos(Nombre="Transporte", Activo=True)
    alojamiento = CategoriasGastos(Nombre="Alojamiento", Activo=True)
    db_session.add_all([comida, transporte, alojamiento])
    db_session.commit()
    return comida, transporte, alojamiento


def _gasto(db_session, viaje, pagador, categoria, nombre, monto, fecha):
    gasto = Gasto(
        IdViaje=viaje.IdViaje,
        Nombre=nombre,
        Monto=Decimal(monto),
        IdCategoria=categoria.IdCategoria,
        IdPagador=pagador.IdParticipanteViaje,
        FechaGasto=fecha,
    )
    db_session.add(gasto)
    db_session.commit()
    return gasto


def _escenario(db_session, viaje, participacion_admin):
    comida, transporte, alojamiento = _categorias(db_session)
    _gasto(db_session, viaje, participacion_admin, comida, "Cena", "100.00", date(2026, 9, 2))
    _gasto(db_session, viaje, participacion_admin, transporte, "Taxi", "40.50", date(2026, 9, 3))
    _gasto(db_session, viaje, participacion_admin, comida, "Almuerzo", "60.00", date(2026, 9, 1))
    return comida, transporte, alojamiento


# PU 1 / CA 1 / CA 2 / CA 3
def test_participante_ve_los_gastos_ordenados_con_sus_datos(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, participacion_admin = viaje_con_admin
    comida, _, _ = _escenario(db_session, viaje, participacion_admin)

    response = client.get(_url(viaje), headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert [item["Nombre"] for item in body] == ["Taxi", "Cena", "Almuerzo"]
    cena = body[1]
    assert cena["NombreCategoria"] == "Comida y Bebida"
    assert cena["IdCategoria"] == comida.IdCategoria
    assert Decimal(cena["Monto"]) == Decimal("100.00")
    assert cena["FechaGasto"] == "2026-09-02"
    assert cena["NombrePagador"] == "Ana Test"
    assert cena["IdUsuarioPagador"] == usuario_activo.IdUsuario


def test_otro_participante_aceptado_tambien_ve_los_gastos(
    client, db_session, viaje_con_admin
):
    viaje, participacion_admin = viaje_con_admin
    _escenario(db_session, viaje, participacion_admin)
    participante = _crear_usuario(db_session, "carlos")
    _agregar_participante(db_session, viaje, participante)

    response = client.get(_url(viaje), headers=_token_de(participante))

    assert response.status_code == 200
    assert len(response.json()) == 3


# PU 2 / CA 4
def test_usuario_que_no_participa_no_ve_los_gastos(client, db_session, viaje_con_admin):
    viaje, participacion_admin = viaje_con_admin
    _escenario(db_session, viaje, participacion_admin)
    ajeno = _crear_usuario(db_session, "ajeno")

    response = client.get(_url(viaje), headers=_token_de(ajeno))

    assert response.status_code == 403


def test_requiere_autenticacion(client, viaje_con_admin):
    viaje, _ = viaje_con_admin

    assert client.get(_url(viaje)).status_code == 401


def test_viaje_inexistente(client, master_data, auth_headers):
    assert client.get("/api/v1/gastos/trips/9999", headers=auth_headers).status_code == 404


# PU 3 / CA 5
def test_filtrar_por_categoria(client, db_session, auth_headers, viaje_con_admin):
    viaje, participacion_admin = viaje_con_admin
    comida, transporte, _ = _escenario(db_session, viaje, participacion_admin)

    response = client.get(_url(viaje), params={"categoria": comida.IdCategoria}, headers=auth_headers)

    assert response.status_code == 200
    assert [item["Nombre"] for item in response.json()] == ["Cena", "Almuerzo"]

    response = client.get(
        _url(viaje), params={"categoria": transporte.IdCategoria}, headers=auth_headers
    )
    assert [item["Nombre"] for item in response.json()] == ["Taxi"]


# PU 5 / CA 7
def test_filtrar_por_categoria_sin_gastos(client, db_session, auth_headers, viaje_con_admin):
    viaje, participacion_admin = viaje_con_admin
    _, _, alojamiento = _escenario(db_session, viaje, participacion_admin)

    response = client.get(
        _url(viaje), params={"categoria": alojamiento.IdCategoria}, headers=auth_headers
    )

    assert response.status_code == 200
    assert response.json() == []


# PU 6 / CA 7
def test_viaje_sin_gastos(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = client.get(_url(viaje), headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == []


def test_no_mezcla_gastos_de_otros_viajes(
    client, db_session, auth_headers, usuario_activo, viaje_con_admin
):
    viaje, participacion_admin = viaje_con_admin
    comida, _, _ = _escenario(db_session, viaje, participacion_admin)

    from app.models.viaje import Viaje

    otro_viaje = Viaje(
        Titulo="Otro viaje",
        FechaInicio=viaje.FechaInicio,
        FechaFin=viaje.FechaFin,
        IdEstadoViaje=viaje.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=usuario_activo.IdUsuario,
    )
    db_session.add(otro_viaje)
    db_session.commit()
    rol_admin = db_session.query(RolParticipante).filter_by(Nombre="administrador").first()
    estado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    participacion_otro = ParticipanteViaje(
        IdViaje=otro_viaje.IdViaje,
        IdUsuario=usuario_activo.IdUsuario,
        IdRolParticipante=rol_admin.IdRolParticipante,
        IdEstadoParticipacion=estado.IdEstadoParticipacion,
    )
    db_session.add(participacion_otro)
    db_session.commit()
    _gasto(db_session, otro_viaje, participacion_otro, comida, "Gasto ajeno", "999.00", date(2026, 9, 5))

    body = client.get(_url(viaje), headers=auth_headers).json()

    assert "Gasto ajeno" not in [item["Nombre"] for item in body]
    assert len(body) == 3