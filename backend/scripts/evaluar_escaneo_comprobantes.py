"""Evalúa la precisión y el tiempo del escaneo de comprobantes (RNF-34, RNF-35).

Corre el mismo pipeline que la app (proveedor configurado + validación de
esquema + reglas de negocio) sobre un conjunto de comprobantes reales y lo
compara con los valores esperados cargados a mano.

Preparación:
  1. Crear una carpeta con las fotos (JPG/PNG), por ejemplo `evaluacion/`.
  2. Crear `evaluacion/esperado.csv` con estas columnas (separador coma):
       archivo,monto,fecha,comercio,moneda,categoria
     - monto con punto decimal (15230.50); fecha AAAA-MM-DD;
     - dejar vacío lo que no figura en el ticket (por ejemplo, sin fecha).
  3. En backend/.env: AI_RECEIPT_PROVIDER=gemini y GEMINI_API_KEY=...

Uso (desde backend/):
  python -m scripts.evaluar_escaneo_comprobantes evaluacion/
  python -m scripts.evaluar_escaneo_comprobantes evaluacion/ --salida resultados.csv

El RNF-35 pide al menos 85% de acierto en el monto total sobre 30 o más
comprobantes; el script informa si se cumple.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import statistics
import sys
import time
import unicodedata
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from app.services.receipt_ai import (
    ReceiptScanError,
    construir_resultado,
    get_receipt_extractor,
    validar_esquema,
    validar_documento,
)

# Las mismas categorías que siembra scripts/sql/007_datos_maestros.sql.
CATEGORIAS = {
    nombre: indice
    for indice, nombre in enumerate(
        [
            "Comida y Bebida",
            "Transporte",
            "Alojamiento",
            "Entretenimiento",
            "Compras",
            "Servicios",
            "Otros",
        ],
        start=1,
    )
}
NOMBRE_POR_ID = {v: k for k, v in CATEGORIAS.items()}
MONEDAS = {"ARS", "USD", "EUR", "BRL", "CLP", "UYU", "PYG", "BOB", "PEN", "COP", "MXN", "GBP"}

MINIMO_COMPROBANTES = 30
PRECISION_OBJETIVO = 0.85
TIEMPO_MAXIMO_SEGUNDOS = 15

CAMPOS = ["monto", "fecha", "comercio", "moneda", "categoria"]


def _normalizar_texto(texto: str | None) -> str:
    if not texto:
        return ""
    sin_tildes = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return " ".join(sin_tildes.lower().split())


def _comparar(campo: str, esperado: str, obtenido) -> bool:
    esperado = (esperado or "").strip()
    if not esperado:
        # AC9: si el dato no figura en el ticket, lo correcto es dejarlo vacío.
        return obtenido in (None, "")
    if obtenido in (None, ""):
        return False
    if campo == "monto":
        try:
            return Decimal(esperado) == Decimal(str(obtenido))
        except InvalidOperation:
            return False
    if campo == "comercio":
        # Coincidencia flexible: uno contiene al otro, sin tildes ni mayúsculas.
        a, b = _normalizar_texto(esperado), _normalizar_texto(str(obtenido))
        return a in b or b in a
    return _normalizar_texto(esperado) == _normalizar_texto(str(obtenido))


async def _procesar(extractor, ruta: Path) -> tuple[dict, float, str | None]:
    inicio = time.perf_counter()
    try:
        contenido = ruta.read_bytes()
        mime = validar_documento(contenido, ruta.name)
        crudo = await extractor.extraer(contenido, mime, list(CATEGORIAS.keys()))
        resultado = construir_resultado(validar_esquema(crudo), CATEGORIAS, MONEDAS)
        obtenido = {
            "monto": resultado.MontoOriginal,
            "fecha": resultado.FechaGasto.isoformat() if resultado.FechaGasto else None,
            "comercio": resultado.Nombre,
            "moneda": resultado.MonedaOriginal,
            "categoria": NOMBRE_POR_ID.get(resultado.IdCategoria),
        }
        return obtenido, time.perf_counter() - inicio, None
    except ReceiptScanError as error:
        return {}, time.perf_counter() - inicio, f"{error.code}: {error.message}"


async def evaluar(carpeta: Path, salida: Path | None) -> int:
    esperado_csv = carpeta / "esperado.csv"
    if not esperado_csv.exists():
        print(f"No se encontró {esperado_csv}", file=sys.stderr)
        return 2

    with esperado_csv.open(encoding="utf-8-sig", newline="") as archivo:
        filas = list(csv.DictReader(archivo))

    extractor = get_receipt_extractor()
    print(f"Proveedor: {extractor.nombre} | Comprobantes: {len(filas)}\n")

    aciertos = {campo: 0 for campo in CAMPOS}
    tiempos: list[float] = []
    detalle = []

    for fila in filas:
        ruta = carpeta / fila["archivo"]
        obtenido, segundos, error = await _procesar(extractor, ruta)
        tiempos.append(segundos)
        resultado_fila = {
            "archivo": fila["archivo"],
            "segundos": f"{segundos:.2f}",
            "error": error or "",
        }
        marcas = []
        for campo in CAMPOS:
            ok = error is None and _comparar(campo, fila.get(campo, ""), obtenido.get(campo))
            aciertos[campo] += ok
            resultado_fila[f"{campo}_esperado"] = fila.get(campo, "")
            resultado_fila[f"{campo}_obtenido"] = obtenido.get(campo, "")
            resultado_fila[f"{campo}_ok"] = ok
            marcas.append("✓" if ok else "✗")
        detalle.append(resultado_fila)
        print(f"{fila['archivo']:<30} {' '.join(marcas)}  {segundos:5.2f}s  {error or ''}")
        # Pausa corta para no chocar con el límite por minuto del plan gratuito.
        await asyncio.sleep(0.5)

    total = len(filas) or 1
    print("\nPrecisión por campo:")
    for campo in CAMPOS:
        print(f"  {campo:<10} {aciertos[campo]}/{len(filas)} = {aciertos[campo] / total:.0%}")

    tiempos_ordenados = sorted(tiempos)
    p95 = tiempos_ordenados[max(0, int(len(tiempos_ordenados) * 0.95) - 1)] if tiempos else 0
    print(
        f"\nTiempo: promedio {statistics.mean(tiempos or [0]):.2f}s | "
        f"p95 {p95:.2f}s | máximo {max(tiempos or [0]):.2f}s"
    )

    precision_monto = aciertos["monto"] / total
    print("\nRNF-35 (monto total ≥ 85% sobre ≥ 30 comprobantes):", end=" ")
    if len(filas) < MINIMO_COMPROBANTES:
        print(f"conjunto insuficiente ({len(filas)} < {MINIMO_COMPROBANTES})")
    else:
        print("CUMPLE" if precision_monto >= PRECISION_OBJETIVO else "NO CUMPLE")
    print(
        "RNF-34 (≤ 15 s por comprobante):",
        "CUMPLE" if max(tiempos or [0]) <= TIEMPO_MAXIMO_SEGUNDOS else "NO CUMPLE",
        "(medido sin la subida desde el celular)",
    )

    if salida:
        with salida.open("w", encoding="utf-8", newline="") as archivo:
            writer = csv.DictWriter(archivo, fieldnames=list(detalle[0].keys()))
            writer.writeheader()
            writer.writerows(detalle)
        print(f"\nDetalle guardado en {salida} ({date.today().isoformat()})")

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("carpeta", type=Path, help="Carpeta con las imágenes y esperado.csv")
    parser.add_argument("--salida", type=Path, help="CSV con el detalle por comprobante")
    args = parser.parse_args()
    sys.exit(asyncio.run(evaluar(args.carpeta, args.salida)))


if __name__ == "__main__":
    main()
