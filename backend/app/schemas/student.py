from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import (
    BatchDeliveryMode,
    BatchStatus,
    CertificateEmailStatus,
    CourseDurationUnit,
    CourseType,
    SessionMode,
    SessionResourceType,
    SessionStatus,
    StudentOccupation,
    StudentPaymentStatus,
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


class StudentEducationUpdate(BaseModel):
    qualification: str
    institution: str | None = None
    field_of_study: str | None = None
    completion_year: str | None = None

    @field_validator("qualification")
    @classmethod
    def strip_qualification(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("institution", "field_of_study", "completion_year")
    @classmethod
    def strip_optional_fields(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class StudentExperienceUpdate(BaseModel):
    organisation: str
    post: str
    description: str | None = None

    @field_validator("organisation", "post")
    @classmethod
    def strip_required_fields(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str | None) -> str | None:
        return _strip_optional(value)


class StudentProfileUpdate(BaseModel):
    first_name: str
    middle_name: str | None = None
    last_name: str
    mobile_number: str
    city: str
    occupation: StudentOccupation
    educations: list[StudentEducationUpdate] = Field(default_factory=list)
    experiences: list[StudentExperienceUpdate] = Field(default_factory=list)

    @field_validator("first_name", "last_name", "mobile_number", "city")
    @classmethod
    def strip_required_fields(cls, value: str) -> str:
        return _strip_required(value)

    @field_validator("middle_name")
    @classmethod
    def strip_middle_name(cls, value: str | None) -> str | None:
        return _strip_optional(value)

    @model_validator(mode="after")
    def clear_non_employee_experience(self) -> "StudentProfileUpdate":
        if self.occupation != StudentOccupation.EMPLOYEE:
            self.experiences = []
        return self


class StudentBatchPaymentRequest(BaseModel):
    payment_method: str = "upi"

    @field_validator("payment_method")
    @classmethod
    def strip_payment_method(cls, value: str) -> str:
        return _strip_required(value)


class StudentPaymentOrderRead(BaseModel):
    key_id: str
    mode: str
    order_id: str
    payment_id: int
    amount: Decimal
    amount_in_paise: int
    currency: str
    receipt_id: str
    course_title: str
    batch_id: int
    student_name: str
    student_email: str
    student_contact: str | None = None


class StudentPaymentVerifyRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str

    @field_validator("razorpay_payment_id", "razorpay_order_id", "razorpay_signature")
    @classmethod
    def strip_razorpay_fields(cls, value: str) -> str:
        return _strip_required(value)


class StudentEducationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    qualification: str
    institution: str | None = None
    field_of_study: str | None = None
    completion_year: str | None = None
    sort_order: int


class StudentExperienceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    organisation: str
    post: str
    description: str | None = None
    sort_order: int


class StudentProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    first_name: str
    middle_name: str | None = None
    last_name: str
    mobile_number: str
    city: str
    occupation: StudentOccupation
    created_at: datetime
    updated_at: datetime
    educations: list[StudentEducationRead] = Field(default_factory=list)
    experiences: list[StudentExperienceRead] = Field(default_factory=list)


class CourseTagRead(BaseModel):
    id: int
    value: str
    sort_order: int


class CourseSyllabusItemRead(BaseModel):
    id: int
    title: str
    sort_order: int


class StudentScheduleSlotRead(BaseModel):
    id: int
    weekday: Weekday | None = None
    specific_date: date | None = None
    start_time: time
    end_time: time
    repeat_every_weeks: int
    sort_order: int


class ExploreBatchRead(BaseModel):
    id: int
    start_date: date
    end_date: date
    delivery_mode: BatchDeliveryMode
    status: BatchStatus
    capacity: int | None = None
    enrolled_count: int
    available_seats: int | None = None
    is_full: bool
    assigned_instructor_name: str | None = None
    schedule_slots: list[StudentScheduleSlotRead] = Field(default_factory=list)


class ExploreCourseRead(BaseModel):
    id: int
    course_type: CourseType
    title: str
    description: str
    duration: str
    duration_unit: CourseDurationUnit
    duration_value: int
    category: str
    price: Decimal
    discount_percentage: Decimal
    thumbnail_url: str | None = None
    banner_url: str | None = None
    syllabus_pdf_path: str | None = None
    syllabus_pdf_original_name: str | None = None
    tags: list[CourseTagRead] = Field(default_factory=list)
    syllabus_items: list[CourseSyllabusItemRead] = Field(default_factory=list)
    batches: list[ExploreBatchRead] = Field(default_factory=list)
    is_enrolled: bool = False


class StudentCourseRead(BaseModel):
    id: int
    title: str
    course_type: CourseType
    category: str
    duration: str
    duration_unit: CourseDurationUnit
    duration_value: int
    description: str
    banner_url: str | None = None
    thumbnail_url: str | None = None
    syllabus_pdf_path: str | None = None
    syllabus_pdf_original_name: str | None = None


class StudentNextSessionRead(BaseModel):
    id: int
    title: str
    session_mode: SessionMode
    status: SessionStatus
    session_date: date
    start_time: time
    end_time: time
    meeting_url: str | None = None
    recording_url: str | None = None


class StudentSessionResourceRead(BaseModel):
    id: int
    resource_type: SessionResourceType
    title: str
    public_url: str | None = None
    sort_order: int


class StudentCertificateRead(BaseModel):
    id: int
    released_at: datetime | None = None
    generated_public_url: str | None = None
    email_status: CertificateEmailStatus
    completion_date: date | None = None
    certificate_code: str


class StudentPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: int
    student_id: int
    amount: Decimal
    payment_method: str
    reference_id: str
    gateway_mode: str | None = None
    razorpay_order_id: str | None = None
    razorpay_payment_id: str | None = None
    receipt_public_url: str | None = None
    status: StudentPaymentStatus
    paid_at: datetime | None = None


class StudentEnrollmentRead(BaseModel):
    enrollment_id: int
    batch_id: int
    start_date: date
    end_date: date
    delivery_mode: BatchDeliveryMode
    status: BatchStatus
    assigned_instructor_name: str | None = None
    course: StudentCourseRead
    total_sessions: int
    completed_sessions: int
    progress_percent: int
    assignments_total: int
    assignments_submitted: int
    assignments_graded: int
    resources_total: int
    attendance_marked: int
    attendance_present: int
    next_session: StudentNextSessionRead | None = None
    recent_resources: list[StudentSessionResourceRead] = Field(default_factory=list)
    certificate: StudentCertificateRead | None = None
    payment: StudentPaymentRead | None = None


class StudentDashboardRead(BaseModel):
    profile: StudentProfileRead | None = None
    profile_complete: bool
    enrolled_courses: list[StudentEnrollmentRead] = Field(default_factory=list)
    explore_courses: list[ExploreCourseRead] = Field(default_factory=list)


class StudentEnrollmentPaymentResponse(BaseModel):
    payment: StudentPaymentRead
    enrollment: StudentEnrollmentRead
