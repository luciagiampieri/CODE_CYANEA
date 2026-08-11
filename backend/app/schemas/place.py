from datetime import date

from pydantic import BaseModel, Field


class TripPlaceDayRead(BaseModel):
    dayId: int
    dayIndex: int
    date: date


class TripPlaceCreate(BaseModel):
    placeId: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=200)
    address: str = Field(..., min_length=1, max_length=255)
    lat: float
    lng: float
    category: str | None = Field(default=None, max_length=100)
    photoUrl: str | None = Field(default=None, max_length=500)
    metadata: dict | None = None
    notes: str | None = None


class TripPlaceSearchRead(BaseModel):
    placeId: str
    name: str
    address: str
    country: str
    lat: float | None = None
    lng: float | None = None
    category: str | None = None
    provider: str | None = None
    metadata: dict | None = None


class PlaceReviewRead(BaseModel):
    authorName: str
    authorUrl: str | None = None
    profilePhotoUrl: str | None = None
    rating: float | None = None
    publishTime: str | None = None
    text: str | None = None
    relativePublishTimeDescription: str | None = None


class PlaceDetailRead(BaseModel):
    placeId: str
    name: str
    address: str
    category: str | None = None
    rating: float | None = None
    userRatingsTotal: int | None = None
    googleMapsUri: str | None = None
    reviews: list[PlaceReviewRead] = []


class PopularTripPlaceRead(BaseModel):
    placeId: str
    name: str
    address: str
    country: str
    lat: float | None = None
    lng: float | None = None
    category: str | None = None
    provider: str | None = None
    metadata: dict | None = None
    rating: float | None = None
    userRatingsTotal: int | None = None
    popularityScore: float | None = None


class PopularTripPlacesResponse(BaseModel):
    contextLabel: str | None = None
    items: list[PopularTripPlaceRead] = []


class TripPlaceRead(BaseModel):
    id: int
    placeId: str
    name: str
    address: str
    lat: float
    lng: float
    category: str | None = None
    photoUrl: str | None = None
    notes: str | None = None
    scheduledDays: list[TripPlaceDayRead] = []


class TripPlaceMutationResponse(BaseModel):
    message: str
    place: TripPlaceRead


class TripPlaceScheduleCreate(BaseModel):
    dayId: int | None = None
    dayIndex: int | None = None
    nombre: str = Field(..., min_length=1, max_length=150)
    descripcion: str | None = None
    horaInicio: str
    horaFin: str
    icono: str = Field(default="location-dot", max_length=50)


class NearbyPlaceRead(BaseModel):
    placeId: str
    name: str
    address: str
    lat: float | None = None
    lng: float | None = None
    category: str | None = None
    provider: str | None = None
    rating: float | None = None
    userRatingsTotal: int | None = None
    distanceMeters: float | None = None


class NearbyPlacesResponse(BaseModel):
    category: str | None = None
    items: list[NearbyPlaceRead] = []