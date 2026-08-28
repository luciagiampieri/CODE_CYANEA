from datetime import date, datetime, timezone
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import verify_password, hash_password
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
    UsuarioDeleteRequest
)
from app.services.supabase.storage import obtener_url_publica, subir_foto_perfil
from app.services.websocket_manager import manager

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
        proveedorAutenticacion=usuario.ProveedorAutenticacion,
        consienteNotificacionesEmail=usuario.ConsienteNotificacionesEmail,
        recibeEmailsNuevaVotacion=usuario.RecibeEmailsNuevaVotacion,
        recibeEmailsCambiosViaje=usuario.RecibeEmailsCambiosViaje,
        recibeEmailsRecordatoriosDeuda=usuario.RecibeEmailsRecordatoriosDeuda,
        recibeEmailsRecordatoriosReserva=usuario.RecibeEmailsRecordatoriosReserva,
    )


def _anonimizar_usuario(usuario: Usuario) -> None:
    usuario.Nombre = "Usuario"
    usuario.Apellido = "Anónimo"
    usuario.NombreUsuario = f"usuario_anonimo_{usuario.IdUsuario}"
    usuario.Email = f"usuario_anonimo_{usuario.IdUsuario}@cyanea.local"
    usuario.FotoUrl = None

    usuario.GoogleSub = None
    usuario.FacebookId = None

    usuario.HashedPassword = hash_password(secrets.token_urlsafe(24))

    usuario.ConsienteNotificacionesEmail = False
    usuario.RecibeEmailsNuevaVotacion = False
    usuario.RecibeEmailsCambiosViaje = False
    usuario.RecibeEmailsRecordatoriosDeuda = False
    usuario.RecibeEmailsRecordatoriosReserva = False

    usuario.Activo = False
    usuario.FechaBaja = datetime.now(timezone.utc)


def _reasignar_administracion_viajes(
    db: Session,
    usuario: Usuario,
) -> None:
    viajes = db.scalars(
        select(Viaje).where(
            Viaje.IdAdministrador == usuario.IdUsuario,
        )
    ).all()

    for viaje in viajes:
        
        if viaje.EstadoViaje.Nombre != "activo":
            continue

        nuevo_administrador = db.scalar(
            select(ParticipanteViaje)
            .join(
                Usuario,
                Usuario.IdUsuario == ParticipanteViaje.IdUsuario,
            )
            .join(
                EstadoParticipacion,
                EstadoParticipacion.IdEstadoParticipacion
                == ParticipanteViaje.IdEstadoParticipacion,
            )
            .where(
                ParticipanteViaje.IdViaje == viaje.IdViaje,
                ParticipanteViaje.IdUsuario != usuario.IdUsuario,
                Usuario.Activo.is_(True),
                EstadoParticipacion.Nombre == "aceptado",
            )
            .order_by(
                ParticipanteViaje.FechaIncorporacion.asc()
            )
        )

        if nuevo_administrador is not None:
            viaje.IdAdministrador = nuevo_administrador.IdUsuario


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


@router.post("/me/verify-password")
def verify_current_password(
    payload: UsuarioDeleteRequest,
    current_user: Usuario = Depends(get_current_user),
) -> dict:
    if current_user.ProveedorAutenticacion != "local":
        return

    if not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debés ingresar tu contraseña.",
        )

    if not verify_password(
        payload.password,
        current_user.HashedPassword,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Contraseña incorrecta.",
        )
    return {"valid": True}


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me(
    payload: UsuarioDeleteRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> None:

    viajes_usuario = []

    if current_user.ProveedorAutenticacion == "local":
        if not payload.password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debés ingresar tu contraseña para eliminar la cuenta.",
            )

        if not verify_password(
            payload.password,
            current_user.HashedPassword,
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="La contraseña ingresada es incorrecta.",
            )

        viajes_usuario = db.scalars(
            select(ParticipanteViaje.IdViaje)
            .join(
                EstadoParticipacion,
                EstadoParticipacion.IdEstadoParticipacion
                == ParticipanteViaje.IdEstadoParticipacion,
            )
            .where(
                ParticipanteViaje.IdUsuario == current_user.IdUsuario,
                EstadoParticipacion.Nombre == "aceptado",
            )
        ).all()

    _reasignar_administracion_viajes(db, current_user)
    _anonimizar_usuario(current_user)

    db.commit()

    for trip_id in viajes_usuario:
        await manager.broadcast_to_trip(
            trip_id,
            {"tipo": "usuario_anonimizado", "usuarioId": current_user.IdUsuario},
        )

