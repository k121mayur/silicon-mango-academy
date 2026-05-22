from datetime import date, datetime, timezone
from decimal import Decimal
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_student
from app.core.database import get_db
from app.models import (
    Assignment,
    AssignmentSubmission,
    Batch,
    BatchEnrollment,
    BatchStatus,
    BatchSession,
    CertificateIssue,
    Course,
    CourseSyllabusItem,
    CourseTag,
    SessionAttendance,
    SessionStatus,
    StudentEducation,
    StudentExperience,
    StudentPayment,
    StudentPaymentStatus,
    StudentProfile,
    User,
)
from app.schemas.student import (
    CourseSyllabusItemRead,
    CourseTagRead,
    ExploreBatchRead,
    ExploreCourseRead,
    StudentBatchPaymentRequest,
    StudentCertificateRead,
    StudentCourseRead,
    StudentDashboardRead,
    StudentEnrollmentRead,
    StudentEnrollmentPaymentResponse,
    StudentNextSessionRead,
    StudentPaymentOrderRead,
    StudentPaymentRead,
    StudentPaymentVerifyRequest,
    StudentProfileRead,
    StudentProfileUpdate,
    StudentScheduleSlotRead,
    StudentSessionResourceRead,
)
from app.services.payments import (
    PaymentGatewayError,
    amount_to_paise,
    create_razorpay_order,
    get_active_razorpay_credentials,
    get_razorpay_credentials_for_mode,
    verify_razorpay_signature,
)
from app.services.planning import seed_batch_planning
from app.services.receipts import generate_payment_receipt_pdf

router = APIRouter(prefix="/student", tags=["student"])


def _profile_query(user_id: int):
    return (
        select(StudentProfile)
        .where(StudentProfile.user_id == user_id)
        .options(
            selectinload(StudentProfile.educations),
            selectinload(StudentProfile.experiences),
        )
    )


def _course_catalog_query():
    return select(Course).options(
        selectinload(Course.tags),
        selectinload(Course.syllabus_items),
        selectinload(Course.batches).selectinload(Batch.schedule_slots),
        selectinload(Course.batches).selectinload(Batch.enrollments),
        selectinload(Course.batches).selectinload(Batch.assigned_instructor),
    )


def _student_enrollment_query(student_id: int):
    return (
        select(BatchEnrollment)
        .where(BatchEnrollment.student_id == student_id)
        .options(
            selectinload(BatchEnrollment.batch).selectinload(Batch.course).selectinload(Course.tags),
            selectinload(BatchEnrollment.batch)
            .selectinload(Batch.course)
            .selectinload(Course.syllabus_items),
            selectinload(BatchEnrollment.batch).selectinload(Batch.schedule_slots),
            selectinload(BatchEnrollment.batch).selectinload(Batch.week_plans),
            selectinload(BatchEnrollment.batch).selectinload(Batch.assigned_instructor),
            selectinload(BatchEnrollment.batch)
            .selectinload(Batch.sessions)
            .selectinload(BatchSession.resources),
            selectinload(BatchEnrollment.batch)
            .selectinload(Batch.sessions)
            .selectinload(BatchSession.attendance_records),
            selectinload(BatchEnrollment.batch)
            .selectinload(Batch.assignments)
            .selectinload(Assignment.submissions),
            selectinload(BatchEnrollment.batch).selectinload(Batch.certificate_issues),
            selectinload(BatchEnrollment.batch).selectinload(Batch.student_payments),
        )
        .order_by(BatchEnrollment.created_at.desc())
    )


def _batch_checkout_query(batch_id: int):
    return (
        select(Batch)
        .where(Batch.id == batch_id)
        .options(
            selectinload(Batch.course).selectinload(Course.tags),
            selectinload(Batch.course).selectinload(Course.syllabus_items),
            selectinload(Batch.schedule_slots),
            selectinload(Batch.week_plans),
            selectinload(Batch.assigned_instructor),
            selectinload(Batch.enrollments),
            selectinload(Batch.sessions).selectinload(BatchSession.resources),
            selectinload(Batch.sessions).selectinload(BatchSession.attendance_records),
            selectinload(Batch.assignments).selectinload(Assignment.submissions),
            selectinload(Batch.certificate_issues),
        )
    )


def _is_profile_complete(profile: StudentProfile | None) -> bool:
    if profile is None:
        return False
    required_values = [
        profile.first_name,
        profile.last_name,
        profile.mobile_number,
        profile.city,
        profile.occupation,
    ]
    return all(bool(value) for value in required_values)


