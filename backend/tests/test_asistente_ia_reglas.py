import asyncio
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.accion_asistente_viaje import AccionAsistenteViaje
from app.models.actividad_itinerario import ActividadItinerario
from app.models.categorias_checklist import CategoriasChecklist
from app.models.categorias_gastos import CategoriasGastos
from app.models.checklist import Checklist
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.gasto import Gasto
from app.models.lugar_interes import LugarInteres
from app.models.lugar_interes_viaje import LugarInteresViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.participantes_gastos import ParticipantesGastos
from app.models.rol_participante import RolParticipante
from app.models.usuario import Usuario
from app.models.votacion import TipoVotacionEnum, Votacion
from app.services.assistant_ai import orchestrator, tools
from app.services.assistant_ai.gemini import AssistantAIError
from app.services.assistant_ai.schemas import AssistantIntent


class _ClienteGuionado:
    def __init__(self, decision):
        self.decision = decision

    async def decide(self, message, context):
        if callable(self.decision):
            return self.decision(message, context)
        return self.decision


def _guion(monkeypatch, decision):
    monkeypatch.setattr(orchestrator, "get_assistant_client", lambda: _ClienteGuionado(decision))


def _intent(**campos):
    base = {
        "intent": "crear_checklist",
        "confidence": 0.9,
        "payload": {},
        "missingFields": [],
        "clarifyingQuestion": None,
        "response": None,
    }
    base.update(campos)
    return base


def _ejecutar(db_session, viaje, usuario, tipo, payload):
    return asyncio.run(
        tools.execute_assistant_action(
            db_session, viaje=viaje, current_user=usuario, action_type=tipo, payload=payload
        )
    )


def _error_ejecutar(db_session, viaje, usuario, tipo, payload):
    with pytest.raises(HTTPException) as error:
        _ejecutar(db_session, viaje, usuario, tipo, payload)
    return error.value


def _dias(db_session, viaje, cantidad=2):
    dias = [
        DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, i), IndiceDia=i)
        for i in range(1, cantidad + 1)
    ]
    db_session.add_all(dias)
    db_session.commit()
    return dias


def _gasto(**extra):
    payload = {"nombre": "Taxi", "monto": "100", "categoria": "Comida", "moneda": "ARS"}
    payload.update(extra)
    return payload


def _url(viaje):
    return f"/api/v1/trips/{viaje.IdViaje}/assistant/messages"


@pytest.fixture()
def asistente_habilitado(db_session, usuario_activo):
    usuario_activo.ConsienteAsistenteIA = True
    db_session.commit()
    return usuario_activo


@pytest.fixture()
def otros_participantes(db_session, viaje_con_admin):
    viaje, _ = viaje_con_admin
    rol = db_session.query(RolParticipante).filter_by(Nombre="participante").one()
    aceptado = db_session.query(EstadoParticipacion).filter_by(Nombre="aceptado").one()
    participaciones = []
    for i in (1, 2):
        usuario = Usuario(
            Nombre=f"Otro{i}",
            Apellido="Test",
            NombreUsuario=f"otro_{i}",
            Email=f"otro{i}@test.com",
            HashedPassword=hash_password("Password123!"),
            Activo=True,
            EmailConfirmado=True,
        )
        db_session.add(usuario)
        db_session.flush()
        participacion = ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario.IdUsuario,
            IdRolParticipante=rol.IdRolParticipante,
            IdEstadoParticipacion=aceptado.IdEstadoParticipacion,
        )
        db_session.add(participacion)
        participaciones.append(participacion)
    db_session.commit()
    return participaciones


@pytest.mark.parametrize(
    ("payload", "claves", "default", "esperado"),
    [
        ({"Nombre": "Kayak"}, ("nombre",), None, "Kayak"),
        ({"nombre": ""}, ("nombre",), "otro", "otro"),
        ({"nombre": None, "titulo": "Plan"}, ("nombre", "titulo"), None, "Plan"),
    ],
)
def test_payload_value_ignora_mayusculas_y_vacios(payload, claves, default, esperado):
    assert tools._payload_value(payload, *claves, default=default) == esperado


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [
        ({"datos": {"Monto": "5"}}, "5"),
        ({"monto": {"value": "7"}}, "7"),
        ([{"x": 1}, {"monto": "9"}], "9"),
        ({"otro": 1}, None),
    ],
)
def test_deep_payload_value_busca_en_estructuras_anidadas(valor, esperado):
    assert tools._deep_payload_value(valor, "monto") == esperado


