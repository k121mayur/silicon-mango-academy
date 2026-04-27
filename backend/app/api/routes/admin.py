from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_admin
from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password, normalize_email
from app.models import (
    Batch,
    BatchEnrollment,
    BatchScheduleSlot,
    BatchStatus,
    BatchWeekPlan,
    CertificateIssue,
    Course,
    CourseDurationUnit,
    CourseCertificationCriterion,
    CourseFaq,
    CourseInstructor,
    CourseSyllabusItem,
    CourseTag,
    InstructorProfile,
    InstructorSkill,
    User,
    UserRole,
)
from app.schemas.admin import (
    BatchCertificateReleaseRequest,
    BatchCreate,
    BatchInstructorAssign,
    BatchRead,
    BatchStudentEnroll,
    BatchWeekPlanUpdate,
    CertificateFieldConfig,
    CourseCreate,
    CourseInstructorAssign,
    CourseRead,
    InstructorCreate,
    InstructorRead,
    StudentCreate,
    StudentRead,
)
from app.schemas.instructor import BatchCompletionRequest
from app.services.certificates import ensure_batch_certificate_ready, release_certificates_for_students
from app.services.planning import (
    get_course_duration_label,
    get_minimum_course_span_days,
    seed_batch_planning,
)
from app.services.storage import public_upload_url, save_upload_file

router = APIRouter(prefix="/admin", tags=["admin"])


def _course_query():
    return select(Course).options(
        selectinload(Course.tags),
        selectinload(Course.syllabus_items),
        selectinload(Course.faqs),
        selectinload(Course.certification_criteria),
        selectinload(Course.instructor_assignments),
        selectinload(Course.batches).selectinload(Batch.schedule_slots),
        selectinload(Course.batches).selectinload(Batch.week_plans),
        selectinload(Course.batches).selectinload(Batch.assigned_instructor),
        selectinload(Course.batches).selectinload(Batch.completed_by),
        selectinload(Course.batches)
        .selectinload(Batch.enrollments)
        .selectinload(BatchEnrollment.student),
        selectinload(Course.batches)
        .selectinload(Batch.certificate_issues)
        .selectinload(CertificateIssue.student),
    )


def _batch_query():
    return select(Batch).options(
        selectinload(Batch.course),
        selectinload(Batch.schedule_slots),
        selectinload(Batch.week_plans),
        selectinload(Batch.sessions),
        selectinload(Batch.assigned_instructor),
        selectinload(Batch.completed_by),
        selectinload(Batch.enrollments).selectinload(BatchEnrollment.student),
        selectinload(Batch.certificate_issues).selectinload(CertificateIssue.student),
    )


def _instructor_query():
    return (
        select(User)
        .where(User.role == UserRole.INSTRUCTOR)
        .options(
            selectinload(User.instructor_profile).selectinload(InstructorProfile.skills),
        )
        .order_by(User.created_at.desc())
    )


def _student_query():
    return select(User).where(User.role == UserRole.STUDENT).order_by(User.created_at.desc())


def _ensure_unique_email(db: Session, email: str) -> None:
    existing_user = db.scalar(select(User.id).where(User.email == email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )


def _get_instructor_user(db: Session, instructor_id: int) -> User:
    instructor = db.scalar(
        select(User)
        .where(User.id == instructor_id, User.role == UserRole.INSTRUCTOR)
        .options(
            selectinload(User.instructor_profile).selectinload(InstructorProfile.skills),
        )
    )
    if instructor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instructor not found.",
        )
    return instructor


def _get_student_user(db: Session, student_id: int) -> User:
    student = db.scalar(select(User).where(User.id == student_id, User.role == UserRole.STUDENT))
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found.",
        )
    return student


def _get_course(db: Session, course_id: int) -> Course:
    course = db.scalar(_course_query().where(Course.id == course_id))
    if course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found.",
        )
    return course


def _get_batch(db: Session, batch_id: int) -> Batch:
    batch = db.scalar(_batch_query().where(Batch.id == batch_id))
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found.",
        )
    return batch


def _ensure_batch_active(batch: Batch) -> None:
    if batch.status == BatchStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completed batches are read-only for planning changes.",
        )


def _parse_certificate_field_config(raw_value: str) -> dict:
    try:
        parsed = json.loads(raw_value)
        return CertificateFieldConfig.model_validate(parsed).model_dump()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid certificate field configuration.",
        ) from exc


