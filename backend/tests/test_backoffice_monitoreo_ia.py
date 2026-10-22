"""US 114: monitorear el consumo de los servicios de inteligencia artificial."""

import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest

from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.configuracion_monitoreo_ia import ConfiguracionMonitoreoIA
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.solicitud_ia import SolicitudIA
from app.models.usuario import Usuario
from app.services import registro_ia
from app.services.backoffice import metricas_service, monitoreo_ia_service
from app.services.mail import get_mail_service
from app.services.receipt_ai.gemini import GeminiReceiptExtractor

URL = "/api/v1/backoffice/monitoreo-ia"
URL_UMBRAL = f"{URL}/umbral"
LOGIN = "/api/v1/backoffice/auth/login"
PASS = "Segura123!"
REQUERIDAS = [
    "sugerencia_actividades",
    "escaneo_comprobantes",
    "deteccion_gastos_documentos",
    "generacion_portadas",
    "analisis_horarios",
]


class _MailFalso:
    def __init__(self):
        self.enviados = []

    def send_template(self, **kwargs):
        self.enviados.append(kwargs)
        return True


@pytest.fixture(autouse=True)
def roles_sistema(db_session):
    if db_session.get(RolSistema, ROL_VIAJERO) is None:
        db_session.add_all([
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
        ])
        db_session.commit()


@pytest.fixture
def mail(monkeypatch):
    """Reemplaza el correo tanto en las rutas como en el registro de solicitudes."""
    falso = _MailFalso()
    monkeypatch.setattr(monitoreo_ia_service, "get_mail_service", lambda: falso)
    app.dependency_overrides[get_mail_service] = lambda: falso
    yield falso
    app.dependency_overrides.pop(get_mail_service, None)


def _crear_usuario(db_session, email, rol=ROL_VIAJERO, **campos):
    datos = {
        "Email": email,
        "Nombre": "Nombre",
        "Apellido": "Apellido",
        "NombreUsuario": email.split("@")[0],
        "HashedPassword": hash_password(PASS),
        "Activo": True,
        "EmailConfirmado": True,
        "IdRolSistema": rol,
    }
    datos.update(campos)
    usuario = Usuario(**datos)
    db_session.add(usuario)
    db_session.commit()
    return usuario


