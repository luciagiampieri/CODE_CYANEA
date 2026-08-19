from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.destino_viaje import DestinoViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.schemas.usuario import (
    UsuarioPhotoUploadResponse,
    UsuarioProfileRead,
    UsuarioProfileUpdate,
    UsuarioRead,
)
from app.services.supabase.storage import obtener_url_publica, subir_foto_perfil

router = APIRouter()


class PaisesVisitadosRead(BaseModel):
    paises: list[str]
    totalPaises: int
    totalViajes: int


def _serializar_usuario_actual(usuario: Usuario) -> UsuarioProfileRead:
    return UsuarioProfileRead(
        id=usuario.IdUsuario,
        nombre=usuario.Nombre,
        apellido=usuario.Apellido,
        nombreUsuario=usuario.NombreUsuario,
        nombreCompleto=f"{usuario.Nombre} {usuario.Apellido}",
        email=usuario.Email,
        fotoUrl=usuario.FotoUrl,
        consienteNotificacionesEmail=usuario.ConsienteNotificacionesEmail,
        recibeEmailsNuevaVotacion=usuario.RecibeEmailsNuevaVotacion,
        recibeEmailsCambiosViaje=usuario.RecibeEmailsCambiosViaje,
        recibeEmailsRecordatoriosDeuda=usuario.RecibeEmailsRecordatoriosDeuda,
        recibeEmailsRecordatoriosReserva=usuario.RecibeEmailsRecordatoriosReserva,
    )


@router.get("/me", response_model=UsuarioProfileRead)
def get_me(current_user: Usuario = Depends(get_current_user)) -> UsuarioProfileRead:
    return _serializar_usuario_actual(current_user)


@router.put("/me", response_model=UsuarioProfileRead)
def update_me(
    payload: UsuarioProfileUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> UsuarioProfileRead:
    nombre_usuario_normalizado = payload.nombreUsuario.strip()

    existente = db.scalar(
        select(Usuario).where(
            func.lower(Usuario.NombreUsuario) == nombre_usuario_normalizado.lower(),
            Usuario.IdUsuario != current_user.IdUsuario,
        )
    )
    if existente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El nombre de usuario ya está asociado a otra cuenta.",
        )

    current_user.Nombre = payload.nombre.strip()
    current_user.Apellido = payload.apellido.strip()
    current_user.NombreUsuario = nombre_usuario_normalizado
    current_user.FotoUrl = payload.fotoUrl.strip() if payload.fotoUrl else None

    db.commit()
    db.refresh(current_user)

    return _serializar_usuario_actual(current_user)


@router.post("/me/photo", response_model=UsuarioPhotoUploadResponse)
def upload_profile_photo(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> UsuarioPhotoUploadResponse:
    extension = (archivo.filename or "").lower().rsplit(".", 1)[-1] if archivo.filename else ""
    extensiones_permitidas = {"jpg", "jpeg", "png", "webp"}
    if extension not in extensiones_permitidas:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de archivo no permitido. Solo se permiten JPG, JPEG, PNG y WEBP.",
        )

    ruta_storage = subir_foto_perfil(archivo, current_user.IdUsuario)
    foto_url = obtener_url_publica(ruta_storage)

    current_user.FotoUrl = foto_url
    db.commit()

    return UsuarioPhotoUploadResponse(
        fotoUrl=foto_url,
        message="Foto de perfil actualizada correctamente.",
    )


@router.get("/me/paises-visitados", response_model=PaisesVisitadosRead)
def get_paises_visitados(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> PaisesVisitadosRead:
    hoy = date.today()

    viajes = (
        db.scalars(
            select(Viaje)
            .options(selectinload(Viaje.Destinos).selectinload(DestinoViaje.Destino))
            .join(ParticipanteViaje, ParticipanteViaje.IdViaje == Viaje.IdViaje)
            .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
            .join(
                EstadoParticipacion,
                EstadoParticipacion.IdEstadoParticipacion == ParticipanteViaje.IdEstadoParticipacion,
            )
            .where(
                ParticipanteViaje.IdUsuario == current_user.IdUsuario,
                EstadoViaje.Nombre.in_(["activo", "finalizado"]),
                EstadoParticipacion.Nombre == "aceptado",
                Viaje.FechaFin < hoy,
            )
        )
        .unique()
        .all()
    )

    paises = sorted(
        {
            rel.Destino.Pais
            for viaje in viajes
            for rel in viaje.Destinos
            if rel.Destino and rel.Destino.Pais
        }
    )

    return PaisesVisitadosRead(
        paises=paises,
        totalPaises=len(paises),
        totalViajes=len(viajes),
    )


@router.get("/", response_model=list[UsuarioRead])
def list_users(
    q: str | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
) -> list[UsuarioRead]:
    query = select(Usuario).where(Usuario.Activo.is_(True))

    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                Usuario.Nombre.ilike(pattern),
                Usuario.Apellido.ilike(pattern),
                Usuario.NombreUsuario.ilike(pattern),
                Usuario.Email.ilike(pattern),
            )
        )

    usuarios = db.scalars(query.order_by(Usuario.NombreUsuario).limit(limit)).all()

    return [
        UsuarioRead(
            id=usuario.IdUsuario,
            nombreUsuario=usuario.NombreUsuario,
            nombreCompleto=f"{usuario.Nombre} {usuario.Apellido}",
            email=usuario.Email,
            fotoUrl=usuario.FotoUrl,
        )
        for usuario in usuarios
    ]