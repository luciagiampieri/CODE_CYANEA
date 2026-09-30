"""US 86 - Configurar preferencias de planificación del viaje.

Cada test documenta el caso de prueba de la US al que corresponde.
"""

from datetime import date, timedelta

import pytest

from app.core.security import create_access_token, hash_password
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.preferencia_planificacion import PreferenciaPlanificacion
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.viaje import Viaje


def _url(viaje):
    return f"/api/v1/trips/{viaje.IdViaje}/preferencias-planificacion"


def _headers(usuario):
    token = create_access_token({"sub": usuario.Email, "user_id": usuario.IdUsuario})
    return {"Authorization": f"Bearer {token}"}


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


def _agregar_participante(db_session, viaje, usuario, estado="aceptado"):
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").first()
    estado_part = db_session.query(EstadoParticipacion).filter_by(Nombre=estado).first()
    participacion = ParticipanteViaje(
        IdViaje=viaje.IdViaje,
        IdUsuario=usuario.IdUsuario,
        IdRolParticipante=rol.IdRolParticipante,
        IdEstadoParticipacion=estado_part.IdEstadoParticipacion,
    )
    db_session.add(participacion)
    db_session.commit()
    return participacion


def _payload(maestros, intereses=("Gastronomía", "Naturaleza y aire libre"), ritmo="Moderado", **extra):
    payload = {
        "IdsIntereses": [maestros["intereses"][nombre] for nombre in intereses],
        "IdRitmoViaje": maestros["ritmos"][ritmo] if ritmo else None,
    }
    payload.update(extra)
    return payload


@pytest.fixture()
def contexto(viaje_con_admin, planificacion_master_data, usuario_activo, auth_headers):
    viaje, participacion = viaje_con_admin
    return {
        "viaje": viaje,
        "participacion": participacion,
        "maestros": planificacion_master_data,
        "usuario": usuario_activo,
        "headers": auth_headers,
    }


# ---------------------------------------------------------------------------
# Casos de prueba de la US
# ---------------------------------------------------------------------------


def test_configurar_preferencias_dos_intereses_ritmo_moderado_y_presupuesto_valido(client, contexto):
    """Pasa: dos intereses, ritmo moderado y presupuesto válido."""
    maestros = contexto["maestros"]
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(maestros, PresupuestoDiarioARS=45000, Consideraciones="Somos vegetarianos"),
        headers=contexto["headers"],
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["Configurada"] is True
    prefs = data["Preferencias"]
    assert set(prefs["IdsIntereses"]) == {
        maestros["intereses"]["Gastronomía"],
        maestros["intereses"]["Naturaleza y aire libre"],
    }
    assert prefs["IdRitmoViaje"] == maestros["ritmos"]["Moderado"]
    assert prefs["PresupuestoDiarioARS"] == 45000
    assert prefs["Consideraciones"] == "Somos vegetarianos"


def test_configurar_preferencias_sin_intereses_falla(client, contexto):
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"], intereses=()),
        headers=contexto["headers"],
    )
    assert response.status_code == 400
    assert "al menos un interés" in response.json()["detail"]


def test_configurar_preferencias_sin_ritmo_falla(client, contexto):
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"], ritmo=None),
        headers=contexto["headers"],
    )
    assert response.status_code == 400
    assert "ritmo" in response.json()["detail"]


def test_configurar_preferencias_presupuesto_cero_falla(client, contexto):
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"], PresupuestoDiarioARS=0),
        headers=contexto["headers"],
    )
    assert response.status_code == 400
    assert "mayor a cero" in response.json()["detail"]


def test_configurar_preferencias_presupuesto_negativo_falla(client, contexto):
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"], PresupuestoDiarioARS=-1500),
        headers=contexto["headers"],
    )
    assert response.status_code == 400
    assert "mayor a cero" in response.json()["detail"]


