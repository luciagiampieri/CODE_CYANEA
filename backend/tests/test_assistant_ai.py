from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from app.core.config import settings
from app.models.actividad_itinerario import ActividadItinerario
from app.models.categorias_checklist import CategoriasChecklist
from app.models.categorias_gastos import CategoriasGastos
from app.models.checklist import Checklist
from app.models.dia_cronograma import DiaCronograma
from app.models.gasto import Gasto
from app.models.lugar_interes import LugarInteres
from app.models.lugar_interes_viaje import LugarInteresViaje
from app.models.participantes_gastos import ParticipantesGastos
from app.models.propuesta import Propuesta
from app.models.ruta_diaria import RutaDiaria
from app.models.votacion import Votacion


class _ScriptedAssistantClient:
    def __init__(self, decision):
        self.decision = decision

    async def decide(self, message, context):
        if callable(self.decision):
            return self.decision(message, context)
        return self.decision


def _usar_asistente_script(monkeypatch, decision):
    from app.services.assistant_ai import orchestrator

    monkeypatch.setattr(
        orchestrator,
        "get_assistant_client",
        lambda: _ScriptedAssistantClient(decision),
    )


def _habilitar_asistente(usuario, db_session):
    usuario.ConsienteAsistenteIA = True
    db_session.commit()


def _proponer_y_confirmar(client, auth_headers, viaje, mensaje):
    propuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": mensaje},
        headers=auth_headers,
    )
    assert propuesta.status_code == 200
    body = propuesta.json()
    assert body["requiresConfirmation"] is True

    confirmacion = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"confirmActionId": body["suggestedAction"]["id"]},
        headers=auth_headers,
    )
    assert confirmacion.status_code == 200
    assert confirmacion.json()["requiresConfirmation"] is False
    return body, confirmacion.json()


def test_assistant_requires_explicit_consent(client, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": "Sugerime una tarea"},
        headers=auth_headers,
    )

    assert response.status_code == 403
    assert response.headers["X-Error-Code"] == "AI_ASSISTANT_CONSENT_REQUIRED"


def test_assistant_mock_proposes_and_executes_checklist(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    monkeypatch.setattr(settings, "ai_assistant_provider", "mock")
    usuario_activo.ConsienteAsistenteIA = True
    categoria = CategoriasChecklist(Nombre="General", Activo=True)
    db_session.add(categoria)
    db_session.commit()
    viaje, _ = viaje_con_admin

    propuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": "Agrega una tarea de checklist para revisar pasaportes"},
        headers=auth_headers,
    )

    assert propuesta.status_code == 200
    body = propuesta.json()
    assert body["requiresConfirmation"] is True
    assert body["suggestedAction"]["type"] == "crear_checklist"

    confirmacion = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"confirmActionId": body["suggestedAction"]["id"]},
        headers=auth_headers,
    )

    assert confirmacion.status_code == 200
    assert confirmacion.json()["requiresConfirmation"] is False
    tarea = db_session.query(Checklist).filter_by(IdViaje=viaje.IdViaje).one()
    assert tarea.Nombre == body["suggestedAction"]["payload"]["nombre"]


def test_assistant_mock_proposes_and_executes_expense(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    categoria_gasto,
    monkeypatch,
):
    monkeypatch.setattr(settings, "ai_assistant_provider", "mock")
    usuario_activo.ConsienteAsistenteIA = True
    db_session.commit()
    viaje, _ = viaje_con_admin

    propuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": "Registrame un gasto"},
        headers=auth_headers,
    )

    assert propuesta.status_code == 200
    body = propuesta.json()
    assert body["requiresConfirmation"] is True
    assert body["suggestedAction"]["type"] == "registrar_gasto"

    confirmacion = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"confirmActionId": body["suggestedAction"]["id"]},
        headers=auth_headers,
    )

    assert confirmacion.status_code == 200
    gasto = db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).one()
    assert gasto.Nombre == "Comida cargada por asistente"
    assert gasto.IdCategoria == categoria_gasto.IdCategoria


