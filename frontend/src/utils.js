export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
export const tokenStorageKey = "silicon-mango-academy-token";

export const weekdayOptions = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const sessionModeOptions = ["live", "recorded"];
export const sessionStatusOptions = ["scheduled", "completed", "cancelled"];
export const assignmentTypeOptions = [
  "quiz",
  "pdf_upload",
  "text_upload",
  "file_upload",
  "link_submission",
];
export const attendanceStatusOptions = ["not_marked", "present", "absent", "late", "excused"];
export const gradingStatusOptions = ["graded", "needs_revision"];
export const deliveryModeOptions = ["live", "recorded"];
export const courseDurationUnitOptions = ["weeks", "days"];
export const sessionResourceTypeOptions = ["video", "presentation", "notes", "attachment", "link"];

export function createDefaultWeeklyScheduleSlot() {
  return {
    weekday: "monday",
    specific_date: "",
    start_time: "09:00",
    end_time: "10:00",
    repeat_every_weeks: "1",
  };
}

export function createInitialInstructorForm() {
  return {
    name: "",
    email: "",
    mobile_number: "",
    skills: [""],
  };
}

export function createInitialStudentForm() {
  return {
    name: "",
    email: "",
    password: "",
  };
}

export function createInitialCourseForm() {
  return {
    course_type: "live",
    title: "",
    description: "",
    duration_unit: "weeks",
    duration_value: "",
    category: "",
    price: "",
    discount_percentage: "0",
    thumbnail_url: "",
    banner_image: null,
    syllabus_pdf: null,
    tags: [""],
    syllabus_items: [""],
    certification_criteria: [""],
    faqs: [{ question: "", answer: "" }],
  };
}

export function createInitialBatchForm() {
  return {
    course_id: "",
    start_date: "",
    end_date: "",
    capacity: "",
    delivery_mode: "live",
    schedule_slots: [createDefaultWeeklyScheduleSlot()],
  };
}

export function createInitialLoginForm() {
  return {
    email: "",
    password: "",
  };
}

export function createInitialCertificateConfig() {
  return {
    student_name: { x: 180, y: 280, font_size: 26 },
    course_title: { x: 180, y: 340, font_size: 18 },
    batch_label: { x: 180, y: 380, font_size: 16 },
    completion_date: { x: 180, y: 420, font_size: 16 },
    certificate_id: { x: 180, y: 460, font_size: 14 },
  };
}

export function createInitialCertificateTemplateForm() {
  return {
    course_id: "",
    certificate_file: null,
    field_config: createInitialCertificateConfig(),
  };
}

export function createInitialAssignmentForm() {
  return {
    batch_id: "",
    week_number: "1",
    session_id: "",
    title: "",
    description: "",
    assignment_type: "quiz",
    due_at: "",
    max_points: "100",
    allow_late_submission: false,
    resource_url: "",
  };
}

export function createInitialSessionForm() {
  return {
    batch_id: "",
    week_number: "1",
    title: "",
    description: "",
    session_date: "",
    start_time: "09:00",
    end_time: "10:00",
    meeting_url: "",
    recording_url: "",
  };
}

export function apiErrorMessage(payload, response) {
  return payload?.detail || payload?.message || `Request failed with status ${response.status}`;
}

export async function apiRequest(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();
  let payload = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const error = new Error(apiErrorMessage(payload, response));
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function apiFormRequest(path, { method = "POST", body, token } = {}) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body,
  });

  const rawText = await response.text();
  let payload = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const error = new Error(apiErrorMessage(payload, response));
    error.status = response.status;
    throw error;
  }

  return payload;
}

export function navigateTo(path, setPathname) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  setPathname(path);
}

export function parseDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatDate(value) {
  const parsedDate = parseDateValue(value);
  if (!parsedDate) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsedDate);
}

export function formatDateTime(value) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatTime(value) {
  if (!value) {
    return "TBD";
  }

  const [hours, minutes] = String(value).split(":").map(Number);
  const displayDate = new Date();
  displayDate.setHours(hours || 0, minutes || 0, 0, 0);

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(displayDate);
}

export function formatEnumLabel(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatWeeks(course) {
  const durationValue = Number(course?.duration_value || course?.duration_weeks || 0);
  const durationUnit = course?.duration_unit || (course?.duration_weeks ? "weeks" : "");

  if (durationValue > 0 && durationUnit) {
    const singularUnit = durationUnit === "days" ? "day" : "week";
    return `${durationValue} ${singularUnit}${durationValue === 1 ? "" : "s"}`;
  }

  return course?.duration || "Not specified";
}

export function getBatchWeekCount(batch) {
  if (batch?.course?.duration_value) {
    return batch.course.duration_value;
  }

  if (batch?.course?.duration_weeks) {
    return batch.course.duration_weeks;
  }

  const startDate = parseDateValue(batch?.start_date);
  const endDate = parseDateValue(batch?.end_date);
  if (!startDate || !endDate) {
    return 1;
  }

  const differenceInDays = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );
  return Math.max(1, Math.ceil(differenceInDays / 7));
}

