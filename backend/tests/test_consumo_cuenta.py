from datetime import date, datetime, time, timezone

from sqlalchemy import select

from app.models.categorias_documento import CategoriaDocumento
from app.models.dia_cronograma import DiaCronograma
from app.models.documento_viaje import DocumentoViaje
from app.models.escaneo_comprobante import EscaneoComprobante
from app.models.estado_participacion import EstadoParticipacion
from app.models.estado_viaje import EstadoViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.plan import Plan
from app.models.rol_participante import RolParticipante
from app.models.sugerencia_actividad import SolicitudSugerenciaActividad
from app.models.usuario import Usuario
from app.models.viaje import Viaje
from app.services import consumo_cuenta, limites_planes as lp

URL = "/api/v1/users/me/consumo"


def test_consumo_concuerda_con_cupos_y_ignora_invitados(
    client, db_session, viaje_con_admin, usuario_activo, auth_headers
):
    db = db_session
    viaje, _ = viaje_con_admin
    invitado = Usuario(
        Nombre="Invitado",
        Apellido="Test",
        NombreUsuario="invitado_cupo",
        Email="invitado@test.invalid",
        HashedPassword="no-login",
    )
    db.add(invitado)
    db.flush()
    db.add(
        ParticipanteViaje(
            IdViaje=viaje.IdViaje,
            IdUsuario=invitado.IdUsuario,
            IdRolParticipante=db.scalar(
                select(RolParticipante.IdRolParticipante).where(
                    RolParticipante.Nombre == "participante"
                )
            ),
            IdEstadoParticipacion=db.scalar(
                select(EstadoParticipacion.IdEstadoParticipacion).where(
                    EstadoParticipacion.Nombre == "invitado"
                )
            ),
        )
    )
    db.add(
        EscaneoComprobante(
            IdViaje=viaje.IdViaje,
            IdUsuario=usuario_activo.IdUsuario,
            FechaEscaneo=datetime.now(timezone.utc),
        )
    )
    categoria = CategoriaDocumento(Nombre="Documentos consumo")
    db.add(categoria)
    db.flush()
    db.add(
        DocumentoViaje(
            IdViaje=viaje.IdViaje,
            IdUsuarioSubida=usuario_activo.IdUsuario,
            IdCategoriaDocumento=categoria.IdCategoriaDocumento,
            NombreArchivo="documento.pdf",
            UrlArchivo="local-test",
            TamanoBytes=2 * lp.BYTES_POR_MB,
        )
    )
    db.commit()
    r = client.get(URL, headers=auth_headers)
    assert r.status_code == 200, r.text
    datos = r.json()
    assert r.headers["cache-control"] == "no-store"
    assert (
        datos["viajesActivos"]["usoActual"]
        == lp.contar_viajes_activos(db, usuario_activo.IdUsuario)
        == 1
    )
    assert (
        datos["escaneosMensuales"]["usoActual"]
        == lp.contar_escaneos_mes(db, usuario_activo.IdUsuario)
        == 1
    )
    item = datos["items"][0]
    assert item["participantes"]["usoActual"] == lp.contar_participantes(db, viaje.IdViaje) == 1
    assert item["almacenamiento"]["usoActual"] == 2


def test_privacidad_participaciones_y_plan_de_otro_administrador(
    client, db_session, master_data, usuario_activo, auth_headers
):
    db = db_session
    otro = Usuario(
        Nombre="Organizador",
        Apellido="Pro",
        NombreUsuario="organizador_cupo",
        Email="organizador@test.invalid",
        HashedPassword="no-login",
        IdPlan=2,
    )
    db.add(otro)
    db.flush()
    estado = db.scalar(select(EstadoViaje.IdEstadoViaje).where(EstadoViaje.Nombre == "activo"))
    rol = db.scalar(
        select(RolParticipante.IdRolParticipante).where(RolParticipante.Nombre == "participante")
    )
    db.get(Plan, 2).MaxParticipantesViaje = 10
    visibles = []
    for nombre, participacion in [
        ("Ajeno privado", None),
        ("Invitacion pendiente", "invitado"),
        ("Viaje compartido", "aceptado"),
    ]:
        v = Viaje(
            Titulo=nombre,
            IdAdministrador=otro.IdUsuario,
            IdEstadoViaje=estado,
            Moneda="ARS",
            FechaInicio=date.today(),
            FechaFin=date.today(),
        )
        db.add(v)
        db.flush()
        if participacion:
            db.add(
                ParticipanteViaje(
                    IdViaje=v.IdViaje,
                    IdUsuario=usuario_activo.IdUsuario,
                    IdRolParticipante=rol,
                    IdEstadoParticipacion=db.scalar(
                        select(EstadoParticipacion.IdEstadoParticipacion).where(
                            EstadoParticipacion.Nombre == participacion
                        )
                    ),
                )
            )
        if participacion == "aceptado":
            visibles.append(v.IdViaje)
    db.commit()
    datos = client.get(URL, headers=auth_headers).json()
    assert [v["id"] for v in datos["items"]] == visibles
    assert datos["viajesActivos"]["usoActual"] == 0
    assert datos["items"][0]["participantes"]["limite"] == 10
    assert datos["items"][0]["planAdministrador"] == "pro"
    assert not datos["items"][0]["esAdministrador"]
    assert client.get(URL).status_code == 401


def test_sugerencias_por_dia_argentino_no_por_dia_utc(db_session, viaje_con_admin, usuario_activo):
    db = db_session
    viaje, _ = viaje_con_admin
    dia = DiaCronograma(IdViaje=viaje.IdViaje, Fecha=date(2026, 10, 24), IndiceDia=1)
    db.add(dia)
    db.flush()
    ahora = datetime(
        2026, 10, 24, 2, 30, tzinfo=timezone.utc
    )  # Sigue siendo 23 de octubre en Argentina.
    for fecha, estado in [
        (datetime(2026, 10, 23, 2, 59, tzinfo=timezone.utc), "completada"),
        (datetime(2026, 10, 23, 3, tzinfo=timezone.utc), "completada"),
        (ahora, "completada"),
        (ahora, "fallida"),
    ]:
        db.add(
            SolicitudSugerenciaActividad(
                IdViaje=viaje.IdViaje,
                IdUsuario=usuario_activo.IdUsuario,
                IdDiaCronograma=dia.IdDiaCronograma,
                HoraInicio=time(10),
                HoraFin=time(13),
                Estado=estado,
                FechaSolicitud=fecha,
            )
        )
    db.commit()
    datos = consumo_cuenta.consultar(db, usuario_activo, ahora=ahora)
    assert datos["items"][0]["sugerenciasDiarias"]["usoActual"] == 2


def test_paginacion_no_altera_total_personal_y_detecta_exceso(
    client, db_session, viaje_con_admin, usuario_activo, auth_headers
):
    db = db_session
    viaje, _ = viaje_con_admin
    for n in range(7):
        db.add(
            Viaje(
                Titulo=f"Viaje {n}",
                IdAdministrador=usuario_activo.IdUsuario,
                IdEstadoViaje=viaje.IdEstadoViaje,
                Moneda="ARS",
                FechaInicio=viaje.FechaInicio,
                FechaFin=viaje.FechaFin,
            )
        )
    db.commit()
    for pagina, cantidad in [(1, 6), (2, 2)]:
        datos = client.get(URL, params={"pagina": pagina}, headers=auth_headers).json()
        assert datos["total"] == 8 and len(datos["items"]) == cantidad
        assert datos["viajesActivos"]["usoActual"] == 8
        assert datos["viajesActivos"]["limiteExcedido"]
    db.get(Plan, 1).MaxViajesActivos = None
    db.commit()
    assert client.get(URL, headers=auth_headers).json()["viajesActivos"]["porcentajeUso"] is None
    viaje.IdEstadoViaje = db.scalar(
        select(EstadoViaje.IdEstadoViaje).where(EstadoViaje.Nombre == "finalizado")
    )
    db.commit()
    assert client.get(URL, headers=auth_headers).json()["total"] == 7