def test_assistant_answer_for_recommendations_without_action(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "respuesta",
            "mensaje": "Para este viaje conviene reservar una manana para el casco historico.",
            "accion": None,
        },
    )
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": "Dame recomendaciones para el viaje"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requiresConfirmation"] is False
    assert body["suggestedAction"] is None
    assert "casco historico" in body["message"]


def test_assistant_executes_expense_with_chat_friendly_payload(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    categoria_gasto,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo registrar el gasto de 10000.",
            "accion": {
                "type": "registrar_gasto",
                "label": "Registrar gasto",
                "payload": {
                    "concepto": "Taxi aeropuerto",
                    "importe": "$ 10.000",
                    "categoria": categoria_gasto.Nombre,
                    "moneda": "ARS",
                    "esCompartido": "si",
                    "dividirEntreTodos": "si",
                },
            },
        },
    )
    viaje, participante = viaje_con_admin

    _proponer_y_confirmar(client, auth_headers, viaje, "Agrega un gasto de 10000")

    gasto = db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).one()
    assert gasto.Nombre == "Taxi aeropuerto"
    assert gasto.MontoOriginal == Decimal("10000.00")
    assert gasto.Monto == Decimal("10000.00")
    assert gasto.IdPagador == participante.IdParticipanteViaje
    asignacion = db_session.query(ParticipantesGastos).filter_by(IdGasto=gasto.IdGasto).one()
    assert asignacion.MontoAsignado == Decimal("10000.00")


def test_assistant_expense_uses_llm_inferred_concept_and_category(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    categoria = CategoriasGastos(Nombre="Transporte", Activo=True)
    db_session.add(categoria)
    db_session.commit()
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo registrar el taxi como gasto de transporte.",
            "accion": {
                "type": "registrar_gasto",
                "label": "Registrar taxi",
                "payload": {
                    "nombre": "Taxi aeropuerto",
                    "monto": "10000",
                    "categoria": "Transporte",
                    "moneda": "ARS",
                },
            },
        },
    )
    viaje, _ = viaje_con_admin

    _proponer_y_confirmar(client, auth_headers, viaje, "Registrá un taxi al aeropuerto de 10000")

    gasto = db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).one()
    assert gasto.Nombre == "Taxi aeropuerto"
    assert gasto.IdCategoria == categoria.IdCategoria


def test_assistant_expense_uses_conversation_history_to_complete_action(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    categoria = CategoriasGastos(Nombre="Transporte", Activo=True)
    db_session.add(categoria)
    db_session.commit()

    def _decision(message, context):
        history = context.get("conversacionReciente", [])
        assert any("taxi" in item["text"].lower() for item in history)
        assert "5000" in message
        return {
            "tipo": "accion",
            "mensaje": "Tengo los datos: registro taxi por 5000 pesos.",
            "accion": {
                "type": "registrar_gasto",
                "label": "Registrar taxi",
                "payload": {
                    "nombre": "Taxi",
                    "monto": "5000",
                    "categoria": "Transporte",
                    "moneda": "ARS",
                },
            },
        }

    _usar_asistente_script(monkeypatch, _decision)
    viaje, _ = viaje_con_admin

    propuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={
            "message": "5000 para el dia 2 del viaje",
            "conversation": [
                {
                    "role": "user",
                    "text": "registra un gasto por 5000 pesos en el viaje. fue por taxi mio",
                },
                {
                    "role": "assistant",
                    "text": "Puedo registrarlo, pero necesito el dia.",
                },
                {"role": "user", "text": "taxi"},
            ],
        },
        headers=auth_headers,
    )

    assert propuesta.status_code == 200
    body = propuesta.json()
    assert body["requiresConfirmation"] is True

    confirmacion = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"confirmActionId": body["suggestedAction"]["id"]},
        headers=auth_headers,
    )

    assert confirmacion.status_code == 200
    gasto = db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).one()
    assert gasto.Nombre == "Taxi"
    assert gasto.MontoOriginal == Decimal("5000.00")
    assert gasto.IdCategoria == categoria.IdCategoria


