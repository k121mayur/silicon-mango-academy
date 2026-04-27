from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_instructor
from app.core.database import get_db
from app.models import (
    Assignment,
    AssignmentSubmission,
    Batch,
    BatchEnrollment,
    BatchSession,
    BatchStatus,
    CertificateIssue,
    SessionAttendance,
    SessionMode,
    SessionOrigin,
    User,
)
from app.schemas.instructor import (
    AssignmentCreate,
    AssignmentRead,
    AssignmentSubmissionRead,
    BatchCompletionRequest,
    BatchSessionRead,
    CertificateReleaseRequest,
    InstructorBatchRead,
    InstructorDashboardRead,
    SessionAttendanceUpdate,
    SessionCreate,
    SessionResourceRead,
    SessionUpdate,
    SubmissionGradeUpdate,
)
from app.services.certificates import ensure_batch_certificate_ready, release_certificates_for_students
from app.services.notifications import broadcast_session_update
from app.services.planning import get_course_duration_label, infer_week_count, seed_batch_planning
from app.services.storage import save_upload_file

router = APIRouter(prefix="/instructor", tags=["instructor"])


def _batch_dashboard_options():
    return (
        selectinload(Batch.course),
        selectinload(Batch.schedule_slots),
        selectinload(Batch.week_plans),
        selectinload(Batch.enrollments).selectinload(BatchEnrollment.student),
        selectinload(Batch.sessions)
        .selectinload(BatchSession.attendance_records)
        .selectinload(SessionAttendance.student),
        selectinload(Batch.sessions).selectinload(BatchSession.resources),
        selectinload(Batch.assignments)
        .selectinload(Assignment.submissions)
        .selectinload(AssignmentSubmission.student),
        selectinload(Batch.certificate_issues).selectinload(CertificateIssue.student),
    )


def _instructor_batch_query(instructor_id: int):
    return (
        select(Batch)
        .where(Batch.assigned_instructor_id == instructor_id)
        .options(*_batch_dashboard_options())
        .order_by(Batch.start_date.asc())
    )


def _get_instructor_batch(db: Session, batch_id: int, instructor_id: int) -> Batch:
    batch = db.scalar(_instructor_batch_query(instructor_id).where(Batch.id == batch_id))
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Batch not found for this instructor.",
        )
    return batch


def _get_instructor_session(db: Session, session_id: int, instructor_id: int) -> BatchSession:
    session = db.scalar(
        select(BatchSession)
        .join(Batch, Batch.id == BatchSession.batch_id)
        .where(BatchSession.id == session_id, Batch.assigned_instructor_id == instructor_id)
        .options(
            selectinload(BatchSession.batch)
            .selectinload(Batch.enrollments)
            .selectinload(BatchEnrollment.student),
            selectinload(BatchSession.batch).selectinload(Batch.course),
            selectinload(BatchSession.batch).selectinload(Batch.week_plans),
            selectinload(BatchSession.resources),
            selectinload(BatchSession.attendance_records).selectinload(SessionAttendance.student),
        )
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found for this instructor.",
        )
    return session


def _get_instructor_submission(
    db: Session,
    submission_id: int,
    instructor_id: int,
) -> AssignmentSubmission:
    submission = db.scalar(
        select(AssignmentSubmission)
        .join(Assignment, Assignment.id == AssignmentSubmission.assignment_id)
        .join(Batch, Batch.id == Assignment.batch_id)
        .where(
            AssignmentSubmission.id == submission_id,
            Batch.assigned_instructor_id == instructor_id,
        )
        .options(selectinload(AssignmentSubmission.student))
    )
    if submission is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found for this instructor.",
        )
    return submission


def _ensure_batch_active(batch: Batch) -> None:
    if batch.status == BatchStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This batch is completed and no longer accepts teaching updates.",
        )


def _validate_week_number(batch: Batch, week_number: int) -> None:
    if week_number < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan number must be 1 or greater.",
        )

    duration_count = infer_week_count(batch)
    if week_number > duration_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Plan number must be within the course duration of "
                f"{get_course_duration_label(batch.course)}."
            ),
        )