def _validate_image_upload(upload: UploadFile, *, field_label: str) -> None:
    filename = (upload.filename or "").lower()
    allowed_extensions = (".png", ".jpg", ".jpeg", ".webp", ".gif")
    if not filename.endswith(allowed_extensions):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_label} must be an image file.",
        )


def _validate_pdf_upload(upload: UploadFile, *, field_label: str) -> None:
    if not (upload.filename or "").lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_label} must be uploaded as a PDF file.",
        )


def _coerce_upload(value) -> UploadFile | None:
    if value is None or not hasattr(value, "filename") or not hasattr(value, "read"):
        return None
    return value


async def _parse_course_create_request(request: Request) -> tuple[CourseCreate, UploadFile | None, UploadFile | None]:
    content_type = request.headers.get("content-type", "").lower()

    try:
        if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            raw_payload = form.get("payload")
            if raw_payload is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Course payload is required.",
                )
            payload = CourseCreate.model_validate(json.loads(str(raw_payload)))
            banner_image = form.get("banner_image")
            syllabus_pdf = form.get("syllabus_pdf")
            return (
                payload,
                _coerce_upload(banner_image),
                _coerce_upload(syllabus_pdf),
            )

        payload = CourseCreate.model_validate(await request.json())
        return payload, None, None
    except HTTPException:
        raise
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(),
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid course payload.",
        ) from exc


def _validate_schedule_slots(course: Course, payload: BatchCreate) -> None:
    if payload.delivery_mode != BatchDeliveryMode.LIVE:
        return

    if course.duration_unit == CourseDurationUnit.DAYS:
        expected_dates = [
            payload.start_date + timedelta(days=index)
            for index in range(course.duration_value)
        ]
        submitted_dates = [slot.specific_date for slot in payload.schedule_slots]
        if any(schedule_date is None for schedule_date in submitted_dates):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Day-based live batches require a schedule date and time for each course day.",
            )

        if submitted_dates != expected_dates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Day-based live batch schedule must include one slot for each course day in order.",
            )
        return

    for slot in payload.schedule_slots:
        if slot.weekday is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Weekly live batches require a weekday for each schedule slot.",
            )


@router.post("/users/instructors", response_model=InstructorRead, status_code=status.HTTP_201_CREATED)
def create_instructor(
    payload: InstructorCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> InstructorRead:
    email = normalize_email(payload.email)
    _ensure_unique_email(db, email)

    instructor = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(settings.default_instructor_password),
        role=UserRole.INSTRUCTOR,
    )
    instructor.instructor_profile = InstructorProfile(
        mobile_number=payload.mobile_number.strip(),
        skills=[
            InstructorSkill(name=skill, sort_order=index)
            for index, skill in enumerate(payload.skills)
        ],
    )

    db.add(instructor)
    db.commit()
    db.refresh(instructor)

    created_instructor = db.scalar(_instructor_query().where(User.id == instructor.id))
    return InstructorRead.model_validate(created_instructor)


