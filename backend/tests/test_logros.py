from app.services.logros import armar_logros

URL = "/api/v1/users/me/logros"


def _logro(logros, id_logro):
    return next(logro for logro in logros if logro["id"] == id_logro)


def _metricas(**valores):
    return {"viajes": 0, "paises": 0, "viajesOrganizados": 0, "maxAmigosEnViaje": 0, **valores}


def test_sin_actividad_ningun_logro_esta_obtenido():
    logros = armar_logros(_metricas())

    assert all(not logro["obtenido"] for logro in logros)
    assert _logro(logros, "primer_viaje")["progresoTexto"] == "Te falta 1 viaje"
    assert _logro(logros, "explorador")["progresoTexto"] == "Te faltan 3 países"
    assert _logro(logros, "organizador")["progresoTexto"] == "Te falta 1 viaje organizado"
    assert _logro(logros, "gran_grupo")["progresoTexto"] == "Te faltan 5 amigos en un mismo viaje"


def test_el_primer_viaje_completa_su_logro_y_avanza_el_siguiente():
    logros = armar_logros(_metricas(viajes=1))

    primer = _logro(logros, "primer_viaje")
    assert primer["obtenido"] and primer["completo"]
    assert primer["progresoTexto"] == "Logro completo"
    frecuente = _logro(logros, "viajero_frecuente")
    assert frecuente["nivel"] == 0
    assert frecuente["meta"] == 3
    assert frecuente["progresoTexto"] == "Te faltan 2 viajes"


def test_logro_con_niveles_indica_el_proximo_nivel():
    frecuente = _logro(armar_logros(_metricas(viajes=4)), "viajero_frecuente")

    assert frecuente["obtenido"] is True
    assert frecuente["nivel"] == 1
    assert frecuente["meta"] == 5
    assert frecuente["progreso"] == 80
    assert frecuente["progresoTexto"] == "Te falta 1 viaje para el nivel 2"


def test_superar_el_ultimo_nivel_completa_el_logro():
    explorador = _logro(armar_logros(_metricas(paises=12)), "explorador")

    assert explorador["completo"] is True
    assert explorador["nivel"] == explorador["niveles"] == 3
    assert explorador["meta"] == 10
    assert explorador["progreso"] == 100


def test_gran_grupo_se_obtiene_con_cinco_amigos_en_un_viaje():
    assert _logro(armar_logros(_metricas(maxAmigosEnViaje=4)), "gran_grupo")["obtenido"] is False
    assert _logro(armar_logros(_metricas(maxAmigosEnViaje=5)), "gran_grupo")["completo"] is True


def test_endpoint_sin_viajes_devuelve_metricas_en_cero(client, auth_headers):
    respuesta = client.get(URL, headers=auth_headers)

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["metricas"] == {"viajes": 0, "paises": 0, "viajesOrganizados": 0, "maxAmigosEnViaje": 0}
    assert [logro["id"] for logro in datos["logros"]] == [
        "primer_viaje", "viajero_frecuente", "explorador", "organizador", "gran_grupo",
    ]


def test_endpoint_requiere_autenticacion(client):
    assert client.get(URL).status_code == 401