from datetime import date, datetime, timezone

from app.core.security import hash_password
from app.models.usuario import Usuario
from app.services.backoffice import metricas_service, usuarios_service


def _utc(anio, mes, dia):
    return datetime(anio, mes, dia, 15, 0, tzinfo=timezone.utc)


def _usuario(db, nombre, fecha_alta):
    usuario = Usuario(
        Nombre=nombre.capitalize(),
        Apellido="Test",
        NombreUsuario=nombre,
        Email=f"{nombre}@test.com",
        HashedPassword=hash_password("Password123!"),
        Activo=True,
        EmailConfirmado=True,
        FechaAlta=fecha_alta,
    )
    db.add(usuario)
    db.commit()
    return usuario


def _nombres(pagina):
    return [item.nombreUsuario for item in pagina.items]


def test_filtrar_usuarios_por_rango_de_fecha_de_registro(db_session):
    _usuario(db_session, "marzo", _utc(2024, 3, 10))
    _usuario(db_session, "mayo", _utc(2024, 5, 10))

    pagina = usuarios_service.buscar_usuarios(
        db_session, None, None, None, None, 1, desde=date(2024, 3, 1), hasta=date(2024, 3, 31)
    )

    assert _nombres(pagina) == ["marzo"]
    assert pagina.total == 1


def test_filtrar_usuarios_solo_desde_una_fecha(db_session):
    _usuario(db_session, "marzo", _utc(2024, 3, 10))
    _usuario(db_session, "mayo", _utc(2024, 5, 10))

    pagina = usuarios_service.buscar_usuarios(
        db_session, None, None, None, None, 1, desde=date(2024, 4, 1)
    )

    assert "mayo" in _nombres(pagina)
    assert "marzo" not in _nombres(pagina)


def test_el_rango_historico_empieza_con_el_primer_registro(db_session):
    _usuario(db_session, "pionera", _utc(2023, 11, 5))
    _usuario(db_session, "mayo", _utc(2024, 5, 10))

    desde, hasta = metricas_service.rango_historico(db_session)

    assert desde == date(2023, 11, 5)
    assert hasta == metricas_service.hoy_ar()


def test_las_metricas_se_comparan_con_el_periodo_anterior(db_session):
    _usuario(db_session, "marzo", _utc(2024, 3, 10))
    _usuario(db_session, "mayo", _utc(2024, 5, 10))

    metricas = metricas_service.obtener_metricas(db_session, date(2024, 5, 1), date(2024, 5, 31))

    assert metricas.desdeAnterior == date(2024, 3, 31)
    assert metricas.hastaAnterior == date(2024, 4, 30)
    assert metricas.usuariosRegistrados.valor == 2
    assert metricas.usuariosRegistrados.anterior == 1
    assert metricas.usuariosActivos.anterior is None


def test_las_metricas_historicas_no_tienen_periodo_anterior(db_session):
    _usuario(db_session, "marzo", _utc(2024, 3, 10))

    metricas = metricas_service.obtener_metricas(
        db_session, date(2024, 3, 10), date(2024, 5, 31), historico=True
    )

    assert metricas.historico is True
    assert metricas.desdeAnterior is None
    assert metricas.usuariosRegistrados.anterior is None


def test_la_estacionalidad_cuenta_registros_por_anio_y_mes(db_session):
    _usuario(db_session, "marzo24", _utc(2024, 3, 10))
    _usuario(db_session, "mayo24", _utc(2024, 5, 10))
    _usuario(db_session, "marzo25", _utc(2025, 3, 2))

    metricas = metricas_service.obtener_metricas(db_session, date(2024, 5, 1), date(2024, 5, 31))
    filas = {fila.anio: fila.meses for fila in metricas.estacionalidad.usuarios}

    assert len(filas[2024]) == 12
    assert filas[2024][2] == 1
    assert filas[2024][4] == 1
    assert filas[2025][2] == 1
    assert metricas.estacionalidad.error is None


def test_la_estacionalidad_ignora_fechas_posteriores_al_anio_tope():
    filas = metricas_service._filas_estacionales(
        [date(2024, 1, 5), date(2024, 7, 1), date(2045, 6, 1)], hasta_anio=2027
    )

    assert [fila.anio for fila in filas] == [2024]
    assert filas[0].meses[0] == 1
    assert filas[0].meses[6] == 1