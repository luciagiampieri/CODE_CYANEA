from pydantic import BaseModel

class MonedasRead(BaseModel):
    Codigo: str
    Nombre: str

    class Config:
        from_attributes = True