def _read_tags(course: Course) -> list[CourseTagRead]:
    return [
        CourseTagRead(id=tag.id, value=tag.value, sort_order=tag.sort_order)
        for tag in course.tags
    ]


def _read_syllabus_items(course: Course) -> list[CourseSyllabusItemRead]:
    return [
        CourseSyllabusItemRead(
            id=item.id,
            title=item.title,
            sort_order=item.sort_order,
        )
        for item in course.syllabus_items
    ]


def _read_schedule_slots(batch: Batch) -> list[StudentScheduleSlotRead]:
    return [
        StudentScheduleSlotRead(
            id=slot.id,
            weekday=slot.weekday,
            specific_date=slot.specific_date,
            start_time=slot.start_time,
            end_time=slot.end_time,
            repeat_every_weeks=slot.repeat_every_weeks,
            sort_order=slot.sort_order,
        )
        for slot in batch.schedule_slots
    ]


def _get_available_seats(batch: Batch) -> int | None:
    if batch.capacity is None:
        return None
    return max(0, batch.capacity - len(batch.enrollments))


def _is_batch_full(batch: Batch) -> bool:
    available_seats = _get_available_seats(batch)
    return available_seats == 0 if available_seats is not None else False


def _get_payable_amount(course: Course) -> Decimal:
    price = Decimal(course.price or 0)
    discount = Decimal(course.discount_percentage or 0)
    if discount <= 0:
        return price
    payable = price - ((price * discount) / Decimal("100"))
    return max(Decimal("0"), payable).quantize(Decimal("0.01"))


def _build_explore_course(course: Course, student_id: int) -> ExploreCourseRead:
    return ExploreCourseRead(
        id=course.id,
        course_type=course.course_type,
        title=course.title,
        description=course.description,
        duration=course.duration,
        duration_unit=course.duration_unit,
        duration_value=course.duration_value,
        category=course.category,
        price=course.price,
        discount_percentage=course.discount_percentage,
        thumbnail_url=course.thumbnail_url,
        banner_url=course.banner_url,
        syllabus_pdf_path=course.syllabus_pdf_path,
        syllabus_pdf_original_name=course.syllabus_pdf_original_name,
        tags=_read_tags(course),
        syllabus_items=_read_syllabus_items(course),
        batches=[
            ExploreBatchRead(
                id=batch.id,
                start_date=batch.start_date,
                end_date=batch.end_date,
                delivery_mode=batch.delivery_mode,
                status=batch.status,
                capacity=batch.capacity,
                enrolled_count=len(batch.enrollments),
                available_seats=_get_available_seats(batch),
                is_full=_is_batch_full(batch),
                assigned_instructor_name=batch.assigned_instructor.name
                if batch.assigned_instructor
                else None,
                schedule_slots=_read_schedule_slots(batch),
            )
            for batch in course.batches
        ],
        is_enrolled=any(
            enrollment.student_id == student_id
            for batch in course.batches
            for enrollment in batch.enrollments
        ),
    )


def _is_completed_session(session: BatchSession) -> bool:
    return session.status == SessionStatus.COMPLETED


def _session_sort_key(session: BatchSession):
    return (session.session_date, session.start_time, session.id)


def _build_next_session(batch: Batch) -> StudentNextSessionRead | None:
    today = date.today()
    upcoming_sessions = [
        session
        for session in batch.sessions
        if session.status == SessionStatus.SCHEDULED and session.session_date >= today
    ]
    if not upcoming_sessions:
        upcoming_sessions = [
            session for session in batch.sessions if session.status == SessionStatus.SCHEDULED
        ]
    if not upcoming_sessions:
        return None

    session = sorted(upcoming_sessions, key=_session_sort_key)[0]
    return StudentNextSessionRead(
        id=session.id,
        title=session.title,
        session_mode=session.session_mode,
        status=session.status,
        session_date=session.session_date,
        start_time=session.start_time,
        end_time=session.end_time,
        meeting_url=session.meeting_url,
        recording_url=session.recording_url,
    )


def _build_recent_resources(batch: Batch) -> list[StudentSessionResourceRead]:
    resources = [
        resource
        for session in sorted(batch.sessions, key=_session_sort_key, reverse=True)
        for resource in session.resources
    ]
    return [
        StudentSessionResourceRead(
            id=resource.id,
            resource_type=resource.resource_type,
            title=resource.title,
            public_url=resource.public_url,
            sort_order=resource.sort_order,
        )
        for resource in resources[:4]
    ]