export function getCoursePlanLabel(course, planNumber) {
  const prefix = course?.duration_unit === "days" ? "Day" : "Week";
  return `${prefix} ${planNumber}`;
}

export function getPlanStartDateValue(batch, weekNumber) {
  const startDate = parseDateValue(batch?.start_date);
  if (!startDate) {
    return "";
  }

  const normalizedWeekNumber = Number(weekNumber || 1);
  const offsetDays = batch?.course?.duration_unit === "days" ? normalizedWeekNumber - 1 : (normalizedWeekNumber - 1) * 7;
  const planDate = new Date(startDate);
  planDate.setDate(startDate.getDate() + offsetDays);

  const year = planDate.getFullYear();
  const month = String(planDate.getMonth() + 1).padStart(2, "0");
  const day = String(planDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekRangeLabel(batch, weekNumber) {
  const startDate = parseDateValue(batch.start_date);
  if (!startDate) {
    return getCoursePlanLabel(batch.course, weekNumber);
  }

  if (batch?.course?.duration_unit === "days") {
    const sessionDate = new Date(startDate);
    sessionDate.setDate(startDate.getDate() + (weekNumber - 1));
    return `${getCoursePlanLabel(batch.course, weekNumber)} | ${formatDate(sessionDate)}`;
  }

  const weekStart = new Date(startDate);
  weekStart.setDate(startDate.getDate() + (weekNumber - 1) * 7);

  const batchEndDate = parseDateValue(batch.end_date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  if (batchEndDate && weekEnd > batchEndDate) {
    return `${getCoursePlanLabel(batch.course, weekNumber)} | ${formatDate(batch.start_date)} - ${formatDate(batch.end_date)}`;
  }

  return `${getCoursePlanLabel(batch.course, weekNumber)} | ${new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
  }).format(weekStart)} - ${new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
  }).format(weekEnd)}`;
}

export function flattenBatches(courses) {
  return courses.flatMap((course) =>
    course.batches.map((batch) => ({
      ...batch,
      course,
      course_id: course.id,
      course_title: course.title,
    })),
  );
}

export function resolveAssetUrl(url) {
  if (!url) {
    return "";
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `${apiBaseUrl}${url}`;
}

export function addDaysToDateString(dateString, totalDays) {
  if (!dateString && dateString !== "") {
    return "";
  }
  const nextDate = new Date(`${dateString}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + totalDays);
  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildDayScheduleSlots(startDate, durationValue, existingSlots = []) {
  if (!startDate || !durationValue) {
    return [];
  }

  return Array.from({ length: durationValue }, (_, index) => {
    const existingSlot = existingSlots[index] || {};
    return {
      weekday: "",
      specific_date: addDaysToDateString(startDate, index),
      start_time: existingSlot.start_time || "09:00",
      end_time: existingSlot.end_time || "10:00",
      repeat_every_weeks: "1",
    };
  });
}

export function formatScheduleSlot(slot) {
  if (slot?.specific_date) {
    return `${formatDate(slot.specific_date)} ${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`;
  }
  return `${formatEnumLabel(slot?.weekday)} ${formatTime(slot?.start_time)} - ${formatTime(slot?.end_time)}`;
}

export function buildAttendanceDrafts(batches) {
  const drafts = {};
  batches.forEach((batch) => {
    batch.sessions.forEach((session) => {
      const attendanceByStudentId = {};
      batch.enrollments.forEach((enrollment) => {
        const existingRecord = session.attendance_records.find(
          (record) => record.student_id === enrollment.student_id,
        );
        attendanceByStudentId[enrollment.student_id] = {
          status: existingRecord?.status || "not_marked",
          note: existingRecord?.note || "",
        };
      });
      drafts[session.id] = attendanceByStudentId;
    });
  });
  return drafts;
}

export function buildSubmissionDrafts(batches) {
  const drafts = {};
  batches.forEach((batch) => {
    batch.assignments.forEach((assignment) => {
      assignment.submissions.forEach((submission) => {
        drafts[submission.id] = {
          score: submission.score ?? "",
          feedback: submission.feedback || "",
          status: submission.status === "needs_revision" ? "needs_revision" : "graded",
        };
      });
    });
  });
  return drafts;
}

export function buildSessionDrafts(batches) {
  const drafts = {};
  batches.forEach((batch) => {
    batch.sessions.forEach((session) => {
      drafts[session.id] = {
        title: session.title,
        description: session.description || "",
        session_date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        meeting_url: session.meeting_url || "",
        recording_url: session.recording_url || "",
        status: session.status,
      };
    });
  });
  return drafts;
}

export function buildResourceDrafts(batches) {
  const drafts = {};
  batches.forEach((batch) => {
    batch.sessions.forEach((session) => {
      drafts[session.id] = {
        title: "",
        resource_type: session.session_mode === "recorded" ? "video" : "attachment",
        input_mode: "file",
        url: "",
        file: null,
      };
    });
  });
  return drafts;
}

export function cloneCertificateConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

export function toggleListSelection(list, value) {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
}
