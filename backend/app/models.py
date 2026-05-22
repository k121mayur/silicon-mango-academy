from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _enum_values(enum_cls: type[Enum]) -> list[str]:
    return [member.value for member in enum_cls]


def _value_enum(enum_cls: type[Enum]) -> SqlEnum:
    return SqlEnum(
        enum_cls,
        values_callable=_enum_values,
        native_enum=False,
        validate_strings=True,
    )


class UserRole(str, Enum):
    ADMIN = "admin"
    INSTRUCTOR = "instructor"
    STUDENT = "student"


class StudentOccupation(str, Enum):
    EMPLOYEE = "employee"
    SELF_EMPLOYED = "self_employed"
    BUSINESS = "business"
    HOMEMAKER = "homemaker"
    STUDENT = "student"


class StudentPaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"


class CourseType(str, Enum):
    LIVE = "live"
    SELF_PACED = "self_paced"


class CourseDurationUnit(str, Enum):
    WEEKS = "weeks"
    DAYS = "days"


class BatchDeliveryMode(str, Enum):
    LIVE = "live"
    RECORDED = "recorded"


class BatchStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"


class Weekday(str, Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class SessionMode(str, Enum):
    LIVE = "live"
    RECORDED = "recorded"


class SessionStatus(str, Enum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SessionOrigin(str, Enum):
    INHERITED = "inherited"
    MANUAL = "manual"


class AttendanceStatus(str, Enum):
    NOT_MARKED = "not_marked"
    PRESENT = "present"
    ABSENT = "absent"
    LATE = "late"
    EXCUSED = "excused"


class AttendanceSource(str, Enum):
    MANUAL = "manual"
    ZOOM = "zoom"
    GOOGLE_MEET = "google_meet"
    PENDING_INTEGRATION = "pending_integration"


class AssignmentType(str, Enum):
    QUIZ = "quiz"
    PDF_UPLOAD = "pdf_upload"
    TEXT_UPLOAD = "text_upload"
    FILE_UPLOAD = "file_upload"
    LINK_SUBMISSION = "link_submission"


class SubmissionStatus(str, Enum):
    SUBMITTED = "submitted"
    GRADED = "graded"
    NEEDS_REVISION = "needs_revision"


class SessionResourceType(str, Enum):
    VIDEO = "video"
    NOTES = "notes"
    ATTACHMENT = "attachment"
    PRESENTATION = "presentation"
    LINK = "link"


class CertificateEmailStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AppSetting(TimestampMixin, Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(SqlEnum(UserRole), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    instructor_profile: Mapped[InstructorProfile | None] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    student_profile: Mapped[StudentProfile | None] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    assigned_courses: Mapped[list[CourseInstructor]] = relationship(
        back_populates="instructor",
        cascade="all, delete-orphan",
    )
    assigned_batches: Mapped[list[Batch]] = relationship(
        back_populates="assigned_instructor",
        foreign_keys="Batch.assigned_instructor_id",
    )
    completed_batches: Mapped[list[Batch]] = relationship(
        back_populates="completed_by",
        foreign_keys="Batch.completed_by_id",
    )
    batch_enrollments: Mapped[list[BatchEnrollment]] = relationship(
        back_populates="student",
        foreign_keys="BatchEnrollment.student_id",
        cascade="all, delete-orphan",
    )
    session_attendance_records: Mapped[list[SessionAttendance]] = relationship(
        back_populates="student",
        foreign_keys="SessionAttendance.student_id",
        cascade="all, delete-orphan",
    )
    assignment_submissions: Mapped[list[AssignmentSubmission]] = relationship(
        back_populates="student",
        foreign_keys="AssignmentSubmission.student_id",
        cascade="all, delete-orphan",
    )
    graded_assignment_submissions: Mapped[list[AssignmentSubmission]] = relationship(
        back_populates="graded_by",
        foreign_keys="AssignmentSubmission.graded_by_id",
    )
    released_certificate_issues: Mapped[list[CertificateIssue]] = relationship(
        back_populates="released_by",
        foreign_keys="CertificateIssue.released_by_id",
    )
    student_payments: Mapped[list[StudentPayment]] = relationship(
        back_populates="student",
        foreign_keys="StudentPayment.student_id",
        cascade="all, delete-orphan",
    )


class InstructorProfile(TimestampMixin, Base):
    __tablename__ = "instructor_profiles"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    mobile_number: Mapped[str] = mapped_column(String(32), nullable=False)

    user: Mapped[User] = relationship(back_populates="instructor_profile")
    skills: Mapped[list[InstructorSkill]] = relationship(
        back_populates="instructor_profile",
        cascade="all, delete-orphan",
        order_by="InstructorSkill.sort_order",
    )


class InstructorSkill(TimestampMixin, Base):
    __tablename__ = "instructor_skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    instructor_profile_id: Mapped[int] = mapped_column(
        ForeignKey("instructor_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    instructor_profile: Mapped[InstructorProfile] = relationship(back_populates="skills")


class StudentProfile(TimestampMixin, Base):
    __tablename__ = "student_profiles"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    first_name: Mapped[str] = mapped_column(String(120), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(120))
    last_name: Mapped[str] = mapped_column(String(120), nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(32), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    occupation: Mapped[StudentOccupation] = mapped_column(
        _value_enum(StudentOccupation),
        nullable=False,
        index=True,
    )

    user: Mapped[User] = relationship(back_populates="student_profile")
    educations: Mapped[list[StudentEducation]] = relationship(
        back_populates="student_profile",
        cascade="all, delete-orphan",
        order_by="StudentEducation.sort_order",
    )
    experiences: Mapped[list[StudentExperience]] = relationship(
        back_populates="student_profile",
        cascade="all, delete-orphan",
        order_by="StudentExperience.sort_order",
    )


class StudentEducation(TimestampMixin, Base):
    __tablename__ = "student_educations"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_profile_id: Mapped[int] = mapped_column(
        ForeignKey("student_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    qualification: Mapped[str] = mapped_column(String(180), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(255))
    field_of_study: Mapped[str | None] = mapped_column(String(180))
    completion_year: Mapped[str | None] = mapped_column(String(20))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    student_profile: Mapped[StudentProfile] = relationship(back_populates="educations")


class StudentExperience(TimestampMixin, Base):
    __tablename__ = "student_experiences"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_profile_id: Mapped[int] = mapped_column(
        ForeignKey("student_profiles.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organisation: Mapped[str] = mapped_column(String(255), nullable=False)
    post: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    student_profile: Mapped[StudentProfile] = relationship(back_populates="experiences")


class Course(TimestampMixin, Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_type: Mapped[CourseType] = mapped_column(SqlEnum(CourseType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    duration: Mapped[str] = mapped_column(String(120), nullable=False)
    duration_unit: Mapped[CourseDurationUnit] = mapped_column(
        _value_enum(CourseDurationUnit),
        nullable=False,
        default=CourseDurationUnit.WEEKS,
        server_default=CourseDurationUnit.WEEKS.value,
    )
    duration_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    duration_weeks: Mapped[int | None] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discount_percentage: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=0,
        nullable=False,
    )
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    banner_url: Mapped[str | None] = mapped_column(String(500))
    syllabus_pdf_path: Mapped[str | None] = mapped_column(String(500))
    syllabus_pdf_original_name: Mapped[str | None] = mapped_column(String(255))
    certificate_template_path: Mapped[str | None] = mapped_column(String(500))
    certificate_template_original_name: Mapped[str | None] = mapped_column(String(255))
    certificate_field_config: Mapped[dict | None] = mapped_column(JSON)

    tags: Mapped[list[CourseTag]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CourseTag.sort_order",
    )
    syllabus_items: Mapped[list[CourseSyllabusItem]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CourseSyllabusItem.sort_order",
    )
    faqs: Mapped[list[CourseFaq]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CourseFaq.sort_order",
    )
    certification_criteria: Mapped[list[CourseCertificationCriterion]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="CourseCertificationCriterion.sort_order",
    )
    instructor_assignments: Mapped[list[CourseInstructor]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
    )
    batches: Mapped[list[Batch]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        order_by="Batch.start_date",
    )


class CourseTag(TimestampMixin, Base):
    __tablename__ = "course_tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    course: Mapped[Course] = relationship(back_populates="tags")


class CourseSyllabusItem(TimestampMixin, Base):
    __tablename__ = "course_syllabus_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    course: Mapped[Course] = relationship(back_populates="syllabus_items")


class CourseFaq(TimestampMixin, Base):
    __tablename__ = "course_faqs"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    course: Mapped[Course] = relationship(back_populates="faqs")


class CourseCertificationCriterion(TimestampMixin, Base):
    __tablename__ = "course_certification_criteria"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    course: Mapped[Course] = relationship(back_populates="certification_criteria")


class CourseInstructor(TimestampMixin, Base):
    __tablename__ = "course_instructors"
    __table_args__ = (UniqueConstraint("course_id", "instructor_id", name="uq_course_instructor"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    instructor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    course: Mapped[Course] = relationship(back_populates="instructor_assignments")
    instructor: Mapped[User] = relationship(back_populates="assigned_courses")


class Batch(TimestampMixin, Base):
    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer)
    delivery_mode: Mapped[BatchDeliveryMode] = mapped_column(
        _value_enum(BatchDeliveryMode),
        nullable=False,
        default=BatchDeliveryMode.LIVE,
        server_default=BatchDeliveryMode.LIVE.value,
    )
    status: Mapped[BatchStatus] = mapped_column(
        _value_enum(BatchStatus),
        nullable=False,
        default=BatchStatus.ACTIVE,
        server_default=BatchStatus.ACTIVE.value,
    )
    assigned_instructor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    course: Mapped[Course] = relationship(back_populates="batches")
    assigned_instructor: Mapped[User | None] = relationship(
        back_populates="assigned_batches",
        foreign_keys=[assigned_instructor_id],
    )
    completed_by: Mapped[User | None] = relationship(
        back_populates="completed_batches",
        foreign_keys=[completed_by_id],
    )
    schedule_slots: Mapped[list[BatchScheduleSlot]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="BatchScheduleSlot.sort_order",
    )
    week_plans: Mapped[list[BatchWeekPlan]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="BatchWeekPlan.week_number",
    )
    enrollments: Mapped[list[BatchEnrollment]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="BatchEnrollment.created_at",
    )
    sessions: Mapped[list[BatchSession]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by=lambda: (BatchSession.week_number, BatchSession.session_date, BatchSession.start_time),
    )
    assignments: Mapped[list[Assignment]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by=lambda: (Assignment.week_number, Assignment.due_at, Assignment.created_at),
    )
    certificate_issues: Mapped[list[CertificateIssue]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="CertificateIssue.created_at",
    )
    student_payments: Mapped[list[StudentPayment]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="StudentPayment.created_at",
    )


class BatchScheduleSlot(TimestampMixin, Base):
    __tablename__ = "batch_schedule_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    weekday: Mapped[Weekday | None] = mapped_column(SqlEnum(Weekday))
    specific_date: Mapped[date | None] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    repeat_every_weeks: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    batch: Mapped[Batch] = relationship(back_populates="schedule_slots")
    inherited_sessions: Mapped[list[BatchSession]] = relationship(back_populates="schedule_slot")


class BatchWeekPlan(TimestampMixin, Base):
    __tablename__ = "batch_week_plans"
    __table_args__ = (UniqueConstraint("batch_id", "week_number", name="uq_batch_week_plan"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)

    batch: Mapped[Batch] = relationship(back_populates="week_plans")
    sessions: Mapped[list[BatchSession]] = relationship(back_populates="week_plan")


class BatchEnrollment(TimestampMixin, Base):
    __tablename__ = "batch_enrollments"
    __table_args__ = (UniqueConstraint("batch_id", "student_id", name="uq_batch_student_enrollment"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    batch: Mapped[Batch] = relationship(back_populates="enrollments")
    student: Mapped[User] = relationship(back_populates="batch_enrollments", foreign_keys=[student_id])


class StudentPayment(TimestampMixin, Base):
    __tablename__ = "student_payments"
    __table_args__ = (UniqueConstraint("reference_id", name="uq_student_payment_reference"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    gateway_mode: Mapped[str | None] = mapped_column(String(20))
    razorpay_order_id: Mapped[str | None] = mapped_column(String(80), index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(80), index=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(256))
    receipt_file_path: Mapped[str | None] = mapped_column(String(500))
    receipt_public_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[StudentPaymentStatus] = mapped_column(
        _value_enum(StudentPaymentStatus),
        nullable=False,
        default=StudentPaymentStatus.PENDING,
        server_default=StudentPaymentStatus.PENDING.value,
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    batch: Mapped[Batch] = relationship(back_populates="student_payments")
    student: Mapped[User] = relationship(back_populates="student_payments", foreign_keys=[student_id])


class BatchSession(TimestampMixin, Base):
    __tablename__ = "batch_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    week_plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("batch_week_plans.id", ondelete="SET NULL"),
    )
    schedule_slot_id: Mapped[int | None] = mapped_column(
        ForeignKey("batch_schedule_slots.id", ondelete="SET NULL"),
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    session_mode: Mapped[SessionMode] = mapped_column(SqlEnum(SessionMode), nullable=False, index=True)
    origin: Mapped[SessionOrigin] = mapped_column(
        _value_enum(SessionOrigin),
        nullable=False,
        default=SessionOrigin.MANUAL,
        server_default=SessionOrigin.MANUAL.value,
    )
    is_customized: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    status: Mapped[SessionStatus] = mapped_column(
        SqlEnum(SessionStatus),
        nullable=False,
        default=SessionStatus.SCHEDULED,
        server_default=SessionStatus.SCHEDULED.name,
    )
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    meeting_url: Mapped[str | None] = mapped_column(String(500))
    recording_url: Mapped[str | None] = mapped_column(String(500))

    batch: Mapped[Batch] = relationship(back_populates="sessions")
    week_plan: Mapped[BatchWeekPlan | None] = relationship(back_populates="sessions")
    schedule_slot: Mapped[BatchScheduleSlot | None] = relationship(back_populates="inherited_sessions")
    attendance_records: Mapped[list[SessionAttendance]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="SessionAttendance.created_at",
    )
    resources: Mapped[list[BatchSessionResource]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="BatchSessionResource.sort_order",
    )
    assignments: Mapped[list[Assignment]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="Assignment.created_at",
    )


class BatchSessionResource(TimestampMixin, Base):
    __tablename__ = "batch_session_resources"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("batch_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    resource_type: Mapped[SessionResourceType] = mapped_column(
        _value_enum(SessionResourceType),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str | None] = mapped_column(String(500))
    public_url: Mapped[str | None] = mapped_column(String(500))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    session: Mapped[BatchSession] = relationship(back_populates="resources")


class SessionAttendance(TimestampMixin, Base):
    __tablename__ = "session_attendance"
    __table_args__ = (UniqueConstraint("session_id", "student_id", name="uq_session_attendance_student"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("batch_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[AttendanceStatus] = mapped_column(
        SqlEnum(AttendanceStatus),
        nullable=False,
        default=AttendanceStatus.NOT_MARKED,
        server_default=AttendanceStatus.NOT_MARKED.name,
    )
    source: Mapped[AttendanceSource] = mapped_column(
        SqlEnum(AttendanceSource),
        nullable=False,
        default=AttendanceSource.MANUAL,
        server_default=AttendanceSource.MANUAL.name,
    )
    note: Mapped[str | None] = mapped_column(Text)

    session: Mapped[BatchSession] = relationship(back_populates="attendance_records")
    student: Mapped[User] = relationship(
        back_populates="session_attendance_records",
        foreign_keys=[student_id],
    )


class Assignment(TimestampMixin, Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("batch_sessions.id", ondelete="SET NULL"),
    )
    week_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    assignment_type: Mapped[AssignmentType] = mapped_column(
        SqlEnum(AssignmentType),
        nullable=False,
        index=True,
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    max_points: Mapped[int | None] = mapped_column(Integer)
    allow_late_submission: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resource_url: Mapped[str | None] = mapped_column(String(500))

    batch: Mapped[Batch] = relationship(back_populates="assignments")
    session: Mapped[BatchSession | None] = relationship(back_populates="assignments")
    submissions: Mapped[list[AssignmentSubmission]] = relationship(
        back_populates="assignment",
        cascade="all, delete-orphan",
        order_by="AssignmentSubmission.submitted_at",
    )


class AssignmentSubmission(TimestampMixin, Base):
    __tablename__ = "assignment_submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "student_id", name="uq_assignment_submission_student"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    submission_text: Mapped[str | None] = mapped_column(Text)
    attachment_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[SubmissionStatus] = mapped_column(
        SqlEnum(SubmissionStatus),
        nullable=False,
        default=SubmissionStatus.SUBMITTED,
        server_default=SubmissionStatus.SUBMITTED.name,
    )
    score: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    feedback: Mapped[str | None] = mapped_column(Text)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    graded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )

    assignment: Mapped[Assignment] = relationship(back_populates="submissions")
    student: Mapped[User] = relationship(back_populates="assignment_submissions", foreign_keys=[student_id])
    graded_by: Mapped[User | None] = relationship(
        back_populates="graded_assignment_submissions",
        foreign_keys=[graded_by_id],
    )


class CertificateIssue(TimestampMixin, Base):
    __tablename__ = "certificate_issues"
    __table_args__ = (UniqueConstraint("batch_id", "student_id", name="uq_batch_certificate_issue"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    released_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    generated_file_path: Mapped[str | None] = mapped_column(String(500))
    generated_public_url: Mapped[str | None] = mapped_column(String(500))
    email_status: Mapped[CertificateEmailStatus] = mapped_column(
        _value_enum(CertificateEmailStatus),
        nullable=False,
        default=CertificateEmailStatus.PENDING,
        server_default=CertificateEmailStatus.PENDING.value,
    )
    email_error: Mapped[str | None] = mapped_column(Text)
    completion_date: Mapped[date | None] = mapped_column(Date)
    certificate_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    batch: Mapped[Batch] = relationship(back_populates="certificate_issues")
    student: Mapped[User] = relationship(foreign_keys=[student_id])
    released_by: Mapped[User | None] = relationship(
        back_populates="released_certificate_issues",
        foreign_keys=[released_by_id],
    )