def test_assistant_uses_extracted_expense_intent(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    categoria = CategoriasGastos(Nombre="Transporte", Activo=True)
    db_session.add(categoria)
    db_session.commit()
    _usar_asistente_script(
        monkeypatch,
        {
            "intent": "registrar_gasto",
            "confidence": 0.93,
            "payload": {
                "nombre": "Taxi desde la Plaza a la Catedral",
                "monto": "5000",
                "categoria": "Transporte",
                "moneda": "ARS",
            },
            "missingFields": [],
            "clarifyingQuestion": None,
            "response": None,
        },
    )
    viaje, _ = viaje_con_admin

    propuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": "quiero cargar un gasto de 5000 por taxi desde la plaza a la catedral"},
        headers=auth_headers,
    )

    assert propuesta.status_code == 200
    body = propuesta.json()
    assert body["requiresConfirmation"] is True
    assert body["suggestedAction"]["type"] == "registrar_gasto"
    assert body["suggestedAction"]["payload"]["nombre"] == "Taxi desde la Plaza a la Catedral"
    assert body["suggestedAction"]["payload"]["categoria"] == "Transporte"

    confirmacion = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"confirmActionId": body["suggestedAction"]["id"]},
        headers=auth_headers,
    )

    assert confirmacion.status_code == 200
    gasto = db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).one()
    assert gasto.Nombre == "Taxi desde la Plaza a la Catedral"
    assert gasto.MontoOriginal == Decimal("5000.00")
    assert gasto.IdCategoria == categoria.IdCategoria


def test_assistant_extractor_uses_history_to_complete_expense_payload(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    categoria = CategoriasGastos(Nombre="Transporte", Activo=True)
    db_session.add(categoria)
    db_session.commit()
    _usar_asistente_script(
        monkeypatch,
        {
            "intent": "registrar_gasto",
            "confidence": 0.91,
            "payload": {
                "nombre": "Taxi desde la Plaza a la Catedral",
                "monto": "5000",
                "categoria": "Transporte",
                "moneda": "ARS",
            },
            "missingFields": [],
            "clarifyingQuestion": None,
            "response": None,
        },
    )
    viaje, _ = viaje_con_admin

    propuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={
            "message": "taxi",
            "conversation": [
                {
                    "role": "user",
                    "text": "quiero cargar un gasto de 5000 por taxi desde la plaza a la catedral",
                },
                {
                    "role": "assistant",
                    "text": "Necesito el concepto para nombrarlo y clasificarlo.",
                },
            ],
        },
        headers=auth_headers,
    )

    assert propuesta.status_code == 200
    body = propuesta.json()
    assert body["requiresConfirmation"] is True
    payload = body["suggestedAction"]["payload"]
    assert payload["nombre"] == "Taxi desde la Plaza a la Catedral"
    assert payload["monto"] == "5000"
    assert payload["categoria"] == "Transporte"


def test_assistant_expense_does_not_propose_generic_concept(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    categoria_gasto,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo registrar el gasto.",
            "accion": {
                "type": "registrar_gasto",
                "label": "Registrar gasto",
                "payload": {
                    "nombre": "Gasto registrado por IA",
                    "monto": "10000",
                    "categoria": categoria_gasto.Nombre,
                },
            },
        },
    )
    viaje, _ = viaje_con_admin

    response = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": "Registrá un gasto de 10000"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["requiresConfirmation"] is False
    assert body["suggestedAction"] is None
    assert db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).count() == 0


