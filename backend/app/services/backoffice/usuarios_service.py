import math
from datetime import date

from sqlalchemy import and_, func, or_, select
from app.models.plan import Plan
from sqlalchemy.orm import Session

from app.models.estado_participacion import EstadoParticipacion
from app.models.participante_viaje import ParticipanteViaje
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.usuario import Usuario
from app.schemas.backoffice_usuario import (
    UsuarioBackofficeDetalle,
    UsuarioBackofficeItem,
    UsuarioBackofficePagina,
)
from app.services.backoffice.metricas_service import limites_utc

TAMANIO_PAGINA = 20
PLAN_GRATUITO = "gratuito"
PLAN_PRO = "pro"

_CONDICIONES_ESTADO = {
    "inactiva": Usuario.FechaBaja.is_not(None),
    "pendiente": and_(
        Usuario.FechaBaja.is_(None),
        Usuario.EmailConfirmado.is_(False),
    ),
    "suspendida": and_(
        Usuario.FechaBaja.is_(None),
        Usuario.EmailConfirmado.is_(True),
        Usuario.Activo.is_(False),
    ),
    "activa": and_(
        Usuario.FechaBaja.is_(None),
        Usuario.EmailConfirmado.is_(True),
        Usuario.Activo.is_(True),
    ),
}


def estado_cuenta(usuario: Usuario) -> str:
    if usuario.FechaBaja is not None:
        return "inactiva"
    if not usuario.EmailConfirmado:
        return "pendiente"
    if not usuario.Activo:
        return "suspendida"
    return "activa"


def plan_usuario(usuario: Usuario) -> str:
    return usuario.Plan.Nombre if usuario.Plan else PLAN_GRATUITO


def _patron_busqueda(texto: str) -> str:
    escapado = texto.replace("/", "//").replace("%", "/%").replace("_", "/_")
    return f"%{escapado}%"


def _a_item(usuario: Usuario) -> UsuarioBackofficeItem:
    return UsuarioBackofficeItem(
        id=usuario.IdUsuario,
        nombreCompleto=f"{usuario.Nombre} {usuario.Apellido}".strip(),
        nombreUsuario=usuario.NombreUsuario,
        email=usuario.Email,
        plan=plan_usuario(usuario),
        estado=estado_cuenta(usuario),
        fechaRegistro=usuario.FechaAlta,
    )


def buscar_usuarios(
    db: Session,
    texto: str | None,
    estado: str | None,
    plan: str | None,
    metodo_registro: str | None,
    pagina: int,
    desde: date | None = None,
    hasta: date | None = None,
) -> UsuarioBackofficePagina:
    consulta = select(Usuario).where(
        Usuario.IdRolSistema.is_distinct_from(ROL_ADMIN_SISTEMA)
    )

    texto = (texto or "").strip()
    if texto:
        patron = _patron_busqueda(texto)
        nombre_completo = Usuario.Nombre + " " + Usuario.Apellido
        consulta = consulta.where(
            or_(
                nombre_completo.ilike(patron, escape="/"),
                Usuario.NombreUsuario.ilike(patron, escape="/"),
                Usuario.Email.ilike(patron, escape="/"),
            )
        )

    if estado:
        consulta = consulta.where(_CONDICIONES_ESTADO[estado])

    if plan:
        consulta = consulta.join(Usuario.Plan).where(Plan.Nombre == plan)

    if metodo_registro:
        consulta = consulta.where(
            Usuario.ProveedorAutenticacion == metodo_registro.strip().lower()
        )

    if desde:
        inicio, _ = limites_utc(desde, desde)
        consulta = consulta.where(Usuario.FechaAlta >= inicio)
    if hasta:
        _, fin = limites_utc(hasta, hasta)
        consulta = consulta.where(Usuario.FechaAlta < fin)

    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0

    usuarios = db.scalars(
        consulta.order_by(Usuario.FechaAlta.desc(), Usuario.IdUsuario.desc())
        .offset((pagina - 1) * TAMANIO_PAGINA)
        .limit(TAMANIO_PAGINA)
    ).all()

    return UsuarioBackofficePagina(
        items=[_a_item(u) for u in usuarios],
        total=total,
        pagina=pagina,
        tamanioPagina=TAMANIO_PAGINA,
        totalPaginas=math.ceil(total / TAMANIO_PAGINA) if total else 0,
    )


def obtener_detalle(db: Session, id_usuario: int) -> UsuarioBackofficeDetalle | None:
    usuario = db.get(Usuario, id_usuario)
    if usuario is None or usuario.IdRolSistema == ROL_ADMIN_SISTEMA:
        return None

    cantidad_viajes = db.scalar(
        select(func.count())
        .select_from(ParticipanteViaje)
        .join(
            EstadoParticipacion,
            EstadoParticipacion.IdEstadoParticipacion
            == ParticipanteViaje.IdEstadoParticipacion,
        )
        .where(
            ParticipanteViaje.IdUsuario == id_usuario,
            EstadoParticipacion.Nombre == "aceptado",
        )
    ) or 0

    return UsuarioBackofficeDetalle(
        **_a_item(usuario).model_dump(),
        nombre=usuario.Nombre,
        apellido=usuario.Apellido,
        fotoUrl=usuario.FotoUrl,
        metodoRegistro=usuario.ProveedorAutenticacion,
        emailConfirmado=usuario.EmailConfirmado,
        fechaBaja=usuario.FechaBaja,
        anonimizado=usuario.FechaBaja is not None,
        cantidadViajes=cantidad_viajes,
        estadoSuscripcion=None,
    )