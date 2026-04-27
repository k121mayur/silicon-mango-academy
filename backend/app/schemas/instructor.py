from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import (
    AssignmentType,
    AttendanceSource,
    AttendanceStatus,
    BatchDeliveryMode,
    BatchStatus,
    CertificateEmailStatus,
    CourseDurationUnit,
    CourseType,
    SessionMode,
    SessionOrigin,
    SessionResourceType,
    SessionStatus,
    SubmissionStatus,
    Weekday,
)


def _strip_required(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("This field is required.")
    return cleaned


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


class SessionCreate(BaseModel):
    week_number: int = Field(ge=1)
    title: str
    description: str | None = None
    session_mode: SessionMode = SessionMode.LIVE
    status: SessionStatus = SessionStatus.SCHEDULED
    session_date: date
    start_time: time
    end_time: time
    meeting_url: str | None = None
    recording_url: str | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("description", "meeting_url", "recording_url")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return _strip_optional(value)

    @model_validator(mode="after")
    def validate_time_range(self) -> "SessionCreate":
        if self.end_time <= self.start_time:
            raise ValueError("End time must be later than start time.")
        return self


class SessionUpdate(BaseModel):
    title: str
    description: str | None = None
    session_date: date
    start_time: time
    end_time: time
    meeting_url: str | None = None
    recording_url: str | None = None
    status: SessionStatus = SessionStatus.SCHEDULED

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("description", "meeting_url", "recording_url")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return _strip_optional(value)

    @model_validator(mode="after")
    def validate_time_range(self) -> "SessionUpdate":
        if self.end_time <= self.start_time:
            raise ValueError("End time must be later than start time.")
        return self


class AttendanceRecordUpdate(BaseModel):
    student_id: int = Field(gt=0)
    status: AttendanceStatus
    note: str | None = None

    @field_validator("note")
    @classmethod
    def strip_note(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class SessionAttendanceUpdate(BaseModel):
    source: AttendanceSource = AttendanceSource.MANUAL
    records: list[AttendanceRecordUpdate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_records(self) -> "SessionAttendanceUpdate":
        if not self.records:
            raise ValueError("At least one attendance record is required.")
        return self


class AssignmentCreate(BaseModel):
    week_number: int = Field(ge=1)
    session_id: int | None = Field(default=None, gt=0)
    title: str
    description: str
    assignment_type: AssignmentType
    due_at: datetime | None = None
    max_points: int | None = Field(default=None, ge=0)
    allow_late_submission: bool = False
    resource_url: str | None = None

    @field_validator("title", "description")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("resource_url")
    @classmethod
    def strip_resource_url(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class SubmissionGradeUpdate(BaseModel):
    score: Decimal | None = Field(default=None, ge=0)
    feedback: str | None = None
    status: SubmissionStatus = SubmissionStatus.GRADED

    @field_validator("feedback")
    @classmethod
    def strip_feedback(cls, value: str | None) -> str | None:
        return _strip_optional(value)

    @field_validator("status")
    @classmethod
    def validate_grade_status(cls, value: SubmissionStatus) -> SubmissionStatus:
        if value == SubmissionStatus.SUBMITTED:
            raise ValueError("Graded submissions must move beyond submitted status.")
        return value


class BatchCompletionRequest(BaseModel):
    student_ids: list[int] = Field(default_factory=list)

    @field_validator("student_ids")
    @classmethod
    def validate_student_ids(cls, value: list[int]) -> list[int]:
        cleaned = [student_id for student_id in value if student_id > 0]
        if not cleaned:
            raise ValueError("At least one student must be selected.")
        return list(dict.fromkeys(cleaned))


class CertificateReleaseRequest(BaseModel):
    student_ids: list[int] = Field(default_factory=list)

    @field_validator("student_ids")
    @classmethod
    def validate_student_ids(cls, value: list[int]) -> list[int]:
        cleaned = [student_id for student_id in value if student_id > 0]
        if not cleaned:
            raise ValueError("At least one student must be selected.")
        return list(dict.fromkeys(cleaned))


class InstructorUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


class InstructorCourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    course_type: CourseType
    category: str
    duration_unit: CourseDurationUnit
    duration_value: int
    duration_weeks: int | None = None
    duration: str
    syllabus_pdf_path: str | None = None
    certificate_template_path: str | None = None


class InstructorScheduleSlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weekday: Weekday | None = None
    specific_date: date | None = None
    start_time: time
    end_time: time
    repeat_every_weeks: int
    sort_order: int


class EnrolledStudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


class InstructorBatchEnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    created_at: datetime
    student: EnrolledStudentRead


class BatchWeekPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    week_number: int
    title: str
    summary: str | None = None


class SessionAttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    status: AttendanceStatus
    source: AttendanceSource
    note: str | None = None
    student: EnrolledStudentRead


class SessionResourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    resource_type: SessionResourceType
    title: str
    file_path: str | None = None
    public_url: str | None = None
    sort_order: int


class BatchSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    week_plan_id: int | None = None
    schedule_slot_id: int | None = None
    week_number: int
    title: str
    description: str | None = None
    session_mode: SessionMode
    origin: SessionOrigin
    is_customized: bool
    status: SessionStatus
    session_date: date
    start_time: time
    end_time: time
    meeting_url: str | None = None
    recording_url: str | None = None
    attendance_records: list[SessionAttendanceRead] = Field(default_factory=list)
    resources: list[SessionResourceRead] = Field(default_factory=list)


class AssignmentSubmissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    submitted_at: datetime
    submission_text: str | None = None
    attachment_url: str | None = None
    status: SubmissionStatus
    score: Decimal | None = None
    feedback: str | None = None
    graded_at: datetime | None = None
    graded_by_id: int | None = None
    student: EnrolledStudentRead


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    session_id: int | None = None
    week_number: int
    title: str
    description: str
    assignment_type: AssignmentType
    due_at: datetime | None = None
    max_points: int | None = None
    allow_late_submission: bool
    resource_url: str | None = None
    submissions: list[AssignmentSubmissionRead] = Field(default_factory=list)


class CertificateIssueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    released_by_id: int | None = None
    released_at: datetime | None = None
    generated_file_path: str | None = None
    generated_public_url: str | None = None
    email_status: CertificateEmailStatus
    email_error: str | None = None
    completion_date: date | None = None
    certificate_code: str
    student: EnrolledStudentRead


class InstructorBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start_date: date
    end_date: date
    capacity: int | None = None
    delivery_mode: BatchDeliveryMode
    status: BatchStatus
    completed_at: datetime | None = None
    course: InstructorCourseRead
    schedule_slots: list[InstructorScheduleSlotRead] = Field(default_factory=list)
    week_plans: list[BatchWeekPlanRead] = Field(default_factory=list)
    enrollments: list[InstructorBatchEnrollmentRead] = Field(default_factory=list)
    sessions: list[BatchSessionRead] = Field(default_factory=list)
    assignments: list[AssignmentRead] = Field(default_factory=list)
    certificate_issues: list[CertificateIssueRead] = Field(default_factory=list)


class InstructorDashboardRead(BaseModel):
    batches: list[InstructorBatchRead] = Field(default_factory=list)