def test_assistant_expense_recovers_amount_from_nested_payload_or_message(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    categoria_gasto,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo registrar el gasto.",
            "accion": {
                "type": "registrar_gasto",
                "label": "Registrar gasto",
                "payload": {
                    "nombre": "Taxi aeropuerto",
                    "monto": {"valor": "$ 10.000", "moneda": "ARS"},
                    "categoria": categoria_gasto.Nombre,
                },
            },
        },
    )
    viaje, _ = viaje_con_admin

    _proponer_y_confirmar(client, auth_headers, viaje, "Registrá un gasto de 10000")

    gasto = db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).one()
    assert gasto.MontoOriginal == Decimal("10000.00")


def test_assistant_expense_asks_for_missing_amount_from_extractor(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    categoria_gasto,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo registrar el gasto.",
            "accion": {
                "type": "registrar_gasto",
                "label": "Registrar gasto",
                "payload": {
                    "nombre": "Taxi aeropuerto",
                    "categoria": categoria_gasto.Nombre,
                },
            },
        },
    )
    viaje, _ = viaje_con_admin

    _proponer_y_confirmar(client, auth_headers, viaje, "Registrá un gasto de 10000")

    gasto = db_session.query(Gasto).filter_by(IdViaje=viaje.IdViaje).one()
    assert gasto.MontoOriginal == Decimal("10000.00")


def test_assistant_executes_activity_on_requested_trip_day(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    viaje, _ = viaje_con_admin
    dia_1 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 1), IndiceDia=10)
    dia_2 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 2), IndiceDia=20)
    db_session.add_all([dia_1, dia_2])
    db_session.commit()
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo agregar la visita al dia 2.",
            "accion": {
                "type": "crear_actividad",
                "label": "Agregar actividad",
                "payload": {
                    "dia": "2",
                    "nombre": "Visita a la Catedral de Mallorca",
                    "horaInicio": "10:00",
                    "horaFin": "11:30",
                },
            },
        },
    )

    _proponer_y_confirmar(
        client,
        auth_headers,
        viaje,
        "Agrega al viaje en el dia 2 visita a la catedral de mallorca",
    )

    actividad = db_session.query(ActividadItinerario).one()
    assert actividad.IdDiaCronograma == dia_2.IdDiaCronograma
    assert actividad.Nombre == "Visita a la Catedral de Mallorca"
    assert actividad.HoraInicio == time(10, 0)
    assert actividad.HoraFin == time(11, 30)


def test_assistant_activity_recovers_name_and_location_from_message_and_saved_place(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    viaje, _ = viaje_con_admin
    dia_1 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 1), IndiceDia=1)
    dia_2 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 2), IndiceDia=2)
    lugar = LugarInteres(
        GooglePlaceId="google:catedral-mallorca",
        Nombre="Catedral de Mallorca",
        Direccion="Palma, Mallorca",
        Lat=39.567,
        Lng=2.648,
        Categoria="Catedral",
    )
    db_session.add_all([dia_1, dia_2, lugar])
    db_session.flush()
    lugar_viaje = LugarInteresViaje(
        IdViaje=viaje.IdViaje,
        IdLugarInteres=lugar.IdLugarInteres,
        IdUsuarioAlta=usuario_activo.IdUsuario,
    )
    db_session.add(lugar_viaje)
    db_session.commit()
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo agregar la actividad.",
            "accion": {
                "type": "crear_actividad",
                "label": "Agregar actividad",
                "payload": {
                    "nombre": "Visita a la Catedral de Mallorca",
                    "horaInicio": "10:00",
                    "horaFin": "11:00",
                    "ubicacion": "Catedral de Mallorca",
                },
            },
        },
    )

    _proponer_y_confirmar(
        client,
        auth_headers,
        viaje,
        "Agrega al viaje en el dia 2 visita a la Catedral de Mallorca",
    )

    actividad = db_session.query(ActividadItinerario).one()
    assert actividad.IdDiaCronograma == dia_2.IdDiaCronograma
    assert actividad.Nombre == "Visita a la Catedral de Mallorca"
    assert actividad.IdLugarInteresViaje == lugar_viaje.IdLugarInteresViaje


