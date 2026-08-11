from fastapi import APIRouter
from app.api.routes import auth, documentos, gastos, liquidaciones, monedas, places, repositorio, root, trips, users, votaciones

api_router = APIRouter()
api_router.include_router(root.router, tags=["root"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(trips.router, prefix="/trips", tags=["trips"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(gastos.router, prefix="/gastos", tags=["gastos"])
api_router.include_router(liquidaciones.router, prefix="/trips", tags=["liquidaciones"])
api_router.include_router(monedas.router, prefix="/monedas", tags=["monedas"])
api_router.include_router(votaciones.router, prefix="/votaciones", tags=["votaciones"])
api_router.include_router(documentos.router, prefix="/trips", tags=["documentos"])
api_router.include_router(repositorio.router, prefix="/trips", tags=["repositorio"])
api_router.include_router(places.router, tags=["places"])