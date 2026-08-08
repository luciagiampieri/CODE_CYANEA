from datetime import time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.api.routes.itinerary import manager
from app.db.session import get_db
from app.models.actividad_itinerario import ActividadItinerario
from app.models.dia_cronograma import DiaCronograma
from app.models.lugar_interes import LugarInteres
from app.models.lugar_interes_viaje import LugarInteresViaje
from app.models.usuario import Usuario
from app.schemas.place import (
    PlaceDetailRead,
    PlaceReviewRead,
    PopularTripPlaceRead,
    PopularTripPlacesResponse,
    TripPlaceCreate,
    TripPlaceDayRead,
    TripPlaceMutationResponse,
    TripPlaceRead,
    TripPlaceScheduleCreate,
    TripPlaceSearchRead,
)
from app.schemas.trip import ActividadRead
from app.services.place_search import get_place_details, search_popular_places, search_trip_places
from app.services.trip_access import get_trip_with_relations, require_trip_access

router = APIRouter()


def _parse_time(value: str, field_name: str) -> time:
    try:
        hour, minute = value.split(":")
        return time(hour=int(hour), minute=int(minute))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} debe tener formato HH:MM",
        ) from exc


def _ensure_trip_days(db: Session, trip_id: int) -> None:
    existing_days = db.scalars(
        select(DiaCronograma).where(DiaCronograma.IdViaje == trip_id)
    ).all()
    if existing_days:
        return

    trip = get_trip_with_relations(db, trip_id)
    if trip is None or trip.FechaInicio is None or trip.FechaFin is None:
        return

    cursor = trip.FechaInicio
    index = 1
    while cursor <= trip.FechaFin:
        db.add(
            DiaCronograma(
                IdViaje=trip_id,
                Fecha=cursor,
                IndiceDia=index,
            )
        )
        cursor += timedelta(days=1)
        index += 1
    db.flush()


def _load_trip_place(db: Session, trip_id: int, trip_place_id: int) -> LugarInteresViaje | None:
    return db.scalar(
        select(LugarInteresViaje)
        .options(
            selectinload(LugarInteresViaje.LugarInteres),
            selectinload(LugarInteresViaje.Actividades).selectinload(ActividadItinerario.DiaCronograma),
        )
        .where(
            LugarInteresViaje.IdLugarInteresViaje == trip_place_id,
            LugarInteresViaje.IdViaje == trip_id,
        )
    )


def _serialize_trip_place(trip_place: LugarInteresViaje) -> TripPlaceRead:
    scheduled_days_by_id: dict[int, TripPlaceDayRead] = {}
    for activity in trip_place.Actividades or []:
        day = activity.DiaCronograma
        if day is None:
            continue
        scheduled_days_by_id[day.IdDiaCronograma] = TripPlaceDayRead(
            dayId=day.IdDiaCronograma,
            dayIndex=day.IndiceDia,
            date=day.Fecha,
        )

    place = trip_place.LugarInteres
    return TripPlaceRead(
        id=trip_place.IdLugarInteresViaje,
        placeId=place.GooglePlaceId,
        name=place.Nombre,
        address=place.Direccion,
        lat=place.Lat,
        lng=place.Lng,
        category=place.Categoria,
        photoUrl=place.FotoUrl,
        notes=trip_place.Notas,
        scheduledDays=sorted(scheduled_days_by_id.values(), key=lambda item: item.dayIndex),
    )


