from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.documento_viaje import DocumentoViaje
from app.models.escaneo_comprobante import EscaneoComprobante
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.plan import Plan
from app.models.sugerencia_actividad import SolicitudSugerenciaActividad
from app.models.usuario import Usuario
from app.models.viaje import Viaje

LIMITE_VIAJES_ACTIVOS = "viajes_activos"
LIMITE_VIAJES_ACTIVOS_DESTINATARIO = "viajes_activos_destinatario"
LIMITE_PARTICIPANTES = "participantes_viaje"
LIMITE_SUGERENCIAS = "sugerencias_diarias"
LIMITE_ESCANEOS = "escaneos_mensuales"
LIMITE_ALMACENAMIENTO = "almacenamiento"

CODIGOS_ERROR = {
    LIMITE_VIAJES_ACTIVOS: "ACTIVE_TRIP_LIMIT_REACHED",
    LIMITE_VIAJES_ACTIVOS_DESTINATARIO: "RECIPIENT_ACTIVE_TRIP_LIMIT_REACHED",
    LIMITE_PARTICIPANTES: "TRIP_PARTICIPANT_LIMIT_REACHED",
    LIMITE_SUGERENCIAS: "SUGGESTION_LIMIT_REACHED",
    LIMITE_ESCANEOS: "RECEIPT_SCAN_LIMIT_REACHED",
    LIMITE_ALMACENAMIENTO: "STORAGE_LIMIT_REACHED",
}

STATUS_ERROR = {
    LIMITE_SUGERENCIAS: status.HTTP_429_TOO_MANY_REQUESTS,
}

MENSAJES = {
    LIMITE_VIAJES_ACTIVOS: "Alcanzaste el límite de {limite} viajes activos de tu plan.",
    LIMITE_VIAJES_ACTIVOS_DESTINATARIO: (
        "La persona elegida alcanzó el límite de {limite} viajes activos de su plan "
        "y no puede recibir la administración."
    ),
    LIMITE_PARTICIPANTES: "El viaje alcanzó el límite de {limite} participantes del plan de su administrador.",
    LIMITE_SUGERENCIAS: (
        "El viaje alcanzó el límite de {limite} solicitudes de sugerencias por día del plan "
        "de su administrador. Podés intentar mañana o crear las actividades manualmente."
    ),
    LIMITE_ESCANEOS: (
        "Alcanzaste el límite de {limite} escaneos de comprobantes por mes de tu plan. "
        "Se renueva al comenzar el próximo mes. Podés cargar el gasto manualmente."
    ),
    LIMITE_ALMACENAMIENTO: (
        "El viaje alcanzó el límite de {limite} MB de almacenamiento del plan de su administrador."
    ),
}

ESTADOS_VIAJE_ACTIVOS = ("borrador", "activo")
ESTADO_PARTICIPACION_CONTABLE = "aceptado"
ESTADOS_SOLICITUD_QUE_CUENTAN = ("en_proceso", "completada")
BYTES_POR_MB = 1024 * 1024


@dataclass(frozen=True)
class UsoLimite:
    tipo: str
    limite: int | None
    uso: int
    renueva_el: datetime | None = None

    @property
    def ilimitado(self) -> bool:
        return self.limite is None

    def permite(self, incremento: int = 1) -> bool:
        return self.ilimitado or self.uso + incremento <= self.limite


def zona_horaria():
    try:
        return ZoneInfo(settings.ai_suggestions_timezone)
    except ZoneInfoNotFoundError:
        return timezone(timedelta(hours=-3))


def inicio_del_dia(ahora: datetime | None = None) -> datetime:
    ahora = ahora or datetime.now(zona_horaria())
    return ahora.replace(hour=0, minute=0, second=0, microsecond=0)


def inicio_del_mes(ahora: datetime | None = None) -> datetime:
    try:
        zona = ZoneInfo("America/Argentina/Buenos_Aires")
    except ZoneInfoNotFoundError:
        zona = timezone(timedelta(hours=-3))
    fecha = datetime.now(zona) if ahora is None else ahora.astimezone(zona)
    return fecha.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def inicio_del_mes_siguiente(ahora: datetime | None = None) -> datetime:
    inicio = inicio_del_mes(ahora)
    return inicio.replace(year=inicio.year + 1, month=1) if inicio.month == 12 else inicio.replace(month=inicio.month + 1)


def obtener_plan(
    db: Session,
    id_usuario: int,
    *,
    bloquear: bool = False,
    mensaje_error: str = "No se pudo verificar el plan del usuario.",
) -> Plan:
    id_plan = db.scalar(select(Usuario.IdPlan).where(Usuario.IdUsuario == id_usuario))
    consulta = (
        select(Plan)
        .where(Plan.IdPlan == id_plan)
        .execution_options(populate_existing=True)
    )
    if bloquear:
        consulta = consulta.with_for_update(read=True)
    plan = db.scalar(consulta)
    if plan is None or not plan.Activo:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            mensaje_error,
            headers={"X-Error-Code": "PLAN_UNAVAILABLE"},
        )
    return plan


def plan_de_usuario(db: Session, usuario: Usuario, *, bloquear: bool = False) -> Plan:
    return obtener_plan(db, usuario.IdUsuario, bloquear=bloquear)


def plan_de_viaje(db: Session, viaje: Viaje, *, bloquear: bool = False) -> Plan:
    return obtener_plan(
        db,
        viaje.IdAdministrador,
        bloquear=bloquear,
        mensaje_error="No se pudo verificar el cupo del plan del administrador.",
    )


def contar_viajes_activos(db: Session, id_usuario: int) -> int:
    return db.scalar(
        select(func.count(Viaje.IdViaje))
        .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
        .where(
            Viaje.IdAdministrador == id_usuario,
            EstadoViaje.Nombre.in_(ESTADOS_VIAJE_ACTIVOS),
        )
    ) or 0


def contar_participantes(db: Session, id_viaje: int) -> int:
    return db.scalar(
        select(func.count())
        .select_from(ParticipanteViaje)
        .join(ParticipanteViaje.EstadoParticipacion)
        .where(
            ParticipanteViaje.IdViaje == id_viaje,
            EstadoParticipacion.Nombre == ESTADO_PARTICIPACION_CONTABLE,
        )
    ) or 0


def contar_sugerencias_hoy(db: Session, id_viaje: int) -> int:
    desde = inicio_del_dia().astimezone(timezone.utc)
    hasta = desde + timedelta(days=1)
    return db.scalar(
        select(func.count())
        .select_from(SolicitudSugerenciaActividad)
        .where(
            SolicitudSugerenciaActividad.IdViaje == id_viaje,
            SolicitudSugerenciaActividad.FechaSolicitud >= desde,
            SolicitudSugerenciaActividad.FechaSolicitud < hasta,
            SolicitudSugerenciaActividad.Estado.in_(ESTADOS_SOLICITUD_QUE_CUENTAN),
        )
    ) or 0


def contar_escaneos_mes(db: Session, id_usuario: int) -> int:
    desde = inicio_del_mes().astimezone(timezone.utc)
    hasta = inicio_del_mes_siguiente().astimezone(timezone.utc)
    return db.scalar(
        select(func.count())
        .select_from(EscaneoComprobante)
        .where(
            EscaneoComprobante.IdUsuario == id_usuario,
            EscaneoComprobante.FechaEscaneo >= desde,
            EscaneoComprobante.FechaEscaneo < hasta,
        )
    ) or 0


def bytes_almacenados(db: Session, id_viaje: int) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(DocumentoViaje.TamanoBytes), 0)).where(
            DocumentoViaje.IdViaje == id_viaje
        )
    ) or 0


def uso_viajes_activos(db: Session, usuario: Usuario, *, bloquear: bool = False) -> UsoLimite:
    return UsoLimite(
        tipo=LIMITE_VIAJES_ACTIVOS,
        limite=plan_de_usuario(db, usuario, bloquear=bloquear).MaxViajesActivos,
        uso=contar_viajes_activos(db, usuario.IdUsuario),
    )


def uso_participantes(db: Session, viaje: Viaje, *, bloquear: bool = False) -> UsoLimite:
    return UsoLimite(
        tipo=LIMITE_PARTICIPANTES,
        limite=plan_de_viaje(db, viaje, bloquear=bloquear).MaxParticipantesViaje,
        uso=contar_participantes(db, viaje.IdViaje),
    )


def uso_sugerencias(db: Session, viaje: Viaje) -> UsoLimite:
    return UsoLimite(
        tipo=LIMITE_SUGERENCIAS,
        limite=plan_de_viaje(db, viaje).MaxSugerenciasDiarias,
        uso=contar_sugerencias_hoy(db, viaje.IdViaje),
        renueva_el=inicio_del_dia() + timedelta(days=1),
    )


def uso_escaneos(db: Session, usuario: Usuario) -> UsoLimite:
    return UsoLimite(
        tipo=LIMITE_ESCANEOS,
        limite=plan_de_usuario(db, usuario).MaxEscaneosMensuales,
        uso=contar_escaneos_mes(db, usuario.IdUsuario),
        renueva_el=inicio_del_mes_siguiente(),
    )


