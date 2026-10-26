import asyncio


import app.main  

from app.db.session import SessionLocal
from app.services.fin_suscripciones import procesar_fin_suscripciones
from app.services.mail import get_mail_service
from app.services.pagos.mercadopago import get_cliente_pasarela


async def main() -> None:
    with SessionLocal() as db:
        resultado = await procesar_fin_suscripciones(
            db, get_cliente_pasarela(), get_mail_service()
        )
    print(resultado)


if __name__ == "__main__":
    asyncio.run(main())