def _build_certificate(batch: Batch, student_id: int) -> StudentCertificateRead | None:
    issue = next(
        (item for item in batch.certificate_issues if item.student_id == student_id),
        None,
    )
    if issue is None:
        return None
    return StudentCertificateRead(
        id=issue.id,
        released_at=issue.released_at,
        generated_public_url=issue.generated_public_url,
        email_status=issue.email_status,
        completion_date=issue.completion_date,
        certificate_code=issue.certificate_code,
    )


def _build_enrollment(enrollment: BatchEnrollment) -> StudentEnrollmentRead:
    batch = enrollment.batch
    course = batch.course
    student_id = enrollment.student_id
    sessions = sorted(batch.sessions, key=_session_sort_key)
    completed_sessions = len([session for session in sessions if _is_completed_session(session)])
    if batch.status.value == "completed":
        progress_percent = 100
    elif sessions:
        progress_percent = round((completed_sessions / len(sessions)) * 100)
    else:
        progress_percent = 0

    student_submissions = [
        submission
        for assignment in batch.assignments
        for submission in assignment.submissions
        if submission.student_id == student_id
    ]
    graded_submissions = [
        submission
        for submission in student_submissions
        if submission.status.value in {"graded", "needs_revision"}
    ]
    attendance_records = [
        record
        for session in sessions
        for record in session.attendance_records
        if record.student_id == student_id
    ]
    present_attendance = [
        record for record in attendance_records if record.status.value in {"present", "late"}
    ]
    paid_payments = [
        payment
        for payment in batch.student_payments
        if payment.student_id == student_id and payment.status == StudentPaymentStatus.PAID
    ]
    latest_payment = (
        sorted(paid_payments, key=lambda payment: payment.created_at, reverse=True)[0]
        if paid_payments
        else None
    )

    return StudentEnrollmentRead(
        enrollment_id=enrollment.id,
        batch_id=batch.id,
        start_date=batch.start_date,
        end_date=batch.end_date,
        delivery_mode=batch.delivery_mode,
        status=batch.status,
        assigned_instructor_name=batch.assigned_instructor.name if batch.assigned_instructor else None,
        course=StudentCourseRead(
            id=course.id,
            title=course.title,
            course_type=course.course_type,
            category=course.category,
            duration=course.duration,
            duration_unit=course.duration_unit,
            duration_value=course.duration_value,
            description=course.description,
            banner_url=course.banner_url,
            thumbnail_url=course.thumbnail_url,
            syllabus_pdf_path=course.syllabus_pdf_path,
            syllabus_pdf_original_name=course.syllabus_pdf_original_name,
        ),
        total_sessions=len(sessions),
        completed_sessions=completed_sessions,
        progress_percent=progress_percent,
        assignments_total=len(batch.assignments),
        assignments_submitted=len(student_submissions),
        assignments_graded=len(graded_submissions),
        resources_total=sum(len(session.resources) for session in sessions),
        attendance_marked=len(attendance_records),
        attendance_present=len(present_attendance),
        next_session=_build_next_session(batch),
        recent_resources=_build_recent_resources(batch),
        certificate=_build_certificate(batch, student_id),
        payment=StudentPaymentRead.model_validate(latest_payment) if latest_payment else None,
    )


def _get_student_enrollment(db: Session, enrollment_id: int, student_id: int) -> BatchEnrollment:
    enrollment = db.scalar(
        _student_enrollment_query(student_id).where(BatchEnrollment.id == enrollment_id)
    )
    if enrollment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enrollment was not found.",
        )
    return enrollment


def _get_existing_course_enrollment(
    db: Session,
    *,
    course_id: int,
    student_id: int,
) -> BatchEnrollment | None:
    return db.scalar(
        select(BatchEnrollment)
        .join(Batch, Batch.id == BatchEnrollment.batch_id)
        .where(
            BatchEnrollment.student_id == student_id,
            Batch.course_id == course_id,
        )
    )


