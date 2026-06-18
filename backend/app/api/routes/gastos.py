from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db

from app.models import CategoriasGastos, ParticipantesGastos, ParticipanteViaje, Usuario, EstadoParticipacion, Gasto 


from app.schemas.gasto import (
    GastoCreate,
    CategoriasGastosRead,
    ParticipantesGastosRead,
    GastoRead
)

router = APIRouter()

@router.post("/")
def create_gasto(data: GastoCreate, db: Session = Depends(get_db)):

    # Convertimos a string por seguridad, por si llega como objeto desde la web
    fecha_str = str(data.FechaGasto)
    # Si viene con hora (formato ISO completo), tomamos solo la parte de la fecha antes de la "T"
    fecha_limpia = fecha_str.split("T")[0]
    # Ahora sí, parseamos
    fecha_gasto_dt = date.fromisoformat(fecha_limpia)

    if fecha_gasto_dt > date.today():
        raise HTTPException(
            status_code=400,
            detail="La fecha del gasto no puede ser posterior a la fecha actual."
        )

    # 1. Crear el gasto principal
    gasto = Gasto(

        IdViaje=data.IdViaje,
        Nombre=data.Nombre,
        Monto=data.Monto,
        IdCategoria=data.IdCategoria,
        IdPagador=data.IdPagador,
        FechaGasto=data.FechaGasto,
        DividirEntreTodos=data.DividirEntreTodos,
    )

    db.add(gasto)
    db.flush()  # para obtener IdGasto sin commit

    # 2. Definir participantes del gasto
    participantes = []

    if data.DividirEntreTodos:
        estado_aceptado = (
            db.query(EstadoParticipacion)
            .filter(
                EstadoParticipacion.Nombre == "aceptado",
                EstadoParticipacion.Activo.is_(True)
            )
            .first()
        )

        if not estado_aceptado:
            raise HTTPException(status_code=500, detail="Estado aceptado no configurado")

        # traer todos los participantes del viaje
        participantes = (
            db.query(ParticipanteViaje)
            .filter(
                ParticipanteViaje.IdViaje == data.IdViaje,
                ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion
            )
            .all()
        )
        participantes_ids = [p.IdParticipanteViaje for p in participantes]
    else:
        participantes_ids = data.IdParticipantes if data.IdParticipantes else []

        if data.IdPagador not in participantes_ids:
            raise HTTPException(
                status_code=400, 
                detail="El participante responsable del gasto debe estar incluido por defecto."
            )
        
        if len(participantes_ids) < 2:
            raise HTTPException(
                status_code=400, 
                detail="Para dividir entre ciertos participantes, debés seleccionar al menos a un amigo además del pagador."
            )

    # 3. Crear relaciones en tabla intermedia
    for id_part in participantes_ids:
        db.add(
            ParticipantesGastos(
                IdGasto=gasto.IdGasto,
                IdParticipanteViaje=id_part,
            )
        )
    
    if not participantes_ids:
        raise HTTPException(
            status_code=400,
            detail="El gasto debe tener al menos un participante" )

    # 4. Guardar todo
    db.commit()
    db.refresh(gasto)

    return {
        "message": "Gasto creado correctamente",
        "IdGasto": gasto.IdGasto,
    }


@router.get("/trips/{id_viaje}", response_model=list[GastoRead])
def get_trip_gastos(
    id_viaje: int,
    db: Session = Depends(get_db)
):

    gastos = db.query(Gasto).filter(
        Gasto.IdViaje == id_viaje
    ).all()

    resultado = []

    for gasto in gastos:

        participantes = (
            db.query(ParticipantesGastos)
            .filter(
                ParticipantesGastos.IdGasto == gasto.IdGasto
            )
            .all()
        )

        resultado.append(
            GastoRead(
                IdGasto=gasto.IdGasto,
                IdViaje=gasto.IdViaje,
                Nombre=gasto.Nombre,
                Monto=gasto.Monto,

                NombreCategoria=gasto.Categoria.Nombre,

                NombrePagador=gasto.Pagador.Usuario.Nombre,
                ApellidoPagador=gasto.Pagador.Usuario.Apellido,
                NombreUsuarioPagador=gasto.Pagador.Usuario.NombreUsuario,

                DividirEntreTodos=gasto.DividirEntreTodos,
                FechaGasto=gasto.FechaGasto,

                Participantes=[
                    f"{p.ParticipanteViaje.Usuario.Nombre} {p.ParticipanteViaje.Usuario.Apellido} ({p.ParticipanteViaje.Usuario.NombreUsuario})"
                    for p in participantes
                ]
            )
        )

    return resultado


@router.get("/categories", response_model=list[CategoriasGastosRead])
def get_categories(
    db: Session = Depends(get_db)
):
    categorias = db.scalars(
        select(CategoriasGastos)
        .where(CategoriasGastos.Activo.is_(True))
    ).all()

    return [
        CategoriasGastosRead(
            IdCategoria=categoria.IdCategoria,
            Nombre=categoria.Nombre
        )
        for categoria in categorias
    ]


@router.get("/trips/{trip_id}/participants", response_model=list[ParticipantesGastosRead])
def get_trip_participants(
    trip_id: int,
    db: Session = Depends(get_db),
):
    # 1. traer estado "aceptado"
    estado_aceptado = db.scalar(
        select(EstadoParticipacion).where(
            EstadoParticipacion.Nombre == "aceptado",
            EstadoParticipacion.Activo.is_(True)
        )
    )

    if not estado_aceptado:
        raise HTTPException(status_code=500, detail="Estado aceptado no configurado")

    # 2. query participantes del viaje
    participantes = db.scalars(
        select(ParticipanteViaje)
        .join(Usuario, Usuario.IdUsuario == ParticipanteViaje.IdUsuario)
        .where(
            ParticipanteViaje.IdViaje == trip_id,
            ParticipanteViaje.IdEstadoParticipacion == estado_aceptado.IdEstadoParticipacion
        )
    ).all()

    # 3. map a schema
    return [
        ParticipantesGastosRead(
            IdParticipanteViaje=p.IdParticipanteViaje,
            Nombre=p.Usuario.Nombre,
            Apellido=p.Usuario.Apellido,
            NombreUsuario=p.Usuario.NombreUsuario
        )
        for p in participantes
    ]