from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from app.models import Batch, StudentPayment, User
from app.services.storage import absolute_upload_path, public_upload_url, relative_upload_path


def _load_reportlab():
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError as exc:
        raise RuntimeError("Receipt generation requires `reportlab` to be installed.") from exc

    return A4, canvas, colors


def _format_amount(amount: Decimal) -> str:
    return f"INR {Decimal(amount or 0):,.2f}"


def _format_datetime(value: datetime | None) -> str:
    payment_time = value or datetime.now(timezone.utc)
    return payment_time.astimezone(timezone.utc).strftime("%d %b %Y, %H:%M UTC")


def generate_payment_receipt_pdf(
    *,
    payment: StudentPayment,
    batch: Batch,
    student: User,
) -> tuple[str, str]:
    A4, canvas, colors = _load_reportlab()
    width, height = A4

    relative_path = relative_upload_path(
        "payment_receipts",
        f"receipt_{payment.reference_id}.pdf",
    )
    absolute_path = absolute_upload_path(relative_path)
    absolute_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(absolute_path), pagesize=A4)
    margin = 56
    y = height - margin

    pdf.setFillColor(colors.HexColor("#173042"))
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(margin, y, "Silicon Mango Academy")
    y -= 28
    pdf.setFont("Helvetica", 11)
    pdf.setFillColor(colors.HexColor("#5d6b76"))
    pdf.drawString(margin, y, "Payment Receipt")
    y -= 34

    pdf.setStrokeColor(colors.HexColor("#d7c49d"))
    pdf.line(margin, y, width - margin, y)
    y -= 34

    rows = [
        ("Receipt No.", payment.reference_id),
        ("Student", student.name),
        ("Email", student.email),
        ("Course", batch.course.title),
        ("Batch", f"Batch #{batch.id}"),
        ("Amount", _format_amount(payment.amount)),
        ("Payment Mode", (payment.gateway_mode or "").title() or "Razorpay"),
        ("Razorpay Order", payment.razorpay_order_id or "-"),
        ("Razorpay Payment", payment.razorpay_payment_id or "-"),
        ("Paid At", _format_datetime(payment.paid_at)),
    ]

    for label, value in rows:
        pdf.setFont("Helvetica-Bold", 10)
        pdf.setFillColor(colors.HexColor("#173042"))
        pdf.drawString(margin, y, label)
        pdf.setFont("Helvetica", 10)
        pdf.setFillColor(colors.HexColor("#2f4656"))
        pdf.drawString(margin + 150, y, str(value))
        y -= 24

    y -= 18
    pdf.setFillColor(colors.HexColor("#f7f2e8"))
    pdf.roundRect(margin, y - 52, width - (margin * 2), 72, 8, fill=1, stroke=0)
    pdf.setFillColor(colors.HexColor("#173042"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(margin + 18, y - 4, "Status")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(margin + 150, y - 4, "Paid")
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(colors.HexColor("#5d6b76"))
    pdf.drawString(margin + 18, y - 28, "This receipt was generated after Razorpay signature verification.")

    pdf.save()
    return relative_path, public_upload_url(relative_path)