def test_configurar_preferencias_consideraciones_de_mas_de_300_caracteres_falla(client, contexto):
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"], Consideraciones="a" * 301),
        headers=contexto["headers"],
    )
    assert response.status_code == 400
    assert "300" in response.json()["detail"]


def test_configurar_preferencias_sin_presupuesto_ni_consideraciones(client, contexto):
    """Pasa: presupuesto y consideraciones son opcionales."""
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"]),
        headers=contexto["headers"],
    )
    assert response.status_code == 200, response.text
    prefs = response.json()["Preferencias"]
    assert prefs["PresupuestoDiarioARS"] is None
    assert prefs["Consideraciones"] is None


def test_modificar_preferencias_guardadas_refleja_los_cambios(client, db_session, contexto):
    maestros = contexto["maestros"]
    client.put(
        _url(contexto["viaje"]),
        json=_payload(maestros, PresupuestoDiarioARS=30000, Consideraciones="Movilidad reducida"),
        headers=contexto["headers"],
    )

    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(maestros, intereses=("Vida nocturna",), ritmo="Intenso", PresupuestoDiarioARS=80000),
        headers=contexto["headers"],
    )
    assert response.status_code == 200, response.text

    lectura = client.get(_url(contexto["viaje"]), headers=contexto["headers"]).json()["Preferencias"]
    assert lectura["IdsIntereses"] == [maestros["intereses"]["Vida nocturna"]]
    assert lectura["IdRitmoViaje"] == maestros["ritmos"]["Intenso"]
    assert lectura["PresupuestoDiarioARS"] == 80000
    assert lectura["Consideraciones"] is None
    # Se modifica la misma fila: no se crea una segunda preferencia.
    assert db_session.query(PreferenciaPlanificacion).count() == 1


def test_configurar_preferencias_en_viaje_finalizado_falla(client, db_session, contexto):
    viaje = contexto["viaje"]
    viaje.FechaInicio = date.today() - timedelta(days=10)
    viaje.FechaFin = date.today() - timedelta(days=1)
    db_session.commit()

    response = client.put(_url(viaje), json=_payload(contexto["maestros"]), headers=contexto["headers"])

    assert response.status_code == 409
    assert response.headers.get("X-Error-Code") == "TRIP_FINISHED"


def test_configurar_preferencias_en_viaje_con_estado_finalizado_falla(client, db_session, contexto):
    viaje = contexto["viaje"]
    viaje.IdEstadoViaje = db_session.query(EstadoViaje).filter_by(Nombre="finalizado").first().IdEstadoViaje
    db_session.commit()

    response = client.put(_url(viaje), json=_payload(contexto["maestros"]), headers=contexto["headers"])
    assert response.status_code == 409


def test_configurar_preferencias_usuario_que_no_participa_falla(client, db_session, contexto):
    ajeno = _crear_usuario(db_session, "ajeno")
    response = client.put(
        _url(contexto["viaje"]), json=_payload(contexto["maestros"]), headers=_headers(ajeno)
    )
    assert response.status_code == 403


@pytest.mark.parametrize("estado", ["salio", "invitado"])
def test_configurar_preferencias_participante_no_actual_falla(client, db_session, contexto, estado):
    """Solo los participantes actuales (aceptados) pueden configurar."""
    usuario = _crear_usuario(db_session, f"user_{estado}")
    _agregar_participante(db_session, contexto["viaje"], usuario, estado=estado)

    response = client.put(
        _url(contexto["viaje"]), json=_payload(contexto["maestros"]), headers=_headers(usuario)
    )
    assert response.status_code == 403


