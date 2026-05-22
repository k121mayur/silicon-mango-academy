from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import (
    BatchDeliveryMode,
    BatchStatus,
    CertificateEmailStatus,
    CourseDurationUnit,
    CourseType,
    UserRole,
    Weekday,
)


def _strip_text(value: str) -> str:
    return value.strip()


def _clean_string_list(values: list[str]) -> list[str]:
    return [item.strip() for item in values if item and item.strip()]


class CertificateFieldPosition(BaseModel):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    font_size: int = Field(default=18, ge=8, le=96)


class CertificateFieldConfig(BaseModel):
    student_name: CertificateFieldPosition
    course_title: CertificateFieldPosition
    batch_label: CertificateFieldPosition
    completion_date: CertificateFieldPosition
    certificate_id: CertificateFieldPosition


class InstructorCreate(BaseModel):
    name: str
    email: str
    mobile_number: str
    skills: list[str] = Field(default_factory=list)

    @field_validator("name", "email", "mobile_number")
    @classmethod
    def strip_required_fields(cls, value: str) -> str:
        cleaned = _strip_text(value)
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned

    @field_validator("skills", mode="before")
    @classmethod
    def normalize_skills(cls, value: list[str] | None) -> list[str]:
        return _clean_string_list(value or [])


class StudentCreate(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=6)

    @field_validator("name", "email")
    @classmethod
    def strip_student_fields(cls, value: str) -> str:
        cleaned = _strip_text(value)
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned


class CourseFaqCreate(BaseModel):
    question: str
    answer: str

    @field_validator("question", "answer")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        cleaned = _strip_text(value)
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned


class CourseCreate(BaseModel):
    course_type: CourseType
    title: str
    description: str
    duration_unit: CourseDurationUnit = CourseDurationUnit.WEEKS
    duration_value: int = Field(ge=1)
    category: str
    price: Decimal = Field(ge=0)
    discount_percentage: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    thumbnail_url: str | None = None
    banner_url: str | None = None
    tags: list[str] = Field(default_factory=list)
    syllabus_items: list[str] = Field(default_factory=list)
    faqs: list[CourseFaqCreate] = Field(default_factory=list)
    certification_criteria: list[str] = Field(default_factory=list)

    @field_validator("title", "description", "category")
    @classmethod
    def strip_course_text(cls, value: str) -> str:
        cleaned = _strip_text(value)
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned

    @field_validator("thumbnail_url", "banner_url")
    @classmethod
    def strip_optional_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("tags", "syllabus_items", "certification_criteria", mode="before")
    @classmethod
    def clean_repeater_lists(cls, value: list[str] | None) -> list[str]:
        return _clean_string_list(value or [])


class ScheduleSlotCreate(BaseModel):
    weekday: Weekday | None = None
    specific_date: date | None = None
    start_time: time
    end_time: time
    repeat_every_weeks: int = Field(default=1, ge=1)

    @model_validator(mode="after")
    def validate_time_range(self) -> "ScheduleSlotCreate":
        if self.end_time <= self.start_time:
            raise ValueError("End time must be later than start time.")
        return self


