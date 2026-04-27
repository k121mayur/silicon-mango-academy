from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, normalize_email, verify_password
from app.models import User, UserRole
from app.schemas.auth import LoginRequest, LoginResponse, StudentSignupRequest, UserProfile

router = APIRouter(prefix="/auth", tags=["auth"])


def _student_name_from_email(email: str) -> str:
    local_part = email.split("@", 1)[0].replace(".", " ").replace("_", " ").strip()
    return local_part.title() or "Student"


def _login_response_for_user(user: User) -> LoginResponse:
    return LoginResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserProfile.model_validate(user),
    )


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

    return _login_response_for_user(user)


@router.post("/signup", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def signup_student(
    payload: StudentSignupRequest,
    db: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    email = normalize_email(payload.email)
    existing_user = db.scalar(select(User.id).where(User.email == email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    student = User(
        name=_student_name_from_email(email),
        email=email,
        password_hash=hash_password(payload.password),
        role=UserRole.STUDENT,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return _login_response_for_user(student)


@router.get("/me", response_model=UserProfile)
def read_current_user(current_user: Annotated[User, Depends(get_current_user)]) -> UserProfile:
    return UserProfile.model_validate(current_user)
