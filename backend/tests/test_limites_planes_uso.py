from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models.categorias_documento import CategoriaDocumento
from app.models.documento_viaje import DocumentoViaje
from app.models.escaneo_comprobante import EscaneoComprobante
from app.models.plan import PLAN_GRATUITO, Plan
from app.services import limites_planes as lp

MB = 1024 * 1024


def _set_limites(db, id_plan, **valores):
    plan = db.get(Plan, id_plan)
    for campo, valor in valores.items():
        setattr(plan, campo, valor)
    db.commit()


def _escaneo(db, usuario, viaje, fecha):
    db.add(EscaneoComprobante(IdUsuario=usuario.IdUsuario, IdViaje=viaje.IdViaje, FechaEscaneo=fecha))
    db.commit()


def _documento(db, viaje, usuario, nombre, tamano):
    categoria = db.query(CategoriaDocumento).filter_by(Nombre="Otros").first()
    if categoria is None:
        categoria = CategoriaDocumento(Nombre="Otros")
        db.add(categoria)
        db.flush()
    db.add(
        DocumentoViaje(
            IdViaje=viaje.IdViaje,
            IdCategoriaDocumento=categoria.IdCategoriaDocumento,
            IdUsuarioSubida=usuario.IdUsuario,
            NombreArchivo=nombre,
            UrlArchivo=f"viajes/{viaje.IdViaje}/Otros/{nombre}",
            TamanoBytes=tamano,
        )
    )
    db.commit()


def test_el_mes_empieza_el_primero_a_las_cero():
    miercoles = datetime(2026, 10, 21, 15, 30, tzinfo=lp.zona_horaria())

    inicio = lp.inicio_del_mes(miercoles)

    assert inicio.day == 1
    assert (inicio.hour, inicio.minute) == (0, 0)


def test_escaneos_de_meses_anteriores_y_futuros_no_cuentan(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    ahora = datetime.now(timezone.utc)
    _escaneo(db_session, usuario_activo, viaje, ahora)
    _escaneo(db_session, usuario_activo, viaje, lp.inicio_del_mes().astimezone(timezone.utc) - timedelta(seconds=1))

    _escaneo(db_session, usuario_activo, viaje, lp.inicio_del_mes_siguiente().astimezone(timezone.utc))
    assert lp.contar_escaneos_mes(db_session, usuario_activo.IdUsuario) == 1


def test_escanear_superando_limite_mensual_falla(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxEscaneosMensuales=1)
    _escaneo(db_session, usuario_activo, viaje, datetime.now(timezone.utc))

    with pytest.raises(HTTPException) as error:
        lp.validar_escaneos(db_session, usuario_activo)

    assert error.value.status_code == 409
    assert error.value.headers["X-Error-Code"] == "RECEIPT_SCAN_LIMIT_REACHED"
    assert error.value.detail["tipoLimite"] == "escaneos_mensuales"


def test_escanear_dentro_del_limite_pasa_y_se_registra(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxEscaneosMensuales=2)

    lp.validar_escaneos(db_session, usuario_activo)
    lp.registrar_escaneo(db_session, usuario_activo, viaje.IdViaje)

    assert lp.contar_escaneos_mes(db_session, usuario_activo.IdUsuario) == 1


def test_almacenamiento_suma_los_documentos_del_viaje(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _documento(db_session, viaje, usuario_activo, "a.pdf", 2 * MB)
    _documento(db_session, viaje, usuario_activo, "b.pdf", 1 * MB)
    _documento(db_session, viaje, usuario_activo, "viejo.pdf", None)

    assert lp.bytes_almacenados(db_session, viaje.IdViaje) == 3 * MB


def test_subir_documento_que_supera_almacenamiento_falla(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxAlmacenamientoMb=1)
    _documento(db_session, viaje, usuario_activo, "a.pdf", int(0.8 * MB))

    with pytest.raises(HTTPException) as error:
        lp.validar_almacenamiento(db_session, viaje, int(0.3 * MB))

    assert error.value.status_code == 409
    assert error.value.headers["X-Error-Code"] == "STORAGE_LIMIT_REACHED"
    assert error.value.detail["limite"] == 1.0
    assert error.value.detail["usoActual"] == 0.8


def test_subir_documento_dentro_del_almacenamiento_pasa(db_session, viaje_con_admin, usuario_activo):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxAlmacenamientoMb=1)
    _documento(db_session, viaje, usuario_activo, "a.pdf", int(0.5 * MB))

    lp.validar_almacenamiento(db_session, viaje, int(0.4 * MB))


def test_limites_del_usuario_por_api(client, db_session, master_data, auth_headers):
    _set_limites(db_session, PLAN_GRATUITO, MaxViajesActivos=5, MaxEscaneosMensuales=3)

    response = client.get("/api/v1/users/me/limites", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["plan"] == "gratuito"
    assert body["viajesActivos"]["limite"] == 5
    assert body["viajesActivos"]["usoActual"] == 0
    assert body["escaneosMensuales"]["limite"] == 3
    assert body["escaneosMensuales"]["renuevaEl"] is not None
    assert body["escaneosSemanales"] == body["escaneosMensuales"]


def test_limites_del_usuario_requiere_autenticacion(client):
    response = client.get("/api/v1/users/me/limites")

    assert response.status_code == 401

def test_renovacion_mensual_en_diciembre_y_bisiesto():
    zona = lp.zona_horaria()
    assert lp.inicio_del_mes_siguiente(datetime(2026, 12, 31, 23, tzinfo=zona)) == datetime(2027, 1, 1, tzinfo=zona)
    assert lp.inicio_del_mes_siguiente(datetime(2028, 2, 29, 15, tzinfo=zona)) == datetime(2028, 3, 1, tzinfo=zona)


def test_el_corte_mensual_es_argentino_aunque_utc_ya_cambio_de_mes():
    inicio = lp.inicio_del_mes(datetime(2026, 3, 1, 1, tzinfo=timezone.utc))
    assert (inicio.year, inicio.month, inicio.day, inicio.hour) == (2026, 2, 1, 0)
    assert inicio.utcoffset() == timedelta(hours=-3)