def test_preferencias_de_un_viaje_no_se_aplican_a_otro_viaje(client, db_session, contexto):
    """Pasa: las preferencias son por participante y por viaje (RNF-14)."""
    viaje = contexto["viaje"]
    otro_viaje = Viaje(
        Titulo="Otro viaje",
        FechaInicio=viaje.FechaInicio,
        FechaFin=viaje.FechaFin,
        IdEstadoViaje=viaje.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=contexto["usuario"].IdUsuario,
    )
    db_session.add(otro_viaje)
    db_session.flush()
    rol_admin = db_session.query(RolParticipante).filter_by(Nombre="administrador").first()
    db_session.add(
        ParticipanteViaje(
            IdViaje=otro_viaje.IdViaje,
            IdUsuario=contexto["usuario"].IdUsuario,
            IdRolParticipante=rol_admin.IdRolParticipante,
            IdEstadoParticipacion=contexto["participacion"].IdEstadoParticipacion,
        )
    )
    db_session.commit()

    client.put(_url(viaje), json=_payload(contexto["maestros"]), headers=contexto["headers"])

    response = client.get(_url(otro_viaje), headers=contexto["headers"])
    assert response.status_code == 200
    assert response.json()["Configurada"] is False
    assert response.json()["Preferencias"] is None


# ---------------------------------------------------------------------------
# Casos adicionales (robustez y lectura)
# ---------------------------------------------------------------------------


def test_preferencias_son_individuales_por_participante(client, db_session, contexto):
    maestros = contexto["maestros"]
    otro = _crear_usuario(db_session, "otro")
    _agregar_participante(db_session, contexto["viaje"], otro)

    client.put(_url(contexto["viaje"]), json=_payload(maestros), headers=contexto["headers"])

    response = client.get(_url(contexto["viaje"]), headers=_headers(otro))
    assert response.json()["Configurada"] is False


def test_obtener_preferencias_devuelve_opciones_ordenadas(client, contexto):
    response = client.get(_url(contexto["viaje"]), headers=contexto["headers"])

    assert response.status_code == 200
    data = response.json()
    assert data["Configurada"] is False
    assert data["PuedeEditar"] is True
    assert [i["Nombre"] for i in data["Opciones"]["Intereses"]] == [
        "Gastronomía",
        "Cultura e historia",
        "Naturaleza y aire libre",
        "Aventura",
        "Vida nocturna",
        "Compras",
        "Relax",
    ]
    assert [r["Nombre"] for r in data["Opciones"]["Ritmos"]] == ["Tranquilo", "Moderado", "Intenso"]
    assert data["Opciones"]["MaxCaracteresConsideraciones"] == 300


def test_obtener_preferencias_en_viaje_finalizado_no_permite_editar(client, db_session, contexto):
    viaje = contexto["viaje"]
    viaje.FechaInicio = date.today() - timedelta(days=10)
    viaje.FechaFin = date.today() - timedelta(days=1)
    db_session.commit()

    response = client.get(_url(viaje), headers=contexto["headers"])
    assert response.status_code == 200
    assert response.json()["PuedeEditar"] is False


def test_configurar_preferencias_con_interes_inexistente_falla(client, contexto):
    payload = _payload(contexto["maestros"])
    payload["IdsIntereses"].append(9999)
    response = client.put(_url(contexto["viaje"]), json=payload, headers=contexto["headers"])
    assert response.status_code == 400


def test_configurar_preferencias_con_ritmo_inexistente_falla(client, contexto):
    payload = _payload(contexto["maestros"])
    payload["IdRitmoViaje"] = 9999
    response = client.put(_url(contexto["viaje"]), json=payload, headers=contexto["headers"])
    assert response.status_code == 400


def test_configurar_preferencias_presupuesto_no_numerico_falla(client, contexto):
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"], PresupuestoDiarioARS="mucho"),
        headers=contexto["headers"],
    )
    assert response.status_code == 400
    assert "numérico" in response.json()["detail"]


def test_configurar_preferencias_intereses_repetidos_se_guardan_una_vez(client, contexto):
    maestros = contexto["maestros"]
    payload = _payload(maestros, intereses=("Relax", "Relax"))
    response = client.put(_url(contexto["viaje"]), json=payload, headers=contexto["headers"])
    assert response.status_code == 200
    assert response.json()["Preferencias"]["IdsIntereses"] == [maestros["intereses"]["Relax"]]


