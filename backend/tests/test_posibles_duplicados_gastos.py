"""US 95 - Detectar posibles gastos duplicados.

`GET /gastos/trips/{trip_id}/posibles-duplicados` devuelve los gastos del
viaje, visibles para el usuario, con igual fecha, monto original y moneda,
pagador y tipo (personal o compartido). No considera nombre, categoría, tipo
de división ni participantes. Solo advierte: `POST /gastos` nunca se bloquea.

Los comentarios CPn remiten a los casos de prueba de la US.
"""
from datetime import date, datetime, timedelta

from app.core.security import create_access_token, hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje

URL_GASTOS = "/api/v1/gastos/"
HOY = date.today()


def _url(viaje):
    return f"/api/v1/gastos/trips/{viaje.IdViaje}/posibles-duplicados"


def _crear_usuario(db_session, nombre_usuario):
    usuario = Usuario(
        Nombre=nombre_usuario.capitalize(), Apellido="Test", NombreUsuario=nombre_usuario,
        Email=f"{nombre_usuario}@test.com", HashedPassword=hash_password("Password123!"),
        Activo=True, EmailConfirmado=True,
    )
    db_session.add(usuario)
    db_session.commit()
    db_session.refresh(usuario)
    return usuario


def _headers(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


def _sumar_participante(db_session, viaje, usuario):
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").first()
    participante = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=aceptado.IdEstadoParticipacion,
    )
    db_session.add(participante)
    db_session.commit()
    db_session.refresh(participante)
    return participante


def _grupo(db_session, viaje_con_admin):
    """Viaje con Ana (admin, usuario_activo), Beto y Carla."""
    viaje, ana = viaje_con_admin
    beto_usuario = _crear_usuario(db_session, "beto")
    carla_usuario = _crear_usuario(db_session, "carla")
    beto = _sumar_participante(db_session, viaje, beto_usuario)
    carla = _sumar_participante(db_session, viaje, carla_usuario)
    return viaje, ana, beto, carla, beto_usuario