def test_strip_accents():
    assert tools._strip_accents("Ñandú Árbol Pingüino") == "nandu arbol pinguino"


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [("pagué $ 10.000 de taxi", "10.000"), ("sin monto", None), (None, None)],
)
def test_extrae_el_primer_monto_del_texto(texto, esperado):
    assert tools._extract_first_money_from_text(texto) == esperado


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("cena en el restaurante La Cabrera", "Cena en restaurante La Cabrera"),
        ("Almuerzo.", "Almuerzo"),
        ("quiero visitar a la Catedral", "la Catedral"),
        ("actividad de surf", "surf"),
        ("agrega al viaje en el dia 2 kayak", "kayak"),
        ("hola", None),
        (None, None),
    ],
)
def test_extrae_el_nombre_de_la_actividad_del_texto(texto, esperado):
    assert tools._extract_activity_name_from_text(texto) == esperado


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("cena en el restaurante La Cabrera", "restaurante La Cabrera"),
        ("ubicacion Plaza Mayor", "Plaza Mayor"),
        ("hola", None),
        (None, None),
    ],
)
def test_extrae_la_ubicacion_de_la_actividad_del_texto(texto, esperado):
    assert tools._extract_activity_location_from_text(texto) == esperado


@pytest.mark.parametrize(
    ("valor", "default", "esperado"),
    [
        (None, True, True),
        (True, False, True),
        (0, True, False),
        (2, False, True),
        ("Sí", False, True),
        (" no ", True, False),
        ("quizas", True, True),
    ],
)
def test_parse_bool(valor, default, esperado):
    assert tools._parse_bool(valor, default) is esperado


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("$ 10.000", "10000"),
        ("1.234,56", "1234.56"),
        ("1,234.56", "1234.56"),
        ("10,000", "10000"),
        ("10,5", "10.5"),
        ("1.000.000", "1000000"),
        ("10.50", "10.50"),
        ("USD 45", "45"),
    ],
)
def test_normaliza_montos_con_formatos_locales(texto, esperado):
    assert tools._normalize_money_text(texto) == esperado


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [("09:30", time(9, 30)), (None, time(10, 0))],
)
def test_parse_time(valor, esperado):
    assert tools._parse_time(valor, "10:00") == esperado


@pytest.mark.parametrize("valor", ["abc", "25:00", "9"])
def test_parse_time_invalido(valor):
    with pytest.raises(HTTPException) as error:
        tools._parse_time(valor, "10:00")
    assert error.value.status_code == 400


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [
        ("10.000", Decimal("10000.00")),
        ({"valor": "$ 50"}, Decimal("50.00")),
        ([{"monto": "20,5"}], Decimal("20.50")),
    ],
)
def test_decimal_desde_payload(valor, esperado):
    assert tools._decimal_from_payload(valor, "El monto") == esperado


@pytest.mark.parametrize(
    ("valor", "mensaje"),
    [
        (None, "numerico"),
        ("abc", "numerico"),
        ("0", "mayor a cero"),
        ("-5", "mayor a cero"),
    ],
)
def test_decimal_desde_payload_invalido(valor, mensaje):
    with pytest.raises(HTTPException) as error:
        tools._decimal_from_payload(valor, "El monto")
    assert mensaje in error.value.detail


def test_resolver_fecha():
    assert tools._resolve_date(None) == date.today()
    assert tools._resolve_date("2026-01-05T10:00:00") == date(2026, 1, 5)


@pytest.mark.parametrize(
    ("valor", "mensaje"),
    [("nope", "no es valida"), ((date.today() + timedelta(days=1)).isoformat(), "futura")],
)
def test_resolver_fecha_invalida(valor, mensaje):
    with pytest.raises(HTTPException) as error:
        tools._resolve_date(valor)
    assert mensaje in error.value.detail