def _ensure_batch_can_be_purchased(
    db: Session,
    *,
    batch_id: int,
    current_user: User,
) -> tuple[StudentProfile, Batch]:
    profile = db.scalar(_profile_query(current_user.id))
    if not _is_profile_complete(profile):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Complete your profile before enrolling in a course.",
        )

    batch = db.scalar(_batch_checkout_query(batch_id))
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")
    if batch.status != BatchStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only active batches are open for enrollment.",
        )
    if _is_batch_full(batch):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This batch has no available seats.",
        )

    existing_course_enrollment = _get_existing_course_enrollment(
        db,
        course_id=batch.course_id,
        student_id=current_user.id,
    )
    if existing_course_enrollment is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You are already enrolled in this course.",
        )

    return profile, batch


def _create_payment_reference(db: Session) -> str:
    for _ in range(10):
        reference_id = f"SMA-{secrets.token_hex(8).upper()}"
        existing_reference = db.scalar(
            select(StudentPayment.id).where(StudentPayment.reference_id == reference_id)
        )
        if existing_reference is None:
            return reference_id
    return f"SMA-{secrets.token_hex(12).upper()}"


@router.get("/dashboard", response_model=StudentDashboardRead)
def read_student_dashboard(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_student)],
) -> StudentDashboardRead:
    enrollments = db.scalars(_student_enrollment_query(current_user.id)).unique().all()
    for enrollment in enrollments:
        if enrollment.batch.status.value == "active":
            seed_batch_planning(db, enrollment.batch)
    db.commit()

    profile = db.scalar(_profile_query(current_user.id))
    refreshed_enrollments = db.scalars(_student_enrollment_query(current_user.id)).unique().all()
    courses = db.scalars(_course_catalog_query().order_by(Course.created_at.desc())).unique().all()

    return StudentDashboardRead(
        profile=StudentProfileRead.model_validate(profile) if profile else None,
        profile_complete=_is_profile_complete(profile),
        enrolled_courses=[_build_enrollment(enrollment) for enrollment in refreshed_enrollments],
        explore_courses=[_build_explore_course(course, current_user.id) for course in courses],
    )


@router.put("/profile", response_model=StudentProfileRead)
def update_student_profile(
    payload: StudentProfileUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_student)],
) -> StudentProfileRead:
    profile = db.scalar(_profile_query(current_user.id))
    if profile is None:
        profile = StudentProfile(user_id=current_user.id)

    profile.first_name = payload.first_name
    profile.middle_name = payload.middle_name
    profile.last_name = payload.last_name
    profile.mobile_number = payload.mobile_number
    profile.city = payload.city
    profile.occupation = payload.occupation
    profile.educations = [
        StudentEducation(
            qualification=item.qualification,
            institution=item.institution,
            field_of_study=item.field_of_study,
            completion_year=item.completion_year,
            sort_order=index,
        )
        for index, item in enumerate(payload.educations)
    ]
    profile.experiences = [
        StudentExperience(
            organisation=item.organisation,
            post=item.post,
            description=item.description,
            sort_order=index,
        )
        for index, item in enumerate(payload.experiences)
    ]

    current_user.name = " ".join(
        part
        for part in [payload.first_name, payload.middle_name, payload.last_name]
        if part
    )
    db.add(profile)
    db.add(current_user)
    db.commit()

    refreshed_profile = db.scalar(_profile_query(current_user.id))
    return StudentProfileRead.model_validate(refreshed_profile)


