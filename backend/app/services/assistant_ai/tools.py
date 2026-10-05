from __future__ import annotations

import json
import re
from datetime import date, datetime, time, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.actividad_itinerario import ActividadItinerario
from app.models.categorias_checklist import CategoriasChecklist
from app.models.categorias_gastos import CategoriasGastos
from app.models.checklist import Checklist
from app.models.dia_cronograma import DiaCronograma
from app.models.estado_participacion import EstadoParticipacion
from app.models.gasto import Gasto, TipoDivisionEnum
from app.models.lugar_interes import LugarInteres
from app.models.lugar_interes_viaje import LugarInteresViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.participantes_gastos import ParticipantesGastos
from app.models.propuesta import Propuesta
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.votacion import TipoVotacionEnum, Votacion
from app.schemas.trip import RutaDiariaRead
from app.services.currency import obtener_tipo_cambio
from app.services.liquidacion_service import rebuild_settlement_plan
from app.services.trip_access import require_trip_edit_access, require_trip_not_finished

try:
    from app.services.route_generation import (
        RutaModoInvalidoError,
        RutaProviderError,
        RutaValidationError,
        generar_ruta_diaria,
    )
except Exception:
    RutaModoInvalidoError = None
    RutaProviderError = None
    RutaValidationError = None
    generar_ruta_diaria = None


def _payload_value(payload: dict, *keys: str, default=None):
    normalized = {str(key).casefold(): value for key, value in payload.items()}
    for key in keys:
        lookup = key.casefold()
        if lookup in normalized and normalized[lookup] not in (None, ""):
            return normalized[lookup]
    return default


def _deep_payload_value(value, *keys: str):
    if isinstance(value, dict):
        direct = _payload_value(value, *keys)
        if direct not in (None, "") and not isinstance(direct, (dict, list)):
            return direct
        if isinstance(direct, (dict, list)):
            found = _deep_payload_value(direct, *keys, "value")
            if found not in (None, ""):
                return found
        for nested in value.values():
            found = _deep_payload_value(nested, *keys)
            if found not in (None, ""):
                return found
    elif isinstance(value, list):
        for nested in value:
            found = _deep_payload_value(nested, *keys)
            if found not in (None, ""):
                return found
    return None


def _strip_accents(value: str) -> str:
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ü": "u",
        "ñ": "n",
    }
    text = value.casefold()
    for source, target in replacements.items():
        text = text.replace(source, target)
    return text


def _extract_first_money_from_text(text: str | None):
    if not text:
        return None
    match = re.search(r"(?:[$€]\s*)?(\d[\d.,]*)", text)
    return match.group(1) if match else None


