from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.core.config import settings
from app.models import BatchSession, SessionMode


def _send_message(message: EmailMessage) -> None:
    if not settings.smtp_host or not settings.smtp_port or not settings.smtp_from_email:
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password or "")
        server.send_message(message)


def _build_session_message(*, session: BatchSession, student_name: str, student_email: str) -> EmailMessage:
    course_title = session.batch.course.title
    session_kind = "Live" if session.session_mode == SessionMode.LIVE else "Recorded"

    body_lines = [
        f"Hello {student_name},",
        "",
        f"A {session_kind.lower()} session has been scheduled or updated for {course_title}.",
        "",
        f"Session: {session.title}",
        f"Date: {session.session_date.strftime('%d %b %Y')}",
        f"Time: {session.start_time.strftime('%I:%M %p')} - {session.end_time.strftime('%I:%M %p')}",
        f"Batch: #{session.batch_id}",
    ]

    if session.description:
        body_lines.extend(["", f"Description: {session.description}"])
    if session.meeting_url:
        body_lines.extend(["", f"Join Link: {session.meeting_url}"])
    if session.recording_url:
        body_lines.extend(["", f"Recording Link: {session.recording_url}"])

    body_lines.extend(["", "Regards,", "Silicon Mango Academy"])

    message = EmailMessage()
    message["Subject"] = f"{course_title}: {session.title} scheduled"
    message["From"] = settings.smtp_from_email
    message["To"] = student_email
    message.set_content("\n".join(body_lines))
    return message


def broadcast_session_update(session: BatchSession) -> int:
    if not settings.smtp_host or not settings.smtp_port or not settings.smtp_from_email:
        return 0

    delivered = 0
    for enrollment in session.batch.enrollments:
        student = enrollment.student
        if not student or not student.email:
            continue

        try:
            message = _build_session_message(
                session=session,
                student_name=student.name,
                student_email=student.email,
            )
            _send_message(message)
            delivered += 1
        except Exception:  # noqa: BLE001
            continue

    return delivered