@router.post(
    "/batches/{batch_id}/payment-order",
    response_model=StudentPaymentOrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_batch_payment_order(
    batch_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_student)],
) -> StudentPaymentOrderRead:
    profile, batch = _ensure_batch_can_be_purchased(
        db,
        batch_id=batch_id,
        current_user=current_user,
    )
    amount = _get_payable_amount(batch.course)
    amount_paise = amount_to_paise(amount)
    if amount_paise <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Razorpay checkout requires a payable amount greater than zero.",
        )

    try:
        credentials = get_active_razorpay_credentials(db)
    except PaymentGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    reference_id = _create_payment_reference(db)
    try:
        order = create_razorpay_order(
            credentials,
            amount_paise=amount_paise,
            receipt=reference_id,
            notes={
                "course_id": str(batch.course_id),
                "batch_id": str(batch.id),
                "student_id": str(current_user.id),
            },
        )
    except PaymentGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    razorpay_order_id = str(order.get("id") or "")
    if not razorpay_order_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Razorpay did not return an order id.",
        )

    payment = StudentPayment(
        batch_id=batch.id,
        student_id=current_user.id,
        amount=amount,
        payment_method="razorpay",
        reference_id=reference_id,
        gateway_mode=credentials.mode,
        razorpay_order_id=razorpay_order_id,
        status=StudentPaymentStatus.PENDING,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    return StudentPaymentOrderRead(
        key_id=credentials.key_id,
        mode=credentials.mode,
        order_id=razorpay_order_id,
        payment_id=payment.id,
        amount=amount,
        amount_in_paise=amount_paise,
        currency=str(order.get("currency") or "INR"),
        receipt_id=reference_id,
        course_title=batch.course.title,
        batch_id=batch.id,
        student_name=current_user.name,
        student_email=current_user.email,
        student_contact=profile.mobile_number,
    )


@router.post(
    "/payments/verify",
    response_model=StudentEnrollmentPaymentResponse,
)
def verify_payment_and_enroll(
    payload: StudentPaymentVerifyRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_student)],
) -> StudentEnrollmentPaymentResponse:
    payment = db.scalar(
        select(StudentPayment).where(
            StudentPayment.student_id == current_user.id,
            StudentPayment.razorpay_order_id == payload.razorpay_order_id,
        )
    )
    if payment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment order was not found.",
        )
    if payment.razorpay_order_id != payload.razorpay_order_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment order mismatch.")

    batch = db.scalar(_batch_checkout_query(payment.batch_id))
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found.")

    if payment.status == StudentPaymentStatus.PAID:
        enrollment = _get_existing_course_enrollment(
            db,
            course_id=batch.course_id,
            student_id=current_user.id,
        )
        if enrollment is None:
            enrollment = BatchEnrollment(batch_id=batch.id, student_id=current_user.id)
            db.add(enrollment)
            db.commit()
        created_enrollment = _get_student_enrollment(db, enrollment.id, current_user.id)
        return StudentEnrollmentPaymentResponse(
            payment=StudentPaymentRead.model_validate(payment),
            enrollment=_build_enrollment(created_enrollment),
        )
    if payment.status == StudentPaymentStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This payment order has already failed. Start a new payment.",
        )

    try:
        credentials = get_razorpay_credentials_for_mode(payment.gateway_mode or "test")
    except PaymentGatewayError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    verified = verify_razorpay_signature(
        order_id=payment.razorpay_order_id or "",
        payment_id=payload.razorpay_payment_id,
        signature=payload.razorpay_signature,
        key_secret=credentials.key_secret,
    )
    if not verified:
        payment.status = StudentPaymentStatus.FAILED
        payment.razorpay_payment_id = payload.razorpay_payment_id
        payment.razorpay_signature = payload.razorpay_signature
        db.add(payment)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Razorpay payment signature verification failed.",
        )

    payment.status = StudentPaymentStatus.PAID
    payment.razorpay_payment_id = payload.razorpay_payment_id
    payment.razorpay_signature = payload.razorpay_signature
    payment.paid_at = datetime.now(timezone.utc)

    existing_course_enrollment = _get_existing_course_enrollment(
        db,
        course_id=batch.course_id,
        student_id=current_user.id,
    )
    enrollment = existing_course_enrollment or BatchEnrollment(batch_id=batch.id, student_id=current_user.id)

    relative_receipt_path, receipt_public_url = generate_payment_receipt_pdf(
        payment=payment,
        batch=batch,
        student=current_user,
    )
    payment.receipt_file_path = relative_receipt_path
    payment.receipt_public_url = receipt_public_url

    db.add(payment)
    db.add(enrollment)
    db.commit()

    refreshed_batch = db.scalar(_batch_checkout_query(batch.id))
    if refreshed_batch and refreshed_batch.status == BatchStatus.ACTIVE:
        seed_batch_planning(db, refreshed_batch)
        db.commit()

    db.refresh(payment)
    created_enrollment = _get_student_enrollment(db, enrollment.id, current_user.id)
    return StudentEnrollmentPaymentResponse(
        payment=StudentPaymentRead.model_validate(payment),
        enrollment=_build_enrollment(created_enrollment),
    )


@router.post(
    "/batches/{batch_id}/enroll",
    response_model=StudentEnrollmentPaymentResponse,
    status_code=status.HTTP_410_GONE,
)
def pay_and_enroll_in_batch(
    batch_id: int,
    payload: StudentBatchPaymentRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_student)],
) -> StudentEnrollmentPaymentResponse:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Course purchase now requires Razorpay checkout and payment verification.",
    )
