from datetime import date, datetime, timezone
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.security import verify_password, hash_password
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.destino_viaje import DestinoViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.token_push_usuario import TokenPushUsuario
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.models.rol_participante import RolParticipante
from app.schemas.usuario import (
    UsuarioPhotoUploadResponse,
    UsuarioProfileRead,
    UsuarioProfileUpdate,
    ConsentimientoIARead,
    ConsentimientoIAUpdate,
    ConsentimientoAsistenteIARead,
    ConsentimientoAsistenteIAUpdate,
    PrivacidadRead,
    PrivacidadUpdate,
    PrivacidadUpdateResponse,
    UsuarioPushTokenResponse,
    UsuarioPushTokenUpsert,
    UsuarioRead,
    UsuarioDeleteRequest
)
from app.services.privacidad import VISIBILIDAD_PRIVADO, datos_visibles
from app.services.supabase.storage import obtener_url_publica, subir_foto_perfil
from app.services.websocket_manager import manager

router = APIRouter()


# Preferencias por tipo de notificación y canal (US 60): campo del payload
# -> atributo del modelo Usuario.
_PREFERENCIAS_NOTIFICACION = {
    "recibeEmailsNuevasActividades": "RecibeEmailsNuevasActividades",
    "recibeEmailsNuevaVotacion": "RecibeEmailsNuevaVotacion",
    "recibeEmailsCambiosViaje": "RecibeEmailsCambiosViaje",
    "recibeEmailsNuevosGastos": "RecibeEmailsNuevosGastos",
    "recibeEmailsRecordatoriosDeuda": "RecibeEmailsRecordatoriosDeuda",
    "recibeEmailsRecordatoriosActividad": "RecibeEmailsRecordatoriosActividad",
    "recibeEmailsRecordatoriosReserva": "RecibeEmailsRecordatoriosReserva",
    "recibePushNuevasActividades": "RecibePushNuevasActividades",
    "recibePushNuevaVotacion": "RecibePushNuevaVotacion",
    "recibePushCambiosViaje": "RecibePushCambiosViaje",
    "recibePushNuevosGastos": "RecibePushNuevosGastos",
    "recibePushRecordatoriosDeuda": "RecibePushRecordatoriosDeuda",
    "recibePushRecordatoriosActividad": "RecibePushRecordatoriosActividad",
    "recibePushRecordatoriosReserva": "RecibePushRecordatoriosReserva",
}


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
        consienteNotificacionesPush=usuario.ConsienteNotificacionesPush,
        consienteProcesamientoIA=usuario.ConsienteProcesamientoIA,
        consienteAsistenteIA=usuario.ConsienteAsistenteIA,
        fechaConsentimientoNotificacionesEmail=usuario.FechaConsentimientoNotificacionesEmail,
        fechaConsentimientoNotificacionesPush=usuario.FechaConsentimientoNotificacionesPush,
        fechaConsentimientoAsistenteIA=usuario.FechaConsentimientoAsistenteIA,
        recibeEmailsNuevasActividades=usuario.RecibeEmailsNuevasActividades,
        recibeEmailsNuevaVotacion=usuario.RecibeEmailsNuevaVotacion,
        recibeEmailsCambiosViaje=usuario.RecibeEmailsCambiosViaje,
        recibeEmailsNuevosGastos=usuario.RecibeEmailsNuevosGastos,
        recibeEmailsRecordatoriosDeuda=usuario.RecibeEmailsRecordatoriosDeuda,
        recibeEmailsRecordatoriosActividad=usuario.RecibeEmailsRecordatoriosActividad,
        recibeEmailsRecordatoriosReserva=usuario.RecibeEmailsRecordatoriosReserva,
        recibePushNuevasActividades=usuario.RecibePushNuevasActividades,
        recibePushNuevaVotacion=usuario.RecibePushNuevaVotacion,
        recibePushCambiosViaje=usuario.RecibePushCambiosViaje,
        recibePushNuevosGastos=usuario.RecibePushNuevosGastos,
        recibePushRecordatoriosDeuda=usuario.RecibePushRecordatoriosDeuda,
        recibePushRecordatoriosActividad=usuario.RecibePushRecordatoriosActividad,
        recibePushRecordatoriosReserva=usuario.RecibePushRecordatoriosReserva,
        aceptaTerminos=usuario.AceptaTerminos,
        fechaAceptacionTerminos=usuario.FechaAceptacionTerminos,
        versionTerminosAceptada=usuario.VersionTerminosAceptada,
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
    usuario.ConsienteNotificacionesPush = False
    usuario.FechaConsentimientoNotificacionesEmail = None
    usuario.FechaConsentimientoNotificacionesPush = None
    usuario.ConsienteProcesamientoIA = False
    usuario.FechaConsentimientoIA = None
    usuario.ConsienteAsistenteIA = False
    usuario.FechaConsentimientoAsistenteIA = None
    usuario.RecibeEmailsNuevasActividades = False
    usuario.RecibeEmailsNuevaVotacion = False
    usuario.RecibeEmailsCambiosViaje = False
    usuario.RecibeEmailsNuevosGastos = False
    usuario.RecibeEmailsRecordatoriosDeuda = False
    usuario.RecibeEmailsRecordatoriosActividad = False
    usuario.RecibeEmailsRecordatoriosReserva = False
    usuario.RecibePushNuevasActividades = False
    usuario.RecibePushNuevaVotacion = False
    usuario.RecibePushCambiosViaje = False
    usuario.RecibePushNuevosGastos = False
    usuario.RecibePushRecordatoriosDeuda = False
    usuario.RecibePushRecordatoriosActividad = False
    usuario.RecibePushRecordatoriosReserva = False

    # Una cuenta eliminada no se muestra ni se puede encontrar (US 61).
    usuario.VisibilidadNombre = VISIBILIDAD_PRIVADO
    usuario.VisibilidadEmail = VISIBILIDAD_PRIVADO
    usuario.VisibilidadFotoPerfil = VISIBILIDAD_PRIVADO
    usuario.PermiteBusquedaPorUsuario = False

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

        rol_administrador = db.scalar(
            select(RolParticipante).where(
                RolParticipante.Nombre == "administrador"
            )
        )

        if nuevo_administrador is not None:
            viaje.IdAdministrador = nuevo_administrador.IdUsuario
            nuevo_administrador.IdRolParticipante = rol_administrador.IdRolParticipante