@pytest.fixture
def headers_admin(client, db_session, mail):
    _crear_usuario(db_session, "admin@cyanea.test", ROL_ADMIN_SISTEMA)
    token = client.post(LOGIN, json={"email": "admin@cyanea.test", "password": PASS}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _hace(dias: int) -> date:
    return metricas_service.hoy_ar() - timedelta(days=dias)


def _utc(fecha: date) -> datetime:
    return datetime(fecha.year, fecha.month, fecha.day, 15, tzinfo=timezone.utc)


def _solicitud(servicio, dias=0, exitosa=True, duracion=1000, costo="0.01", fecha=None):
    return SolicitudIA(
        Servicio=servicio,
        Modelo="gemini-test",
        Exitosa=exitosa,
        DuracionMs=duracion,
        CostoEstimadoUSD=Decimal(costo),
        Fecha=fecha or _utc(_hace(dias)),
    )


def _por_servicio(datos):
    return {f["servicio"]: f for f in datos["funcionalidades"]}


def _gemini_falso(texto: str, usage: dict | None = None):
    def responder(request: httpx.Request) -> httpx.Response:
        cuerpo = {"candidates": [{"content": {"parts": [{"text": texto}]}}]}
        if usage is not None:
            cuerpo["usageMetadata"] = usage
        return httpx.Response(200, json=cuerpo)

    return httpx.MockTransport(responder)


def _extractor(transport, model="gemini-test"):
    return GeminiReceiptExtractor(api_key="clave", model=model, timeout_seconds=5, transport=transport)


# --- CA 1 / CP 7: solo administradores del sistema --------------------------

def test_cp7_viajero_no_puede_acceder_al_monitoreo(client, db_session):
    viajero = _crear_usuario(db_session, "viajero@cyanea.test")
    token = create_access_token({"sub": viajero.Email, "user_id": viajero.IdUsuario})
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get(URL, headers=headers).status_code == 401
    assert client.put(URL_UMBRAL, json={"umbralMensualUSD": 10}, headers=headers).status_code == 401


def test_sin_token_no_puede_acceder_al_monitoreo(client):
    assert client.get(URL).status_code == 401


# --- CA 2 y 3 / CP 1: consumo por funcionalidad en los últimos 30 días ------

def test_cp1_consumo_por_funcionalidad_ultimos_30_dias(client, db_session, headers_admin):
    db_session.add_all([
        _solicitud("sugerencia_actividades", 1, duracion=1000, costo="0.02"),
        _solicitud("sugerencia_actividades", 2, exitosa=False, duracion=3000, costo="0"),
        _solicitud("escaneo_comprobantes", 3, duracion=500, costo="0.005"),
        _solicitud("generacion_portadas", 5, duracion=4000, costo="0.0011"),
        _solicitud("sugerencia_actividades", 40, costo="5"),  # fuera del período
    ])
    db_session.commit()

    r = client.get(URL, headers=headers_admin)
    assert r.status_code == 200
    datos = r.json()
    assert datos["desde"] == _hace(29).isoformat()
    assert datos["hasta"] == _hace(0).isoformat()
    assert [f["servicio"] for f in datos["funcionalidades"]] == REQUERIDAS

    filas = _por_servicio(datos)
    assert filas["sugerencia_actividades"]["nombre"] == "Sugerencias de actividades"
    assert filas["sugerencia_actividades"]["solicitudes"] == 2
    assert filas["sugerencia_actividades"]["fallidas"] == 1
    assert filas["sugerencia_actividades"]["tiempoPromedioMs"] == 2000
    assert filas["sugerencia_actividades"]["costoEstimadoUSD"] == pytest.approx(0.02)
    assert filas["generacion_portadas"]["solicitudes"] == 1
    assert filas["analisis_horarios"]["solicitudes"] == 0
    assert filas["analisis_horarios"]["tiempoPromedioMs"] is None

    # CA 4: costo estimado del período a partir del consumo registrado.
    assert datos["totales"]["solicitudes"] == 4
    assert datos["totales"]["fallidas"] == 1
    assert datos["totales"]["costoEstimadoUSD"] == pytest.approx(0.0261)


def test_muestra_otras_funcionalidades_registradas(client, db_session, headers_admin):
    db_session.add(_solicitud("asistente_viaje", 1))
    db_session.commit()
    filas = _por_servicio(client.get(URL, headers=headers_admin).json())
    assert filas["asistente_viaje"]["nombre"] == "Asistente del viaje"
    assert filas["asistente_viaje"]["solicitudes"] == 1


# --- CP 2: las solicitudes de escaneo coinciden con las registradas ----------

def test_cp2_solicitudes_de_escaneo_coinciden_con_las_registradas(client, db_session, headers_admin):
    usage = {"promptTokenCount": 1000, "candidatesTokenCount": 200, "thoughtsTokenCount": 50}
    extractor = _extractor(_gemini_falso(json.dumps({"comercio": "Café"}), usage))
    for _ in range(3):
        asyncio.run(extractor.extraer(b"imagen", "image/jpeg", ["Comida"]))
    # Detección de gastos al subir un documento: mismo lector, otra funcionalidad.
    with registro_ia.servicio_ia(registro_ia.SERVICIO_DETECCION_GASTOS_DOCUMENTOS):
        asyncio.run(extractor.extraer(b"imagen", "image/jpeg", ["Comida"]))

    registradas = db_session.query(SolicitudIA).filter_by(Servicio="escaneo_comprobantes").count()
    filas = _por_servicio(client.get(URL, headers=headers_admin).json())
    assert filas["escaneo_comprobantes"]["solicitudes"] == registradas == 3
    assert filas["deteccion_gastos_documentos"]["solicitudes"] == 1

    solicitud = db_session.query(SolicitudIA).filter_by(Servicio="escaneo_comprobantes").first()
    assert solicitud.TokensEntrada == 1000
    assert solicitud.TokensSalida == 250
    assert solicitud.DuracionMs is not None
    # 1000 * 0.30 / 1M + 250 * 2.50 / 1M
    assert solicitud.CostoEstimadoUSD == Decimal("0.000925")


def test_registra_solicitud_fallida_de_escaneo(db_session):
    extractor = _extractor(httpx.MockTransport(lambda request: httpx.Response(500, text="caído")))
    with pytest.raises(Exception):
        asyncio.run(extractor.extraer(b"imagen", "image/jpeg", ["Comida"]))
    solicitud = db_session.query(SolicitudIA).one()
    assert solicitud.Servicio == "escaneo_comprobantes"
    assert solicitud.Exitosa is False
    assert solicitud.CostoEstimadoUSD == 0


def test_estimar_costo_usa_precios_lite_e_imagenes():
    assert registro_ia.estimar_costo_usd("gemini-3.5-flash-lite", 1_000_000, 1_000_000) == Decimal("0.500000")
    assert registro_ia.estimar_costo_usd("@cf/flux", imagenes=2) == Decimal("0.002200")
    assert registro_ia.estimar_costo_usd("gemini-x") == Decimal("0")


# --- CA 5 / CP 3: filtro por rango de fechas --------------------------------

def test_cp3_filtra_por_rango_de_fechas(client, db_session, headers_admin):
    db_session.add_all([
        _solicitud("escaneo_comprobantes", 2),
        _solicitud("escaneo_comprobantes", 10),
        _solicitud("escaneo_comprobantes", 11, exitosa=False),
        _solicitud("escaneo_comprobantes", 20),
    ])
    db_session.commit()

    r = client.get(URL, params={"desde": _hace(12).isoformat(), "hasta": _hace(9).isoformat()}, headers=headers_admin)
    assert r.status_code == 200
    filas = _por_servicio(r.json())
    assert filas["escaneo_comprobantes"]["solicitudes"] == 2
    assert filas["escaneo_comprobantes"]["fallidas"] == 1


def test_rango_invalido(client, headers_admin):
    r = client.get(URL, params={"desde": _hace(1).isoformat(), "hasta": _hace(5).isoformat()}, headers=headers_admin)
    assert r.status_code == 422


# --- CA 6 / CP 4: umbral mensual y alerta al superar el 80% -----------------

def test_sin_umbral_configurado(client, headers_admin):
    umbral = client.get(URL, headers=headers_admin).json()["umbral"]
    assert umbral["umbralMensualUSD"] is None
    assert umbral["nivel"] == "sin_umbral"


def test_cp4_supera_el_80_por_ciento_muestra_la_alerta(client, db_session, headers_admin, mail):
    r = client.put(URL_UMBRAL, json={"umbralMensualUSD": 10}, headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["nivel"] == "normal"

    db_session.add(_solicitud("sugerencia_actividades", fecha=datetime.now(timezone.utc), costo="8.50"))
    db_session.commit()

    umbral = client.get(URL, headers=headers_admin).json()["umbral"]
    assert umbral["umbralMensualUSD"] == 10
    assert umbral["costoMesActualUSD"] == pytest.approx(8.5)
    assert umbral["porcentajeUsado"] == 85
    assert umbral["nivel"] == "advertencia"
    assert mail.enviados == []


def test_80_por_ciento_justo_no_alerta(client, db_session, headers_admin):
    client.put(URL_UMBRAL, json={"umbralMensualUSD": 10}, headers=headers_admin)
    db_session.add(_solicitud("sugerencia_actividades", fecha=datetime.now(timezone.utc), costo="8"))
    db_session.commit()
    assert client.get(URL, headers=headers_admin).json()["umbral"]["nivel"] == "normal"


@pytest.mark.parametrize("valor", [0, -5, "abc"])
def test_umbral_invalido(client, headers_admin, valor):
    assert client.put(URL_UMBRAL, json={"umbralMensualUSD": valor}, headers=headers_admin).status_code == 422


def test_quitar_umbral(client, headers_admin):
    client.put(URL_UMBRAL, json={"umbralMensualUSD": 10}, headers=headers_admin)
    r = client.put(URL_UMBRAL, json={"umbralMensualUSD": None}, headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["nivel"] == "sin_umbral"


# --- CA 7 / CP 5: correo a los administradores al superar el umbral ---------

def test_cp5_superar_el_umbral_envia_correo_a_los_administradores(client, db_session, headers_admin, mail):
    _crear_usuario(db_session, "admin2@cyanea.test", ROL_ADMIN_SISTEMA)
    _crear_usuario(db_session, "suspendido@cyanea.test", ROL_ADMIN_SISTEMA, Activo=False)
    _crear_usuario(db_session, "viajero@cyanea.test")
    client.put(URL_UMBRAL, json={"umbralMensualUSD": 1}, headers=headers_admin)
    db_session.add(_solicitud("sugerencia_actividades", fecha=datetime.now(timezone.utc), costo="0.999999"))
    db_session.commit()

    # La solicitud que hace superar el umbral dispara el aviso.
    registro_ia.registrar_solicitud_ia(
        "sugerencia_actividades", "gemini-test", True, tokens_entrada=10_000, tokens_salida=1_000
    )

    assert len(mail.enviados) == 1
    correo = mail.enviados[0]
    assert sorted(correo["to"]) == ["admin2@cyanea.test", "admin@cyanea.test"]
    assert correo["template_name"] == "ai_cost_threshold.html"
    assert correo["context"]["umbral"] == "USD 1.00"
    assert client.get(URL, headers=headers_admin).json()["umbral"]["nivel"] == "superado"

    # No se repite en el mismo mes para el mismo umbral.
    registro_ia.registrar_solicitud_ia("sugerencia_actividades", "gemini-test", True, tokens_entrada=10_000)
    assert len(mail.enviados) == 1


def test_configurar_un_umbral_ya_superado_avisa_en_el_momento(client, db_session, headers_admin, mail):
    db_session.add(_solicitud("generacion_portadas", fecha=datetime.now(timezone.utc), costo="3"))
    db_session.commit()

    client.put(URL_UMBRAL, json={"umbralMensualUSD": 5}, headers=headers_admin)
    assert mail.enviados == []

    r = client.put(URL_UMBRAL, json={"umbralMensualUSD": 2}, headers=headers_admin)
    assert r.json()["nivel"] == "superado"
    assert r.json()["fechaUltimaAlerta"] is not None
    assert len(mail.enviados) == 1

    # Un umbral distinto vuelve a avisar.
    client.put(URL_UMBRAL, json={"umbralMensualUSD": 1}, headers=headers_admin)
    assert len(mail.enviados) == 2


def test_costo_de_meses_anteriores_no_cuenta_para_el_umbral(client, db_session, headers_admin, mail):
    inicio_mes = metricas_service.hoy_ar().replace(day=1)
    db_session.add(_solicitud("generacion_portadas", fecha=_utc(inicio_mes - timedelta(days=3)), costo="50"))
    db_session.commit()
    r = client.put(URL_UMBRAL, json={"umbralMensualUSD": 10}, headers=headers_admin)
    assert r.json()["costoMesActualUSD"] == 0
    assert mail.enviados == []


def test_si_falla_el_correo_se_reintenta(db_session, mail, monkeypatch):
    _crear_usuario(db_session, "admin@cyanea.test", ROL_ADMIN_SISTEMA)
    db_session.add(ConfiguracionMonitoreoIA(IdConfiguracionMonitoreoIA=1, UmbralCostoMensualUSD=Decimal("1")))
    db_session.add(_solicitud("generacion_portadas", fecha=datetime.now(timezone.utc), costo="2"))
    db_session.commit()

    def roto(**kwargs):
        raise RuntimeError("SMTP caído")

    monkeypatch.setattr(mail, "send_template", roto)
    assert monitoreo_ia_service.verificar_umbral_costo(db_session) is False
    assert db_session.get(ConfiguracionMonitoreoIA, 1).PeriodoUltimaAlerta is None

    monkeypatch.undo()
    falso = _MailFalso()
    monkeypatch.setattr(monitoreo_ia_service, "get_mail_service", lambda: falso)
    assert monitoreo_ia_service.verificar_umbral_costo(db_session) is True
    assert len(falso.enviados) == 1


# --- CA 8 / CP 6: sin contenido de las solicitudes ni datos personales ------

def test_cp6_el_monitoreo_no_muestra_el_contenido_de_las_solicitudes(client, db_session, headers_admin):
    _crear_usuario(db_session, "privado@cyanea.test", Nombre="Lucrecia", Apellido="Secreta")
    respuesta_ia = json.dumps({"comercio": "Farmacia Secreta 123", "total": 999})
    extractor = _extractor(_gemini_falso(respuesta_ia, {"promptTokenCount": 10}))
    asyncio.run(extractor.extraer(b"ticket privado", "image/jpeg", ["Salud"]))

    # La tabla solo tiene metadatos de consumo.
    columnas = set(SolicitudIA.__table__.columns.keys())
    assert columnas == {
        "IdSolicitudIA", "Fecha", "Servicio", "Modelo", "Exitosa", "DuracionMs",
        "TokensEntrada", "TokensSalida", "Imagenes", "CostoEstimadoUSD",
    }

    texto = client.get(URL, headers=headers_admin).text
    for dato in ("Farmacia Secreta", "ticket privado", "Salud", "privado@cyanea.test", "Lucrecia", "gemini-test"):
        assert dato not in texto
