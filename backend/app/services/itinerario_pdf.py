"""PDF del itinerario exportado: portada y un apartado por día."""

import logging
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.services.exportar_itinerario import (
    DiaItinerario,
    EventoItinerario,
    ItinerarioExportado,
    fecha_larga,
    rango_fechas,
)

logger = logging.getLogger(__name__)

AZUL = colors.HexColor("#1e3e7b")
TEXTO = colors.HexColor("#374151")
GRIS = colors.HexColor("#6b7280")
BORDE = colors.HexColor("#e5e1d8")
MARGEN = 18 * mm
ANCHO_HORARIO = 30 * mm
ALTO_MAXIMO_PORTADA = 95 * mm


def _plano(valor: str | None) -> str:
    """Las fuentes estándar del PDF solo tienen caracteres de Windows-1252: se quitan
    los demás (emojis, por ejemplo) para que no salgan como cuadraditos."""
    return (valor or "").encode("cp1252", "ignore").decode("cp1252").strip()


def _texto(valor: str | None) -> str:
    return escape(_plano(valor)).replace("\n", "<br/>")


def _estilos() -> dict[str, ParagraphStyle]:
    return {
        "portada_titulo": ParagraphStyle(
            "portada_titulo", fontName="Helvetica-Bold", fontSize=28, leading=34, textColor=AZUL
        ),
        "portada_dato": ParagraphStyle(
            "portada_dato", fontName="Helvetica", fontSize=13, leading=18, textColor=TEXTO
        ),
        "nota": ParagraphStyle("nota", fontName="Helvetica", fontSize=9, leading=12, textColor=GRIS),
        "dia": ParagraphStyle(
            "dia", fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=AZUL,
            spaceBefore=8, keepWithNext=1,
        ),
        "dia_dato": ParagraphStyle(
            "dia_dato", fontName="Helvetica", fontSize=10, leading=13, textColor=GRIS,
            spaceAfter=6, keepWithNext=1,
        ),
        "horario": ParagraphStyle(
            "horario", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=AZUL
        ),
        "nombre": ParagraphStyle(
            "nombre", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=colors.black
        ),
        "texto": ParagraphStyle("texto", fontName="Helvetica", fontSize=9.5, leading=13, textColor=TEXTO),
        "libre": ParagraphStyle("libre", fontName="Helvetica-Oblique", fontSize=10, leading=13, textColor=GRIS),
    }


def _imagen(datos: bytes, ancho: float, alto_maximo: float) -> Image | None:
    try:
        ancho_original, alto_original = ImageReader(BytesIO(datos)).getSize()
        escala = min(ancho / ancho_original, alto_maximo / alto_original)
        return Image(BytesIO(datos), width=ancho_original * escala, height=alto_original * escala)
    except Exception:
        logger.warning("No se pudo usar la portada en el PDF", exc_info=True)
        return None


def _portada(itinerario: ItinerarioExportado, estilos, ancho: float) -> list:
    elementos: list = []
    imagen = _imagen(itinerario.portada, ancho, ALTO_MAXIMO_PORTADA) if itinerario.portada else None
    elementos.append(imagen if imagen is not None else Spacer(1, 40 * mm))
    elementos.append(Spacer(1, 10 * mm))
    elementos.append(Paragraph(_texto(itinerario.titulo), estilos["portada_titulo"]))
    elementos.append(Spacer(1, 4 * mm))
    if itinerario.destinos:
        elementos.append(Paragraph(_texto(itinerario.destinos), estilos["portada_dato"]))
    elementos.append(
        Paragraph(_texto(rango_fechas(itinerario.fecha_inicio, itinerario.fecha_fin)), estilos["portada_dato"])
    )
    elementos.append(Spacer(1, 14 * mm))
    generado = itinerario.generado_en.strftime("%d/%m/%Y a las %H:%M")
    elementos.append(
        Paragraph(
            _texto(
                f"Generado el {generado}. Refleja el itinerario en ese momento: "
                "si después cambia, volvé a exportarlo."
            ),
            estilos["nota"],
        )
    )
    return elementos


def _contenido_evento(evento: EventoItinerario, estilos) -> list:
    contenido = [Paragraph(_texto(evento.titulo), estilos["nombre"])]
    if evento.linea_traslado:
        contenido.append(Paragraph(_texto(evento.linea_traslado), estilos["texto"]))
    if evento.descripcion:
        contenido.append(Paragraph(_texto(evento.descripcion), estilos["texto"]))
    if evento.direccion:
        contenido.append(Paragraph(_texto(evento.direccion), estilos["texto"]))
    if evento.url_mapa:
        enlace = escape(evento.url_mapa, {'"': "&quot;"})
        contenido.append(
            Paragraph(
                f'<a href="{enlace}" color="#1e3e7b"><u>Abrir en Google Maps</u></a>',
                estilos["texto"],
            )
        )
    return contenido


def _dia(dia: DiaItinerario, estilos, ancho: float) -> list:
    dato = f"Día {dia.indice}" + (f" · {dia.destino}" if dia.destino else "")
    elementos: list = [
        Paragraph(_texto(fecha_larga(dia.fecha)), estilos["dia"]),
        Paragraph(_texto(dato), estilos["dia_dato"]),
    ]
    if not dia.eventos:
        elementos.append(Paragraph("Día libre", estilos["libre"]))
        elementos.append(Spacer(1, 6 * mm))
        return elementos

    filas = [
        [Paragraph(_texto(evento.horario), estilos["horario"]), _contenido_evento(evento, estilos)]
        for evento in dia.eventos
    ]
    tabla = Table(filas, colWidths=[ANCHO_HORARIO, ancho - ANCHO_HORARIO])
    tabla.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, BORDE),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (0, -1), 0),
            ]
        )
    )
    elementos.append(tabla)
    elementos.append(Spacer(1, 6 * mm))
    return elementos


def _pie(titulo: str):
    texto = _plano(titulo)

    def dibujar(canvas, documento):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(GRIS)
        canvas.drawString(documento.leftMargin, 10 * mm, texto)
        canvas.drawRightString(A4[0] - documento.rightMargin, 10 * mm, f"Página {documento.page}")
        canvas.restoreState()

    return dibujar


def generar_pdf(itinerario: ItinerarioExportado, *, comprimir: bool = True) -> bytes:
    buffer = BytesIO()
    documento = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGEN,
        rightMargin=MARGEN,
        topMargin=MARGEN,
        bottomMargin=22 * mm,
        title=_plano(f"Itinerario - {itinerario.titulo}"),
        author="Cyanea",
        pageCompression=1 if comprimir else 0,
    )
    ancho = A4[0] - 2 * MARGEN
    estilos = _estilos()
    elementos = _portada(itinerario, estilos, ancho)
    elementos.append(PageBreak())
    for dia in itinerario.dias:
        elementos.extend(_dia(dia, estilos, ancho))
    documento.build(elementos, onLaterPages=_pie(itinerario.titulo))
    return buffer.getvalue()