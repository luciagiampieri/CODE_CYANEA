from datetime import date
from decimal import Decimal

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
from app.models.gasto import TipoDivisionEnum

router = APIRouter()

@router.post("/")
def create_gasto(data: GastoCreate, db: Session = Depends(get_db), current_user: Usuario = Depends(get_current_user)):

    fecha_str = str(data.FechaGasto)
    fecha_limpia = fecha_str.split("T")[0]
    fecha_gasto_dt = date.fromisoformat(fecha_limpia)

    if fecha_gasto_dt > date.today():
        raise HTTPException(
            status_code=400,
            detail="La fecha del gasto no puede ser posterior a la fecha actual."
        )

    monto_por_participante = {}
    participantes_ids = []
    tipo_division_final = None


    if not data.EsCompartido:

        participante = (
        db.query(ParticipanteViaje)
        .filter(
            ParticipanteViaje.IdViaje == data.IdViaje,
            ParticipanteViaje.IdUsuario == current_user.IdUsuario,
        )
        .first()
        )

        if not participante:
            raise HTTPException(
                status_code=400,
                detail="No se encontró al participante del viaje para el usuario actual."
            )
        id_pagador = participante.IdParticipanteViaje
        tipo_division_final = None
        participantes_ids = [id_pagador]
        monto_por_participante [id_pagador] = data.Monto

    elif data.TipoDivision == TipoDivisionEnum.igualitaria:
        
        tipo_division_final = TipoDivisionEnum.igualitaria
        
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
            participantes_ids = data.IdParticipantes
            
            if len(participantes_ids) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Para dividir entre ciertos participantes, debés seleccionar al menos 2."
                )
        
        
        if len(participantes_ids) == 0:
            raise HTTPException(
                status_code=400,
                detail="El gasto debe tener al menos un participante"
            )

        monto_individual = data.Monto / len(participantes_ids)
        monto_por_participante = {id_part: monto_individual for id_part in participantes_ids}
    

    elif data.TipoDivision == TipoDivisionEnum.personalizada:

        tipo_division_final = TipoDivisionEnum.personalizada
        detalles = data.DetalleMontosPersonalizados

        if not detalles:
            raise HTTPException(
                status_code=400,
                detail="Debe proporcionar detalles de montos personalizados para cada participante."
            ) 
        
        total_asignado = 0
        participantes_ids = []
        monto_por_participante = {}

        for item in detalles:
            monto_asignado = Decimal(str(item.MontoAsignado)) 
    
            if monto_asignado <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"El monto asignado debe ser mayor a cero."
                )

            participantes_ids.append(item.IdParticipanteViaje)
            monto_por_participante[item.IdParticipanteViaje] = monto_asignado
            total_asignado += monto_asignado
        
        if abs(total_asignado - data.Monto) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"La suma de los montos asignados ({total_asignado}) no coincide con el monto total del gasto ({data.Monto})."
            )
        
    print(f"DEBUG: Guardando gasto: {data.Nombre}, Total: {data.Monto}")
    print(f"DEBUG: Participantes a guardar: {participantes_ids}")
    print(f"DEBUG: Montos por participante: {monto_por_participante}")
        
    gasto = Gasto(
        
        IdViaje=data.IdViaje,
        Nombre=data.Nombre,
        Monto=data.Monto,
        IdCategoria=data.IdCategoria,
        IdPagador=id_pagador if not data.EsCompartido else data.IdPagador,
        FechaGasto=data.FechaGasto,
        DividirEntreTodos=data.DividirEntreTodos,
        TipoDivision=tipo_division_final,
    )

    db.add(gasto)
    db.flush() 
        
    for id_part in participantes_ids:
        db.add(
            ParticipantesGastos(
                IdGasto=gasto.IdGasto,
                IdParticipanteViaje=id_part,
                MontoAsignado=monto_por_participante.get(id_part)
            )
        )
    
    db.commit()
    db.refresh(gasto)

    return {
        "message": "Gasto creado correctamente",
        "IdGasto": gasto.IdGasto,
    }


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