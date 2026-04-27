from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, normalize_email, verify_password
from app.models import User
from app.schemas.auth import LoginRequest, LoginResponse, UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> LoginResponse:
    email = normalize_email(payload.email)
    user = db.scalar(select(User).where(User.email == email))

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive.",
        )

    return LoginResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserProfile.model_validate(user),
    )


@router.get("/me", response_model=UserProfile)
def read_current_user(current_user: Annotated[User, Depends(get_current_user)]) -> UserProfile:
    return UserProfile.model_validate(current_user)
