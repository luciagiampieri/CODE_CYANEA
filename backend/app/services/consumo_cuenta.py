"""Lectura de cupos con las mismas reglas que validan el consumo del dominio."""

from datetime import datetime, timedelta, timezone
from math import ceil

from sqlalchemy import func, or_, select

from app.models.documento_viaje import DocumentoViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.plan import Plan
from app.models.sugerencia_actividad import SolicitudSugerenciaActividad
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import limites_planes as limites

TAMANIO_PAGINA = 6


def _presentar(tipo, uso, limite, renueva=None):
    valor = limites.UsoLimite(tipo, limite, uso, renueva)
    return {
        **limites.presentar(valor),
        "porcentajeUso": None
        if limite is None
        else round(uso / limite * 100, 2)
        if limite > 0
        else 100,
        "limiteAlcanzado": limite is not None and uso >= limite,
        "limiteExcedido": limite is not None and uso > limite,
    }


def consultar(db, usuario, *, pagina=1, ahora=None):
    ahora = ahora or datetime.now(timezone.utc)
    plan = limites.plan_de_usuario(db, usuario)
    aceptados = (
        select(ParticipanteViaje.IdViaje)
        .join(
            EstadoParticipacion,
            EstadoParticipacion.IdEstadoParticipacion == ParticipanteViaje.IdEstadoParticipacion,
        )
        .where(
            ParticipanteViaje.IdUsuario == usuario.IdUsuario,
            EstadoParticipacion.Nombre == limites.ESTADO_PARTICIPACION_CONTABLE,
        )
    )
    consulta = (
        select(Viaje, EstadoViaje.Nombre, Plan)
        .join(EstadoViaje, EstadoViaje.IdEstadoViaje == Viaje.IdEstadoViaje)
        .join(Usuario, Usuario.IdUsuario == Viaje.IdAdministrador)
        .join(Plan, Plan.IdPlan == Usuario.IdPlan)
        .where(
            EstadoViaje.Nombre.in_(limites.ESTADOS_VIAJE_ACTIVOS),
            or_(Viaje.IdAdministrador == usuario.IdUsuario, Viaje.IdViaje.in_(aceptados)),
        )
    )
    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    filas = db.execute(
        consulta.order_by(
            (Viaje.IdAdministrador == usuario.IdUsuario).desc(),
            Viaje.FechaCreacion.desc(),
            Viaje.IdViaje.desc(),
        )
        .offset((pagina - 1) * TAMANIO_PAGINA)
        .limit(TAMANIO_PAGINA)
    ).all()
    ids = [v.IdViaje for v, _, _ in filas]
    participantes, sugerencias, archivos = {}, {}, {}
    inicio_local = limites.inicio_del_dia(ahora.astimezone(limites.zona_horaria()))
    inicio = inicio_local.astimezone(timezone.utc)
    if ids:
        participantes = dict(
            db.execute(
                select(ParticipanteViaje.IdViaje, func.count())
                .join(
                    EstadoParticipacion,
                    EstadoParticipacion.IdEstadoParticipacion
                    == ParticipanteViaje.IdEstadoParticipacion,
                )
                .where(
                    ParticipanteViaje.IdViaje.in_(ids),
                    EstadoParticipacion.Nombre == limites.ESTADO_PARTICIPACION_CONTABLE,
                )
                .group_by(ParticipanteViaje.IdViaje)
            ).all()
        )
        sugerencias = dict(
            db.execute(
                select(SolicitudSugerenciaActividad.IdViaje, func.count())
                .where(
                    SolicitudSugerenciaActividad.IdViaje.in_(ids),
                    SolicitudSugerenciaActividad.FechaSolicitud >= inicio,
                    SolicitudSugerenciaActividad.FechaSolicitud < inicio + timedelta(days=1),
                    SolicitudSugerenciaActividad.Estado.in_(limites.ESTADOS_SOLICITUD_QUE_CUENTAN),
                )
                .group_by(SolicitudSugerenciaActividad.IdViaje)
            ).all()
        )
        archivos = dict(
            db.execute(
                select(
                    DocumentoViaje.IdViaje, func.coalesce(func.sum(DocumentoViaje.TamanoBytes), 0)
                )
                .where(DocumentoViaje.IdViaje.in_(ids))
                .group_by(DocumentoViaje.IdViaje)
            ).all()
        )
    return dict(
        planActual=plan.Nombre,
        consultadoEl=ahora,
        viajesActivos=_presentar(
            limites.LIMITE_VIAJES_ACTIVOS,
            limites.contar_viajes_activos(db, usuario.IdUsuario),
            plan.MaxViajesActivos,
        ),
        escaneosMensuales=_presentar(
            limites.LIMITE_ESCANEOS,
            limites.contar_escaneos_mes(db, usuario.IdUsuario),
            plan.MaxEscaneosMensuales,
            limites.inicio_del_mes_siguiente(ahora),
        ),
        items=[
            dict(
                id=v.IdViaje,
                titulo=v.Titulo,
                estado=estado,
                esAdministrador=v.IdAdministrador == usuario.IdUsuario,
                planAdministrador=propietario.Nombre,
                participantes=_presentar(
                    limites.LIMITE_PARTICIPANTES,
                    participantes.get(v.IdViaje, 0),
                    propietario.MaxParticipantesViaje,
                ),
                sugerenciasDiarias=_presentar(
                    limites.LIMITE_SUGERENCIAS,
                    sugerencias.get(v.IdViaje, 0),
                    propietario.MaxSugerenciasDiarias,
                    inicio_local + timedelta(days=1),
                ),
                almacenamiento=_presentar(
                    limites.LIMITE_ALMACENAMIENTO,
                    archivos.get(v.IdViaje, 0),
                    None
                    if propietario.MaxAlmacenamientoMb is None
                    else propietario.MaxAlmacenamientoMb * limites.BYTES_POR_MB,
                ),
            )
            for v, estado, propietario in filas
        ],
        total=total,
        pagina=pagina,
        totalPaginas=ceil(total / TAMANIO_PAGINA),
    )