def _extract_activity_name_from_text(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = text.strip().strip(".")
    meal = re.search(
        r"\b(cena|almuerzo|desayuno|comida)\b(?:.*?\b(?:en|a|al)\s+(?:el\s+|la\s+)?([^.,;\n]+))?",
        cleaned,
        flags=re.IGNORECASE,
    )
    if meal:
        meal_name = meal.group(1).strip().capitalize()
        place = (meal.group(2) or "").strip(" .")
        return f"{meal_name} en {place}"[:150] if place else meal_name[:150]
    patterns = [
        r"(?:visita|visitar)\s+a\s+(.+)$",
        r"(?:actividad|evento|plan)\s+(?:de\s+)?(.+)$",
        r"(?:agrega|agregá|sum[aá]|crear|crea|program[aá])(?:\s+al\s+viaje)?(?:\s+en\s+el\s+d[ií]a\s+\d+)?\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, cleaned, flags=re.IGNORECASE)
        if match:
            value = match.group(1).strip(" .")
            value = re.sub(r"^(?:una\s+)?(?:visita\s+a\s+)", "", value, flags=re.IGNORECASE).strip()
            return value[:150] if value else None
    return None


def _parse_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().casefold()
    if text in {"true", "1", "si", "sí", "yes", "y"}:
        return True
    if text in {"false", "0", "no", "n"}:
        return False
    return default


def _normalize_money_text(value) -> str:
    text = str(value).strip()
    text = re.sub(r"[^\d,.\-]", "", text)
    if "," in text and "." in text:
        comma = text.rfind(",")
        dot = text.rfind(".")
        if comma > dot:
            return text.replace(".", "").replace(",", ".")
        return text.replace(",", "")
    if "," in text:
        left, right = text.rsplit(",", 1)
        if len(right) == 3 and left.replace(",", "").isdigit():
            return text.replace(",", "")
        return text.replace(",", ".")
    if text.count(".") > 1:
        return text.replace(".", "")
    if "." in text:
        left, right = text.rsplit(".", 1)
        if len(right) == 3 and left.isdigit():
            return text.replace(".", "")
    return text


def _parse_time(value: str | None, fallback: str) -> time:
    text = (value or fallback).strip()
    try:
        hour, minute = text.split(":", 1)
        return time(hour=int(hour), minute=int(minute))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="La hora debe tener formato HH:MM.") from exc


def _resolve_day(db: Session, viaje: Viaje, payload: dict) -> DiaCronograma:
    day_id = _payload_value(payload, "dayId", "idDia", "IdDiaCronograma")
    day_index = _payload_value(payload, "dayIndex", "dia", "numeroDia", "nroDia", "dayNumber")
    if not day_index:
        message = _payload_value(payload, "_userMessage", default="")
        match = re.search(r"d[ií]a\s+(\d+)", str(message), flags=re.IGNORECASE)
        if match:
            day_index = match.group(1)
    base_query = select(DiaCronograma).where(DiaCronograma.IdViaje == viaje.IdViaje)
    if day_id:
        day = db.scalar(base_query.where(DiaCronograma.IdDiaCronograma == int(day_id)))
    elif day_index:
        numeric_index = int(day_index)
        day = db.scalar(base_query.where(DiaCronograma.IndiceDia == numeric_index))
        if day is None:
            days = db.scalars(base_query.order_by(DiaCronograma.Fecha.asc(), DiaCronograma.IndiceDia.asc())).all()
            if 1 <= numeric_index <= len(days):
                day = days[numeric_index - 1]
    else:
        day = db.scalar(base_query.order_by(DiaCronograma.Fecha.asc(), DiaCronograma.IndiceDia.asc()))
    if day is None:
        raise HTTPException(status_code=404, detail="No se encontro el dia indicado del itinerario.")
    return day


def _decimal_from_payload(value, field_name: str) -> Decimal:
    try:
        if value is None:
            raise ValueError("missing")
        if isinstance(value, dict):
            value = _deep_payload_value(value, "monto", "MontoOriginal", "Monto", "importe", "total", "valor", "amount", "value")
        if isinstance(value, list):
            value = _deep_payload_value(value, "monto", "MontoOriginal", "Monto", "importe", "total", "valor", "amount", "value")
        amount = Decimal(_normalize_money_text(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} debe ser numerico.") from exc
    if amount <= 0:
        raise HTTPException(status_code=400, detail=f"{field_name} debe ser mayor a cero.")
    return amount


def _resolve_date(value: str | None) -> date:
    if not value:
        return date.today()
    try:
        parsed = date.fromisoformat(str(value).split("T")[0])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="La fecha del gasto no es valida.") from exc
    if parsed > date.today():
        raise HTTPException(status_code=400, detail="La fecha del gasto no puede ser futura.")
    return parsed


def _resolve_expense_category(db: Session, payload: dict) -> CategoriasGastos:
    category_id = _payload_value(payload, "idCategoria", "IdCategoria", "idCategoriaGasto")
    if category_id:
        category = db.get(CategoriasGastos, int(category_id))
        if category is not None and category.Activo:
            return category

    category_name_raw = str(_payload_value(payload, "categoria", "categoriaGasto", default="")).strip()
    category_name = _strip_accents(category_name_raw)
    if category_name:
        categories = db.scalars(
            select(CategoriasGastos).where(CategoriasGastos.Activo.is_(True))
        ).all()
        for item in categories:
            item_name = _strip_accents(item.Nombre)
            if item_name == category_name:
                return item
        for item in categories:
            item_name = _strip_accents(item.Nombre)
            if category_name in item_name or item_name in category_name:
                return item

        raise HTTPException(
            status_code=400,
            detail=(
                "No pude asociar la categoria inferida por el asistente "
                f"('{category_name_raw}') con una categoria de gastos activa."
            ),
        )

    raise HTTPException(
        status_code=400,
        detail="El asistente debe indicar una categoria para registrar el gasto.",
    )


def _resolve_expense_name(payload: dict) -> str:
    name = str(
        _payload_value(payload, "nombre", "Nombre", "titulo", "concepto", default="")
        or ""
    ).strip()
    if name.casefold() in {"", "gasto", "nuevo gasto", "gasto registrado por ia", "gasto del viaje"}:
        raise HTTPException(
            status_code=400,
            detail="El asistente debe indicar el concepto del gasto.",
        )
    return name[:150]


def _accepted_participants(db: Session, viaje: Viaje) -> list[ParticipanteViaje]:
    accepted_state = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado",
            EstadoParticipacion.Activo.is_(True),
        )
    )
    if accepted_state is None:
        raise HTTPException(status_code=500, detail="Estado aceptado no configurado.")
    return db.scalars(
        select(ParticipanteViaje)
        .join(Usuario, Usuario.IdUsuario == ParticipanteViaje.IdUsuario)
        .where(
            ParticipanteViaje.IdViaje == viaje.IdViaje,
            ParticipanteViaje.IdEstadoParticipacion == accepted_state.IdEstadoParticipacion,
            Usuario.Activo.is_(True),
        )
    ).all()


