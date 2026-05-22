import { useEffect, useState } from "react";

import {
  addDaysToDateString,
  apiFormRequest,
  apiRequest,
  assignmentTypeOptions,
  buildDayScheduleSlots,
  cloneCertificateConfig,
  courseDurationUnitOptions,
  createDefaultWeeklyScheduleSlot,
  createInitialBatchForm,
  createInitialCertificateTemplateForm,
  createInitialCourseForm,
  createInitialInstructorForm,
  createInitialStudentForm,
  deliveryModeOptions,
  flattenBatches,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatEnumLabel,
  getCoursePlanLabel,
  formatWeeks,
  resolveAssetUrl,
  toggleListSelection,
  weekdayOptions,
} from "./utils";
import {
  DashboardWorkspace,
  DashboardSummary,
  EmptyState,
  FaqRepeater,
  ScheduleRepeater,
  SectionCard,
  SelectionChecklist,
  StatusBanner,
  TextRepeater,
} from "./shared";

function createInitialWeekPlanDrafts(batch) {
  return (batch?.week_plans || []).map((plan) => ({
    week_number: plan.week_number,
    title: plan.title,
    summary: plan.summary || "",
  }));
}

function createInitialSearchState() {
  return {
    completion: "",
    release: "",
  };
}

function createInitialSelectionState() {
  return {
    completion: [],
    release: [],
  };
}

