from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.db.session import get_db 

router = APIRouter()

class VotoRequest(BaseModel):
    idPropuestas: List[int]

@router.post("/votaciones/{id_votacion}/votar")
def emitir_voto(id_votacion: int, request: VotoRequest, current_user_id: int = 1, db = Depends(get_db)):
    votacion = db.execute('SELECT * FROM public."Votaciones" WHERE "IdVotacion" = %s', (id_votacion,)).fetchone()
    if not votacion:
        raise HTTPException(status_code=404, detail="La votación no existe.")

    if datetime.now(timezone.utc) > votacion["FechaCierre"].replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="La votación ya ha cerrado.")

    ya_voto = db.execute('SELECT 1 FROM public."Votos" WHERE "IdUsuario" = %s AND "IdVotacion" = %s', (current_user_id, id_votacion)).fetchone()
    if ya_voto:
        raise HTTPException(status_code=400, detail="Ya has emitir un voto en esta votación.")

    if votacion["Tipo"] == "opcion_unica" and len(request.idPropuestas) > 1:
        raise HTTPException(status_code=400, detail="Solo puedes seleccionar una propuesta en esta votación.")

    if len(request.idPropuestas) == 0:
        raise HTTPException(status_code=400, detail="Debes seleccionar al menos una propuesta.")

    for id_propuesta in request.idPropuestas:
        db.execute(
            'INSERT INTO public."Votos" ("IdUsuario", "IdVotacion", "IdPropuesta") VALUES (%s, %s, %s)',
            (current_user_id, id_votacion, id_propuesta)
        )
    db.commit()

    return {"detail": "Voto registrado correctamente. ¡Gracias por participar!"}