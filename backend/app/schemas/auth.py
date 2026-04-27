from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models import UserRole


class LoginRequest(BaseModel):
    email: str
    password: str


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfile
