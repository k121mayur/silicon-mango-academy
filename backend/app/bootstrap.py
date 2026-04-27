import re

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session, selectinload

from app.core.database import Base, engine
from app.core.security import hash_password, normalize_email
from app.models import (
    Batch,
    BatchDeliveryMode,
    BatchSession,
    BatchStatus,
    Course,
    CourseDurationUnit,
    CourseType,
    SessionOrigin,
    User,
    UserRole,
)
from app.services.planning import backfill_existing_batches
from app.services.storage import ensure_upload_directories


def _extract_duration_weeks(duration: str) -> int | None:
    match = re.search(r"(\d+)", duration or "")
    if match is None:
        return None
    return int(match.group(1))


def _infer_duration_unit(duration: str) -> CourseDurationUnit:
    if "day" in (duration or "").lower():
        return CourseDurationUnit.DAYS
    return CourseDurationUnit.WEEKS


def _ensure_column(table_name: str, column_name: str, ddl: str) -> None:
    inspector = inspect(engine)
    existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name in existing_columns:
        return

    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {ddl}"))


def _ensure_nullable_column(table_name: str, column_name: str) -> None:
    inspector = inspect(engine)
    existing_columns = {column["name"]: column for column in inspector.get_columns(table_name)}
    column = existing_columns.get(column_name)
    if column is None or column.get("nullable", True):
        return

    dialect_name = engine.dialect.name
    if dialect_name.startswith("postgres"):
        with engine.begin() as connection:
            connection.execute(
                text(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} DROP NOT NULL")
            )


def ensure_schema_extensions() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "courses" not in table_names:
        return

    _ensure_column("courses", "duration_weeks", "duration_weeks INTEGER")
    _ensure_column("courses", "duration_unit", "duration_unit VARCHAR(20)")
    _ensure_column("courses", "duration_value", "duration_value INTEGER")
    _ensure_column("courses", "syllabus_pdf_path", "syllabus_pdf_path VARCHAR(500)")
    _ensure_column(
        "courses",
        "syllabus_pdf_original_name",
        "syllabus_pdf_original_name VARCHAR(255)",
    )
    _ensure_column("courses", "certificate_template_path", "certificate_template_path VARCHAR(500)")
    _ensure_column(
        "courses",
        "certificate_template_original_name",
        "certificate_template_original_name VARCHAR(255)",
    )
    _ensure_column("courses", "certificate_field_config", "certificate_field_config JSON")

    if "batches" in table_names:
        _ensure_column("batches", "delivery_mode", "delivery_mode VARCHAR(20)")
        _ensure_column("batches", "status", "status VARCHAR(20)")
        _ensure_column("batches", "completed_at", "completed_at TIMESTAMP WITH TIME ZONE")
        _ensure_column("batches", "completed_by_id", "completed_by_id INTEGER")

    if "batch_schedule_slots" in table_names:
        _ensure_column("batch_schedule_slots", "specific_date", "specific_date DATE")
        _ensure_nullable_column("batch_schedule_slots", "weekday")

    if "batch_sessions" in table_names:
        _ensure_column("batch_sessions", "week_plan_id", "week_plan_id INTEGER")
        _ensure_column("batch_sessions", "schedule_slot_id", "schedule_slot_id INTEGER")
        _ensure_column("batch_sessions", "origin", "origin VARCHAR(20)")
        _ensure_column("batch_sessions", "is_customized", "is_customized BOOLEAN")

    db = Session(bind=engine)
    try:
        courses = db.scalars(select(Course)).all()
        for course in courses:
            duration_value = course.duration_value or course.duration_weeks or _extract_duration_weeks(course.duration)
            course.duration_unit = course.duration_unit or _infer_duration_unit(course.duration)
            course.duration_value = duration_value or 1
            if course.duration_weeks is None:
                course.duration_weeks = (
                    course.duration_value if course.duration_unit == CourseDurationUnit.WEEKS else None
                )
            course.duration = f"{course.duration_value} {course.duration_unit.value}"
            db.add(course)

        batches = db.scalars(
            select(Batch)
            .options(
                selectinload(Batch.course),
                selectinload(Batch.schedule_slots),
                selectinload(Batch.week_plans),
                selectinload(Batch.sessions),
            )
        ).all()
        for batch in batches:
            if batch.delivery_mode is None:
                batch.delivery_mode = (
                    BatchDeliveryMode.LIVE
                    if batch.course.course_type == CourseType.LIVE
                    else BatchDeliveryMode.RECORDED
                )
            if batch.status is None:
                batch.status = BatchStatus.ACTIVE
            db.add(batch)

        sessions = db.scalars(select(BatchSession)).all()
        for session in sessions:
            if session.origin is None:
                session.origin = SessionOrigin.MANUAL
            if session.is_customized is None:
                session.is_customized = False
            db.add(session)

        db.commit()

        batches = db.scalars(
            select(Batch)
            .options(
                selectinload(Batch.course),
                selectinload(Batch.schedule_slots),
                selectinload(Batch.week_plans),
                selectinload(Batch.sessions),
            )
        ).all()
        backfill_existing_batches(db, batches)
        db.commit()
    finally:
        db.close()


def initialize_database() -> None:
    ensure_upload_directories()
    Base.metadata.create_all(bind=engine)
    ensure_schema_extensions()


def ensure_master_admin(
    db: Session,
    *,
    admin_name: str,
    admin_email: str,
    admin_password: str,
) -> None:
    normalized_email = normalize_email(admin_email)
    existing_admin = db.scalar(select(User).where(User.email == normalized_email))
    if existing_admin is not None:
        return

    db.add(
        User(
            name=admin_name.strip(),
            email=normalized_email,
            password_hash=hash_password(admin_password),
            role=UserRole.ADMIN,
        )
    )
    db.commit()
