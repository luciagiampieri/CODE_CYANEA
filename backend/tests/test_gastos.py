from datetime import date, timedelta

from app.core.security import hash_password, create_access_token
from app.models.categorias_gastos import CategoriasGastos
from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.participantes_gastos import ParticipantesGastos
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario


def _agregar_participante_aceptado(db_session, viaje, nombre_usuario):
    usuario = Usuario(
        Nombre=nombre_usuario.capitalize(), Apellido="Test", NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)

    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()

    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado_aceptado.IdEstadoParticipacion,
    )
    db_session.add(participante)
    db_session.commit()
    db_session.refresh(participante)
    return usuario, participante


def test_create_gasto_individual(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Cena",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    assert "IdGasto" in response.json()


def test_create_gasto_rejects_future_date(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Cena",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today() + timedelta(days=5)),
        "EsCompartido": False,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400


def test_create_gasto_personalizada_montos_no_coinciden(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, participante = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Excursion",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "personalizada",
        "DetalleMontosPersonalizados": [
            {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "500.00"}
        ],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400 


def test_create_gasto_personalizada_success(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, participante = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Excursion",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "personalizada",
        "IdPagador": participante.IdParticipanteViaje,
        "DetalleMontosPersonalizados": [
            {"IdParticipanteViaje": participante.IdParticipanteViaje, "MontoAsignado": "1000.00"}
        ],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]


def test_create_gasto_igualitaria_dividir_entre_todos(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, admin_participante = viaje_con_admin
    _agregar_participante_aceptado(db_session, viaje, "bruno")

    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Almuerzo",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": True,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]

    montos = (
        db_session.query(ParticipantesGastos)
        .filter_by(IdGasto=id_gasto)
        .all()
    )
    assert len(montos) == 2
    assert all(m.MontoAsignado == 500 for m in montos)


def test_create_gasto_igualitaria_dividir_entre_ciertos_participantes(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, admin_participante = viaje_con_admin
    _, otro_participante = _agregar_participante_aceptado(db_session, viaje, "bruno")
    _agregar_participante_aceptado(db_session, viaje, "carla") 

    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Almuerzo",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
        "IdParticipantes": [admin_participante.IdParticipanteViaje, otro_participante.IdParticipanteViaje],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 200
    id_gasto = response.json()["IdGasto"]

    montos = db_session.query(ParticipantesGastos).filter_by(IdGasto=id_gasto).all()
    assert len(montos) == 2
    assert all(m.MontoAsignado == 500 for m in montos)


def test_create_gasto_igualitaria_rechaza_menos_de_dos_participantes(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, admin_participante = viaje_con_admin
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Almuerzo",
        "Monto": "1000.00",
        "IdCategoria": categoria_gasto.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": True,
        "DividirEntreTodos": False,
        "TipoDivision": "igualitaria",
        "IdPagador": admin_participante.IdParticipanteViaje,
        "IdParticipantes": [admin_participante.IdParticipanteViaje],
    }
    response = client.post("/api/v1/gastos/", json=payload, headers=auth_headers)
    assert response.status_code == 400


def test_get_categories_devuelve_solo_activas(client, db_session):
    activa = CategoriasGastos(Nombre="Comida", Activo=True)
    inactiva = CategoriasGastos(Nombre="Vieja", Activo=False)
    db_session.add_all([activa, inactiva])
    db_session.commit()

    response = client.get("/api/v1/gastos/categories")
    assert response.status_code == 200
    nombres = [c["Nombre"] for c in response.json()]
    assert "Comida" in nombres
    assert "Vieja" not in nombres


def test_get_categories_no_requiere_auth(client, categoria_gasto):
    response = client.get("/api/v1/gastos/categories")
    assert response.status_code == 200


def test_get_trip_participants_requires_auth(client, viaje_con_admin):
    viaje, _ = viaje_con_admin
    response = client.get(f"/api/v1/gastos/trips/{viaje.IdViaje}/participants")
    assert response.status_code == 401


def test_get_trip_participants_viaje_no_encontrado(client, auth_headers):
    response = client.get("/api/v1/gastos/trips/9999/participants", headers=auth_headers)
    assert response.status_code == 404


def test_get_trip_participants_rechaza_no_miembro(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    intruso = Usuario(
        Nombre="Intruso", Apellido="Ajeno", NombreUsuario="intruso_gastos",
        Email="intruso_gastos@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(intruso)
    db_session.commit()
    db_session.refresh(intruso)
    token = create_access_token({"sub": intruso.Email, "user_id": intruso.IdUsuario})

    response = client.get(
        f"/api/v1/gastos/trips/{viaje.IdViaje}/participants",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


def test_get_trip_participants_success_incluye_solo_aceptados(client, db_session, auth_headers, viaje_con_admin):
    viaje, admin_participante = viaje_con_admin
    otro_usuario, _ = _agregar_participante_aceptado(db_session, viaje, "bruno")

    invitado = Usuario(
        Nombre="Invitado", Apellido="Pendiente", NombreUsuario="invitado_pendiente",
        Email="invitado_pendiente@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(invitado)
    db_session.commit()
    db_session.refresh(invitado)
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_invitado = db_session.query(EstadoParticipacion).filter_by(Nombre="invitado").first()
    db_session.add(ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=invitado.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado_invitado.IdEstadoParticipacion,
    ))
    db_session.commit()

    response = client.get(f"/api/v1/gastos/trips/{viaje.IdViaje}/participants", headers=auth_headers)
    assert response.status_code == 200
    nombres_usuario = [p["NombreUsuario"] for p in response.json()]
    assert "ana_test" in nombres_usuario 
    assert "bruno" in nombres_usuario
    assert "invitado_pendiente" not in nombres_usuario