def uso_almacenamiento(db: Session, viaje: Viaje) -> UsoLimite:
    limite_mb = plan_de_viaje(db, viaje).MaxAlmacenamientoMb
    return UsoLimite(
        tipo=LIMITE_ALMACENAMIENTO,
        limite=None if limite_mb is None else limite_mb * BYTES_POR_MB,
        uso=bytes_almacenados(db, viaje.IdViaje),
    )


def _en_mb(valor: int) -> float:
    return round(valor / BYTES_POR_MB, 1)


def _texto_numero(valor: float | int) -> str:
    return str(int(valor)) if float(valor).is_integer() else str(valor)


def presentar(uso: UsoLimite) -> dict:
    if uso.tipo == LIMITE_ALMACENAMIENTO:
        limite = None if uso.limite is None else _en_mb(uso.limite)
        actual = _en_mb(uso.uso)
    else:
        limite = uso.limite
        actual = uso.uso
    return {
        "tipoLimite": uso.tipo,
        "limite": limite,
        "usoActual": actual,
        "ilimitado": uso.ilimitado,
        "renuevaEl": uso.renueva_el,
    }


def validar(uso: UsoLimite, incremento: int = 1) -> None:
    if uso.permite(incremento):
        return
    datos = presentar(uso)
    raise HTTPException(
        status_code=STATUS_ERROR.get(uso.tipo, status.HTTP_409_CONFLICT),
        detail={
            "mensaje": MENSAJES[uso.tipo].format(limite=_texto_numero(datos["limite"])),
            "tipoLimite": uso.tipo,
            "limite": datos["limite"],
            "usoActual": datos["usoActual"],
        },
        headers={"X-Error-Code": CODIGOS_ERROR[uso.tipo]},
    )


def _bloquear_usuario(db: Session, id_usuario: int) -> None:
    db.execute(
        select(Usuario.IdUsuario)
        .where(Usuario.IdUsuario == id_usuario)
        .with_for_update()
    )


def _bloquear_viaje(db: Session, id_viaje: int) -> None:
    db.execute(
        select(Viaje.IdViaje)
        .where(Viaje.IdViaje == id_viaje)
        .with_for_update()
    )


def validar_viajes_activos(db: Session, usuario: Usuario) -> None:
    _bloquear_usuario(db, usuario.IdUsuario)
    validar(uso_viajes_activos(db, usuario, bloquear=True))


def validar_viajes_activos_destinatario(db: Session, destinatario: Usuario) -> None:
    _bloquear_usuario(db, destinatario.IdUsuario)
    uso = uso_viajes_activos(db, destinatario, bloquear=True)
    validar(UsoLimite(tipo=LIMITE_VIAJES_ACTIVOS_DESTINATARIO, limite=uso.limite, uso=uso.uso))


def puede_recibir_administracion(db: Session, destinatario: Usuario) -> bool:
    _bloquear_usuario(db, destinatario.IdUsuario)
    return uso_viajes_activos(db, destinatario, bloquear=True).permite()


def validar_participantes(db: Session, viaje: Viaje) -> None:
    _bloquear_viaje(db, viaje.IdViaje)
    validar(uso_participantes(db, viaje, bloquear=True))


def validar_sugerencias(db: Session, viaje: Viaje, solicitudes: int = 1) -> None:
    _bloquear_viaje(db, viaje.IdViaje)
    validar(uso_sugerencias(db, viaje), solicitudes)


def validar_escaneos(db: Session, usuario: Usuario) -> None:
    _bloquear_usuario(db, usuario.IdUsuario)
    validar(uso_escaneos(db, usuario))


def registrar_escaneo(db: Session, usuario: Usuario, id_viaje: int) -> None:
    db.add(
        EscaneoComprobante(
            IdUsuario=usuario.IdUsuario,
            IdViaje=id_viaje,
            FechaEscaneo=datetime.now(timezone.utc),
        )
    )
    db.commit()


def validar_almacenamiento(db: Session, viaje: Viaje, bytes_nuevos: int) -> None:
    _bloquear_viaje(db, viaje.IdViaje)
    validar(uso_almacenamiento(db, viaje), bytes_nuevos)


def resumen_usuario(db: Session, usuario: Usuario) -> dict:
    escaneos = presentar(uso_escaneos(db, usuario))
    return {
        "plan": plan_de_usuario(db, usuario).Nombre,
        "viajesActivos": presentar(uso_viajes_activos(db, usuario)),
        "escaneosMensuales": escaneos,
        "escaneosSemanales": escaneos,
    }


def resumen_viaje(db: Session, viaje: Viaje) -> dict:
    return {
        "plan": plan_de_viaje(db, viaje).Nombre,
        "participantes": presentar(uso_participantes(db, viaje)),
        "sugerenciasDiarias": presentar(uso_sugerencias(db, viaje)),
        "almacenamiento": presentar(uso_almacenamiento(db, viaje)),
    }