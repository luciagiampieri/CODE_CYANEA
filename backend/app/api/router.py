from fastapi import APIRouter

from app.api.routes import auth, root, trips, users, gastos, votaciones

api_router = APIRouter()
api_router.include_router(root.router, tags=["root"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(trips.router, prefix="/trips", tags=["trips"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(gastos.router, prefix="/gastos", tags=["gastos"])
api_router.include_router(votaciones.router, tags=["votaciones"])