def test_payload_json_ida_y_vuelta():
    assert tools.loads_payload(tools.dumps_payload({"fecha": date(2026, 1, 1)})) == {"fecha": "2026-01-01"}
    assert tools.loads_payload("[1, 2]") == {}


def test_normalizar_conversacion_filtra_y_recorta():
    conversacion = [
        {"role": "system", "text": "x"},
        {"role": "user", "text": "   "},
        {"role": "ASSISTANT", "text": "hola"},
        {"role": "user", "text": "a" * 800},
    ]

    assert orchestrator._normalize_conversation(conversacion) == [
        {"role": "assistant", "text": "hola"},
        {"role": "user", "text": "a" * 700},
    ]
    assert orchestrator._normalize_conversation(None) == []


def test_normalizar_conversacion_toma_los_ultimos_12():
    conversacion = [{"role": "user", "text": str(i)} for i in range(20)]

    resultado = orchestrator._normalize_conversation(conversacion)

    assert len(resultado) == 12
    assert resultado[0]["text"] == "8"


def test_texto_de_conversacion():
    assert orchestrator._conversation_text([{"role": "user", "text": "hola"}], "chau") == "user: hola\nuser: chau"


def test_coerce_intent_formato_nuevo():
    intent = orchestrator._coerce_intent(_intent(payload={"nombre": "X"}))

    assert intent.intent == "crear_checklist"
    assert intent.payload == {"nombre": "X"}


def test_coerce_intent_formato_legado_respuesta():
    intent = orchestrator._coerce_intent({"tipo": "respuesta", "mensaje": "Hola", "accion": None})

    assert intent.intent == "respuesta"
    assert intent.response == "Hola"


def test_coerce_intent_formato_legado_accion():
    intent = orchestrator._coerce_intent(
        {
            "tipo": "accion",
            "mensaje": "Puedo",
            "accion": {"type": "crear_checklist", "label": "Crear", "payload": {"nombre": "Y"}},
        }
    )

    assert intent.intent == "crear_checklist"
    assert intent.payload == {"nombre": "Y"}


@pytest.mark.parametrize(
    ("campos", "esperado"),
    [
        ({}, None),
        ({"missingFields": ["fechaCierre", " "]}, "Necesito que completes: fechaCierre."),
        ({"missingFields": ["monto"], "clarifyingQuestion": "¿Cuánto fue?"}, "¿Cuánto fue?"),
    ],
)
def test_mensaje_de_campos_faltantes(campos, esperado):
    intent = AssistantIntent.model_validate(_intent(**campos))

    assert orchestrator._missing_fields_message(intent) == esperado


@pytest.mark.parametrize(
    ("tipo", "payload", "esperado"),
    [
        ("crear_actividad", {"nombre": "Kayak"}, "Agregar actividad: Kayak"),
        ("registrar_gasto", {}, "Registrar gasto"),
        ("otra", {"titulo": "X"}, "Confirmar accion: X"),
    ],
)
def test_etiqueta_de_accion(tipo, payload, esperado):
    assert orchestrator._action_label(tipo, payload) == esperado


@pytest.mark.parametrize(
    ("tipo", "payload", "esperado"),
    [
        ("registrar_gasto", {"nombre": "Taxi", "monto": "500", "moneda": "ARS"}, "Puedo registrar Taxi por 500 ARS."),
        ("registrar_gasto", {}, "Puedo registrar el gasto."),
        ("crear_actividad", {"nombre": "Cena", "ubicacion": "La Cabrera"}, "Puedo agregar Cena en La Cabrera."),
        ("crear_actividad", {"nombre": "Cena en La Cabrera", "ubicacion": "La Cabrera"}, "Puedo agregar Cena en La Cabrera. Te"),
        ("crear_checklist", {"nombre": "Pasaportes"}, "la tarea Pasaportes"),
        ("crear_votacion", {}, "la votacion indicada"),
        ("generar_ruta_dia", {"dayIndex": 2}, "ruta del dia 2"),
        ("otra", {}, "Puedo realizar la accion"),
    ],
)
def test_mensaje_de_confirmacion(tipo, payload, esperado):
    assert esperado in orchestrator._confirmation_message(tipo, payload)