export default function AdminDashboard({ token, user, onLogout }) {
  const [adminData, setAdminData] = useState({
    loading: true,
    error: "",
    instructors: [],
    students: [],
    courses: [],
    paymentSettings: null,
  });
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState("");
  const [instructorForm, setInstructorForm] = useState(createInitialInstructorForm());
  const [studentForm, setStudentForm] = useState(createInitialStudentForm());
  const [courseForm, setCourseForm] = useState(createInitialCourseForm());
  const [batchForm, setBatchForm] = useState(createInitialBatchForm());
  const [courseInstructorForm, setCourseInstructorForm] = useState({ course_id: "", instructor_id: "" });
  const [batchInstructorForm, setBatchInstructorForm] = useState({ batch_id: "", instructor_id: "" });
  const [batchEnrollmentForm, setBatchEnrollmentForm] = useState({ batch_id: "", student_id: "" });
  const [certificateTemplateForm, setCertificateTemplateForm] = useState(
    createInitialCertificateTemplateForm(),
  );
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [activeAdminSection, setActiveAdminSection] = useState("dashboard");
  const [weekPlanDrafts, setWeekPlanDrafts] = useState([]);
  const [searchState, setSearchState] = useState(createInitialSearchState());
  const [selectionState, setSelectionState] = useState(createInitialSelectionState());

  const batches = flattenBatches(adminData.courses);
  const selectedBatch =
    batches.find((batch) => String(batch.id) === selectedBatchId) || batches[0] || null;
  const selectedInstructorBatch =
    batches.find((batch) => String(batch.id) === batchInstructorForm.batch_id) || null;
  const selectedEnrollmentBatch =
    batches.find((batch) => String(batch.id) === batchEnrollmentForm.batch_id) || null;
  const selectedTemplateCourse =
    adminData.courses.find((course) => String(course.id) === certificateTemplateForm.course_id) || null;
  const selectedBatchCourse = selectedBatch?.course || null;
  const selectedCourseForBatch =
    adminData.courses.find((course) => String(course.id) === batchForm.course_id) || null;
  const isDayBasedBatchCourse = selectedCourseForBatch?.duration_unit === "days";

  useEffect(() => {
    if (!selectedBatch && batches.length > 0) {
      setSelectedBatchId(String(batches[0].id));
    }
  }, [batches, selectedBatch]);

  useEffect(() => {
    if (!selectedBatch) {
      setWeekPlanDrafts([]);
      setSelectionState(createInitialSelectionState());
      setSearchState(createInitialSearchState());
      return;
    }

    setWeekPlanDrafts(createInitialWeekPlanDrafts(selectedBatch));
    setSelectionState({
      completion: selectedBatch.enrollments.map((enrollment) => enrollment.student_id),
      release: selectedBatch.enrollments
        .filter(
          (enrollment) =>
            !selectedBatch.certificate_issues.some(
              (issue) => issue.student_id === enrollment.student_id && issue.email_status === "sent",
            ),
        )
        .map((enrollment) => enrollment.student_id),
    });
    setSearchState(createInitialSearchState());
  }, [selectedBatchId, adminData.courses]);

  useEffect(() => {
    if (!selectedCourseForBatch || !batchForm.start_date) {
      return;
    }

    const durationValue = Number(selectedCourseForBatch.duration_value || selectedCourseForBatch.duration_weeks || 0);
    if (!durationValue) {
      return;
    }

    const totalDays = selectedCourseForBatch.duration_unit === "days" ? durationValue - 1 : (durationValue * 7) - 1;
    const nextEndDate = addDaysToDateString(batchForm.start_date, totalDays);
    if (nextEndDate && nextEndDate !== batchForm.end_date) {
      setBatchForm((current) => ({ ...current, end_date: nextEndDate }));
    }
  }, [
    batchForm.start_date,
    selectedCourseForBatch?.duration_unit,
    selectedCourseForBatch?.duration_value,
    selectedCourseForBatch?.duration_weeks,
  ]);

  useEffect(() => {
    if (!selectedCourseForBatch) {
      return;
    }

    if (selectedCourseForBatch.duration_unit === "days") {
      if (!batchForm.start_date) {
        setBatchForm((current) => ({ ...current, schedule_slots: [] }));
        return;
      }

      const durationValue = Number(
        selectedCourseForBatch.duration_value || selectedCourseForBatch.duration_weeks || 0,
      );
      const nextSlots = buildDayScheduleSlots(
        batchForm.start_date,
        durationValue,
        batchForm.schedule_slots,
      );
      const serializedCurrent = JSON.stringify(batchForm.schedule_slots);
      const serializedNext = JSON.stringify(nextSlots);
      if (serializedCurrent !== serializedNext) {
        setBatchForm((current) => ({ ...current, schedule_slots: nextSlots }));
      }
      return;
    }

    const hasDaySlots = batchForm.schedule_slots.some((slot) => slot.specific_date);
    if (hasDaySlots || batchForm.schedule_slots.length === 0) {
      setBatchForm((current) => ({
        ...current,
        schedule_slots: [createDefaultWeeklyScheduleSlot()],
      }));
    }
  }, [
    batchForm.start_date,
    batchForm.schedule_slots,
    selectedCourseForBatch,
  ]);

  async function loadAdminData() {
    try {
      setAdminData((current) => ({ ...current, loading: true, error: "" }));
      const [instructors, students, courses, paymentSettings] = await Promise.all([
        apiRequest("/api/v1/admin/users/instructors", { token }),
        apiRequest("/api/v1/admin/users/students", { token }),
        apiRequest("/api/v1/admin/courses", { token }),
        apiRequest("/api/v1/admin/payment-settings", { token }),
      ]);
      setAdminData({
        loading: false,
        error: "",
        instructors,
        students,
        courses,
        paymentSettings,
      });
    } catch (error) {
      if (error.status === 401) {
        onLogout();
        return;
      }

      setAdminData({
        loading: false,
        error: error.message || "Unable to load the admin dashboard.",
        instructors: [],
        students: [],
        courses: [],
        paymentSettings: null,
      });
    }
  }

  useEffect(() => {
    loadAdminData();
  }, [token]);

  function updateSimpleForm(setter) {
    return (event) => {
      const { name, value, type, checked, files } = event.target;
      setter((current) => ({
        ...current,
        [name]:
          type === "checkbox"
            ? checked
            : type === "file"
              ? files?.[0] || null
              : value,
      }));
    };
  }

  function updateTextList(setter, key, index, value) {
    setter((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  }

  function addTextListItem(setter, key) {
    setter((current) => ({
      ...current,
      [key]: [...current[key], ""],
    }));
  }

  function removeTextListItem(setter, key, index) {
    setter((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function updateFaq(index, field, value) {
    setCourseForm((current) => ({
      ...current,
      faqs: current.faqs.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function updateScheduleSlot(index, field, value) {
    setBatchForm((current) => ({
      ...current,
      schedule_slots: current.schedule_slots.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, [field]: value } : slot,
      ),
    }));
  }

  function updateCertificateField(fieldName, subField, value) {
    setCertificateTemplateForm((current) => ({
      ...current,
      field_config: {
        ...current.field_config,
        [fieldName]: {
          ...current.field_config[fieldName],
          [subField]: value,
        },
      },
    }));
  }

  function updateWeekPlanDraft(index, field, value) {
    setWeekPlanDrafts((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  async function submitWithRefresh(action, successMessage, reset) {
    try {
      setNotice({ type: "", message: "" });
      await action();
      if (reset) {
        reset();
      }
      await loadAdminData();
      setNotice({ type: "success", message: successMessage });
    } catch (error) {
      setNotice({
        type: "error",
        message: error.message || "Something went wrong.",
      });
    } finally {
      setSubmitting("");
    }
  }

  async function handleInstructorSubmit(event) {
    event.preventDefault();
    setSubmitting("instructor");

    const payload = {
      ...instructorForm,
      skills: instructorForm.skills.filter((skill) => skill.trim()),
    };

    await submitWithRefresh(
      () =>
        apiRequest("/api/v1/admin/users/instructors", {
          method: "POST",
          body: payload,
          token,
        }),
      "Instructor created successfully.",
      () => setInstructorForm(createInitialInstructorForm()),
    );
  }

  async function handleStudentSubmit(event) {
    event.preventDefault();
    setSubmitting("student");

    await submitWithRefresh(
      () =>
        apiRequest("/api/v1/admin/users/students", {
          method: "POST",
          body: studentForm,
          token,
        }),
      "Student account created successfully.",
      () => setStudentForm(createInitialStudentForm()),
    );
  }

  async function handleCourseSubmit(event) {
    event.preventDefault();
    setSubmitting("course");

    const payload = {
      course_type: courseForm.course_type,
      title: courseForm.title,
      description: courseForm.description,
      duration_unit: courseForm.duration_unit,
      duration_value: Number(courseForm.duration_value),
      category: courseForm.category,
      price: courseForm.price || "0",
      discount_percentage: courseForm.discount_percentage || "0",
      thumbnail_url: courseForm.thumbnail_url || null,
      banner_url: null,
      tags: courseForm.tags.filter((item) => item.trim()),
      syllabus_items: courseForm.syllabus_items.filter((item) => item.trim()),
      certification_criteria: courseForm.certification_criteria.filter((item) => item.trim()),
      faqs: courseForm.faqs.filter((item) => item.question.trim() && item.answer.trim()),
    };
    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    if (courseForm.banner_image) {
      body.append("banner_image", courseForm.banner_image);
    }
    if (courseForm.syllabus_pdf) {
      body.append("syllabus_pdf", courseForm.syllabus_pdf);
    }

    await submitWithRefresh(
      () =>
        apiFormRequest("/api/v1/admin/courses", {
          method: "POST",
          body,
          token,
        }),
      "Course created successfully.",
      () => setCourseForm(createInitialCourseForm()),
    );
  }

  async function handleBatchSubmit(event) {
    event.preventDefault();
    setSubmitting("batch");

    const payload = {
      start_date: batchForm.start_date,
      end_date: batchForm.end_date,
      capacity: batchForm.capacity ? Number(batchForm.capacity) : null,
      delivery_mode: batchForm.delivery_mode,
      schedule_slots:
        batchForm.delivery_mode === "live"
          ? batchForm.schedule_slots.map((slot) => ({
              weekday: isDayBasedBatchCourse ? null : slot.weekday,
              specific_date: isDayBasedBatchCourse ? slot.specific_date : null,
              start_time: slot.start_time,
              end_time: slot.end_time,
              repeat_every_weeks: isDayBasedBatchCourse ? 1 : Number(slot.repeat_every_weeks || 1),
            }))
          : [],
    };

    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/admin/courses/${batchForm.course_id}/batches`, {
          method: "POST",
          body: payload,
          token,
        }),
      "Batch created successfully.",
      () => setBatchForm(createInitialBatchForm()),
    );
  }

  async function handleCourseInstructorSubmit(event) {
    event.preventDefault();
    setSubmitting("course-assignment");

    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/admin/courses/${courseInstructorForm.course_id}/instructors`, {
          method: "POST",
          body: { instructor_id: Number(courseInstructorForm.instructor_id) },
          token,
        }),
      "Instructor assigned to course successfully.",
      () => setCourseInstructorForm({ course_id: "", instructor_id: "" }),
    );
  }

  async function handleBatchInstructorSubmit(event) {
    event.preventDefault();
    setSubmitting("batch-assignment");

    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/admin/batches/${batchInstructorForm.batch_id}/instructor`, {
          method: "PATCH",
          body: { instructor_id: Number(batchInstructorForm.instructor_id) },
          token,
        }),
      "Instructor assigned to batch successfully.",
      () => setBatchInstructorForm({ batch_id: "", instructor_id: "" }),
    );
  }

  async function handleBatchEnrollmentSubmit(event) {
    event.preventDefault();
    setSubmitting("batch-enrollment");

    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/admin/batches/${batchEnrollmentForm.batch_id}/students`, {
          method: "POST",
          body: { student_id: Number(batchEnrollmentForm.student_id) },
          token,
        }),
      "Student enrolled in batch successfully.",
      () => setBatchEnrollmentForm({ batch_id: "", student_id: "" }),
    );
  }

  async function handleCertificateTemplateSubmit(event) {
    event.preventDefault();
    if (!certificateTemplateForm.certificate_file) {
      setNotice({ type: "error", message: "Select a PDF certificate template before uploading." });
      return;
    }

    setSubmitting("certificate-template");
    const body = new FormData();
    body.append("certificate_file", certificateTemplateForm.certificate_file);
    body.append("field_config", JSON.stringify(certificateTemplateForm.field_config));

    await submitWithRefresh(
      () =>
        apiFormRequest(
          `/api/v1/admin/courses/${certificateTemplateForm.course_id}/certificate-template`,
          {
            method: "POST",
            body,
            token,
          },
        ),
      "Certificate template saved successfully.",
      () =>
        setCertificateTemplateForm((current) => ({
          ...createInitialCertificateTemplateForm(),
          course_id: current.course_id,
        })),
    );
  }

  async function handleWeekPlanSave() {
    if (!selectedBatch) {
      return;
    }

    setSubmitting("week-plans");
    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/admin/batches/${selectedBatch.id}/week-plans`, {
          method: "PATCH",
          body: { week_plans: weekPlanDrafts },
          token,
        }),
      "Course plans updated and inherited sessions re-synced.",
    );
  }

  async function handleAdminBatchComplete() {
    if (!selectedBatch) {
      return;
    }

    setSubmitting("admin-complete");
    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/admin/batches/${selectedBatch.id}/complete`, {
          method: "POST",
          body: { student_ids: selectionState.completion },
          token,
        }),
      "Batch marked completed and certificate release triggered.",
    );
  }

  async function handleAdminCertificateRelease() {
    if (!selectedBatch) {
      return;
    }

    setSubmitting("admin-release");
    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/admin/batches/${selectedBatch.id}/certificates/release`, {
          method: "POST",
          body: { student_ids: selectionState.release },
          token,
        }),
      "Certificate release attempted for selected students.",
    );
  }

  async function handlePaymentModeChange(mode) {
    setSubmitting("payment-settings");
    await submitWithRefresh(
      () =>
        apiRequest("/api/v1/admin/payment-settings/mode", {
          method: "PUT",
          body: { active_mode: mode },
          token,
        }),
      `Razorpay ${formatEnumLabel(mode)} mode activated.`,
    );
  }

  const eligibleInstructors = selectedInstructorBatch
    ? adminData.instructors.filter((instructor) =>
        selectedInstructorBatch.course.instructor_assignments.some(
          (assignment) => assignment.instructor_id === instructor.id,
        ),
      )
    : adminData.instructors;

  const summaryItems = [
    { label: "Total Courses", value: adminData.courses.length, helper: "Course catalogue" },
    { label: "Total Batches", value: batches.length, helper: "Live and recorded" },
    { label: "Instructors", value: adminData.instructors.length, helper: "Teaching staff" },
    { label: "Students", value: adminData.students.length, helper: "Learner accounts" },
    {
      label: "Payments",
      value: formatEnumLabel(adminData.paymentSettings?.active_mode || "test"),
      helper: "Razorpay mode",
    },
  ];

  const activeBatches = batches.filter((batch) => batch.status === "active");
  const completedBatches = batches.filter((batch) => batch.status === "completed");
  const recentBatches = batches.slice(0, 5);
  const paymentSettings = adminData.paymentSettings;
  const paymentModeOptions = [
    {
      mode: "test",
      configured: Boolean(paymentSettings?.test_configured),
      keyId: paymentSettings?.test_key_id || "Not set",
    },
    {
      mode: "live",
      configured: Boolean(paymentSettings?.live_configured),
      keyId: paymentSettings?.live_key_id || "Not set",
    },
  ];

  const adminMenuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      shortLabel: "DB",
      description: "Numbers, activity, and quick overview",
    },
    {
      id: "create-course",
      label: "Create Course",
      shortLabel: "CO",
      description: "Course details, syllabus, pricing, and FAQs",
    },
    {
      id: "add-instructor",
      label: "Add Instructor",
      shortLabel: "IN",
      description: "Create instructor profile and skills",
    },
    {
      id: "create-student",
      label: "Create Student",
      shortLabel: "ST",
      description: "Create student login account",
    },
    {
      id: "create-batch",
      label: "Create Batch",
      shortLabel: "BA",
      description: "Batch dates, capacity, and schedule",
    },
    {
      id: "assign-instructors",
      label: "Assign Instructors",
      shortLabel: "AI",
      description: "Course and batch instructor mapping",
    },
    {
      id: "enroll-student",
      label: "Enroll Student",
      shortLabel: "EN",
      description: "Add students into a batch",
    },
    {
      id: "certificates",
      label: "Certificates",
      shortLabel: "CE",
      description: "Upload blank certificate template",
    },
    {
      id: "batch-operations",
      label: "Batch Operations",
      shortLabel: "OP",
      description: "Course plans, completion, and release",
    },
    {
      id: "payments",
      label: "Payments",
      shortLabel: "PY",
      description: "Razorpay keys, mode, and checkout status",
    },
    {
      id: "directories",
      label: "Directories",
      shortLabel: "DI",
      description: "Instructor and student registry",
    },
    {
      id: "catalogue",
      label: "Catalogue",
      shortLabel: "CA",
      description: "Courses and batch overview",
    },
  ];

  const activeAdminMenuItem =
    adminMenuItems.find((item) => item.id === activeAdminSection) || adminMenuItems[0];

  return (
    <main className="dashboard-shell">
      {adminData.loading ? (
        <SectionCard title="Loading" subtitle="Preparing admin data">
          <p className="muted-copy">Fetching instructors, students, courses, and batch management data.</p>
        </SectionCard>
      ) : adminData.error ? (
        <SectionCard title="Error" subtitle="Admin dashboard unavailable">
          <p className="feedback error">{adminData.error}</p>
        </SectionCard>
      ) : (
        <DashboardWorkspace
          title="Admin Panel"
          items={adminMenuItems}
          activeItem={activeAdminSection}
          onChange={setActiveAdminSection}
          user={user}
          role="admin"
          onLogout={onLogout}
        >
          <div className="workspace-page-title">
            <div>
              <h1>{activeAdminSection === "dashboard" ? "Dashboard Overview" : activeAdminMenuItem.label}</h1>
              <p>
                {activeAdminSection === "dashboard"
                  ? "Real-time academy insights and operational shortcuts."
                  : activeAdminMenuItem.description}
              </p>
            </div>
            {activeAdminSection === "dashboard" && (
              <button className="primary-button" type="button" onClick={() => setActiveAdminSection("create-course")}>
                Create Course
              </button>
            )}
          </div>
          <StatusBanner notice={notice} />

          <div hidden={activeAdminSection !== "dashboard"}>
            <DashboardSummary items={summaryItems} />

            <section className="dashboard-grid two-one">
              <SectionCard title="Insights" subtitle="Batch Distribution">
                <div className="distribution-panel">
                  <div className="donut-chart" style={{ "--done": `${batches.length ? (completedBatches.length / batches.length) * 100 : 0}%` }} />
                  <div className="distribution-legend">
                    <span><strong>{activeBatches.length}</strong> Active Batches</span>
                    <span><strong>{completedBatches.length}</strong> Completed Batches</span>
                    <span><strong>{batches.length - activeBatches.length - completedBatches.length}</strong> Other Batches</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Operations" subtitle="Recent Batches">
                {recentBatches.length === 0 ? (
                  <EmptyState title="No batches yet" body="Create a course and batch to start seeing activity here." />
                ) : (
                  <div className="dashboard-table">
                    <div className="dashboard-table-row header">
                      <span>Course</span>
                      <span>Mode</span>
                      <span>Students</span>
                    </div>
                    {recentBatches.map((batch) => (
                      <div className="dashboard-table-row" key={batch.id}>
                        <strong>{batch.course_title}</strong>
                        <span>{formatEnumLabel(batch.delivery_mode)}</span>
                        <span>{batch.enrollments.length}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </section>

            <section className="dashboard-grid">
              <SectionCard title="Quick Access" subtitle="Primary Admin Actions">
                <div className="quick-action-grid">
                  <button className="selector-card" type="button" onClick={() => setActiveAdminSection("create-course")}>
                    <strong>Create Course</strong>
                    <span>Build course details, syllabus, pricing, and FAQs.</span>
                  </button>
                  <button className="selector-card" type="button" onClick={() => setActiveAdminSection("add-instructor")}>
                    <strong>Add Instructor</strong>
                    <span>Create instructor profile and skills.</span>
                  </button>
                  <button className="selector-card" type="button" onClick={() => setActiveAdminSection("create-batch")}>
                    <strong>Create Batch</strong>
                    <span>Schedule live or recorded course delivery.</span>
                  </button>
                  <button className="selector-card" type="button" onClick={() => setActiveAdminSection("batch-operations")}>
                    <strong>Batch Operations</strong>
                    <span>Manage course plans, completion, and certificate release.</span>
                  </button>
                  <button className="selector-card" type="button" onClick={() => setActiveAdminSection("payments")}>
                    <strong>Payments</strong>
                    <span>Switch Razorpay test and live checkout modes.</span>
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Catalogue" subtitle="Course Snapshot">
                {adminData.courses.length === 0 ? (
                  <EmptyState title="No courses yet" body="Created courses will appear in this overview." />
                ) : (
                  <div className="record-list">
                    {adminData.courses.slice(0, 4).map((course) => (
                      <article className="record-item compact" key={course.id}>
                        <div>
                          <h4>{course.title}</h4>
                          <p>{course.category} | {formatWeeks(course)}</p>
                        </div>
                        <span className="detail-pill">{course.batches.length} batches</span>
                      </article>
                    ))}
                  </div>
                )}
              </SectionCard>
            </section>
          </div>

          <section className="dashboard-grid">
            <div hidden={activeAdminSection !== "add-instructor"}>
            <SectionCard title="Users" subtitle="Create Instructor">
              <form className="stack-form" onSubmit={handleInstructorSubmit}>
                <label className="field">
                  <span>Name</span>
                  <input
                    name="name"
                    value={instructorForm.name}
                    onChange={updateSimpleForm(setInstructorForm)}
                    required
                  />
                </label>
                <div className="field-grid">
                  <label className="field">
                    <span>Email</span>
                    <input
                      name="email"
                      type="email"
                      value={instructorForm.email}
                      onChange={updateSimpleForm(setInstructorForm)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Mobile</span>
                    <input
                      name="mobile_number"
                      value={instructorForm.mobile_number}
                      onChange={updateSimpleForm(setInstructorForm)}
                      required
                    />
                  </label>
                </div>

                <TextRepeater
                  label="Skills"
                  values={instructorForm.skills}
                  onChange={(index, value) => updateTextList(setInstructorForm, "skills", index, value)}
                  onAdd={() => addTextListItem(setInstructorForm, "skills")}
                  onRemove={(index) => removeTextListItem(setInstructorForm, "skills", index)}
                  placeholder="React, Python, Data Science"
                />

                <button className="primary-button full-width" type="submit" disabled={submitting === "instructor"}>
                  {submitting === "instructor" ? "Creating..." : "Create Instructor"}
                </button>
              </form>
            </SectionCard>
            </div>

            <div hidden={activeAdminSection !== "create-student"}>
            <SectionCard title="Users" subtitle="Create Student">
              <form className="stack-form" onSubmit={handleStudentSubmit}>
                <label className="field">
                  <span>Name</span>
                  <input
                    name="name"
                    value={studentForm.name}
                    onChange={updateSimpleForm(setStudentForm)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    value={studentForm.email}
                    onChange={updateSimpleForm(setStudentForm)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input
                    name="password"
                    type="password"
                    minLength="6"
                    value={studentForm.password}
                    onChange={updateSimpleForm(setStudentForm)}
                    required
                  />
                </label>

                <button className="primary-button full-width" type="submit" disabled={submitting === "student"}>
                  {submitting === "student" ? "Creating..." : "Create Student"}
                </button>
              </form>
            </SectionCard>
            </div>

            <div hidden={activeAdminSection !== "create-course"}>
            <SectionCard title="Courses" subtitle="Create Course">
              <form className="stack-form" onSubmit={handleCourseSubmit}>
                <div className="field-grid">
                  <label className="field">
                    <span>Course Type</span>
                    <select
                      name="course_type"
                      value={courseForm.course_type}
                      onChange={updateSimpleForm(setCourseForm)}
                    >
                      <option value="live">Live</option>
                      <option value="self_paced">Self Paced</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Duration Unit</span>
                    <select
                      name="duration_unit"
                      value={courseForm.duration_unit}
                      onChange={updateSimpleForm(setCourseForm)}
                    >
                      {courseDurationUnitOptions.map((option) => (
                        <option key={option} value={option}>
                          {formatEnumLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="field-grid">
                  <label className="field">
                    <span>{courseForm.duration_unit === "days" ? "Duration in Days" : "Duration in Weeks"}</span>
                    <input
                      name="duration_value"
                      type="number"
                      min="1"
                      value={courseForm.duration_value}
                      onChange={updateSimpleForm(setCourseForm)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Syllabus PDF</span>
                    <input
                      name="syllabus_pdf"
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={updateSimpleForm(setCourseForm)}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Title</span>
                  <input
                    name="title"
                    value={courseForm.title}
                    onChange={updateSimpleForm(setCourseForm)}
                    required
                  />
                </label>

                <label className="field">
                  <span>Description</span>
                  <textarea
                    name="description"
                    rows="4"
                    value={courseForm.description}
                    onChange={updateSimpleForm(setCourseForm)}
                    required
                  />
                </label>

                <div className="field-grid">
                  <label className="field">
                    <span>Category</span>
                    <input
                      name="category"
                      value={courseForm.category}
                      onChange={updateSimpleForm(setCourseForm)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Price</span>
                    <input
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={courseForm.price}
                      onChange={updateSimpleForm(setCourseForm)}
                      required
                    />
                  </label>
                </div>

                <div className="field-grid">
                  <label className="field">
                    <span>Discount %</span>
                    <input
                      name="discount_percentage"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={courseForm.discount_percentage}
                      onChange={updateSimpleForm(setCourseForm)}
                    />
                  </label>
                  <label className="field">
                    <span>Thumbnail URL</span>
                    <input
                      name="thumbnail_url"
                      value={courseForm.thumbnail_url}
                      onChange={updateSimpleForm(setCourseForm)}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Course Banner Image</span>
                  <input
                    name="banner_image"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    onChange={updateSimpleForm(setCourseForm)}
                  />
                </label>

                {(courseForm.banner_image || courseForm.syllabus_pdf) && (
                  <p className="helper-text">
                    {courseForm.banner_image ? `Banner: ${courseForm.banner_image.name}` : "Banner: not selected"}
                    {" | "}
                    {courseForm.syllabus_pdf ? `Syllabus: ${courseForm.syllabus_pdf.name}` : "Syllabus: not selected"}
                  </p>
                )}

                <TextRepeater
                  label="Tags"
                  values={courseForm.tags}
                  onChange={(index, value) => updateTextList(setCourseForm, "tags", index, value)}
                  onAdd={() => addTextListItem(setCourseForm, "tags")}
                  onRemove={(index) => removeTextListItem(setCourseForm, "tags", index)}
                  placeholder="frontend"
                />

                <TextRepeater
                  label="Syllabus Highlights"
                  values={courseForm.syllabus_items}
                  onChange={(index, value) =>
                    updateTextList(setCourseForm, "syllabus_items", index, value)
                  }
                  onAdd={() => addTextListItem(setCourseForm, "syllabus_items")}
                  onRemove={(index) => removeTextListItem(setCourseForm, "syllabus_items", index)}
                  placeholder="Module title"
                />

                <TextRepeater
                  label="Certification Criteria"
                  values={courseForm.certification_criteria}
                  onChange={(index, value) =>
                    updateTextList(setCourseForm, "certification_criteria", index, value)
                  }
                  onAdd={() => addTextListItem(setCourseForm, "certification_criteria")}
                  onRemove={(index) =>
                    removeTextListItem(setCourseForm, "certification_criteria", index)
                  }
                  placeholder="Minimum attendance 80%"
                />

                <FaqRepeater
                  items={courseForm.faqs}
                  onChange={updateFaq}
                  onAdd={() =>
                    setCourseForm((current) => ({
                      ...current,
                      faqs: [...current.faqs, { question: "", answer: "" }],
                    }))
                  }
                  onRemove={(index) =>
                    setCourseForm((current) => ({
                      ...current,
                      faqs: current.faqs.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                />

                <button className="primary-button full-width" type="submit" disabled={submitting === "course"}>
                  {submitting === "course" ? "Creating..." : "Create Course"}
                </button>
              </form>
            </SectionCard>
            </div>

            <div hidden={activeAdminSection !== "create-batch"}>
            <SectionCard title="Batches" subtitle="Create Batch">
              <form className="stack-form" onSubmit={handleBatchSubmit}>
                <label className="field">
                  <span>Course</span>
                  <select
                    name="course_id"
                    value={batchForm.course_id}
                    onChange={updateSimpleForm(setBatchForm)}
                    required
                  >
                    <option value="">Select course</option>
                    {adminData.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title} | {formatWeeks(course)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="field-grid">
                  <label className="field">
                    <span>Delivery Mode</span>
                    <select
                      name="delivery_mode"
                      value={batchForm.delivery_mode}
                      onChange={updateSimpleForm(setBatchForm)}
                    >
                      {deliveryModeOptions.map((option) => (
                        <option key={option} value={option}>
                          {formatEnumLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Capacity</span>
                    <input
                      name="capacity"
                      type="number"
                      min="1"
                      value={batchForm.capacity}
                      onChange={updateSimpleForm(setBatchForm)}
                    />
                  </label>
                </div>

                <div className="field-grid">
                  <label className="field">
                    <span>Start Date</span>
                    <input
                      name="start_date"
                      type="date"
                      value={batchForm.start_date}
                      onChange={updateSimpleForm(setBatchForm)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>End Date</span>
                    <input
                      name="end_date"
                      type="date"
                      value={batchForm.end_date}
                      onChange={updateSimpleForm(setBatchForm)}
                      required
                    />
                  </label>
                </div>

                {selectedCourseForBatch && batchForm.start_date && (
                  <p className="helper-text">
                    End date is auto-suggested from the selected course duration of {formatWeeks(selectedCourseForBatch)}, and you can still edit it.
                  </p>
                )}

                {selectedCourseForBatch?.duration_unit === "days" && (
                  <p className="helper-text">
                    For day-based live courses, one schedule row is created for each course day starting from the batch start date. You only need to set the times.
                  </p>
                )}

                {batchForm.delivery_mode === "live" && isDayBasedBatchCourse && !batchForm.start_date ? (
                  <p className="helper-text">Select a start date to generate the daily live schedule.</p>
                ) : batchForm.delivery_mode === "live" ? (
                  <ScheduleRepeater
                    items={batchForm.schedule_slots}
                    onChange={updateScheduleSlot}
                    onAdd={() =>
                      setBatchForm((current) => ({
                        ...current,
                        schedule_slots: [...current.schedule_slots, createDefaultWeeklyScheduleSlot()],
                      }))
                    }
                    onRemove={(index) =>
                      setBatchForm((current) => ({
                        ...current,
                        schedule_slots: current.schedule_slots.filter(
                          (_, slotIndex) => slotIndex !== index,
                        ),
                      }))
                    }
                    weekdayOptions={weekdayOptions}
                    scheduleMode={isDayBasedBatchCourse ? "daily" : "weekly"}
                  />
                ) : (
                  <p className="helper-text">
                    Recorded batches inherit course plans and create one recorded content session per plan automatically.
                  </p>
                )}

                <button className="primary-button full-width" type="submit" disabled={submitting === "batch"}>
                  {submitting === "batch" ? "Creating..." : "Create Batch"}
                </button>
              </form>
            </SectionCard>
            </div>

            <div hidden={activeAdminSection !== "assign-instructors"}>
            <SectionCard title="Assignments" subtitle="Assign Instructor to Course">
              <form className="stack-form" onSubmit={handleCourseInstructorSubmit}>
                <label className="field">
                  <span>Course</span>
                  <select
                    name="course_id"
                    value={courseInstructorForm.course_id}
                    onChange={updateSimpleForm(setCourseInstructorForm)}
                    required
                  >
                    <option value="">Select course</option>
                    {adminData.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Instructor</span>
                  <select
                    name="instructor_id"
                    value={courseInstructorForm.instructor_id}
                    onChange={updateSimpleForm(setCourseInstructorForm)}
                    required
                  >
                    <option value="">Select instructor</option>
                    {adminData.instructors.map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="primary-button full-width"
                  type="submit"
                  disabled={submitting === "course-assignment"}
                >
                  {submitting === "course-assignment" ? "Assigning..." : "Assign Instructor to Course"}
                </button>
              </form>
            </SectionCard>
            </div>

            <div hidden={activeAdminSection !== "assign-instructors"}>
            <SectionCard title="Assignments" subtitle="Assign Instructor to Batch">
              <form className="stack-form" onSubmit={handleBatchInstructorSubmit}>
                <label className="field">
                  <span>Batch</span>
                  <select
                    name="batch_id"
                    value={batchInstructorForm.batch_id}
                    onChange={(event) => {
                      const batchId = event.target.value;
                      setBatchInstructorForm({ batch_id: batchId, instructor_id: "" });
                    }}
                    required
                  >
                    <option value="">Select batch</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.course_title} | Batch #{batch.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Instructor</span>
                  <select
                    name="instructor_id"
                    value={batchInstructorForm.instructor_id}
                    onChange={updateSimpleForm(setBatchInstructorForm)}
                    required
                  >
                    <option value="">
                      {selectedInstructorBatch ? "Select instructor" : "Select batch first"}
                    </option>
                    {eligibleInstructors.map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="primary-button full-width"
                  type="submit"
                  disabled={submitting === "batch-assignment"}
                >
                  {submitting === "batch-assignment" ? "Assigning..." : "Assign Instructor to Batch"}
                </button>
              </form>
            </SectionCard>
            </div>

            <div hidden={activeAdminSection !== "enroll-student"}>
            <SectionCard title="Enrollment" subtitle="Enroll Student into Batch">
              <form className="stack-form" onSubmit={handleBatchEnrollmentSubmit}>
                <label className="field">
                  <span>Batch</span>
                  <select
                    name="batch_id"
                    value={batchEnrollmentForm.batch_id}
                    onChange={updateSimpleForm(setBatchEnrollmentForm)}
                    required
                  >
                    <option value="">Select batch</option>
                    {batches.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.course_title} | Batch #{batch.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Student</span>
                  <select
                    name="student_id"
                    value={batchEnrollmentForm.student_id}
                    onChange={updateSimpleForm(setBatchEnrollmentForm)}
                    required
                  >
                    <option value="">
                      {selectedEnrollmentBatch ? "Select student" : "Select batch first"}
                    </option>
                    {adminData.students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name} ({student.email})
                      </option>
                    ))}
                  </select>
                </label>

                {selectedEnrollmentBatch && (
                  <p className="helper-text">
                    Seats used: {selectedEnrollmentBatch.enrollments.length}
                    {selectedEnrollmentBatch.capacity ? ` / ${selectedEnrollmentBatch.capacity}` : ""}
                  </p>
                )}

                <button
                  className="primary-button full-width"
                  type="submit"
                  disabled={submitting === "batch-enrollment"}
                >
                  {submitting === "batch-enrollment" ? "Enrolling..." : "Enroll Student"}
                </button>
              </form>
            </SectionCard>
            </div>
          </section>

          <div hidden={activeAdminSection !== "payments"}>
            <SectionCard title="Payments" subtitle="Razorpay Checkout">
              {!paymentSettings ? (
                <EmptyState title="Payment settings unavailable" body="Razorpay settings could not be loaded." />
              ) : (
                <div className="detail-stack">
                  <div className="meta-row">
                    <span className="detail-pill">Active: {formatEnumLabel(paymentSettings.active_mode)}</span>
                    <span className="detail-pill">
                      Test Keys: {paymentSettings.test_configured ? "Configured" : "Missing"}
                    </span>
                    <span className="detail-pill">
                      Live Keys: {paymentSettings.live_configured ? "Configured" : "Missing"}
                    </span>
                  </div>

                  <div className="quick-action-grid">
                    {paymentModeOptions.map((option) => {
                      const isActive = paymentSettings.active_mode === option.mode;
                      return (
                        <button
                          className={`selector-card ${isActive ? "selected" : ""}`}
                          key={option.mode}
                          type="button"
                          onClick={() => handlePaymentModeChange(option.mode)}
                          disabled={isActive || !option.configured || submitting === "payment-settings"}
                        >
                          <strong>{formatEnumLabel(option.mode)} Mode</strong>
                          <span>{option.configured ? `Key ID: ${option.keyId}` : "Keys missing in backend .env"}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="record-list">
                    <article className="record-item compact">
                      <div>
                        <h4>Test Key ID</h4>
                        <p>{paymentSettings.test_key_id || "Not configured"}</p>
                      </div>
                      <span className="detail-pill">
                        {paymentSettings.test_configured ? "Ready" : "Missing Secret"}
                      </span>
                    </article>
                    <article className="record-item compact">
                      <div>
                        <h4>Live Key ID</h4>
                        <p>{paymentSettings.live_key_id || "Not configured"}</p>
                      </div>
                      <span className="detail-pill">
                        {paymentSettings.live_configured ? "Ready" : "Missing Secret"}
                      </span>
                    </article>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          <section className="dashboard-grid two-one">
            <div hidden={activeAdminSection !== "certificates"}>
            <SectionCard title="Certificates" subtitle="Upload Blank Course Certificate">
              <form className="stack-form" onSubmit={handleCertificateTemplateSubmit}>
                <label className="field">
                  <span>Course</span>
                  <select
                    name="course_id"
                    value={certificateTemplateForm.course_id}
                    onChange={(event) => {
                      const courseId = event.target.value;
                      const course = adminData.courses.find((item) => String(item.id) === courseId);
                      setCertificateTemplateForm({
                        course_id: courseId,
                        certificate_file: null,
                        field_config: cloneCertificateConfig(
                          course?.certificate_field_config || createInitialCertificateTemplateForm().field_config,
                        ),
                      });
                    }}
                    required
                  >
                    <option value="">Select course</option>
                    {adminData.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Template PDF</span>
                  <input
                    name="certificate_file"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={updateSimpleForm(setCertificateTemplateForm)}
                    required
                  />
                </label>

                {selectedTemplateCourse?.certificate_template_original_name && (
                  <p className="helper-text">
                    Current template: {selectedTemplateCourse.certificate_template_original_name}
                  </p>
                )}

                <div className="week-grid">
                  {Object.entries(certificateTemplateForm.field_config).map(([fieldName, config]) => (
                    <div className="nested-card" key={fieldName}>
                      <h5>{formatEnumLabel(fieldName)}</h5>
                      <div className="field-grid">
                        <label className="field">
                          <span>X</span>
                          <input
                            type="number"
                            min="0"
                            value={config.x}
                            onChange={(event) =>
                              updateCertificateField(fieldName, "x", Number(event.target.value))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Y</span>
                          <input
                            type="number"
                            min="0"
                            value={config.y}
                            onChange={(event) =>
                              updateCertificateField(fieldName, "y", Number(event.target.value))
                            }
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>Font Size</span>
                        <input
                          type="number"
                          min="8"
                          max="96"
                          value={config.font_size}
                          onChange={(event) =>
                            updateCertificateField(fieldName, "font_size", Number(event.target.value))
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <button
                  className="primary-button full-width"
                  type="submit"
                  disabled={submitting === "certificate-template"}
                >
                  {submitting === "certificate-template" ? "Saving..." : "Save Certificate Template"}
                </button>
              </form>
            </SectionCard>
            </div>

            <div hidden={activeAdminSection !== "batch-operations"}>
            <SectionCard title="Batch Ops" subtitle="Course Plan, Completion, and Certificate Release">
              {batches.length === 0 ? (
                <EmptyState
                  title="No batches yet"
                  body="Create a batch first. Course plans, completion, and certificate release are managed at the batch level."
                />
              ) : (
                <div className="detail-stack">
                  <label className="field">
                    <span>Select Batch</span>
                    <select
                      value={selectedBatchId || ""}
                      onChange={(event) => setSelectedBatchId(event.target.value)}
                    >
                      {batches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.course_title} | Batch #{batch.id} | {formatEnumLabel(batch.delivery_mode)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedBatch && (
                    <>
                      <div className="meta-row">
                        <span className="detail-pill">Status: {formatEnumLabel(selectedBatch.status)}</span>
                        <span className="detail-pill">Mode: {formatEnumLabel(selectedBatch.delivery_mode)}</span>
                        <span className="detail-pill">
                          Instructor: {selectedBatch.assigned_instructor?.name || "Not assigned"}
                        </span>
                      </div>

                      <div className="subsection-block">
                        <div className="subsection-header">
                          <h5>{selectedBatchCourse?.duration_unit === "days" ? "Day Plans" : "Week Plans"}</h5>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={handleWeekPlanSave}
                            disabled={submitting === "week-plans" || selectedBatch.status === "completed"}
                          >
                            {submitting === "week-plans"
                              ? "Saving..."
                              : selectedBatchCourse?.duration_unit === "days"
                                ? "Save Day Plans"
                                : "Save Week Plans"}
                          </button>
                        </div>

                        <div className="stack-list">
                          {weekPlanDrafts.map((plan, index) => (
                            <div className="nested-card" key={`week-plan-${plan.week_number}`}>
                              <p className="card-eyebrow">{getCoursePlanLabel(selectedBatchCourse, plan.week_number)}</p>
                              <label className="field">
                                <span>Title</span>
                                <input
                                  value={plan.title}
                                  onChange={(event) =>
                                    updateWeekPlanDraft(index, "title", event.target.value)
                                  }
                                  disabled={selectedBatch.status === "completed"}
                                />
                              </label>
                              <label className="field">
                                <span>Summary</span>
                                <textarea
                                  rows="3"
                                  value={plan.summary}
                                  onChange={(event) =>
                                    updateWeekPlanDraft(index, "summary", event.target.value)
                                  }
                                  disabled={selectedBatch.status === "completed"}
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="subsection-block">
                        <div className="subsection-header">
                          <h5>Batch Completion</h5>
                        </div>

                        {selectedBatch.status === "active" ? (
                          <>
                            <p className="helper-text">
                              Completing the batch freezes teaching updates and immediately attempts certificate release for the selected eligible students.
                            </p>
                            <SelectionChecklist
                              items={selectedBatch.enrollments.map((entry) => entry.student)}
                              selectedIds={selectionState.completion}
                              onToggle={(studentId) =>
                                setSelectionState((current) => ({
                                  ...current,
                                  completion: toggleListSelection(current.completion, studentId),
                                }))
                              }
                              searchValue={searchState.completion}
                              onSearchChange={(value) =>
                                setSearchState((current) => ({ ...current, completion: value }))
                              }
                              emptyMessage="No students found in this batch."
                            />
                            <button
                              className="primary-button"
                              type="button"
                              onClick={handleAdminBatchComplete}
                              disabled={submitting === "admin-complete"}
                            >
                              {submitting === "admin-complete"
                                ? "Completing..."
                                : "Mark Batch Completed and Release Certificates"}
                            </button>
                          </>
                        ) : (
                          <p className="muted-copy">
                            Completed on {formatDateTime(selectedBatch.completed_at)}.
                          </p>
                        )}
                      </div>

                      <div className="subsection-block">
                        <div className="subsection-header">
                          <h5>Manual Certificate Release</h5>
                        </div>

                        {selectedBatch.status !== "completed" ? (
                          <p className="muted-copy">Manual release becomes available after the batch is completed.</p>
                        ) : (
                          <>
                            <SelectionChecklist
                              items={selectedBatch.enrollments.map((entry) => entry.student)}
                              selectedIds={selectionState.release}
                              onToggle={(studentId) =>
                                setSelectionState((current) => ({
                                  ...current,
                                  release: toggleListSelection(current.release, studentId),
                                }))
                              }
                              searchValue={searchState.release}
                              onSearchChange={(value) =>
                                setSearchState((current) => ({ ...current, release: value }))
                              }
                              emptyMessage="No students found in this batch."
                            />
                            <button
                              className="primary-button"
                              type="button"
                              onClick={handleAdminCertificateRelease}
                              disabled={submitting === "admin-release"}
                            >
                              {submitting === "admin-release" ? "Releasing..." : "Release Certificates"}
                            </button>

                            <div className="record-list">
                              {selectedBatch.certificate_issues.map((issue) => (
                                <article className="record-item" key={issue.id}>
                                  <div>
                                    <h4>{issue.student.name}</h4>
                                    <p>{issue.student.email}</p>
                                    <p>Status: {formatEnumLabel(issue.email_status)}</p>
                                  </div>
                                  <p className="record-meta">
                                    Code: {issue.certificate_code}
                                    {issue.email_error ? ` | Error: ${issue.email_error}` : ""}
                                  </p>
                                </article>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </SectionCard>
            </div>
          </section>

          <section className="records-grid">
            <div hidden={activeAdminSection !== "directories"}>
            <SectionCard title="Registry" subtitle="Instructor Directory">
              {adminData.instructors.length === 0 ? (
                <EmptyState
                  title="No instructors yet"
                  body="Create instructors here before assigning them to courses and batches."
                />
              ) : (
                <div className="record-list">
                  {adminData.instructors.map((instructor) => (
                    <article className="record-item" key={instructor.id}>
                      <div>
                        <h4>{instructor.name}</h4>
                        <p>{instructor.email}</p>
                        <p>{instructor.instructor_profile?.mobile_number}</p>
                      </div>
                      <p className="record-meta">
                        Skills: {instructor.instructor_profile?.skills.map((skill) => skill.name).join(", ") || "Not added"}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </SectionCard>
            </div>

            <div hidden={activeAdminSection !== "directories"}>
            <SectionCard title="Registry" subtitle="Student Directory">
              {adminData.students.length === 0 ? (
                <EmptyState title="No students yet" body="Students appear here once you create their accounts." />
              ) : (
                <div className="record-list">
                  {adminData.students.map((student) => (
                    <article className="record-item" key={student.id}>
                      <div>
                        <h4>{student.name}</h4>
                        <p>{student.email}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </SectionCard>
            </div>
          </section>

          <div hidden={activeAdminSection !== "catalogue"}>
          <SectionCard title="Catalogue" subtitle="Courses and Batch Overview">
            {adminData.courses.length === 0 ? (
              <EmptyState title="No courses yet" body="Create a course to start managing batches and instructors." />
            ) : (
              <div className="catalogue-grid">
                {adminData.courses.map((course) => (
                  <article className="course-card" key={course.id}>
                    <div className="course-topline">
                      <span className="course-type">{course.course_type.replace("_", " ")}</span>
                      <span className="course-price">{formatCurrency(course.price)}</span>
                    </div>
                    <h4>{course.title}</h4>
                    <p className="course-description">{course.description}</p>
                    <p className="record-meta">
                      Category: {course.category} | Duration: {formatWeeks(course)}
                    </p>
                    <p className="record-meta">
                      Syllabus PDF: {course.syllabus_pdf_original_name ? (
                        <a href={resolveAssetUrl(course.syllabus_pdf_path)} target="_blank" rel="noreferrer">
                          {course.syllabus_pdf_original_name}
                        </a>
                      ) : "Not uploaded"}
                    </p>
                    <p className="record-meta">
                      Template: {course.certificate_template_original_name || "Not uploaded"}
                    </p>

                    {course.batches.length > 0 && (
                      <div className="batch-list">
                        {course.batches.map((batch) => (
                          <div className="batch-chip" key={batch.id}>
                            <strong>Batch #{batch.id}</strong>
                            <span>
                              {formatDate(batch.start_date)} to {formatDate(batch.end_date)}
                            </span>
                            <span>
                              {formatEnumLabel(batch.delivery_mode)} | {formatEnumLabel(batch.status)}
                            </span>
                            <span>
                              Students enrolled: {batch.enrollments.length}
                              {batch.capacity ? ` / ${batch.capacity}` : ""}
                            </span>
                            <span>
                              Certificates sent: {batch.certificate_issues.filter((issue) => issue.email_status === "sent").length}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </SectionCard>
          </div>
        </DashboardWorkspace>
      )}
    </main>
  );
}
