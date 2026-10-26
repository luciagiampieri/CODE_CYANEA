from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.destino_viaje import DestinoViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.usuario import Usuario
from app.models.viaje import Viaje

ESTADO_ACEPTADO = "aceptado"
ESTADOS_VIAJE_VALIDOS = ("borrador", "activo", "finalizado")
ESTADOS_VIAJE_CON_PAISES = ("activo", "finalizado")
ESTADO_FINALIZADO = "finalizado"


@dataclass(frozen=True)
class DefinicionLogro:
    id: str
    titulo: str
    descripcion: str
    icono: str
    metrica: str
    metas: tuple[int, ...]
    unidad: str
    unidad_plural: str
    contexto: str = ""


LOGROS = (
    DefinicionLogro(
        "primer_viaje", "Primer viaje", "Creá un viaje o sumate al de tu grupo.",
        "plane-departure", "viajes", (1,), "viaje", "viajes",
    ),
    DefinicionLogro(
        "viajero_frecuente", "Viajero frecuente", "Organizá o sumate a más viajes.",
        "suitcase-rolling", "viajes", (3, 5, 10), "viaje", "viajes",
    ),
    DefinicionLogro(
        "explorador", "Explorador", "Conocé países nuevos con tus viajes.",
        "earth-americas", "paises", (3, 5, 10), "país", "países",
    ),
    DefinicionLogro(
        "organizador", "Organizador", "Administrá un viaje hasta que finalice.",
        "flag-checkered", "viajesOrganizados", (1, 3), "viaje organizado", "viajes organizados",
    ),
    DefinicionLogro(
        "gran_grupo", "Gran grupo", "Viajá con 5 amigos o más en un mismo viaje.",
        "user-group", "maxAmigosEnViaje", (5,), "amigo", "amigos", " en un mismo viaje",
    ),
)



def _texto_progreso(definicion: DefinicionLogro, valor: int, nivel: int) -> str:
    if nivel == len(definicion.metas):
        return "Logro completo"
    faltan = definicion.metas[nivel] - valor
    verbo = "Te falta" if faltan == 1 else "Te faltan"
    unidad = definicion.unidad if faltan == 1 else definicion.unidad_plural
    texto = f"{verbo} {faltan} {unidad}{definicion.contexto}"
    if len(definicion.metas) > 1 and nivel > 0:
        texto += f" para el nivel {nivel + 1}"
    return texto


def armar_logros(metricas: dict[str, int]) -> list[dict]:
    logros = []
    for definicion in LOGROS:
        valor = metricas.get(definicion.metrica, 0)
        nivel = sum(1 for meta in definicion.metas if valor >= meta)
        completo = nivel == len(definicion.metas)
        meta = definicion.metas[-1] if completo else definicion.metas[nivel]
        logros.append(
            {
                "id": definicion.id,
                "titulo": definicion.titulo,
                "descripcion": definicion.descripcion,
                "icono": definicion.icono,
                "valor": valor,
                "meta": meta,
                "nivel": nivel,
                "niveles": len(definicion.metas),
                "obtenido": nivel > 0,
                "completo": completo,
                "progreso": min(100, round(valor * 100 / meta)),
                "progresoTexto": _texto_progreso(definicion, valor, nivel),
            }
        )
    return logros



def paises_visitados(db: Session, id_usuario: int, hoy: date | None = None) -> tuple[list[str], int]:
    """Países de viajes ya terminados en los que participó. Devuelve (países, viajes)."""
    hoy = hoy or date.today()
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
                ParticipanteViaje.IdUsuario == id_usuario,
                EstadoViaje.Nombre.in_(ESTADOS_VIAJE_CON_PAISES),
                EstadoParticipacion.Nombre == ESTADO_ACEPTADO,
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
    return paises, len(viajes)


def _ids_viajes(db: Session, id_usuario: int) -> list[int]:
    return list(
        db.scalars(
            select(ParticipanteViaje.IdViaje)
            .join(
                EstadoParticipacion,
                EstadoParticipacion.IdEstadoParticipacion == ParticipanteViaje.IdEstadoParticipacion,
            )
            .join(Viaje, Viaje.IdViaje == ParticipanteViaje.IdViaje)
            .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
            .where(
                ParticipanteViaje.IdUsuario == id_usuario,
                EstadoParticipacion.Nombre == ESTADO_ACEPTADO,
                EstadoViaje.Nombre.in_(ESTADOS_VIAJE_VALIDOS),
            )
        ).all()
    )


def _viajes_organizados(db: Session, id_usuario: int) -> int:
    return db.scalar(
        select(func.count(Viaje.IdViaje))
        .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
        .where(Viaje.IdAdministrador == id_usuario, EstadoViaje.Nombre == ESTADO_FINALIZADO)
    ) or 0


def _max_amigos_en_viaje(db: Session, ids_viajes: list[int]) -> int:
    if not ids_viajes:
        return 0
    conteos = db.execute(
        select(ParticipanteViaje.IdViaje, func.count().label("cantidad"))
        .join(
            EstadoParticipacion,
            EstadoParticipacion.IdEstadoParticipacion == ParticipanteViaje.IdEstadoParticipacion,
        )
        .where(
            ParticipanteViaje.IdViaje.in_(ids_viajes),
            EstadoParticipacion.Nombre == ESTADO_ACEPTADO,
        )
        .group_by(ParticipanteViaje.IdViaje)
    ).all()
    return max((cantidad - 1 for _, cantidad in conteos), default=0)


def metricas_usuario(db: Session, id_usuario: int, hoy: date | None = None) -> dict[str, int]:
    ids_viajes = _ids_viajes(db, id_usuario)
    paises, _ = paises_visitados(db, id_usuario, hoy)
    return {
        "viajes": len(ids_viajes),
        "paises": len(paises),
        "viajesOrganizados": _viajes_organizados(db, id_usuario),
        "maxAmigosEnViaje": _max_amigos_en_viaje(db, ids_viajes),
    }


def consultar(db: Session, usuario: Usuario) -> dict:
    metricas = metricas_usuario(db, usuario.IdUsuario)
    return {"metricas": metricas, "logros": armar_logros(metricas)}