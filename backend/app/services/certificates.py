from __future__ import annotations

import smtplib
from datetime import date, datetime, timezone
from email.message import EmailMessage
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Batch, CertificateEmailStatus, CertificateIssue, User
from app.services.storage import absolute_upload_path, public_upload_url, relative_upload_path


REQUIRED_CERTIFICATE_FIELDS = (
    "student_name",
    "course_title",
    "batch_label",
    "completion_date",
    "certificate_id",
)


def ensure_batch_certificate_ready(batch: Batch) -> None:
    if not batch.course.certificate_template_path:
        raise RuntimeError("Certificate template has not been uploaded for this course.")

    config = batch.course.certificate_field_config or {}
    missing = [field for field in REQUIRED_CERTIFICATE_FIELDS if field not in config]
    if missing:
        raise RuntimeError("Certificate text positions are incomplete for this course.")


def _load_pdf_dependencies():
    try:
        from pypdf import PdfReader, PdfWriter
        from reportlab.pdfgen import canvas
    except ImportError as exc:
        raise RuntimeError(
            "Certificate generation requires `reportlab` and `pypdf` to be installed.",
        ) from exc

    return PdfReader, PdfWriter, canvas


def _render_text_overlay(
    width: float,
    height: float,
    field_config: dict,
    values: dict[str, str],
) -> bytes:
    _, _, canvas = _load_pdf_dependencies()

    buffer = BytesIO()
    pdf_canvas = canvas.Canvas(buffer, pagesize=(width, height))

    for field_name, value in values.items():
        config = field_config.get(field_name) or {}
        x = float(config.get("x", 0))
        y_from_top = float(config.get("y", 0))
        font_size = int(config.get("font_size", 18))
        font_name = config.get("font_name", "Helvetica-Bold" if field_name == "student_name" else "Helvetica")

        pdf_canvas.setFont(font_name, font_size)
        pdf_canvas.drawString(x, height - y_from_top, value)

    pdf_canvas.save()
    return buffer.getvalue()


def generate_certificate_pdf(
    batch: Batch,
    student: User,
    certificate_code: str,
    completion_date: date,
) -> tuple[str, str]:
    PdfReader, PdfWriter, _ = _load_pdf_dependencies()
    ensure_batch_certificate_ready(batch)

    template_path = absolute_upload_path(batch.course.certificate_template_path)
    if not template_path.exists():
        raise RuntimeError("Certificate template file is missing on disk.")

    reader = PdfReader(str(template_path))
    writer = PdfWriter()

    first_page = reader.pages[0]
    width = float(first_page.mediabox.width)
    height = float(first_page.mediabox.height)

    values = {
        "student_name": student.name,
        "course_title": batch.course.title,
        "batch_label": f"Batch #{batch.id}",
        "completion_date": completion_date.strftime("%d %b %Y"),
        "certificate_id": certificate_code,
    }

    overlay_bytes = _render_text_overlay(
        width=width,
        height=height,
        field_config=batch.course.certificate_field_config or {},
        values=values,
    )
    overlay_reader = PdfReader(BytesIO(overlay_bytes))
    overlay_page = overlay_reader.pages[0]

    merged_page = reader.pages[0]
    merged_page.merge_page(overlay_page)
    writer.add_page(merged_page)

    for extra_page in reader.pages[1:]:
        writer.add_page(extra_page)

    relative_path = relative_upload_path(
        "certificates",
        f"batch_{batch.id}",
        f"{student.id}_{certificate_code}.pdf",
    )
    absolute_path = absolute_upload_path(relative_path)
    absolute_path.parent.mkdir(parents=True, exist_ok=True)

    with absolute_path.open("wb") as output_file:
        writer.write(output_file)

    return relative_path, public_upload_url(relative_path)


def _build_certificate_email(batch: Batch, student: User, pdf_path: Path) -> EmailMessage:
    if not settings.smtp_from_email:
        raise RuntimeError("SMTP_FROM_EMAIL is not configured.")

    message = EmailMessage()
    message["Subject"] = f"Your certificate for {batch.course.title}"
    message["From"] = settings.smtp_from_email
    message["To"] = student.email
    message.set_content(
        "\n".join(
            [
                f"Hello {student.name},",
                "",
                f"Please find attached your certificate for {batch.course.title}.",
                "",
                "Regards,",
                "Silicon Mango Academy",
            ]
        )
    )

    with pdf_path.open("rb") as file_handle:
        message.add_attachment(
            file_handle.read(),
            maintype="application",
            subtype="pdf",
            filename=pdf_path.name,
        )
    return message


def send_certificate_email(batch: Batch, student: User, relative_pdf_path: str) -> None:
    if not settings.smtp_host or not settings.smtp_port:
        raise RuntimeError("SMTP host and port must be configured to send certificates.")

    pdf_path = absolute_upload_path(relative_pdf_path)
    message = _build_certificate_email(batch, student, pdf_path)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(message)


def release_certificates_for_students(
    db: Session,
    *,
    batch: Batch,
    student_ids: list[int],
    released_by: User,
) -> list[CertificateIssue]:
    ensure_batch_certificate_ready(batch)

    enrolled_students = {
        enrollment.student_id: enrollment.student
        for enrollment in batch.enrollments
        if enrollment.student_id in student_ids
    }
    missing_ids = [student_id for student_id in student_ids if student_id not in enrolled_students]
    if missing_ids:
        raise RuntimeError("Certificates can only be released to students enrolled in the batch.")

    completion_date = (batch.completed_at or datetime.now(timezone.utc)).date()
    issues: list[CertificateIssue] = []

    existing_issues = {
        issue.student_id: issue
        for issue in db.scalars(
            select(CertificateIssue).where(CertificateIssue.batch_id == batch.id)
        ).all()
    }

    for student_id in student_ids:
        student = enrolled_students[student_id]
        issue = existing_issues.get(student_id)
        if issue is None:
            issue = CertificateIssue(
                batch_id=batch.id,
                student_id=student_id,
                certificate_code=uuid4().hex[:12].upper(),
            )

        issue.released_by_id = released_by.id
        issue.released_at = datetime.now(timezone.utc)
        issue.completion_date = completion_date
        issue.email_status = CertificateEmailStatus.PENDING
        issue.email_error = None

        try:
            relative_pdf_path, public_url = generate_certificate_pdf(
                batch=batch,
                student=student,
                certificate_code=issue.certificate_code,
                completion_date=completion_date,
            )
            issue.generated_file_path = relative_pdf_path
            issue.generated_public_url = public_url
            send_certificate_email(batch=batch, student=student, relative_pdf_path=relative_pdf_path)
            issue.email_status = CertificateEmailStatus.SENT
        except Exception as exc:  # noqa: BLE001
            issue.email_status = CertificateEmailStatus.FAILED
            issue.email_error = str(exc)

        db.add(issue)
        issues.append(issue)

    return issues