def _validate_session_date(batch: Batch, session_date) -> None:
    if session_date < batch.start_date or session_date > batch.end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session date must fall within the batch date range.",
        )


@router.get("/dashboard", response_model=InstructorDashboardRead)
def read_instructor_dashboard(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> InstructorDashboardRead:
    batches = db.scalars(_instructor_batch_query(current_user.id)).unique().all()
    for batch in batches:
        if batch.status == BatchStatus.ACTIVE:
            seed_batch_planning(db, batch)
    db.commit()

    refreshed_batches = db.scalars(_instructor_batch_query(current_user.id)).unique().all()
    return InstructorDashboardRead(
        batches=[InstructorBatchRead.model_validate(batch) for batch in refreshed_batches],
    )


@router.post("/batches/{batch_id}/sessions", response_model=BatchSessionRead, status_code=status.HTTP_201_CREATED)
def create_batch_session(
    batch_id: int,
    payload: SessionCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> BatchSessionRead:
    batch = _get_instructor_batch(db, batch_id, current_user.id)
    _ensure_batch_active(batch)
    _validate_week_number(batch, payload.week_number)
    _validate_session_date(batch, payload.session_date)

    session = BatchSession(
        batch_id=batch.id,
        week_number=payload.week_number,
        title=payload.title,
        description=payload.description,
        session_mode=payload.session_mode,
        origin=SessionOrigin.MANUAL,
        is_customized=True,
        status=payload.status,
        session_date=payload.session_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        meeting_url=payload.meeting_url,
        recording_url=payload.recording_url,
    )
    db.add(session)
    db.commit()

    created_session = _get_instructor_session(db, session.id, current_user.id)
    broadcast_session_update(created_session)
    return BatchSessionRead.model_validate(created_session)


@router.patch("/sessions/{session_id}", response_model=BatchSessionRead)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> BatchSessionRead:
    session = _get_instructor_session(db, session_id, current_user.id)
    _ensure_batch_active(session.batch)
    _validate_week_number(session.batch, session.week_number)
    _validate_session_date(session.batch, payload.session_date)

    session.title = payload.title
    session.description = payload.description
    session.session_date = payload.session_date
    session.start_time = payload.start_time
    session.end_time = payload.end_time
    session.meeting_url = payload.meeting_url
    session.recording_url = payload.recording_url
    session.status = payload.status
    if session.origin == SessionOrigin.INHERITED:
        session.is_customized = True

    db.add(session)
    db.commit()

    refreshed_session = _get_instructor_session(db, session.id, current_user.id)
    broadcast_session_update(refreshed_session)
    return BatchSessionRead.model_validate(refreshed_session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> None:
    session = _get_instructor_session(db, session_id, current_user.id)
    _ensure_batch_active(session.batch)
    db.delete(session)
    db.commit()


@router.post("/sessions/{session_id}/resources", response_model=SessionResourceRead, status_code=status.HTTP_201_CREATED)
async def upload_session_resource(
    session_id: int,
    title: Annotated[str, Form(...)],
    resource_type: Annotated[str, Form(...)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
    resource_file: Annotated[UploadFile | None, File()] = None,
    resource_url: Annotated[str | None, Form()] = None,
) -> SessionResourceRead:
    session = _get_instructor_session(db, session_id, current_user.id)
    _ensure_batch_active(session.batch)

    cleaned_title = title.strip()
    cleaned_resource_url = resource_url.strip() if resource_url else None
    if not cleaned_title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Resource title is required.",
        )
    if resource_file is None and not cleaned_resource_url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either a file or a resource URL.",
        )
    from app.models import BatchSessionResource, SessionResourceType  # lazy local import

    try:
        normalized_resource_type = SessionResourceType(resource_type)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid session resource type.",
        ) from exc

    relative_path = None
    public_url = cleaned_resource_url
    if resource_file is not None:
        relative_path, public_url, _ = await save_upload_file(
            resource_file,
            folder=f"session_resources/batch_{session.batch_id}",
        )

    created_resource = BatchSessionResource(
        session_id=session.id,
        title=cleaned_title,
        resource_type=normalized_resource_type,
        file_path=relative_path,
        public_url=public_url,
        sort_order=len(session.resources),
    )
    db.add(created_resource)
    db.commit()
    db.refresh(created_resource)
    return SessionResourceRead.model_validate(created_resource)


@router.put("/sessions/{session_id}/attendance", response_model=BatchSessionRead)
def update_session_attendance(
    session_id: int,
    payload: SessionAttendanceUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> BatchSessionRead:
    session = _get_instructor_session(db, session_id, current_user.id)
    _ensure_batch_active(session.batch)

    if session.session_mode != SessionMode.LIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attendance can only be recorded for live sessions.",
        )

    enrolled_student_ids = {enrollment.student_id for enrollment in session.batch.enrollments}
    invalid_student_ids = [
        record.student_id
        for record in payload.records
        if record.student_id not in enrolled_student_ids
    ]
    if invalid_student_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attendance can only be recorded for enrolled students.",
        )

    existing_records = {record.student_id: record for record in session.attendance_records}
    for record in payload.records:
        existing = existing_records.get(record.student_id)
        if existing is None:
            db.add(
                SessionAttendance(
                    session_id=session.id,
                    student_id=record.student_id,
                    status=record.status,
                    source=payload.source,
                    note=record.note,
                )
            )
            continue

        existing.status = record.status
        existing.source = payload.source
        existing.note = record.note
        db.add(existing)

    db.commit()
    return BatchSessionRead.model_validate(_get_instructor_session(db, session.id, current_user.id))