@router.get("/users/instructors", response_model=list[InstructorRead])
def list_instructors(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> list[InstructorRead]:
    instructors = db.scalars(_instructor_query()).all()
    return [InstructorRead.model_validate(instructor) for instructor in instructors]


@router.post("/users/students", response_model=StudentRead, status_code=status.HTTP_201_CREATED)
def create_student(
    payload: StudentCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> StudentRead:
    email = normalize_email(payload.email)
    _ensure_unique_email(db, email)

    student = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=UserRole.STUDENT,
    )

    db.add(student)
    db.commit()
    db.refresh(student)
    return StudentRead.model_validate(student)


@router.get("/users/students", response_model=list[StudentRead])
def list_students(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> list[StudentRead]:
    students = db.scalars(_student_query()).all()
    return [StudentRead.model_validate(student) for student in students]


@router.post("/courses", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
async def create_course(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> CourseRead:
    payload, banner_image, syllabus_pdf = await _parse_course_create_request(request)

    if banner_image is not None:
        _validate_image_upload(banner_image, field_label="Course banner")
    if syllabus_pdf is not None:
        _validate_pdf_upload(syllabus_pdf, field_label="Course syllabus")

    banner_url = payload.banner_url
    if banner_image is not None:
        relative_path, _, _ = await save_upload_file(banner_image, folder="course_banners")
        banner_url = public_upload_url(relative_path)

    syllabus_pdf_path = None
    syllabus_pdf_original_name = None
    if syllabus_pdf is not None:
        syllabus_pdf_path, _, syllabus_pdf_original_name = await save_upload_file(
            syllabus_pdf,
            folder="course_syllabi",
        )

    course = Course(
        course_type=payload.course_type,
        title=payload.title.strip(),
        description=payload.description.strip(),
        duration=f"{payload.duration_value} {payload.duration_unit.value}",
        duration_unit=payload.duration_unit,
        duration_value=payload.duration_value,
        duration_weeks=payload.duration_value if payload.duration_unit.value == "weeks" else None,
        category=payload.category.strip(),
        price=Decimal(payload.price),
        discount_percentage=Decimal(payload.discount_percentage),
        thumbnail_url=payload.thumbnail_url,
        banner_url=banner_url,
        syllabus_pdf_path=syllabus_pdf_path,
        syllabus_pdf_original_name=syllabus_pdf_original_name,
        tags=[CourseTag(value=tag, sort_order=index) for index, tag in enumerate(payload.tags)],
        syllabus_items=[
            CourseSyllabusItem(title=item, sort_order=index)
            for index, item in enumerate(payload.syllabus_items)
        ],
        faqs=[
            CourseFaq(question=faq.question, answer=faq.answer, sort_order=index)
            for index, faq in enumerate(payload.faqs)
        ],
        certification_criteria=[
            CourseCertificationCriterion(value=item, sort_order=index)
            for index, item in enumerate(payload.certification_criteria)
        ],
    )

    db.add(course)
    db.commit()
    db.refresh(course)

    created_course = db.scalar(_course_query().where(Course.id == course.id))
    return CourseRead.model_validate(created_course)


@router.post("/courses/{course_id}/certificate-template", response_model=CourseRead)
async def upload_course_certificate_template(
    course_id: int,
    certificate_file: Annotated[UploadFile, File(...)],
    field_config: Annotated[str, Form(...)],
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> CourseRead:
    course = _get_course(db, course_id)
    if not (certificate_file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Certificate template must be uploaded as a PDF file.",
        )

    relative_path, _, original_name = await save_upload_file(
        certificate_file,
        folder="certificate_templates",
    )
    course.certificate_template_path = relative_path
    course.certificate_template_original_name = original_name
    course.certificate_field_config = _parse_certificate_field_config(field_config)

    db.add(course)
    db.commit()

    updated_course = _get_course(db, course.id)
    return CourseRead.model_validate(updated_course)


@router.get("/courses", response_model=list[CourseRead])
def list_courses(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> list[CourseRead]:
    courses = db.scalars(_course_query().order_by(Course.created_at.desc())).unique().all()
    return [CourseRead.model_validate(course) for course in courses]


@router.post("/courses/{course_id}/instructors", response_model=CourseRead)
def assign_instructor_to_course(
    course_id: int,
    payload: CourseInstructorAssign,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> CourseRead:
    course = _get_course(db, course_id)
    instructor = _get_instructor_user(db, payload.instructor_id)

    existing_assignment = db.scalar(
        select(CourseInstructor).where(
            CourseInstructor.course_id == course.id,
            CourseInstructor.instructor_id == instructor.id,
        )
    )

    if existing_assignment is None:
        db.add(CourseInstructor(course_id=course.id, instructor_id=instructor.id))
        db.commit()

    updated_course = _get_course(db, course_id)
    return CourseRead.model_validate(updated_course)


@router.post("/courses/{course_id}/batches", response_model=BatchRead, status_code=status.HTTP_201_CREATED)
def create_batch(
    course_id: int,
    payload: BatchCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> BatchRead:
    course = _get_course(db, course_id)
    actual_span_days = (payload.end_date - payload.start_date).days + 1
    minimum_span_days = get_minimum_course_span_days(course)
    if actual_span_days < minimum_span_days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Batch date range must cover at least {get_course_duration_label(course)} "
                "for this course."
            ),
        )
    _validate_schedule_slots(course, payload)

    batch = Batch(
        course_id=course.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        capacity=payload.capacity,
        delivery_mode=payload.delivery_mode,
        schedule_slots=[
            BatchScheduleSlot(
                weekday=slot.weekday,
                specific_date=slot.specific_date,
                start_time=slot.start_time,
                end_time=slot.end_time,
                repeat_every_weeks=slot.repeat_every_weeks,
                sort_order=index,
            )
            for index, slot in enumerate(payload.schedule_slots)
        ],
    )

    db.add(batch)
    db.commit()

    created_batch = _get_batch(db, batch.id)
    seed_batch_planning(db, created_batch)
    db.commit()

    return BatchRead.model_validate(_get_batch(db, batch.id))


@router.patch("/batches/{batch_id}/week-plans", response_model=BatchRead)
def update_batch_week_plans(
    batch_id: int,
    payload: BatchWeekPlanUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> BatchRead:
    batch = _get_batch(db, batch_id)
    _ensure_batch_active(batch)

    plans_by_week = {plan.week_number: plan for plan in batch.week_plans}
    for item in payload.week_plans:
        plan = plans_by_week.get(item.week_number)
        if plan is None:
            plan = BatchWeekPlan(
                batch_id=batch.id,
                week_number=item.week_number,
                title=item.title,
                summary=item.summary,
            )
        else:
            plan.title = item.title
            plan.summary = item.summary
        db.add(plan)

    db.commit()

    refreshed_batch = _get_batch(db, batch.id)
    seed_batch_planning(db, refreshed_batch)
    db.commit()
    return BatchRead.model_validate(_get_batch(db, batch.id))


@router.patch("/batches/{batch_id}/instructor", response_model=BatchRead)
def assign_instructor_to_batch(
    batch_id: int,
    payload: BatchInstructorAssign,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> BatchRead:
    batch = _get_batch(db, batch_id)
    instructor = _get_instructor_user(db, payload.instructor_id)

    course_assignment = db.scalar(
        select(CourseInstructor).where(
            CourseInstructor.course_id == batch.course_id,
            CourseInstructor.instructor_id == instructor.id,
        )
    )
    if course_assignment is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Instructor must be assigned to the course before being assigned to the batch.",
        )

    batch.assigned_instructor_id = instructor.id
    db.add(batch)
    db.commit()

    return BatchRead.model_validate(_get_batch(db, batch.id))


@router.post("/batches/{batch_id}/students", response_model=BatchRead)
def enroll_student_to_batch(
    batch_id: int,
    payload: BatchStudentEnroll,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_admin)],
) -> BatchRead:
    batch = _get_batch(db, batch_id)
    student = _get_student_user(db, payload.student_id)

    existing_enrollment = db.scalar(
        select(BatchEnrollment).where(
            BatchEnrollment.batch_id == batch.id,
            BatchEnrollment.student_id == student.id,
        )
    )

    if existing_enrollment is None:
        if batch.capacity is not None and len(batch.enrollments) >= batch.capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This batch has already reached its capacity.",
            )

        db.add(BatchEnrollment(batch_id=batch.id, student_id=student.id))
        db.commit()

    return BatchRead.model_validate(_get_batch(db, batch.id))


@router.post("/batches/{batch_id}/complete", response_model=BatchRead)
def complete_batch(
    batch_id: int,
    payload: BatchCompletionRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_admin)],
) -> BatchRead:
    batch = _get_batch(db, batch_id)
    if batch.status == BatchStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This batch is already completed.",
        )

    try:
        ensure_batch_certificate_ready(batch)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    batch.status = BatchStatus.COMPLETED
    batch.completed_at = datetime.now(timezone.utc)
    batch.completed_by_id = current_user.id
    db.add(batch)

    try:
        release_certificates_for_students(
            db,
            batch=batch,
            student_ids=payload.student_ids,
            released_by=current_user,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.commit()
    return BatchRead.model_validate(_get_batch(db, batch.id))


@router.post("/batches/{batch_id}/certificates/release", response_model=BatchRead)
def release_batch_certificates(
    batch_id: int,
    payload: BatchCertificateReleaseRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_admin)],
) -> BatchRead:
    batch = _get_batch(db, batch_id)
    if batch.status != BatchStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Certificates can only be released after the batch is completed.",
        )

    try:
        release_certificates_for_students(
            db,
            batch=batch,
            student_ids=payload.student_ids,
            released_by=current_user,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    db.commit()
    return BatchRead.model_validate(_get_batch(db, batch.id))
