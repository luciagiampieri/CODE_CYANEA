class MockAssistantClient:
    async def decide(self, message: str, context: dict) -> dict:
        text = message.lower()
        if "checklist" in text or "tarea" in text:
            return {
                "intent": "crear_checklist",
                "confidence": 0.8,
                "payload": {"nombre": message[:60] or "Nueva tarea"},
                "missingFields": [],
                "clarifyingQuestion": None,
                "response": None,
            }
        if "gasto" in text:
            categorias = context.get("categorias", {}).get("gastos", [])
            categoria = categorias[0] if categorias else {}
            return {
                "intent": "registrar_gasto",
                "confidence": 0.8,
                "payload": {
                    "nombre": "Comida cargada por asistente",
                    "monto": 1200,
                    "moneda": context.get("viaje", {}).get("moneda") or "ARS",
                    "idCategoria": categoria.get("id"),
                    "categoria": categoria.get("nombre"),
                },
                "missingFields": [],
                "clarifyingQuestion": None,
                "response": None,
            }
        return {
            "intent": "respuesta",
            "confidence": 0.8,
            "payload": {},
            "missingFields": [],
            "clarifyingQuestion": None,
            "response": "Puedo ayudarte con recomendaciones, itinerario, gastos y acciones del viaje.",
        }