class BatchCreate(BaseModel):
    start_date: date
    end_date: date
    capacity: int | None = Field(default=None, ge=1)
    delivery_mode: BatchDeliveryMode
    schedule_slots: list[ScheduleSlotCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_date_range(self) -> "BatchCreate":
        if self.end_date < self.start_date:
            raise ValueError("End date must be on or after start date.")
        if self.delivery_mode == BatchDeliveryMode.LIVE and not self.schedule_slots:
            raise ValueError("At least one schedule slot is required for a live batch.")
        return self


class CourseInstructorAssign(BaseModel):
    instructor_id: int = Field(gt=0)


class BatchInstructorAssign(BaseModel):
    instructor_id: int = Field(gt=0)


class BatchStudentEnroll(BaseModel):
    student_id: int = Field(gt=0)


class BatchWeekPlanUpdateItem(BaseModel):
    week_number: int = Field(ge=1)
    title: str
    summary: str | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = _strip_text(value)
        if not cleaned:
            raise ValueError("This field is required.")
        return cleaned

    @field_validator("summary")
    @classmethod
    def strip_summary(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class BatchWeekPlanUpdate(BaseModel):
    week_plans: list[BatchWeekPlanUpdateItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_items(self) -> "BatchWeekPlanUpdate":
        if not self.week_plans:
            raise ValueError("At least one week plan is required.")
        week_numbers = [item.week_number for item in self.week_plans]
        if len(week_numbers) != len(set(week_numbers)):
            raise ValueError("Week numbers must be unique.")
        return self


class BatchCertificateReleaseRequest(BaseModel):
    student_ids: list[int] = Field(default_factory=list)

    @field_validator("student_ids")
    @classmethod
    def validate_student_ids(cls, value: list[int]) -> list[int]:
        cleaned = [student_id for student_id in value if student_id > 0]
        if not cleaned:
            raise ValueError("At least one student must be selected.")
        return list(dict.fromkeys(cleaned))


class RazorpayModeUpdate(BaseModel):
    active_mode: str

    @field_validator("active_mode")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        cleaned = _strip_text(value).lower()
        if cleaned not in {"test", "live"}:
            raise ValueError("Razorpay mode must be test or live.")
        return cleaned


class RazorpaySettingsRead(BaseModel):
    active_mode: str
    test_key_id: str | None = None
    live_key_id: str | None = None
    test_configured: bool
    live_configured: bool


class SkillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sort_order: int


class InstructorProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mobile_number: str
    skills: list[SkillRead] = Field(default_factory=list)


class UserSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole


class InstructorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    instructor_profile: InstructorProfileRead | None = None


class StudentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BatchEnrollmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    created_at: datetime
    student: StudentRead


class BatchWeekPlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    week_number: int
    title: str
    summary: str | None = None


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
    student: StudentRead


class CourseTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    value: str
    sort_order: int


class CourseSyllabusItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    sort_order: int


class CourseFaqRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question: str
    answer: str
    sort_order: int


class CourseCertificationCriterionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    value: str
    sort_order: int


class CourseInstructorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    instructor_id: int


class ScheduleSlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weekday: Weekday | None = None
    specific_date: date | None = None
    start_time: time
    end_time: time
    repeat_every_weeks: int
    sort_order: int


class BatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    start_date: date
    end_date: date
    capacity: int | None = None
    delivery_mode: BatchDeliveryMode
    status: BatchStatus
    assigned_instructor_id: int | None = None
    completed_at: datetime | None = None
    completed_by_id: int | None = None
    assigned_instructor: UserSummaryRead | None = None
    completed_by: UserSummaryRead | None = None
    schedule_slots: list[ScheduleSlotRead] = Field(default_factory=list)
    week_plans: list[BatchWeekPlanRead] = Field(default_factory=list)
    enrollments: list[BatchEnrollmentRead] = Field(default_factory=list)
    certificate_issues: list[CertificateIssueRead] = Field(default_factory=list)


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_type: CourseType
    title: str
    description: str
    duration: str
    duration_unit: CourseDurationUnit
    duration_value: int
    duration_weeks: int | None = None
    category: str
    price: Decimal
    discount_percentage: Decimal
    thumbnail_url: str | None = None
    banner_url: str | None = None
    syllabus_pdf_path: str | None = None
    syllabus_pdf_original_name: str | None = None
    certificate_template_path: str | None = None
    certificate_template_original_name: str | None = None
    certificate_field_config: CertificateFieldConfig | None = None
    created_at: datetime
    updated_at: datetime
    tags: list[CourseTagRead] = Field(default_factory=list)
    syllabus_items: list[CourseSyllabusItemRead] = Field(default_factory=list)
    faqs: list[CourseFaqRead] = Field(default_factory=list)
    certification_criteria: list[CourseCertificationCriterionRead] = Field(default_factory=list)
    instructor_assignments: list[CourseInstructorRead] = Field(default_factory=list)
    batches: list[BatchRead] = Field(default_factory=list)
