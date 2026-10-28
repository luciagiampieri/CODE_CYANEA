from pydantic import BaseModel


class AccesoOfflineRead(BaseModel):
    IdsViajes: list[int]