def test_assistant_uses_extracted_activity_intent(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    viaje, _ = viaje_con_admin
    dia_1 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 1), IndiceDia=1)
    dia_2 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 2), IndiceDia=2)
    db_session.add_all([dia_1, dia_2])
    db_session.commit()
    _usar_asistente_script(
        monkeypatch,
        {
            "intent": "crear_actividad",
            "confidence": 0.94,
            "payload": {
                "dayIndex": "2",
                "nombre": "Visita a la Catedral de Mallorca",
                "ubicacion": "Catedral de Mallorca",
                "horaInicio": "10:00",
                "horaFin": "11:00",
            },
            "missingFields": [],
            "clarifyingQuestion": None,
            "response": None,
        },
    )

    propuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": "agrega al viaje en el dia 2 visita a la catedral de mallorca"},
        headers=auth_headers,
    )

    assert propuesta.status_code == 200
    body = propuesta.json()
    assert body["requiresConfirmation"] is True
    assert body["suggestedAction"]["type"] == "crear_actividad"
    assert body["suggestedAction"]["payload"]["dayIndex"] == "2"

    confirmacion = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"confirmActionId": body["suggestedAction"]["id"]},
        headers=auth_headers,
    )

    assert confirmacion.status_code == 200
    actividad = db_session.query(ActividadItinerario).one()
    assert actividad.IdDiaCronograma == dia_2.IdDiaCronograma
    assert actividad.Nombre == "Visita a la Catedral de Mallorca"


def test_assistant_uses_extracted_meal_activity_with_location(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    viaje, _ = viaje_con_admin
    dia_1 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 1), IndiceDia=1)
    dia_2 = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 2), IndiceDia=2)
    db_session.add_all([dia_1, dia_2])
    db_session.commit()
    _usar_asistente_script(
        monkeypatch,
        {
            "intent": "crear_actividad",
            "confidence": 0.95,
            "payload": {
                "nombre": "Cena en Restaurante la Cabrera",
                "descripcion": "Cena en Restaurante la Cabrera",
                "dayIndex": "2",
                "ubicacion": "Restaurante la Cabrera",
                "horaInicio": "20:00",
                "horaFin": "22:00",
                "icono": "utensils",
            },
            "missingFields": [],
            "clarifyingQuestion": None,
            "response": None,
        },
    )

    propuesta = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"message": "registra una actividad de cena el dia 2 en el restaurante La Cabrera"},
        headers=auth_headers,
    )

    assert propuesta.status_code == 200
    body = propuesta.json()
    assert body["requiresConfirmation"] is True
    payload = body["suggestedAction"]["payload"]
    assert payload["nombre"] == "Cena en Restaurante la Cabrera"
    assert payload["ubicacion"] == "Restaurante la Cabrera"
    assert payload["dayIndex"] == "2"

    confirmacion = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/assistant/messages",
        json={"confirmActionId": body["suggestedAction"]["id"]},
        headers=auth_headers,
    )

    assert confirmacion.status_code == 200
    actividad = db_session.query(ActividadItinerario).one()
    assert actividad.IdDiaCronograma == dia_2.IdDiaCronograma
    assert actividad.Nombre == "Cena en Restaurante la Cabrera"
    assert actividad.Descripcion == "Cena en Restaurante la Cabrera"
    assert actividad.HoraInicio == time(20, 0)
    assert actividad.HoraFin == time(22, 0)
    assert actividad.IdLugarInteresViaje is not None
    assert actividad.LugarInteresViaje.LugarInteres.Nombre == "Restaurante la Cabrera"