def _registrar(client, headers, viaje, categoria, **cambios):
    payload = {
        "IdViaje": viaje.IdViaje,
        "Nombre": "Cena",
        "MontoOriginal": "50000.00",
        "MonedaOriginal": "ARS",
        "IdCategoria": categoria.IdCategoria,
        "FechaGasto": str(HOY),
        "EsCompartido": False,
    }
    payload.update(cambios)
    response = client.post(URL_GASTOS, json=payload, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["IdGasto"]


def _compartido_igualitario(participantes, pagador):
    return {
        "EsCompartido": True,
        "IdPagador": pagador.IdParticipanteViaje,
        "TipoDivision": "igualitaria",
        "DividirEntreTodos": False,
        "IdParticipantes": [p.IdParticipanteViaje for p in participantes],
    }


def _consultar(client, headers, viaje, **cambios):
    params = {
        "fecha_gasto": str(HOY),
        "monto_original": "50000",
        "moneda_original": "ARS",
        "es_compartido": "false",
    }
    params.update(cambios)
    return client.get(_url(viaje), params=params, headers=headers)


# CP1: gasto compartido con los mismos datos
def test_compartido_igual_a_uno_existente_devuelve_el_detalle(
    client, db_session, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, ana, beto, carla, _ = _grupo(db_session, viaje_con_admin)
    id_gasto = _registrar(
        client, auth_headers, viaje, categoria_gasto,
        **_compartido_igualitario([ana, beto, carla], beto),
    )

    response = _consultar(
        client, auth_headers, viaje,
        es_compartido="true", id_pagador=beto.IdParticipanteViaje,
    )

    assert response.status_code == 200
    [gasto] = response.json()
    # Trae los mismos datos que el detalle del gasto, para mostrarlo igual.
    assert gasto == {
        **gasto,
        "IdGasto": id_gasto,
        "Nombre": "Cena",
        "Monto": "50000.00",
        "MontoOriginal": "50000.00",
        "MonedaOriginal": "ARS",
        "MonedaViaje": "ARS",
        "FechaGasto": str(HOY),
        "IdCategoria": categoria_gasto.IdCategoria,
        "NombreCategoria": "Comida",
        "IdPagador": beto.IdParticipanteViaje,
        "NombrePagador": "Beto Test",
        "NombreCreador": "Ana Test",
        "EsCompartido": True,
        "TipoDivision": "igualitaria",
    }
    assert sorted(p["IdParticipanteViaje"] for p in gasto["Participantes"]) == sorted(
        p.IdParticipanteViaje for p in (ana, beto, carla)
    )
    assert {p["Nombre"] for p in gasto["Participantes"]} == {"Ana", "Beto", "Carla"}
    # Cuándo se cargó, para mostrarlo en la advertencia.
    assert datetime.fromisoformat(gasto["FechaCreacion"]).date() == date.today()


# CP1: gasto personal con los mismos datos
def test_personal_igual_a_uno_propio_existente_se_detecta(
    client, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, _ = viaje_con_admin
    id_gasto = _registrar(client, auth_headers, viaje, categoria_gasto)

    response = _consultar(client, auth_headers, viaje)

    assert response.status_code == 200
    assert [g["IdGasto"] for g in response.json()] == [id_gasto]
    assert response.json()[0]["EsCompartido"] is False


# CP2: distinto nombre, tipo de división y participantes
def test_compartido_con_distinto_nombre_division_y_participantes_se_detecta(
    client, db_session, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, ana, beto, _carla, _ = _grupo(db_session, viaje_con_admin)
    id_gasto = _registrar(
        client, auth_headers, viaje, categoria_gasto,
        Nombre="Parrilla Don Julio",
        EsCompartido=True,
        IdPagador=beto.IdParticipanteViaje,
        TipoDivision="personalizada",
        DividirEntreTodos=False,
        DetalleMontosPersonalizados=[
            {"IdParticipanteViaje": ana.IdParticipanteViaje, "MontoAsignado": "30000"},
            {"IdParticipanteViaje": beto.IdParticipanteViaje, "MontoAsignado": "20000"},
        ],
    )

    # Se registraría como "cena" igualitaria entre los tres.
    response = _consultar(
        client, auth_headers, viaje,
        es_compartido="true", id_pagador=beto.IdParticipanteViaje,
    )

    assert [g["IdGasto"] for g in response.json()] == [id_gasto]


def test_la_categoria_no_se_considera(client, db_session, auth_headers, viaje_con_admin, categoria_gasto):
    from app.models.categorias_gastos import CategoriasGastos

    viaje, _ = viaje_con_admin
    otra = CategoriasGastos(Nombre="Transporte", Activo=True)
    db_session.add(otra)
    db_session.commit()
    id_gasto = _registrar(client, auth_headers, viaje, categoria_gasto, IdCategoria=otra.IdCategoria)

    response = _consultar(client, auth_headers, viaje)

    assert [g["IdGasto"] for g in response.json()] == [id_gasto]


# CP3
def test_distinta_fecha_no_se_considera_duplicado(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    _registrar(client, auth_headers, viaje, categoria_gasto, FechaGasto=str(HOY - timedelta(days=1)))

    response = _consultar(client, auth_headers, viaje)

    assert response.json() == []


# CP4
def test_distinto_pagador_no_se_considera_duplicado(
    client, db_session, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, ana, beto, carla, _ = _grupo(db_session, viaje_con_admin)
    _registrar(
        client, auth_headers, viaje, categoria_gasto,
        **_compartido_igualitario([ana, beto, carla], beto),
    )

    response = _consultar(
        client, auth_headers, viaje,
        es_compartido="true", id_pagador=carla.IdParticipanteViaje,
    )

    assert response.json() == []


# CP5
def test_distinto_monto_no_se_considera_duplicado(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    _registrar(client, auth_headers, viaje, categoria_gasto)

    response = _consultar(client, auth_headers, viaje, monto_original="50000.01")

    assert response.json() == []


# CP5
def test_distinta_moneda_no_se_considera_duplicado(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    _registrar(client, auth_headers, viaje, categoria_gasto)

    response = _consultar(client, auth_headers, viaje, moneda_original="USD")

    assert response.json() == []


def test_el_monto_se_compara_por_valor_y_la_moneda_sin_importar_mayusculas(
    client, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, _ = viaje_con_admin
    id_gasto = _registrar(client, auth_headers, viaje, categoria_gasto, MontoOriginal="15230.5")

    response = _consultar(
        client, auth_headers, viaje, monto_original="15230.50", moneda_original="ars"
    )

    assert [g["IdGasto"] for g in response.json()] == [id_gasto]


# CP6
def test_personal_no_se_compara_con_un_compartido_del_mismo_pagador(
    client, db_session, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, ana, beto, carla, _ = _grupo(db_session, viaje_con_admin)
    _registrar(
        client, auth_headers, viaje, categoria_gasto,
        **_compartido_igualitario([ana, beto, carla], ana),
    )

    response = _consultar(client, auth_headers, viaje)

    assert response.json() == []


# CP6 (al revés): compartido contra un personal propio
def test_compartido_no_se_compara_con_un_personal_del_mismo_pagador(
    client, db_session, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, ana, _, _, _ = _grupo(db_session, viaje_con_admin)
    _registrar(client, auth_headers, viaje, categoria_gasto)

    response = _consultar(
        client, auth_headers, viaje,
        es_compartido="true", id_pagador=ana.IdParticipanteViaje,
    )

    assert response.json() == []


# CP7
def test_no_revela_el_gasto_personal_de_otro_usuario(
    client, db_session, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, _, beto, _, beto_usuario = _grupo(db_session, viaje_con_admin)
    id_personal_beto = _registrar(client, _headers(beto_usuario), viaje, categoria_gasto)

    # Ana registra un compartido pagado por Beto con los mismos datos.
    respuesta_ana = _consultar(
        client, auth_headers, viaje,
        es_compartido="true", id_pagador=beto.IdParticipanteViaje,
    )
    # Y un personal propio con los mismos datos.
    respuesta_ana_personal = _consultar(client, auth_headers, viaje)
    # Beto sí ve su propio gasto como posible duplicado.
    respuesta_beto = _consultar(client, _headers(beto_usuario), viaje)

    assert respuesta_ana.json() == []
    assert respuesta_ana_personal.json() == []
    assert [g["IdGasto"] for g in respuesta_beto.json()] == [id_personal_beto]


# CP8
def test_detecta_un_gasto_confirmado_desde_un_comprobante(
    client, auth_headers, viaje_con_admin, categoria_gasto
):
    viaje, _ = viaje_con_admin
    id_gasto = _registrar(
        client, auth_headers, viaje, categoria_gasto,
        Nombre="DIA SUC 123", DesdeComprobante=True,
    )

    response = _consultar(client, auth_headers, viaje)

    assert [g["IdGasto"] for g in response.json()] == [id_gasto]


# CP9
def test_no_compara_con_gastos_de_otro_viaje(
    client, db_session, auth_headers, viaje_con_admin, categoria_gasto, usuario_activo
):
    viaje, _ = viaje_con_admin
    _registrar(client, auth_headers, viaje, categoria_gasto)

    otro_viaje = Viaje(
        Titulo="Otro viaje",
        FechaInicio=viaje.FechaInicio,
        FechaFin=viaje.FechaFin,
        IdEstadoViaje=db_session.query(EstadoViaje).filter_by(Nombre="activo").first().IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=usuario_activo.IdUsuario,
    )
    db_session.add(otro_viaje)
    db_session.commit()
    _sumar_participante(db_session, otro_viaje, usuario_activo)

    response = _consultar(client, auth_headers, otro_viaje)

    assert response.json() == []


# CP10: la advertencia no impide registrar gastos legítimos repetidos
def test_registrar_un_gasto_repetido_no_se_bloquea(client, auth_headers, viaje_con_admin, categoria_gasto):
    viaje, _ = viaje_con_admin
    primero = _registrar(client, auth_headers, viaje, categoria_gasto)
    segundo = _registrar(client, auth_headers, viaje, categoria_gasto)

    response = _consultar(client, auth_headers, viaje)

    assert primero != segundo
    assert sorted(g["IdGasto"] for g in response.json()) == sorted([primero, segundo])


# CP11: consultar no registra nada
def test_consultar_no_registra_ningun_gasto(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    _consultar(client, auth_headers, viaje)
    listado = client.get(f"/api/v1/gastos/trips/{viaje.IdViaje}", headers=auth_headers)

    assert listado.json() == []


def test_compartido_sin_pagador_responde_400(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = _consultar(client, auth_headers, viaje, es_compartido="true")

    assert response.status_code == 400


def test_usuario_que_no_participa_del_viaje_no_puede_consultar(client, db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    ajeno = _crear_usuario(db_session, "ajeno")

    response = _consultar(client, _headers(ajeno), viaje)

    assert response.status_code in (403, 404)