@pytest.mark.parametrize(
    ("tipo", "payload", "esperado"),
    [
        ("registrar_gasto", {"nombre": "gasto", "categoria": "Comida"}, "concepto"),
        ("registrar_gasto", {"nombre": "Taxi"}, "categoria"),
        ("registrar_gasto", {"nombre": "Taxi", "idCategoria": 3}, None),
        ("crear_actividad", {"nombre": "actividad"}, "nombre o descripcion"),
        ("crear_actividad", {"nombre": "actividad", "ubicacion": "Museo"}, None),
        ("crear_checklist", {}, "nombre de la tarea"),
        ("crear_checklist", {"nombre": "Pasaportes"}, None),
        ("crear_votacion", {}, "titulo"),
        ("crear_votacion", {"titulo": "X", "propuestas": ["a"]}, "dos opciones"),
        ("crear_votacion", {"titulo": "X", "propuestas": "a, b"}, "dos opciones"),
        ("crear_votacion", {"titulo": "X", "propuestas": ["a", "b"]}, None),
        ("generar_ruta_dia", {}, "que dia"),
        ("generar_ruta_dia", {"dia": 1}, None),
        ("otra", {}, None),
    ],
)
def test_validacion_de_payload(tipo, payload, esperado):
    resultado = orchestrator._validate_action_payload(tipo, payload)

    if esperado is None:
        assert resultado is None
    else:
        assert esperado in resultado


