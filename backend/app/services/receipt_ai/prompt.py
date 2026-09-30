"""Prompt e instrucciones de salida para leer comprobantes (US 93).

Se mantienen fuera de los proveedores para que cualquier modelo reciba las
mismas reglas y el mismo esquema.
"""

from __future__ import annotations


def construir_prompt(categorias: list[str]) -> str:
    lista = ", ".join(f'"{c}"' for c in categorias) or "ninguna"
    return f"""Sos un sistema que lee comprobantes de pago (tickets, facturas, recibos)
para una aplicación de gastos de viaje. Analizá la imagen y devolvé solo el JSON pedido.

Reglas:
1. es_comprobante: false si la imagen no es un comprobante de pago (paisajes, personas,
   documentos que no registran una compra, etc.).
2. legible: false si es un comprobante pero no se puede leer el importe total.
3. monto_total: el TOTAL FINAL pagado. Nunca un subtotal, IVA u otro impuesto, propina
   sugerida, descuento, importe parcial, recargo ni el vuelto. Si hay varias líneas de
   total, usá el importe final a pagar. Devolvelo como número con punto decimal y sin
   separador de miles: en Argentina "1.234,56" significa 1234.56.
4. fecha: fecha de la operación en formato AAAA-MM-DD. Los comprobantes argentinos usan
   DD/MM/AA o DD/MM/AAAA: "03/05/26" es el 3 de mayo de 2026.
5. comercio: nombre comercial o de fantasía del local (por ejemplo "Café Martínez"). Si
   solo figura la razón social, usala. No incluyas CUIT, domicilio ni número de ticket.
6. moneda: código ISO 4217 (ARS, USD, EUR, BRL, CLP, UYU, etc.). moneda_explicita es
   true solo si el comprobante muestra el código, el nombre o un símbolo inequívoco de la
   moneda. El símbolo "$" solo es ambiguo: inferí la moneda por el país del comercio y
   marcá moneda_explicita en false.
7. categoria: exactamente una de estas: {lista}. Usá null si ninguna aplica.
8. Nunca inventes datos. Si un campo no se ve con claridad, devolvé null.
9. confianza: "alta" solo si el valor se lee con claridad; "baja" si está borroso,
   cortado, lo inferiste o tenés dudas. Para los campos en null usá "baja".
10. No incluyas datos personales (nombres de personas, CUIT, DNI, números de tarjeta) en
    ningún campo."""


def construir_esquema_json(categorias: list[str]) -> dict:
    """Esquema JSON (subconjunto soportado por Gemini) de la respuesta esperada."""
    confianza = {"type": "string", "enum": ["alta", "baja"]}
    opciones_categoria = [{"type": "null"}]
    if categorias:
        opciones_categoria.insert(0, {"type": "string", "enum": categorias})
    return {
        "type": "object",
        "properties": {
            "es_comprobante": {
                "type": "boolean",
                "description": "Si la imagen es un comprobante de pago.",
            },
            "legible": {
                "type": "boolean",
                "description": "Si el importe total del comprobante se puede leer.",
            },
            "monto_total": {
                "type": ["number", "null"],
                "description": "Importe total final pagado, sin separador de miles.",
            },
            "fecha": {
                "type": ["string", "null"],
                "format": "date",
                "description": "Fecha de la operación en formato AAAA-MM-DD.",
            },
            "comercio": {
                "type": ["string", "null"],
                "description": "Nombre comercial del local.",
            },
            "moneda": {
                "type": ["string", "null"],
                "description": "Código ISO 4217 de la moneda.",
            },
            "moneda_explicita": {
                "type": "boolean",
                "description": "Si la moneda figura de forma inequívoca en el comprobante.",
            },
            "categoria": {
                "anyOf": opciones_categoria,
                "description": "Categoría de gasto sugerida.",
            },
            "confianza": {
                "type": "object",
                "properties": {
                    "monto_total": confianza,
                    "fecha": confianza,
                    "comercio": confianza,
                    "moneda": confianza,
                    "categoria": confianza,
                },
                "required": ["monto_total", "fecha", "comercio", "moneda", "categoria"],
            },
        },
        "required": [
            "es_comprobante",
            "legible",
            "monto_total",
            "fecha",
            "comercio",
            "moneda",
            "moneda_explicita",
            "categoria",
            "confianza",
        ],
    }