@router.get("/me", response_model=UsuarioProfileRead)
def get_me(current_user: Usuario = Depends(get_current_user)) -> UsuarioProfileRead:
    return _serializar_usuario_actual(current_user)


@router.put("/me/consentimiento-ia", response_model=ConsentimientoIARead)
def update_ai_consent(
    payload: ConsentimientoIAUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> ConsentimientoIARead:
    """Otorga o revoca el consentimiento para procesar imágenes con un servicio
    externo de IA (US 93, RNF-13, RNF-33). Se registra la fecha en que se otorgó."""
    current_user.ConsienteProcesamientoIA = payload.consiente
    current_user.FechaConsentimientoIA = (
        datetime.now(timezone.utc) if payload.consiente else None
    )
    db.commit()
    db.refresh(current_user)
    return ConsentimientoIARead(
        consienteProcesamientoIA=current_user.ConsienteProcesamientoIA,
        fechaConsentimientoIA=current_user.FechaConsentimientoIA,
    )


@router.put("/me/consentimiento-asistente-ia", response_model=ConsentimientoAsistenteIARead)
def update_assistant_ai_consent(
    payload: ConsentimientoAsistenteIAUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> ConsentimientoAsistenteIARead:
    current_user.ConsienteAsistenteIA = payload.consiente
    current_user.FechaConsentimientoAsistenteIA = (
        datetime.now(timezone.utc) if payload.consiente else None
    )
    db.commit()
    db.refresh(current_user)
    return ConsentimientoAsistenteIARead(
        consienteAsistenteIA=current_user.ConsienteAsistenteIA,
        fechaConsentimientoAsistenteIA=current_user.FechaConsentimientoAsistenteIA,
    )


def _serializar_privacidad(usuario: Usuario) -> PrivacidadRead:
    return PrivacidadRead(
        visibilidadNombre=usuario.VisibilidadNombre,
        visibilidadEmail=usuario.VisibilidadEmail,
        visibilidadFotoPerfil=usuario.VisibilidadFotoPerfil,
        permiteBusquedaPorUsuario=usuario.PermiteBusquedaPorUsuario,
    )


@router.get("/me/privacidad", response_model=PrivacidadRead)
def get_privacy_settings(current_user: Usuario = Depends(get_current_user)) -> PrivacidadRead:
    """Preferencias de privacidad del perfil (US 61)."""
    return _serializar_privacidad(current_user)


@router.put("/me/privacidad", response_model=PrivacidadUpdateResponse)
def update_privacy_settings(
    payload: PrivacidadUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> PrivacidadUpdateResponse:
    """Actualiza qué datos del perfil ven los demás participantes de los viajes
    compartidos y si la cuenta se puede encontrar por nombre de usuario (US 61)."""
    current_user.VisibilidadNombre = payload.visibilidadNombre
    current_user.VisibilidadEmail = payload.visibilidadEmail
    current_user.VisibilidadFotoPerfil = payload.visibilidadFotoPerfil
    current_user.PermiteBusquedaPorUsuario = payload.permiteBusquedaPorUsuario
    db.commit()
    db.refresh(current_user)
    return PrivacidadUpdateResponse(
        **_serializar_privacidad(current_user).model_dump(),
        message="Tu información de privacidad se actualizó correctamente.",
    )


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

    # Campos opcionales: solo se tocan si vienen en el payload, para no
    # pisar el consentimiento/preferencias cuando se edita el perfil desde
    # la pantalla de "Cuenta" (que no los envía).
    ahora = datetime.now(timezone.utc)

    if payload.consienteNotificacionesEmail is not None:
        if payload.consienteNotificacionesEmail and not current_user.ConsienteNotificacionesEmail:
            current_user.FechaConsentimientoNotificacionesEmail = ahora
        elif not payload.consienteNotificacionesEmail:
            current_user.FechaConsentimientoNotificacionesEmail = None
        current_user.ConsienteNotificacionesEmail = payload.consienteNotificacionesEmail

    if payload.consienteNotificacionesPush is not None:
        if payload.consienteNotificacionesPush and not current_user.ConsienteNotificacionesPush:
            current_user.FechaConsentimientoNotificacionesPush = ahora
        elif not payload.consienteNotificacionesPush:
            current_user.FechaConsentimientoNotificacionesPush = None
            # Al revocar el consentimiento se dan de baja los tokens de todos
            # los dispositivos de la cuenta.
            db.execute(
                update(TokenPushUsuario)
                .where(
                    TokenPushUsuario.IdUsuario == current_user.IdUsuario,
                    TokenPushUsuario.Activo.is_(True),
                )
                .values(Activo=False, FechaBaja=ahora)
            )
        current_user.ConsienteNotificacionesPush = payload.consienteNotificacionesPush

    for campo_payload, atributo_modelo in _PREFERENCIAS_NOTIFICACION.items():
        valor = getattr(payload, campo_payload)
        if valor is not None:
            setattr(current_user, atributo_modelo, valor)

    db.commit()
    db.refresh(current_user)

    return _serializar_usuario_actual(current_user)


@router.post("/me/push-tokens", response_model=UsuarioPushTokenResponse)
def upsert_push_token(
    payload: UsuarioPushTokenUpsert,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> UsuarioPushTokenResponse:
    if not current_user.ConsienteNotificacionesPush:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Debes activar las notificaciones push antes de registrar el dispositivo.",
        )

    token_limpio = payload.token.strip()
    plataforma = payload.plataforma.strip().lower()
    dispositivo_id = payload.dispositivoId.strip() if payload.dispositivoId else None

    token = db.scalar(select(TokenPushUsuario).where(TokenPushUsuario.Token == token_limpio))

    if token is None:
        token = TokenPushUsuario(
            IdUsuario=current_user.IdUsuario,
            Token=token_limpio,
            Plataforma=plataforma,
            DispositivoId=dispositivo_id,
        )
        db.add(token)
    else:
        token.IdUsuario = current_user.IdUsuario
        token.Plataforma = plataforma
        token.DispositivoId = dispositivo_id
        token.Activo = True
        token.FechaBaja = None

    db.commit()
    db.refresh(token)

    return UsuarioPushTokenResponse(
        id=token.IdTokenPushUsuario,
        token=token.Token,
        plataforma=token.Plataforma,
        activo=token.Activo,
    )


@router.post("/me/push-tokens/revoke")
def revoke_push_token(
    payload: UsuarioPushTokenUpsert,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> dict[str, bool]:
    token = db.scalar(
        select(TokenPushUsuario).where(
            TokenPushUsuario.Token == payload.token.strip(),
            TokenPushUsuario.IdUsuario == current_user.IdUsuario,
        )
    )

    if token is not None:
        token.Activo = False
        token.FechaBaja = datetime.now(timezone.utc)
        db.commit()

    return {"revoked": True}


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


@router.get("", response_model=list[UsuarioRead])
def list_users(
    q: str | None = Query(default=None),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
) -> list[UsuarioRead]:
    """Búsqueda de usuarios para invitarlos a un viaje (US 61, CA 3).

    Solo busca por nombre de usuario y solo devuelve cuentas que permiten ser
    encontradas. El email nunca se expone acá: quien busca todavía no comparte
    un viaje con esas personas. Nombre y foto respetan la privacidad de cada
    usuario.
    """
    query = select(Usuario).where(
        Usuario.Activo.is_(True),
        or_(
            Usuario.PermiteBusquedaPorUsuario.is_(True),
            Usuario.IdUsuario == current_user.IdUsuario,
        ),
    )

    if q:
        pattern = f"%{q.strip()}%"
        query = query.where(Usuario.NombreUsuario.ilike(pattern))

    usuarios = db.scalars(query.order_by(Usuario.NombreUsuario).limit(limit)).all()

    resultado = []
    for usuario in usuarios:
        visibles = datos_visibles(usuario, current_user.IdUsuario, incluir_email=False)
        resultado.append(
            UsuarioRead(
                id=usuario.IdUsuario,
                nombreUsuario=usuario.NombreUsuario,
                nombreCompleto=visibles.nombreCompleto,
                email=None,
                fotoUrl=visibles.fotoUrl,
            )
        )
    return resultado


@router.post("/me/verify-password")
def verify_current_password(
    payload: UsuarioDeleteRequest,
    current_user: Usuario = Depends(get_current_user),
) -> dict:
    if current_user.ProveedorAutenticacion != "local":
        return {"valid": True}

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
    db.execute(
        update(TokenPushUsuario)
        .where(TokenPushUsuario.IdUsuario == current_user.IdUsuario)
        .values(Activo=False, FechaBaja=datetime.now(timezone.utc))
    )

    db.commit()

    for trip_id in viajes_usuario:
        await manager.broadcast_to_trip(
            trip_id,
            {"tipo": "usuario_anonimizado", "usuarioId": current_user.IdUsuario},
        )