def test_configurar_preferencias_consideraciones_en_blanco_se_guardan_vacias(client, contexto):
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"], Consideraciones="   "),
        headers=contexto["headers"],
    )
    assert response.status_code == 200
    assert response.json()["Preferencias"]["Consideraciones"] is None


def test_configurar_preferencias_consideraciones_de_exactamente_300_caracteres(client, contexto):
    response = client.put(
        _url(contexto["viaje"]),
        json=_payload(contexto["maestros"], Consideraciones="a" * 300),
        headers=contexto["headers"],
    )
    assert response.status_code == 200


def test_configurar_preferencias_requiere_autenticacion(client, contexto):
    response = client.put(_url(contexto["viaje"]), json=_payload(contexto["maestros"]))
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Listado para Configuración: GET /users/me/preferencias-planificacion
# ---------------------------------------------------------------------------

URL_LISTADO = "/api/v1/users/me/preferencias-planificacion"


def _crear_viaje_para(db_session, usuario, titulo, inicio, fin, estado_viaje="activo", estado_part="aceptado"):
    estado = db_session.query(EstadoViaje).filter_by(Nombre=estado_viaje).first()
    viaje = Viaje(
        Titulo=titulo,
        FechaInicio=inicio,
        FechaFin=fin,
        IdEstadoViaje=estado.IdEstadoViaje,
        Moneda="ARS",
        IdAdministrador=usuario.IdUsuario,
    )
    db_session.add(viaje)
    db_session.commit()
    db_session.refresh(viaje)
    _agregar_participante(db_session, viaje, usuario, estado=estado_part)
    return viaje


def test_listado_muestra_viajes_vigentes_con_estado_de_configuracion(client, db_session, contexto):
    maestros = contexto["maestros"]
    usuario = contexto["usuario"]
    viaje = contexto["viaje"]
    otro = _crear_viaje_para(
        db_session, usuario, "Bariloche", date.today() + timedelta(days=5), date.today() + timedelta(days=9)
    )

    client.put(_url(viaje), json=_payload(maestros, intereses=("Relax",), ritmo="Tranquilo"), headers=contexto["headers"])

    response = client.get(URL_LISTADO, headers=contexto["headers"])

    assert response.status_code == 200
    data = response.json()
    # Ordenado por fecha de inicio: Bariloche (en 5 días) antes que el viaje de diciembre.
    assert [v["IdViaje"] for v in data] == [otro.IdViaje, viaje.IdViaje]
    assert data[0]["Configurada"] is False
    assert data[0]["Intereses"] == []
    assert data[1]["Configurada"] is True
    assert data[1]["Intereses"] == ["Relax"]
    assert data[1]["Ritmo"] == "Tranquilo"


def test_listado_excluye_viajes_finalizados_cancelados_y_sin_participacion_actual(client, db_session, contexto):
    usuario = contexto["usuario"]
    pasado = date.today() - timedelta(days=10)
    _crear_viaje_para(db_session, usuario, "Terminado", pasado, pasado + timedelta(days=3))
    futuro = date.today() + timedelta(days=30)
    _crear_viaje_para(db_session, usuario, "Cancelado", futuro, futuro, estado_viaje="cancelado")
    _crear_viaje_para(db_session, usuario, "Me fui", futuro, futuro, estado_part="salio")
    _crear_viaje_para(db_session, usuario, "Sin responder", futuro, futuro, estado_part="invitado")

    response = client.get(URL_LISTADO, headers=contexto["headers"])

    assert [v["Titulo"] for v in response.json()] == ["Viaje de test"]


def test_listado_no_incluye_viajes_de_otros_usuarios(client, db_session, contexto):
    ajeno = _crear_usuario(db_session, "ajeno2")
    response = client.get(URL_LISTADO, headers=_headers(ajeno))
    assert response.status_code == 200
    assert response.json() == []


def test_listado_requiere_autenticacion(client, contexto):
    assert client.get(URL_LISTADO).status_code == 401