def _resolve_payer(
    accepted: list[ParticipanteViaje], current_user: Usuario, payload: dict
) -> ParticipanteViaje:
    payer_id = _payload_value(payload, "idPagador", "IdPagador", "idParticipantePagador")
    if payer_id:
        for participant in accepted:
            if participant.IdParticipanteViaje == int(payer_id):
                return participant
        raise HTTPException(status_code=400, detail="El pagador indicado no participa activamente del viaje.")

    for participant in accepted:
        if participant.IdUsuario == current_user.IdUsuario:
            return participant
    raise HTTPException(status_code=400, detail="No se encontro al usuario actual como participante activo.")


def _convert_amount(amount: Decimal, from_currency: str, to_currency: str, expense_date: date) -> tuple[Decimal, Decimal]:
    if from_currency == to_currency:
        return amount, Decimal("1.000000")
    try:
        exchange_rate = Decimal(str(obtener_tipo_cambio(from_currency, to_currency, fecha=expense_date)))
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Servicio de cotizacion no disponible. No se pudo registrar el gasto.",
        ) from exc
    converted = (amount * exchange_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return converted, exchange_rate.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def _resolve_activity_place(db: Session, viaje: Viaje, current_user: Usuario, payload: dict) -> tuple[int | None, int | None, str | None]:
    trip_place_id = _payload_value(
        payload,
        "idLugarInteresViaje",
        "IdLugarInteresViaje",
        "tripPlaceId",
        "idLugarViaje",
    )
    if trip_place_id:
        trip_place = db.scalar(
            select(LugarInteresViaje).where(
                LugarInteresViaje.IdLugarInteresViaje == int(trip_place_id),
                LugarInteresViaje.IdViaje == viaje.IdViaje,
            )
        )
        if trip_place is None:
            raise HTTPException(status_code=400, detail="El lugar guardado indicado no pertenece al viaje.")
        name = trip_place.LugarInteres.Nombre if trip_place.LugarInteres else None
        return trip_place.IdLugarInteresViaje, None, name

    place_id = _payload_value(payload, "idLugarInteres", "IdLugarInteres", "placeDbId")
    if place_id:
        place = db.get(LugarInteres, int(place_id))
        if place is None:
            raise HTTPException(status_code=400, detail="El lugar de interes indicado no existe.")
        return None, place.IdLugarInteres, place.Nombre

    place_name = str(
        _payload_value(
            payload,
            "ubicacion",
            "lugar",
            "placeName",
            "location",
            "nombreLugar",
            default="",
        )
        or ""
    ).strip()
    if not place_name:
        return None, None, None

    normalized = _strip_accents(place_name)
    trip_places = db.scalars(
        select(LugarInteresViaje).where(LugarInteresViaje.IdViaje == viaje.IdViaje)
    ).all()
    for trip_place in trip_places:
        place = trip_place.LugarInteres
        if place is None:
            continue
        candidate = _strip_accents(place.Nombre)
        if normalized in candidate or candidate in normalized:
            return trip_place.IdLugarInteresViaje, None, place.Nombre

    places = db.scalars(select(LugarInteres).where(LugarInteres.Activo.is_(True))).all()
    for place in places:
        candidate = _strip_accents(place.Nombre)
        if normalized in candidate or candidate in normalized:
            return None, place.IdLugarInteres, place.Nombre

    google_place_id = _payload_value(payload, "placeId", "googlePlaceId", "GooglePlaceId")
    lat = _payload_value(payload, "lat", "latitude")
    lng = _payload_value(payload, "lng", "longitude")
    address = _payload_value(payload, "direccion", "address", "formattedAddress", default=place_name)
    if google_place_id and lat is not None and lng is not None:
        place = db.scalar(select(LugarInteres).where(LugarInteres.GooglePlaceId == str(google_place_id)))
        if place is None:
            place = LugarInteres(
                GooglePlaceId=str(google_place_id),
                Nombre=place_name[:200],
                Direccion=str(address)[:255],
                Lat=float(lat),
                Lng=float(lng),
                Categoria=str(_payload_value(payload, "categoriaLugar", "placeCategory", default=""))[:100] or None,
                MetadataJson={"source": "assistant"},
            )
            db.add(place)
            db.flush()
        trip_place = db.scalar(
            select(LugarInteresViaje).where(
                LugarInteresViaje.IdViaje == viaje.IdViaje,
                LugarInteresViaje.IdLugarInteres == place.IdLugarInteres,
            )
        )
        if trip_place is None:
            trip_place = LugarInteresViaje(
                IdViaje=viaje.IdViaje,
                IdLugarInteres=place.IdLugarInteres,
                IdUsuarioAlta=current_user.IdUsuario,
            )
            db.add(trip_place)
            db.flush()
        return trip_place.IdLugarInteresViaje, None, place.Nombre

    slug = re.sub(r"[^a-z0-9]+", "-", _strip_accents(place_name)).strip("-")[:80] or "lugar"
    synthetic_place_id = f"assistant:{viaje.IdViaje}:{slug}"
    place = db.scalar(select(LugarInteres).where(LugarInteres.GooglePlaceId == synthetic_place_id))
    if place is None:
        destino = next((rel.Destino for rel in viaje.Destinos if rel.Destino is not None), None)
        place = LugarInteres(
            GooglePlaceId=synthetic_place_id,
            Nombre=place_name[:200],
            Direccion=place_name[:255],
            Lat=float(destino.Lat) if destino and destino.Lat is not None else 0.0,
            Lng=float(destino.Lng) if destino and destino.Lng is not None else 0.0,
            Categoria=str(_payload_value(payload, "categoriaLugar", "placeCategory", default="Asistente"))[:100],
            MetadataJson={"source": "assistant", "approximate": True},
        )
        db.add(place)
        db.flush()
    trip_place = db.scalar(
        select(LugarInteresViaje).where(
            LugarInteresViaje.IdViaje == viaje.IdViaje,
            LugarInteresViaje.IdLugarInteres == place.IdLugarInteres,
        )
    )
    if trip_place is None:
        trip_place = LugarInteresViaje(
            IdViaje=viaje.IdViaje,
            IdLugarInteres=place.IdLugarInteres,
            IdUsuarioAlta=current_user.IdUsuario,
        )
        db.add(trip_place)
        db.flush()
    return trip_place.IdLugarInteresViaje, None, place.Nombre


def _extract_activity_location_from_text(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = str(text).strip()
    meal = re.search(
        r"\b(?:cena|almuerzo|desayuno|comida)\b.*?\b(?:en|a|al)\s+(?:el\s+|la\s+)?([^.,;\n]+)",
        cleaned,
        flags=re.IGNORECASE,
    )
    if meal:
        return meal.group(1).strip(" .")[:200]
    generic = re.search(
        r"\b(?:ubicacion|lugar|en|a|al)\s+(?:el\s+|la\s+)?([^.,;\n]+)",
        cleaned,
        flags=re.IGNORECASE,
    )
    if generic:
        return generic.group(1).strip(" .")[:200]
    return None


async def execute_assistant_action(
    db: Session,
    *,
    viaje: Viaje,
    current_user: Usuario,
    action_type: str,
    payload: dict,
) -> dict:
    require_trip_edit_access(viaje, current_user)

    if action_type == "crear_actividad":
        require_trip_not_finished(viaje, "el itinerario")
        day = _resolve_day(db, viaje, payload)
        inicio = _parse_time(_payload_value(payload, "horaInicio", "HoraInicio", "inicio"), "10:00")
        fin = _parse_time(_payload_value(payload, "horaFin", "HoraFin", "fin"), "11:00")
        if fin <= inicio:
            raise HTTPException(status_code=400, detail="La hora de fin debe ser posterior a la hora de inicio.")
        trip_place_id, place_id, place_name = _resolve_activity_place(db, viaje, current_user, payload)
        activity_name = str(
            _payload_value(payload, "nombre", "Nombre", "titulo", "actividad", default="")
            or ""
        ).strip()
        if not activity_name or activity_name.casefold() in {"nueva actividad", "actividad"}:
            activity_name = place_name or "Nueva actividad"
        actividad = ActividadItinerario(
            IdDiaCronograma=day.IdDiaCronograma,
            IdLugarInteresViaje=trip_place_id,
            IdLugarInteres=place_id,
            Nombre=activity_name[:150],
            Descripcion=(_payload_value(payload, "descripcion", "Descripcion") or None),
            HoraInicio=inicio,
            HoraFin=fin,
            Icono=str(_payload_value(payload, "icono", "Icono", default="location-dot"))[:50],
        )
        db.add(actividad)
        db.commit()
        db.refresh(actividad)
        return {"message": "Actividad creada.", "idActividad": actividad.IdActividad}

    if action_type == "crear_checklist":
        require_trip_not_finished(viaje, "la checklist")
        categoria_id = _payload_value(payload, "idCategoriaChecklist", "IdCategoriaChecklist")
        categoria = db.get(CategoriasChecklist, int(categoria_id)) if categoria_id else None
        if categoria is None:
            categoria_nombre = str(_payload_value(payload, "categoria", "categoriaChecklist", default="")).strip().casefold()
            if categoria_nombre:
                categoria = db.scalar(
                    select(CategoriasChecklist)
                    .where(CategoriasChecklist.Activo.is_(True), func.lower(CategoriasChecklist.Nombre) == categoria_nombre)
                    .order_by(CategoriasChecklist.Nombre.asc())
                )
        if categoria is None:
            categoria = db.scalar(
                select(CategoriasChecklist)
                .where(CategoriasChecklist.Activo.is_(True))
                .order_by(CategoriasChecklist.Nombre.asc())
            )
        if categoria is None:
            raise HTTPException(status_code=500, detail="No hay categorias de checklist disponibles.")
        checklist = Checklist(
            IdViaje=viaje.IdViaje,
            IdUsuarioCreador=current_user.IdUsuario,
            Nombre=str(_payload_value(payload, "nombre", "Nombre", "titulo", default="Nueva tarea")).strip()[:60],
            IdCategoriaChecklist=categoria.IdCategoriaChecklist,
        )
        db.add(checklist)
        db.commit()
        db.refresh(checklist)
        return {"message": "Tarea creada.", "idChecklist": checklist.IdChecklist}

    if action_type == "registrar_gasto":
        amount_value = _deep_payload_value(
            payload,
            "monto",
            "MontoOriginal",
            "Monto",
            "importe",
            "total",
            "valor",
            "amount",
            "value",
        )
        if amount_value in (None, ""):
            amount_value = _extract_first_money_from_text(_payload_value(payload, "_userMessage"))
        amount = _decimal_from_payload(
            amount_value,
            "El monto",
        )
        expense_date = _resolve_date(_payload_value(payload, "fecha", "FechaGasto", "fechaGasto"))
        category = _resolve_expense_category(db, payload)
        accepted = _accepted_participants(db, viaje)
        if not accepted:
            raise HTTPException(status_code=400, detail="El viaje no tiene participantes activos.")

        payer = _resolve_payer(accepted, current_user, payload)
        base_currency = (getattr(viaje, "Moneda", None) or "USD").upper()
        original_currency = str(
            _payload_value(payload, "moneda", "MonedaOriginal", "monedaOriginal", "currency", default=base_currency)
        ).upper()
        converted_amount, exchange_rate = _convert_amount(
            amount,
            original_currency,
            base_currency,
            expense_date,
        )

        is_shared = _parse_bool(_payload_value(payload, "esCompartido", "EsCompartido"), True)
        divide_all = _parse_bool(_payload_value(payload, "dividirEntreTodos", "DividirEntreTodos"), True)
        selected_ids = _payload_value(payload, "idParticipantes", "IdParticipantes", "participantes", default=[])

        if not is_shared:
            participant_ids = [payer.IdParticipanteViaje]
            division_type = None
        elif divide_all:
            participant_ids = [participant.IdParticipanteViaje for participant in accepted]
            division_type = TipoDivisionEnum.igualitaria
        else:
            participant_ids = [int(item) for item in selected_ids]
            active_ids = {participant.IdParticipanteViaje for participant in accepted}
            if any(item not in active_ids for item in participant_ids):
                raise HTTPException(status_code=400, detail="Hay participantes invalidos para dividir el gasto.")
            if len(participant_ids) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Para dividir entre algunos participantes, indica al menos dos.",
                )
            division_type = TipoDivisionEnum.igualitaria

        if not participant_ids:
            raise HTTPException(status_code=400, detail="El gasto debe tener al menos un participante.")

        assigned_amount = (converted_amount / len(participant_ids)).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )
        assigned_amounts = {participant_id: assigned_amount for participant_id in participant_ids}
        rounding_delta = converted_amount - sum(assigned_amounts.values(), Decimal("0.00"))
        if rounding_delta:
            assigned_amounts[participant_ids[0]] += rounding_delta

        gasto = Gasto(
            IdViaje=viaje.IdViaje,
            Nombre=_resolve_expense_name(payload),
            Monto=converted_amount,
            MontoOriginal=amount,
            MonedaOriginal=original_currency,
            TipoCambio=exchange_rate,
            IdCategoria=category.IdCategoria,
            IdPagador=payer.IdParticipanteViaje,
            FechaGasto=expense_date,
            DividirEntreTodos=divide_all,
            TipoDivision=division_type,
        )
        db.add(gasto)
        db.flush()
        for participant_id, participant_amount in assigned_amounts.items():
            db.add(
                ParticipantesGastos(
                    IdGasto=gasto.IdGasto,
                    IdParticipanteViaje=participant_id,
                    MontoAsignado=participant_amount,
                )
            )
        db.commit()
        db.refresh(gasto)
        rebuild_settlement_plan(db, viaje.IdViaje)
        return {"message": "Gasto registrado.", "idGasto": gasto.IdGasto}

    if action_type == "crear_votacion":
        require_trip_not_finished(viaje, "las votaciones")
        propuestas = [
            str(item.get("texto") if isinstance(item, dict) else item).strip()
            for item in (payload.get("propuestas") or [])
            if str(item.get("texto") if isinstance(item, dict) else item).strip()
        ]
        if len(propuestas) < 2:
            raise HTTPException(status_code=400, detail="La votacion debe tener al menos dos propuestas.")
        fecha_raw = _payload_value(payload, "fechaCierre", "FechaCierre", "cierraEl")
        try:
            fecha_cierre = datetime.fromisoformat(str(fecha_raw).replace("Z", "+00:00"))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="La fecha de cierre no es valida.") from exc
        if fecha_cierre.tzinfo is None:
            fecha_cierre = fecha_cierre.replace(tzinfo=timezone.utc)
        if fecha_cierre <= datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="La fecha de cierre debe ser futura.")
        tipo = _payload_value(payload, "tipo", "Tipo", default="opcion_unica")
        if tipo not in {"opcion_unica", "opcion_multiple"}:
            tipo = "opcion_unica"
        votacion = Votacion(
            IdViaje=viaje.IdViaje,
            Titulo=str(_payload_value(payload, "nombre", "Nombre", "titulo", default="Nueva votacion")).strip()[:150],
            Tipo=TipoVotacionEnum(tipo),
            FechaCierre=fecha_cierre,
            IdCreador=current_user.IdUsuario,
        )
        db.add(votacion)
        db.flush()
        for index, texto in enumerate(propuestas, start=1):
            db.add(Propuesta(IdVotacion=votacion.IdVotacion, Texto=texto[:150], Orden=index))
        db.commit()
        db.refresh(votacion)
        return {"message": "Votacion creada.", "idVotacion": int(votacion.IdVotacion)}

    if action_type == "generar_ruta_dia":
        require_trip_not_finished(viaje, "el itinerario")
        if generar_ruta_diaria is None:
            raise HTTPException(status_code=503, detail="La generacion de rutas no esta disponible.")
        day = _resolve_day(db, viaje, payload)
        try:
            ruta, excluidas = await generar_ruta_diaria(
                db,
                day,
                _payload_value(payload, "modo", "Modo", "mode", default="walking"),
            )
        except RutaValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.message) from exc
        except RutaModoInvalidoError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except RutaProviderError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        return {
            "message": "Ruta generada.",
            "ruta": RutaDiariaRead.model_validate(ruta).model_dump(by_alias=False),
            "actividadesExcluidas": [
                {"idActividad": item.IdActividad, "nombre": item.Nombre}
                for item in excluidas
            ],
        }

    raise HTTPException(status_code=400, detail="Accion del asistente no permitida.")


def dumps_payload(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)


def loads_payload(value: str) -> dict:
    data = json.loads(value)
    return data if isinstance(data, dict) else {}