@router.get("/trips/{trip_id}/places/search", response_model=list[TripPlaceSearchRead])
async def search_places(
    trip_id: int,
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[TripPlaceSearchRead]:
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    results = await search_trip_places(q.strip(), limit=8)
    return [
        TripPlaceSearchRead(
            placeId=item.place_id,
            name=item.name,
            address=item.address,
            country=item.country,
            lat=item.lat,
            lng=item.lng,
            category=item.category,
            provider=item.provider,
            metadata=item.metadata,
        )
        for item in results
        if item.lat is not None and item.lng is not None
    ]


@router.get("/trips/{trip_id}/places/popular", response_model=PopularTripPlacesResponse)
async def popular_places(
    trip_id: int,
    lat: float = Query(...),
    lng: float = Query(...),
    limit: int = Query(default=6, ge=1, le=10),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> PopularTripPlacesResponse:
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    results = await search_popular_places(lat=lat, lng=lng, limit=limit)
    return PopularTripPlacesResponse(
        contextLabel=results.context_label,
        items=[
            PopularTripPlaceRead(
                placeId=item.place_id,
                name=item.name,
                address=item.address,
                country=item.country,
                lat=item.lat,
                lng=item.lng,
                category=item.category,
                provider=item.provider,
                metadata=item.metadata,
                rating=item.rating,
                userRatingsTotal=item.user_ratings_total,
                popularityScore=item.popularity_score,
            )
            for item in results.items
            if item.lat is not None and item.lng is not None
        ],
    )


@router.get("/trips/{trip_id}/places/details", response_model=PlaceDetailRead)
async def get_place_details_route(
    trip_id: int,
    placeId: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> PlaceDetailRead:
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    details = await get_place_details(placeId.strip())
    return PlaceDetailRead(
        placeId=details.place_id,
        name=details.name,
        address=details.address,
        category=details.category,
        rating=details.rating,
        userRatingsTotal=details.user_ratings_total,
        googleMapsUri=details.google_maps_uri,
        reviews=[
            PlaceReviewRead(
                authorName=review.author_name,
                authorUrl=review.author_url,
                profilePhotoUrl=review.profile_photo_url,
                rating=review.rating,
                publishTime=review.publish_time,
                text=review.text,
                relativePublishTimeDescription=review.relative_publish_time_description,
            )
            for review in details.reviews
        ],
    )


@router.get("/trips/{trip_id}/places", response_model=list[TripPlaceRead])
def list_trip_places(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[TripPlaceRead]:
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)

    places = db.scalars(
        select(LugarInteresViaje)
        .options(
            selectinload(LugarInteresViaje.LugarInteres),
            selectinload(LugarInteresViaje.Actividades).selectinload(ActividadItinerario.DiaCronograma),
        )
        .where(LugarInteresViaje.IdViaje == trip_id)
        .order_by(LugarInteresViaje.FechaAlta.desc())
    ).all()

    return [_serialize_trip_place(place) for place in places]


@router.get("/trips/{trip_id}/places/{trip_place_id}", response_model=TripPlaceRead)
def get_trip_place_detail(
    trip_id: int,
    trip_place_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripPlaceRead:
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    trip_place = _load_trip_place(db, trip_id, trip_place_id)
    if trip_place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lugar de interés no encontrado")
    return _serialize_trip_place(trip_place)


@router.post("/trips/{trip_id}/places", response_model=TripPlaceMutationResponse, status_code=status.HTTP_201_CREATED)
def create_trip_place(
    trip_id: int,
    payload: TripPlaceCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> TripPlaceMutationResponse:
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)

    place = db.scalar(
        select(LugarInteres).where(LugarInteres.GooglePlaceId == payload.placeId.strip())
    )
    if place is None:
        place = LugarInteres(
            GooglePlaceId=payload.placeId.strip(),
            Nombre=payload.name.strip(),
            Direccion=payload.address.strip(),
            Lat=payload.lat,
            Lng=payload.lng,
            Categoria=payload.category.strip() if payload.category else None,
            FotoUrl=payload.photoUrl.strip() if payload.photoUrl else None,
            MetadataJson=payload.metadata,
        )
        db.add(place)
        db.flush()

    existing = db.scalar(
        select(LugarInteresViaje)
        .options(
            selectinload(LugarInteresViaje.LugarInteres),
            selectinload(LugarInteresViaje.Actividades).selectinload(ActividadItinerario.DiaCronograma),
        )
        .where(
            LugarInteresViaje.IdViaje == trip_id,
            LugarInteresViaje.IdLugarInteres == place.IdLugarInteres,
        )
    )
    if existing is not None:
        return TripPlaceMutationResponse(
            message="El lugar ya estaba guardado en este viaje.",
            place=_serialize_trip_place(existing),
        )

    trip_place = LugarInteresViaje(
        IdViaje=trip_id,
        IdLugarInteres=place.IdLugarInteres,
        Notas=payload.notes.strip() if payload.notes else None,
        IdUsuarioAlta=current_user.IdUsuario,
    )
    db.add(trip_place)
    db.commit()

    created = _load_trip_place(db, trip_id, trip_place.IdLugarInteresViaje)
    if created is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo recuperar el lugar guardado.",
        )

    return TripPlaceMutationResponse(
        message="Lugar guardado en el viaje correctamente.",
        place=_serialize_trip_place(created),
    )


@router.post(
    "/trips/{trip_id}/places/{trip_place_id}/schedule",
    response_model=ActividadRead,
    status_code=status.HTTP_201_CREATED,
)
async def schedule_trip_place(
    trip_id: int,
    trip_place_id: int,
    payload: TripPlaceScheduleCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> ActividadRead:
    require_trip_access(get_trip_with_relations(db, trip_id), current_user)
    _ensure_trip_days(db, trip_id)

    trip_place = _load_trip_place(db, trip_id, trip_place_id)
    if trip_place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lugar de interés no encontrado")

    day = None
    if payload.dayId is not None:
        day = db.scalar(
            select(DiaCronograma).where(
                DiaCronograma.IdDiaCronograma == payload.dayId,
                DiaCronograma.IdViaje == trip_id,
            )
        )
    if day is None and payload.dayIndex is not None:
        day = db.scalar(
            select(DiaCronograma).where(
                DiaCronograma.IdViaje == trip_id,
                DiaCronograma.IndiceDia == payload.dayIndex,
            )
        )
    if day is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Día de itinerario no encontrado")

    hora_inicio = _parse_time(payload.horaInicio, "horaInicio")
    hora_fin = _parse_time(payload.horaFin, "horaFin")
    if hora_fin <= hora_inicio:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La hora de fin debe ser posterior a la hora de inicio",
        )

    activity = ActividadItinerario(
        IdDiaCronograma=day.IdDiaCronograma,
        IdLugarInteresViaje=trip_place.IdLugarInteresViaje,
        Nombre=payload.nombre.strip(),
        Descripcion=payload.descripcion.strip() if payload.descripcion else None,
        HoraInicio=hora_inicio,
        HoraFin=hora_fin,
        Icono=payload.icono,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)

    result = ActividadRead.model_validate(activity)
    await manager.broadcast(
        trip_id,
        {
            "tipo": "actividad_creada",
            "idDiaCronograma": day.IdDiaCronograma,
            "actividad": result.model_dump(by_alias=True),
        },
    )
    return result