def test_assistant_executes_checklist_with_category_name(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    categoria = CategoriasChecklist(Nombre="Documentacion", Activo=True)
    db_session.add(categoria)
    db_session.commit()
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo crear la tarea.",
            "accion": {
                "type": "crear_checklist",
                "label": "Crear tarea",
                "payload": {"nombre": "Revisar pasaportes", "categoria": "Documentacion"},
            },
        },
    )
    viaje, _ = viaje_con_admin

    _proponer_y_confirmar(client, auth_headers, viaje, "Agrega una tarea de pasaportes")

    tarea = db_session.query(Checklist).filter_by(IdViaje=viaje.IdViaje).one()
    assert tarea.Nombre == "Revisar pasaportes"
    assert tarea.IdCategoriaChecklist == categoria.IdCategoriaChecklist


def test_assistant_executes_voting_with_dict_proposals(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    fecha_cierre = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo crear la votacion.",
            "accion": {
                "type": "crear_votacion",
                "label": "Crear votacion",
                "payload": {
                    "titulo": "Elegir excursion",
                    "tipo": "opcion_multiple",
                    "fechaCierre": fecha_cierre,
                    "propuestas": [{"texto": "Catedral"}, {"texto": "Castillo de Bellver"}],
                },
            },
        },
    )
    viaje, _ = viaje_con_admin

    _proponer_y_confirmar(client, auth_headers, viaje, "Crea una votacion de excursiones")

    votacion = db_session.query(Votacion).filter_by(IdViaje=viaje.IdViaje).one()
    propuestas = db_session.query(Propuesta).filter_by(IdVotacion=votacion.IdVotacion).order_by(Propuesta.Orden).all()
    assert votacion.Titulo == "Elegir excursion"
    assert [item.Texto for item in propuestas] == ["Catedral", "Castillo de Bellver"]


def test_assistant_executes_route_generation_tuple_result(
    client,
    db_session,
    auth_headers,
    usuario_activo,
    viaje_con_admin,
    monkeypatch,
):
    _habilitar_asistente(usuario_activo, db_session)
    viaje, _ = viaje_con_admin
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 12, 1), IndiceDia=1)
    db_session.add(dia)
    db_session.flush()
    act_1 = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        Nombre="Actividad A",
        HoraInicio=time(9, 0),
        HoraFin=time(10, 0),
        Icono="location-dot",
    )
    act_2 = ActividadItinerario(
        IdDiaCronograma=dia.IdDiaCronograma,
        Nombre="Actividad B",
        HoraInicio=time(11, 0),
        HoraFin=time(12, 0),
        Icono="location-dot",
    )
    db_session.add_all([act_1, act_2])
    db_session.commit()

    async def _fake_route_generator(db, day, modo):
        ruta = RutaDiaria(
            IdDiaCronograma=day.IdDiaCronograma,
            Modo=modo,
            PolilineaCodificada="abc",
            DistanciaMetros=1200,
            DuracionSegundos=900,
            IdsActividadesOrdenadas=[act_1.IdActividad, act_2.IdActividad],
        )
        db.add(ruta)
        db.commit()
        db.refresh(ruta)
        return ruta, []

    from app.services.assistant_ai import tools

    monkeypatch.setattr(tools, "generar_ruta_diaria", _fake_route_generator)
    _usar_asistente_script(
        monkeypatch,
        {
            "tipo": "accion",
            "mensaje": "Puedo generar la ruta del dia.",
            "accion": {
                "type": "generar_ruta_dia",
                "label": "Generar ruta",
                "payload": {"dayIndex": 1, "modo": "walking"},
            },
        },
    )

    _, confirmacion = _proponer_y_confirmar(client, auth_headers, viaje, "Genera la ruta del dia 1")

    assert confirmacion["result"]["ruta"]["distanciaMetros"] == 1200
    ruta = db_session.query(RutaDiaria).filter_by(IdDiaCronograma=dia.IdDiaCronograma).one()
    assert ruta.Modo == "walking"