@router.post(
    "/batches/{batch_id}/assignments",
    response_model=AssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    batch_id: int,
    payload: AssignmentCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> AssignmentRead:
    batch = _get_instructor_batch(db, batch_id, current_user.id)
    _ensure_batch_active(batch)
    _validate_week_number(batch, payload.week_number)

    if payload.session_id is not None and not any(
        session.id == payload.session_id for session in batch.sessions
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected session does not belong to this batch.",
        )

    assignment = Assignment(
        batch_id=batch.id,
        session_id=payload.session_id,
        week_number=payload.week_number,
        title=payload.title,
        description=payload.description,
        assignment_type=payload.assignment_type,
        due_at=payload.due_at,
        max_points=payload.max_points,
        allow_late_submission=payload.allow_late_submission,
        resource_url=payload.resource_url,
    )
    db.add(assignment)
    db.commit()

    created_assignment = db.scalar(
        select(Assignment)
        .where(Assignment.id == assignment.id)
        .options(
            selectinload(Assignment.submissions).selectinload(AssignmentSubmission.student),
        )
    )
    return AssignmentRead.model_validate(created_assignment)


@router.patch("/submissions/{submission_id}/grade", response_model=AssignmentSubmissionRead)
def grade_submission(
    submission_id: int,
    payload: SubmissionGradeUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> AssignmentSubmissionRead:
    submission = _get_instructor_submission(db, submission_id, current_user.id)
    batch = db.scalar(
        select(Batch)
        .join(Assignment, Assignment.batch_id == Batch.id)
        .where(Assignment.id == submission.assignment_id)
    )
    if batch is not None:
        _ensure_batch_active(batch)

    submission.score = payload.score
    submission.feedback = payload.feedback
    submission.status = payload.status
    submission.graded_at = datetime.now(timezone.utc)
    submission.graded_by_id = current_user.id

    db.add(submission)
    db.commit()

    graded_submission = _get_instructor_submission(db, submission.id, current_user.id)
    return AssignmentSubmissionRead.model_validate(graded_submission)


@router.post("/batches/{batch_id}/complete", response_model=InstructorBatchRead)
def complete_batch(
    batch_id: int,
    payload: BatchCompletionRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> InstructorBatchRead:
    batch = _get_instructor_batch(db, batch_id, current_user.id)
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
    return InstructorBatchRead.model_validate(_get_instructor_batch(db, batch.id, current_user.id))


@router.post("/batches/{batch_id}/certificates/release", response_model=InstructorBatchRead)
def release_batch_certificates(
    batch_id: int,
    payload: CertificateReleaseRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_instructor)],
) -> InstructorBatchRead:
    batch = _get_instructor_batch(db, batch_id, current_user.id)
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
    return InstructorBatchRead.model_validate(_get_instructor_batch(db, batch.id, current_user.id))