def test_accion_no_permitida(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin

    error = _error_ejecutar(db_session, viaje, usuario_activo, "borrar_viaje", {})

    assert error.status_code == 400


def test_actividad_sin_dias_en_el_itinerario(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin

    error = _error_ejecutar(db_session, viaje, usuario_activo, "crear_actividad", {"nombre": "Kayak"})

    assert error.status_code == 404


@pytest.mark.parametrize(
    ("payload", "indice_esperado"),
    [
        ({"nombre": "Kayak"}, 0),
        ({"nombre": "Kayak", "_userMessage": "agregalo el día 2"}, 1),
    ],
)
def test_actividad_resuelve_el_dia(db_session, viaje_con_admin, usuario_activo, payload, indice_esperado):
    viaje, _ = viaje_con_admin
    dias = _dias(db_session, viaje)

    _ejecutar(db_session, viaje, usuario_activo, "crear_actividad", payload)

    actividad = db_session.query(ActividadItinerario).one()
    assert actividad.IdDiaCronograma == dias[indice_esperado].IdDiaCronograma
    assert actividad.HoraInicio == time(10, 0)
    assert actividad.HoraFin == time(11, 0)


def test_actividad_por_id_de_dia(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    dias = _dias(db_session, viaje)

    _ejecutar(db_session, viaje, usuario_activo, "crear_actividad", {"nombre": "Kayak", "dayId": dias[1].IdDiaCronograma})

    assert db_session.query(ActividadItinerario).one().IdDiaCronograma == dias[1].IdDiaCronograma


@pytest.mark.parametrize(
    ("payload", "mensaje"),
    [
        ({"nombre": "Kayak", "horaInicio": "12:00", "horaFin": "11:00"}, "posterior"),
        ({"nombre": "Kayak", "horaInicio": "doce"}, "HH:MM"),
        ({"nombre": "Kayak", "idLugarInteresViaje": 9999}, "no pertenece al viaje"),
        ({"nombre": "Kayak", "idLugarInteres": 9999}, "no existe"),
    ],
)
def test_actividad_invalida(db_session, viaje_con_admin, usuario_activo, payload, mensaje):
    viaje, _ = viaje_con_admin
    _dias(db_session, viaje)

    error = _error_ejecutar(db_session, viaje, usuario_activo, "crear_actividad", payload)

    assert error.status_code == 400
    assert mensaje in error.detail


def test_actividad_con_lugar_existente_toma_su_nombre(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _dias(db_session, viaje)
    lugar = LugarInteres(
        GooglePlaceId="google:prado", Nombre="Museo del Prado", Direccion="Madrid", Lat=40.4, Lng=-3.7, Categoria="Museo"
    )
    db_session.add(lugar)
    db_session.commit()

    _ejecutar(db_session, viaje, usuario_activo, "crear_actividad", {"nombre": "actividad", "idLugarInteres": lugar.IdLugarInteres})

    actividad = db_session.query(ActividadItinerario).one()
    assert actividad.IdLugarInteres == lugar.IdLugarInteres
    assert actividad.Nombre == "Museo del Prado"


def test_actividad_con_lugar_de_google_lo_guarda_en_el_viaje(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _dias(db_session, viaje)

    _ejecutar(
        db_session,
        viaje,
        usuario_activo,
        "crear_actividad",
        {"nombre": "Visita", "ubicacion": "Museo Reina Sofia", "placeId": "google:reina", "lat": 40.4, "lng": -3.69},
    )

    lugar = db_session.query(LugarInteres).filter_by(GooglePlaceId="google:reina").one()
    lugar_viaje = db_session.query(LugarInteresViaje).filter_by(IdViaje=viaje.IdViaje).one()
    assert lugar_viaje.IdLugarInteres == lugar.IdLugarInteres
    assert db_session.query(ActividadItinerario).one().IdLugarInteresViaje == lugar_viaje.IdLugarInteresViaje


def test_actividad_con_lugar_desconocido_crea_uno_aproximado_sin_duplicar(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _dias(db_session, viaje)
    payload = {"nombre": "Visita", "ubicacion": "Museo del Prádo"}

    _ejecutar(db_session, viaje, usuario_activo, "crear_actividad", payload)
    _ejecutar(db_session, viaje, usuario_activo, "crear_actividad", payload)

    lugares = db_session.query(LugarInteres).filter_by(GooglePlaceId=f"assistant:{viaje.IdViaje}:museo-del-prado").all()
    assert len(lugares) == 1
    assert db_session.query(LugarInteresViaje).filter_by(IdViaje=viaje.IdViaje).count() == 1
    assert db_session.query(ActividadItinerario).count() == 2


def test_tarea_sin_categorias_disponibles(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin

    error = _error_ejecutar(db_session, viaje, usuario_activo, "crear_checklist", {"nombre": "Pasaportes"})

    assert error.status_code == 500


def test_tarea_por_id_de_categoria(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    categoria = CategoriasChecklist(Nombre="Documentacion", Activo=True)
    db_session.add(categoria)
    db_session.commit()

    _ejecutar(
        db_session,
        viaje,
        usuario_activo,
        "crear_checklist",
        {"nombre": "Pasaportes", "idCategoriaChecklist": categoria.IdCategoriaChecklist},
    )

    assert db_session.query(Checklist).one().IdCategoriaChecklist == categoria.IdCategoriaChecklist


def test_tarea_sin_categoria_usa_la_primera_activa(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    zeta = CategoriasChecklist(Nombre="Zeta", Activo=True)
    alfa = CategoriasChecklist(Nombre="Alfa", Activo=True)
    db_session.add_all([zeta, alfa])
    db_session.commit()

    _ejecutar(db_session, viaje, usuario_activo, "crear_checklist", {"nombre": "Pasaportes", "categoria": "Inexistente"})

    assert db_session.query(Checklist).one().IdCategoriaChecklist == alfa.IdCategoriaChecklist


def test_gasto_en_otra_moneda_se_convierte(db_session, viaje_con_admin, usuario_activo, categoria_gasto, monkeypatch):
    viaje, _ = viaje_con_admin
    monkeypatch.setattr(tools, "obtener_tipo_cambio", lambda origen, destino, fecha=None: 1000)

    _ejecutar(db_session, viaje, usuario_activo, "registrar_gasto", _gasto(monto="10", moneda="usd"))

    gasto = db_session.query(Gasto).one()
    assert gasto.MonedaOriginal == "USD"
    assert gasto.MontoOriginal == Decimal("10.00")
    assert gasto.Monto == Decimal("10000.00")


def test_gasto_sin_cotizacion_disponible(db_session, viaje_con_admin, usuario_activo, categoria_gasto, monkeypatch):
    viaje, _ = viaje_con_admin

    def _falla(*args, **kwargs):
        raise RuntimeError("sin servicio")

    monkeypatch.setattr(tools, "obtener_tipo_cambio", _falla)

    error = _error_ejecutar(db_session, viaje, usuario_activo, "registrar_gasto", _gasto(moneda="USD"))

    assert error.status_code == 503


def test_gasto_divide_entre_todos_y_ajusta_el_redondeo(
    db_session, viaje_con_admin, usuario_activo, categoria_gasto, otros_participantes
):
    viaje, participante_admin = viaje_con_admin

    _ejecutar(db_session, viaje, usuario_activo, "registrar_gasto", _gasto())

    gasto = db_session.query(Gasto).one()
    asignaciones = {
        a.IdParticipanteViaje: a.MontoAsignado
        for a in db_session.query(ParticipantesGastos).filter_by(IdGasto=gasto.IdGasto)
    }
    assert len(asignaciones) == 3
    assert sum(asignaciones.values()) == Decimal("100.00")
    assert sorted(asignaciones.values()) == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]


def test_gasto_no_compartido_queda_a_cargo_del_pagador(
    db_session, viaje_con_admin, usuario_activo, categoria_gasto, otros_participantes
):
    viaje, participante_admin = viaje_con_admin

    _ejecutar(db_session, viaje, usuario_activo, "registrar_gasto", _gasto(esCompartido="no"))

    gasto = db_session.query(Gasto).one()
    asignacion = db_session.query(ParticipantesGastos).filter_by(IdGasto=gasto.IdGasto).one()
    assert asignacion.IdParticipanteViaje == participante_admin.IdParticipanteViaje
    assert gasto.TipoDivision is None


def test_gasto_entre_participantes_elegidos(db_session, viaje_con_admin, usuario_activo, categoria_gasto, otros_participantes):
    viaje, participante_admin = viaje_con_admin
    elegidos = [participante_admin.IdParticipanteViaje, otros_participantes[0].IdParticipanteViaje]

    _ejecutar(
        db_session, viaje, usuario_activo, "registrar_gasto", _gasto(dividirEntreTodos="no", idParticipantes=elegidos)
    )

    gasto = db_session.query(Gasto).one()
    montos = [a.MontoAsignado for a in db_session.query(ParticipantesGastos).filter_by(IdGasto=gasto.IdGasto)]
    assert montos == [Decimal("50.00"), Decimal("50.00")]


def test_gasto_pagado_por_otro_participante(db_session, viaje_con_admin, usuario_activo, categoria_gasto, otros_participantes):
    viaje, _ = viaje_con_admin
    pagador = otros_participantes[0]

    _ejecutar(db_session, viaje, usuario_activo, "registrar_gasto", _gasto(idPagador=pagador.IdParticipanteViaje))

    assert db_session.query(Gasto).one().IdPagador == pagador.IdParticipanteViaje


def test_gasto_con_categoria_por_coincidencia_parcial(db_session, viaje_con_admin, usuario_activo, categoria_gasto):
    viaje, _ = viaje_con_admin

    _ejecutar(db_session, viaje, usuario_activo, "registrar_gasto", _gasto(categoria="comid"))

    assert db_session.query(Gasto).one().IdCategoria == categoria_gasto.IdCategoria


def test_gasto_con_id_de_categoria(db_session, viaje_con_admin, usuario_activo, categoria_gasto):
    viaje, _ = viaje_con_admin
    otra = CategoriasGastos(Nombre="Transporte", Activo=True)
    db_session.add(otra)
    db_session.commit()

    _ejecutar(db_session, viaje, usuario_activo, "registrar_gasto", _gasto(categoria=None, idCategoria=otra.IdCategoria))

    assert db_session.query(Gasto).one().IdCategoria == otra.IdCategoria


@pytest.mark.parametrize(
    ("extra", "mensaje"),
    [
        ({"categoria": "Hospedaje"}, "No pude asociar la categoria"),
        ({"categoria": None}, "debe indicar una categoria"),
        ({"nombre": "Nuevo gasto"}, "concepto del gasto"),
        ({"idPagador": 9999}, "pagador indicado"),
        ({"dividirEntreTodos": "no", "idParticipantes": [9999, 9998]}, "participantes invalidos"),
        ({"fecha": (date.today() + timedelta(days=1)).isoformat()}, "futura"),
    ],
)
def test_gasto_invalido(db_session, viaje_con_admin, usuario_activo, categoria_gasto, otros_participantes, extra, mensaje):
    viaje, _ = viaje_con_admin

    error = _error_ejecutar(db_session, viaje, usuario_activo, "registrar_gasto", _gasto(**extra))

    assert error.status_code == 400
    assert mensaje in error.detail
    assert db_session.query(Gasto).count() == 0


def test_gasto_entre_elegidos_necesita_al_menos_dos(db_session, viaje_con_admin, usuario_activo, categoria_gasto):
    viaje, participante_admin = viaje_con_admin

    error = _error_ejecutar(
        db_session,
        viaje,
        usuario_activo,
        "registrar_gasto",
        _gasto(dividirEntreTodos="no", idParticipantes=[participante_admin.IdParticipanteViaje]),
    )

    assert "al menos dos" in error.detail


@pytest.mark.parametrize(
    ("payload", "mensaje"),
    [
        ({"titulo": "X", "propuestas": ["a", "  "]}, "al menos dos propuestas"),
        ({"titulo": "X", "propuestas": ["a", "b"], "fechaCierre": "mañana"}, "no es valida"),
        ({"titulo": "X", "propuestas": ["a", "b"], "fechaCierre": "2020-01-01T10:00:00"}, "debe ser futura"),
    ],
)
def test_votacion_invalida(db_session, viaje_con_admin, usuario_activo, payload, mensaje):
    viaje, _ = viaje_con_admin

    error = _error_ejecutar(db_session, viaje, usuario_activo, "crear_votacion", payload)

    assert error.status_code == 400
    assert mensaje in error.detail


def test_votacion_con_fecha_sin_zona_y_tipo_invalido(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    cierre = (datetime.now() + timedelta(days=2)).replace(microsecond=0).isoformat()

    _ejecutar(
        db_session,
        viaje,
        usuario_activo,
        "crear_votacion",
        {"titulo": "Excursion", "propuestas": ["Catedral", "Castillo"], "fechaCierre": cierre, "tipo": "ranking"},
    )

    votacion = db_session.query(Votacion).one()
    assert votacion.Tipo == TipoVotacionEnum.opcion_unica


def test_ruta_sin_servicio_de_rutas(db_session, viaje_con_admin, usuario_activo, monkeypatch):
    viaje, _ = viaje_con_admin
    _dias(db_session, viaje, 1)
    monkeypatch.setattr(tools, "generar_ruta_diaria", None)

    error = _error_ejecutar(db_session, viaje, usuario_activo, "generar_ruta_dia", {"dia": 1})

    assert error.status_code == 503


def _error_ruta(clase, mensaje):
    error = clase.__new__(clase)
    Exception.__init__(error, mensaje)
    error.message = mensaje
    return error


@pytest.mark.parametrize(
    ("nombre_clase", "status_esperado"),
    [("RutaValidationError", 422), ("RutaModoInvalidoError", 422), ("RutaProviderError", 502)],
)
def test_ruta_traduce_los_errores_del_servicio(
    db_session, viaje_con_admin, usuario_activo, monkeypatch, nombre_clase, status_esperado
):
    viaje, _ = viaje_con_admin
    _dias(db_session, viaje, 1)
    error_servicio = _error_ruta(getattr(tools, nombre_clase), "No se pudo armar la ruta")

    async def _falla(db, dia, modo):
        raise error_servicio

    monkeypatch.setattr(tools, "generar_ruta_diaria", _falla)

    error = _error_ejecutar(db_session, viaje, usuario_activo, "generar_ruta_dia", {"dia": 1})

    assert error.status_code == status_esperado
    assert "No se pudo armar la ruta" in error.detail


def test_asistente_deshabilitado(client, auth_headers, viaje_con_admin, asistente_habilitado, monkeypatch):
    viaje, _ = viaje_con_admin
    monkeypatch.setattr(settings, "ai_assistant_enabled", False)

    respuesta = client.post(_url(viaje), json={"message": "hola"}, headers=auth_headers)

    assert respuesta.status_code == 503


def test_falla_del_proveedor_de_ia(client, auth_headers, viaje_con_admin, asistente_habilitado, monkeypatch):
    viaje, _ = viaje_con_admin

    def _falla(message, context):
        raise AssistantAIError("timeout")

    _guion(monkeypatch, _falla)

    respuesta = client.post(_url(viaje), json={"message": "hola"}, headers=auth_headers)

    assert respuesta.status_code == 502


def test_respuesta_sin_texto_usa_el_mensaje_por_defecto(client, auth_headers, viaje_con_admin, asistente_habilitado, monkeypatch):
    viaje, _ = viaje_con_admin
    _guion(monkeypatch, _intent(intent="respuesta"))

    respuesta = client.post(_url(viaje), json={"message": "hola"}, headers=auth_headers)

    assert respuesta.status_code == 200
    assert respuesta.json()["message"].startswith("Puedo ayudarte con el viaje")


def test_campos_faltantes_devuelven_la_pregunta_sin_proponer(
    client, db_session, auth_headers, viaje_con_admin, asistente_habilitado, monkeypatch
):
    viaje, _ = viaje_con_admin
    _guion(
        monkeypatch,
        _intent(intent="crear_votacion", missingFields=["fechaCierre"], clarifyingQuestion="¿Cuándo cierra la votación?"),
    )

    respuesta = client.post(_url(viaje), json={"message": "armemos una votacion"}, headers=auth_headers)

    assert respuesta.json()["message"] == "¿Cuándo cierra la votación?"
    assert respuesta.json()["suggestedAction"] is None
    assert db_session.query(AccionAsistenteViaje).count() == 0


def test_payload_invalido_no_propone_accion(client, db_session, auth_headers, viaje_con_admin, asistente_habilitado, monkeypatch):
    viaje, _ = viaje_con_admin
    _guion(monkeypatch, _intent(intent="crear_votacion", payload={"titulo": "X", "propuestas": ["a"]}))

    respuesta = client.post(_url(viaje), json={"message": "votacion"}, headers=auth_headers)

    assert "dos opciones" in respuesta.json()["message"]
    assert db_session.query(AccionAsistenteViaje).count() == 0


def test_confirmar_accion_inexistente(client, auth_headers, viaje_con_admin, asistente_habilitado):
    viaje, _ = viaje_con_admin

    respuesta = client.post(_url(viaje), json={"confirmActionId": "no-existe"}, headers=auth_headers)

    assert respuesta.status_code == 404


def _proponer_tarea(client, db_session, auth_headers, viaje, monkeypatch):
    db_session.add(CategoriasChecklist(Nombre="General", Activo=True))
    db_session.commit()
    _guion(monkeypatch, _intent(payload={"nombre": "Pasaportes"}))
    respuesta = client.post(_url(viaje), json={"message": "tarea pasaportes"}, headers=auth_headers)
    return respuesta.json()["suggestedAction"]["id"]


def test_una_accion_no_se_puede_confirmar_dos_veces(
    client, db_session, auth_headers, viaje_con_admin, asistente_habilitado, monkeypatch
):
    viaje, _ = viaje_con_admin
    id_accion = _proponer_tarea(client, db_session, auth_headers, viaje, monkeypatch)

    primera = client.post(_url(viaje), json={"confirmActionId": id_accion}, headers=auth_headers)
    segunda = client.post(_url(viaje), json={"confirmActionId": id_accion}, headers=auth_headers)

    assert primera.status_code == 200
    assert segunda.status_code == 409
    assert db_session.query(Checklist).count() == 1


def test_otro_participante_no_puede_confirmar_la_accion_ajena(
    client, db_session, auth_headers, viaje_con_admin, asistente_habilitado, otros_participantes, monkeypatch
):
    viaje, _ = viaje_con_admin
    id_accion = _proponer_tarea(client, db_session, auth_headers, viaje, monkeypatch)
    otro = otros_participantes[0].Usuario
    otro.ConsienteAsistenteIA = True
    db_session.commit()
    headers_otro = {"Authorization": f"Bearer {create_access_token({'sub': otro.Email, 'user_id': otro.IdUsuario})}"}

    respuesta = client.post(_url(viaje), json={"confirmActionId": id_accion}, headers=headers_otro)

    assert respuesta.status_code == 404
    assert db_session.query(Checklist).count() == 0