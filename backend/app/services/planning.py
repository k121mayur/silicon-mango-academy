from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.models import (
    Batch,
    BatchDeliveryMode,
    BatchSession,
    BatchStatus,
    BatchWeekPlan,
    Course,
    CourseDurationUnit,
    SessionMode,
    SessionOrigin,
    SessionStatus,
    Weekday,
)


WEEKDAY_INDEX = {
    Weekday.MONDAY: 0,
    Weekday.TUESDAY: 1,
    Weekday.WEDNESDAY: 2,
    Weekday.THURSDAY: 3,
    Weekday.FRIDAY: 4,
    Weekday.SATURDAY: 5,
    Weekday.SUNDAY: 6,
}


def infer_week_count(batch: Batch) -> int:
    if batch.course.duration_value:
        return batch.course.duration_value
    if batch.course.duration_weeks:
        return batch.course.duration_weeks

    difference_in_days = (batch.end_date - batch.start_date).days + 1
    return max(1, (difference_in_days + 6) // 7)


def get_course_duration_unit(course: Course) -> CourseDurationUnit:
    return course.duration_unit or CourseDurationUnit.WEEKS


def get_course_duration_label(course: Course, value: int | None = None) -> str:
    duration_value = value or course.duration_value or course.duration_weeks or 1
    duration_unit = get_course_duration_unit(course)
    unit_label = "day" if duration_unit == CourseDurationUnit.DAYS else "week"
    suffix = "" if duration_value == 1 else "s"
    return f"{duration_value} {unit_label}{suffix}"


def get_plan_label(batch: Batch, plan_number: int) -> str:
    prefix = "Day" if get_course_duration_unit(batch.course) == CourseDurationUnit.DAYS else "Week"
    return f"{prefix} {plan_number}"


def get_minimum_batch_span_days(batch: Batch) -> int:
    return get_minimum_course_span_days(batch.course)


def get_minimum_course_span_days(course: Course) -> int:
    if get_course_duration_unit(course) == CourseDurationUnit.DAYS:
        return max(1, course.duration_value or 1)
    return max(1, (course.duration_value or course.duration_weeks or 1) * 7)


def get_week_range(batch: Batch, week_number: int) -> tuple[date, date]:
    if get_course_duration_unit(batch.course) == CourseDurationUnit.DAYS:
        plan_date = batch.start_date + timedelta(days=week_number - 1)
        return plan_date, min(batch.end_date, plan_date)

    week_start = batch.start_date + timedelta(days=(week_number - 1) * 7)
    week_end = min(batch.end_date, week_start + timedelta(days=6))
    return week_start, week_end


def _default_recorded_times(batch: Batch) -> tuple[time, time]:
    if batch.schedule_slots:
        first_slot = sorted(batch.schedule_slots, key=lambda slot: slot.sort_order)[0]
        return first_slot.start_time, first_slot.end_time
    return time(hour=9, minute=0), time(hour=10, minute=0)


def _find_weekday_date(start_date: date, end_date: date, weekday: Weekday) -> date | None:
    target_index = WEEKDAY_INDEX[weekday]
    current = start_date
    while current <= end_date:
        if current.weekday() == target_index:
            return current
        current += timedelta(days=1)
    return None


def ensure_batch_week_plans(db: Session, batch: Batch) -> list[BatchWeekPlan]:
    total_weeks = infer_week_count(batch)
    plans_by_week = {plan.week_number: plan for plan in batch.week_plans}

    for week_number in range(1, total_weeks + 1):
        if week_number in plans_by_week:
            continue

        plan = BatchWeekPlan(
            batch_id=batch.id,
            week_number=week_number,
            title=get_plan_label(batch, week_number),
            summary="",
        )
        db.add(plan)
        batch.week_plans.append(plan)

    batch.week_plans.sort(key=lambda plan: plan.week_number)
    return batch.week_plans


def sync_inherited_sessions(db: Session, batch: Batch) -> None:
    if batch.status == BatchStatus.COMPLETED:
        return

    week_plans = sorted(batch.week_plans, key=lambda plan: plan.week_number)
    existing_inherited = [session for session in batch.sessions if session.origin == SessionOrigin.INHERITED]

    if batch.delivery_mode == BatchDeliveryMode.LIVE:
        desired_sessions: dict[tuple[int, int | None], dict] = {}
        if get_course_duration_unit(batch.course) == CourseDurationUnit.DAYS:
            for plan in week_plans:
                plan_date, _ = get_week_range(batch, plan.week_number)
                for slot in batch.schedule_slots:
                    if slot.specific_date != plan_date:
                        continue

                    desired_sessions[(plan.id, slot.id)] = {
                        "week_number": plan.week_number,
                        "title": plan.title,
                        "description": plan.summary,
                        "session_mode": SessionMode.LIVE,
                        "session_date": plan_date,
                        "start_time": slot.start_time,
                        "end_time": slot.end_time,
                        "week_plan_id": plan.id,
                        "schedule_slot_id": slot.id,
                    }
        else:
            for plan in week_plans:
                week_start, week_end = get_week_range(batch, plan.week_number)
                for slot in batch.schedule_slots:
                    if slot.weekday is None:
                        continue
                    if (plan.week_number - 1) % max(slot.repeat_every_weeks, 1) != 0:
                        continue
                    session_date = _find_weekday_date(week_start, week_end, slot.weekday)
                    if session_date is None:
                        continue

                    desired_sessions[(plan.id, slot.id)] = {
                        "week_number": plan.week_number,
                        "title": plan.title,
                        "description": plan.summary,
                        "session_mode": SessionMode.LIVE,
                        "session_date": session_date,
                        "start_time": slot.start_time,
                        "end_time": slot.end_time,
                        "week_plan_id": plan.id,
                        "schedule_slot_id": slot.id,
                    }
    else:
        start_time, end_time = _default_recorded_times(batch)
        desired_sessions = {}
        for plan in week_plans:
            week_start, _ = get_week_range(batch, plan.week_number)
            desired_sessions[(plan.id, None)] = {
                "week_number": plan.week_number,
                "title": plan.title,
                "description": plan.summary,
                "session_mode": SessionMode.RECORDED,
                "session_date": week_start,
                "start_time": start_time,
                "end_time": end_time,
                "week_plan_id": plan.id,
                "schedule_slot_id": None,
            }

    existing_by_key = {(session.week_plan_id, session.schedule_slot_id): session for session in existing_inherited}

    for key, desired in desired_sessions.items():
        session = existing_by_key.get(key)
        if session is None:
            db.add(
                BatchSession(
                    batch_id=batch.id,
                    week_number=desired["week_number"],
                    title=desired["title"],
                    description=desired["description"],
                    session_mode=desired["session_mode"],
                    origin=SessionOrigin.INHERITED,
                    is_customized=False,
                    status=SessionStatus.SCHEDULED,
                    session_date=desired["session_date"],
                    start_time=desired["start_time"],
                    end_time=desired["end_time"],
                    week_plan_id=desired["week_plan_id"],
                    schedule_slot_id=desired["schedule_slot_id"],
                )
            )
            continue

        if session.is_customized or session.status != SessionStatus.SCHEDULED:
            continue

        session.week_number = desired["week_number"]
        session.title = desired["title"]
        session.description = desired["description"]
        session.session_mode = desired["session_mode"]
        session.session_date = desired["session_date"]
        session.start_time = desired["start_time"]
        session.end_time = desired["end_time"]
        session.week_plan_id = desired["week_plan_id"]
        session.schedule_slot_id = desired["schedule_slot_id"]
        db.add(session)

    desired_keys = set(desired_sessions)
    for session in existing_inherited:
        key = (session.week_plan_id, session.schedule_slot_id)
        if key in desired_keys:
            continue
        if session.is_customized or session.status != SessionStatus.SCHEDULED:
            continue
        db.delete(session)


def seed_batch_planning(db: Session, batch: Batch) -> None:
    ensure_batch_week_plans(db, batch)
    sync_inherited_sessions(db, batch)


def backfill_existing_batches(db: Session, batches: list[Batch]) -> None:
    for batch in batches:
        ensure_batch_week_plans(db, batch)
        sync_inherited_sessions(db, batch)


def utcnow() -> datetime:
    return datetime.utcnow()
