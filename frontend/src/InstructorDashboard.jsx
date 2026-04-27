import { useEffect, useState } from "react";

import {
  apiFormRequest,
  apiRequest,
  assignmentTypeOptions,
  attendanceStatusOptions,
  buildAttendanceDrafts,
  buildResourceDrafts,
  buildSessionDrafts,
  buildSubmissionDrafts,
  createInitialAssignmentForm,
  createInitialSessionForm,
  formatDate,
  formatDateTime,
  formatEnumLabel,
  formatScheduleSlot,
  formatWeeks,
  getCoursePlanLabel,
  getPlanStartDateValue,
  getWeekRangeLabel,
  gradingStatusOptions,
  resolveAssetUrl,
  sessionResourceTypeOptions,
  toggleListSelection,
} from "./utils";
import {
  DashboardWorkspace,
  DashboardSummary,
  EmptyState,
  SectionCard,
  SelectionChecklist,
  StatusBanner,
} from "./shared";

function createInitialSelectionState(batch) {
  const studentIds = batch?.enrollments.map((entry) => entry.student_id) || [];
  return {
    completion: studentIds,
    release: studentIds,
  };
}

function createInitialSearchState() {
  return {
    completion: "",
    release: "",
  };
}

function createEmptyComposerResource(sessionMode) {
  return {
    title: "",
    resource_type: sessionMode === "recorded" ? "video" : "attachment",
    input_mode: "file",
    url: "",
    file: null,
  };
}

export default function InstructorDashboard({ token, user, onLogout }) {
  const [dashboardState, setDashboardState] = useState({
    loading: true,
    error: "",
    batches: [],
  });
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [activeInstructorSection, setActiveInstructorSection] = useState("dashboard");
  const [assignmentForm, setAssignmentForm] = useState(createInitialAssignmentForm());
  const [sessionForm, setSessionForm] = useState(createInitialSessionForm());
  const [focusedSessionId, setFocusedSessionId] = useState("");
  const [sessionComposerResources, setSessionComposerResources] = useState([createEmptyComposerResource("live")]);
  const [attendanceDrafts, setAttendanceDrafts] = useState({});
  const [submissionDrafts, setSubmissionDrafts] = useState({});
  const [sessionDrafts, setSessionDrafts] = useState({});
  const [resourceDrafts, setResourceDrafts] = useState({});
  const [selectionState, setSelectionState] = useState({ completion: [], release: [] });
  const [searchState, setSearchState] = useState(createInitialSearchState());

  const selectedBatch =
    dashboardState.batches.find((batch) => String(batch.id) === selectedBatchId) ||
    dashboardState.batches[0] ||
    null;
  const focusedSession =
    selectedBatch?.sessions.find((session) => String(session.id) === String(focusedSessionId)) ||
    selectedBatch?.sessions[0] ||
    null;

  async function loadDashboard() {
    try {
      setDashboardState((current) => ({ ...current, loading: true, error: "" }));
      const response = await apiRequest("/api/v1/instructor/dashboard", { token });
      const batches = response.batches || [];
      setDashboardState({
        loading: false,
        error: "",
        batches,
      });
      setAttendanceDrafts(buildAttendanceDrafts(batches));
      setSubmissionDrafts(buildSubmissionDrafts(batches));
      setSessionDrafts(buildSessionDrafts(batches));
      setResourceDrafts(buildResourceDrafts(batches));

      if (!selectedBatchId && batches.length > 0) {
        setSelectedBatchId(String(batches[0].id));
      } else if (
        selectedBatchId &&
        !batches.some((batch) => String(batch.id) === selectedBatchId)
      ) {
        setSelectedBatchId(batches.length > 0 ? String(batches[0].id) : "");
      }
    } catch (error) {
      if (error.status === 401) {
        onLogout();
        return;
      }

      setDashboardState({
        loading: false,
        error: error.message || "Unable to load the instructor dashboard.",
        batches: [],
      });
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [token]);

  useEffect(() => {
    if (!selectedBatch && dashboardState.batches.length > 0) {
      setSelectedBatchId(String(dashboardState.batches[0].id));
    }
  }, [dashboardState.batches, selectedBatch]);

  useEffect(() => {
    if (!selectedBatch) {
      setSelectionState({ completion: [], release: [] });
      setSearchState(createInitialSearchState());
      return;
    }

    setAssignmentForm((current) => ({
      ...current,
      batch_id: String(selectedBatch.id),
      week_number: String(selectedBatch.week_plans[0]?.week_number || 1),
      session_id: "",
    }));
    setSessionForm({
      ...createInitialSessionForm(),
      batch_id: String(selectedBatch.id),
      week_number: String(selectedBatch.week_plans[0]?.week_number || 1),
      session_date: getPlanStartDateValue(selectedBatch, selectedBatch.week_plans[0]?.week_number || 1),
    });
    setFocusedSessionId(String(selectedBatch.sessions[0]?.id || ""));
    setSessionComposerResources([createEmptyComposerResource(selectedBatch.delivery_mode)]);
    setSelectionState(createInitialSelectionState(selectedBatch));
    setSearchState(createInitialSearchState());
  }, [selectedBatchId, dashboardState.batches]);

  async function submitWithRefresh(action, successMessage, afterSuccess) {
    try {
      setNotice({ type: "", message: "" });
      await action();
      if (afterSuccess) {
        afterSuccess();
      }
      await loadDashboard();
      setNotice({
        type: "success",
        message: successMessage,
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error.message || "Something went wrong.",
      });
    } finally {
      setSubmitting("");
    }
  }

  function updateSimpleForm(setter) {
    return (event) => {
      const { name, value, type, checked } = event.target;
      setter((current) => ({
        ...current,
        [name]: type === "checkbox" ? checked : value,
      }));
    };
  }

  function updateSessionDraft(sessionId, field, value) {
    setSessionDrafts((current) => ({
      ...current,
      [sessionId]: {
        ...current[sessionId],
        [field]: value,
      },
    }));
  }

  function updateResourceDraft(sessionId, field, value) {
    setResourceDrafts((current) => ({
      ...current,
      [sessionId]: {
        ...current[sessionId],
        [field]: value,
      },
    }));
  }

  function updateAttendanceDraft(sessionId, studentId, field, value) {
    setAttendanceDrafts((current) => ({
      ...current,
      [sessionId]: {
        ...(current[sessionId] || {}),
        [studentId]: {
          ...((current[sessionId] && current[sessionId][studentId]) || {
            status: "not_marked",
            note: "",
          }),
          [field]: value,
        },
      },
    }));
  }

  function updateSubmissionDraft(submissionId, field, value) {
    setSubmissionDrafts((current) => ({
      ...current,
      [submissionId]: {
        ...current[submissionId],
        [field]: value,
      },
    }));
  }

  function updateComposerResource(index, field, value) {
    setSessionComposerResources((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function addComposerResource() {
    setSessionComposerResources((current) => [
      ...current,
      createEmptyComposerResource(selectedBatch?.delivery_mode || "live"),
    ]);
  }

  function removeComposerResource(index) {
    setSessionComposerResources((current) =>
      current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  function handleSessionFormChange(event) {
    const { name, value } = event.target;
    setSessionForm((current) => {
      const nextState = {
        ...current,
        [name]: value,
      };
      if (name === "week_number" && selectedBatch) {
        nextState.session_date = getPlanStartDateValue(selectedBatch, value);
      }
      return nextState;
    });
  }

  async function handleAssignmentSubmit(event) {
    event.preventDefault();
    setSubmitting("assignment");

    const payload = {
      week_number: Number(assignmentForm.week_number),
      session_id: assignmentForm.session_id ? Number(assignmentForm.session_id) : null,
      title: assignmentForm.title,
      description: assignmentForm.description,
      assignment_type: assignmentForm.assignment_type,
      due_at: assignmentForm.due_at ? new Date(assignmentForm.due_at).toISOString() : null,
      max_points: assignmentForm.max_points ? Number(assignmentForm.max_points) : null,
      allow_late_submission: assignmentForm.allow_late_submission,
      resource_url: assignmentForm.resource_url || null,
    };

    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/instructor/batches/${assignmentForm.batch_id}/assignments`, {
          method: "POST",
          body: payload,
          token,
        }),
      "Assignment created successfully.",
      () =>
        setAssignmentForm((current) => ({
          ...createInitialAssignmentForm(),
          batch_id: current.batch_id,
          week_number: current.week_number,
        })),
    );
  }

  async function handleSessionSave(sessionId) {
    const sessionDraft = sessionDrafts[sessionId];
    setSubmitting(`session-${sessionId}`);

    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/instructor/sessions/${sessionId}`, {
          method: "PATCH",
          body: {
            ...sessionDraft,
          },
          token,
        }),
      "Session updated successfully.",
    );
  }

  async function handleSessionCreate(event) {
    event.preventDefault();
    if (!selectedBatch) {
      return;
    }

    setSubmitting("create-session");
    try {
      setNotice({ type: "", message: "" });
      const payload = {
        week_number: Number(sessionForm.week_number),
        title: sessionForm.title,
        description: sessionForm.description || null,
        session_mode: selectedBatch.delivery_mode === "recorded" ? "recorded" : "live",
        status: "scheduled",
        session_date: sessionForm.session_date,
        start_time: sessionForm.start_time,
        end_time: sessionForm.end_time,
        meeting_url: sessionForm.meeting_url || null,
        recording_url: sessionForm.recording_url || null,
      };

      const createdSession = await apiRequest(`/api/v1/instructor/batches/${selectedBatch.id}/sessions`, {
        method: "POST",
        body: payload,
        token,
      });

      const pendingResources = sessionComposerResources.filter(
        (item) => item.title.trim() || item.file || item.url.trim(),
      );
      for (const resource of pendingResources) {
        await uploadSessionResourcePayload(createdSession.id, resource);
      }

      setSessionForm({
        ...createInitialSessionForm(),
        batch_id: String(selectedBatch.id),
        week_number: sessionForm.week_number,
        session_date: getPlanStartDateValue(selectedBatch, sessionForm.week_number),
      });
      setSessionComposerResources([createEmptyComposerResource(selectedBatch.delivery_mode)]);
      await loadDashboard();
      setFocusedSessionId(String(createdSession.id));
      setNotice({
        type: "success",
        message:
          pendingResources.length > 0
            ? "Session and resources created successfully."
            : "Session created successfully.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error.message || "Something went wrong.",
      });
    } finally {
      setSubmitting("");
    }
  }

  async function handleAttendanceSave(session) {
    if (!selectedBatch) {
      return;
    }

    setSubmitting(`attendance-${session.id}`);
    const records = selectedBatch.enrollments.map((enrollment) => ({
      student_id: enrollment.student_id,
      status:
        attendanceDrafts[session.id]?.[enrollment.student_id]?.status || "not_marked",
      note: attendanceDrafts[session.id]?.[enrollment.student_id]?.note || null,
    }));

    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/instructor/sessions/${session.id}/attendance`, {
          method: "PUT",
          body: { source: "manual", records },
          token,
        }),
      `Attendance saved for ${session.title}.`,
    );
  }

  async function uploadSessionResourcePayload(sessionId, draft) {
    if (!draft?.file && !draft?.url?.trim()) {
      throw new Error("Choose a file or enter a resource link before uploading.");
    }

    const body = new FormData();
    body.append("title", draft.title || draft.file?.name || draft.url || "Resource");
    body.append("resource_type", draft.resource_type);
    if (draft.file) {
      body.append("resource_file", draft.file);
    }
    if (draft.url?.trim()) {
      body.append("resource_url", draft.url.trim());
    }

    return apiFormRequest(`/api/v1/instructor/sessions/${sessionId}/resources`, {
      method: "POST",
      body,
      token,
    });
  }

  async function handleResourceUpload(sessionId) {
    const draft = resourceDrafts[sessionId];
    if (!draft?.file && !draft?.url?.trim()) {
      setNotice({ type: "error", message: "Choose a file or enter a resource link before uploading." });
      return;
    }

    setSubmitting(`resource-${sessionId}`);
    await submitWithRefresh(
      () => uploadSessionResourcePayload(sessionId, draft),
      "Session resource uploaded successfully.",
      () =>
        setResourceDrafts((current) => ({
          ...current,
          [sessionId]: {
            ...current[sessionId],
            title: "",
            input_mode: "file",
            url: "",
            file: null,
          },
        })),
    );
  }

  async function handleSessionDelete(sessionId) {
    if (!window.confirm("Delete this session?")) {
      return;
    }

    setSubmitting(`delete-session-${sessionId}`);
    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/instructor/sessions/${sessionId}`, {
          method: "DELETE",
          token,
        }),
      "Session deleted successfully.",
      () => setFocusedSessionId(""),
    );
  }

  async function handleGradeSubmit(submissionId) {
    const draft = submissionDrafts[submissionId];
    setSubmitting(`grade-${submissionId}`);

    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/instructor/submissions/${submissionId}/grade`, {
          method: "PATCH",
          body: {
            score: draft.score === "" ? null : Number(draft.score),
            feedback: draft.feedback || null,
            status: draft.status,
          },
          token,
        }),
      "Submission graded successfully.",
    );
  }

  async function handleBatchComplete() {
    if (!selectedBatch) {
      return;
    }

    setSubmitting("batch-complete");
    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/instructor/batches/${selectedBatch.id}/complete`, {
          method: "POST",
          body: { student_ids: selectionState.completion },
          token,
        }),
      "Batch marked completed and certificates processed.",
    );
  }

  async function handleCertificateRelease() {
    if (!selectedBatch) {
      return;
    }

    setSubmitting("certificate-release");
    await submitWithRefresh(
      () =>
        apiRequest(`/api/v1/instructor/batches/${selectedBatch.id}/certificates/release`, {
          method: "POST",
          body: { student_ids: selectionState.release },
          token,
        }),
      "Certificate release attempted for selected students.",
    );
  }

  const summaryItems = [
    { label: "Assigned Batches", value: dashboardState.batches.length, helper: "Current workload" },
    {
      label: "Students",
      value: new Set(
        dashboardState.batches.flatMap((batch) => batch.enrollments.map((entry) => entry.student_id)),
      ).size,
      helper: "Unique learners",
    },
    {
      label: "Active Sessions",
      value: dashboardState.batches.reduce((total, batch) => total + batch.sessions.length, 0),
      helper: "Teaching sessions",
    },
    {
      label: "Pending Grading",
      value: dashboardState.batches.reduce(
        (total, batch) =>
          total +
          batch.assignments.reduce(
            (assignmentTotal, assignment) =>
              assignmentTotal +
              assignment.submissions.filter((submission) => submission.status === "submitted").length,
            0,
          ),
        0,
      ),
      helper: "Needs review",
    },
  ];

  const activeInstructorBatches = dashboardState.batches.filter((batch) => batch.status === "active");
  const completedInstructorBatches = dashboardState.batches.filter((batch) => batch.status === "completed");
  const recentInstructorBatches = dashboardState.batches.slice(0, 5);

  const instructorMenuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      shortLabel: "DB",
      description: "Numbers, assigned work, and quick overview",
    },
    {
      id: "batches",
      label: "Assigned Batches",
      shortLabel: "BA",
      description: "Pick a batch and review status",
    },
    {
      id: "create-assignment",
      label: "Create Assignment",
      shortLabel: "AS",
      description: "Create course assignments",
    },
    {
      id: "week-plan",
      label: "Course Plan",
      shortLabel: "WP",
      description: "Review inherited course plan",
    },
    {
      id: "sessions",
      label: "Sessions & Resources",
      shortLabel: "SR",
      description: "Update sessions and upload material",
    },
    {
      id: "attendance",
      label: "Attendance",
      shortLabel: "AT",
      description: "Mark live-session attendance",
    },
    {
      id: "grading",
      label: "Submissions & Grading",
      shortLabel: "GR",
      description: "Review submissions and save grades",
    },
    {
      id: "completion",
      label: "Completion",
      shortLabel: "CP",
      description: "Batch offboarding and certificates",
    },
  ];

  const selectedInstructorMenuItem =
    instructorMenuItems.find((item) => item.id === activeInstructorSection) || instructorMenuItems[0];

  return (
    <main className="dashboard-shell">
      {dashboardState.loading ? (
        <SectionCard title="Loading" subtitle="Preparing instructor workspace">
          <p className="muted-copy">Fetching assigned batches, inherited course plans, sessions, and grading data.</p>
        </SectionCard>
      ) : dashboardState.error ? (
        <SectionCard title="Error" subtitle="Instructor dashboard unavailable">
          <p className="feedback error">{dashboardState.error}</p>
        </SectionCard>
      ) : dashboardState.batches.length === 0 ? (
        <SectionCard title="No Batches" subtitle="Nothing assigned yet">
          <EmptyState
            title="No assigned batches"
            body="Once an admin assigns you to a batch, inherited course plans and sessions will appear here automatically."
          />
        </SectionCard>
      ) : (
        <DashboardWorkspace
          title="Instructor Panel"
          items={instructorMenuItems}
          activeItem={activeInstructorSection}
          onChange={setActiveInstructorSection}
          user={user}
          role="instructor"
          onLogout={onLogout}
        >
          <div className="workspace-page-title">
            <div>
              <h1>{activeInstructorSection === "dashboard" ? "Dashboard Overview" : selectedInstructorMenuItem.label}</h1>
              <p>
                {activeInstructorSection === "dashboard"
                  ? "Assigned teaching activity, sessions, and grading workload."
                  : selectedInstructorMenuItem.description}
              </p>
            </div>
            {activeInstructorSection === "sessions" && selectedBatch ? (
              <label className="field compact-select">
                <span>Course / Batch</span>
                <select value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}>
                  {dashboardState.batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.course.title} | Batch #{batch.id}
                    </option>
                  ))}
                </select>
              </label>
            ) : activeInstructorSection === "dashboard" && (
              <button className="primary-button" type="button" onClick={() => setActiveInstructorSection("batches")}>
                View Batches
              </button>
            )}
          </div>
          <StatusBanner notice={notice} />

          <div hidden={activeInstructorSection !== "dashboard"}>
            <DashboardSummary items={summaryItems} />

            <section className="dashboard-grid two-one">
              <SectionCard title="Insights" subtitle="Batch Distribution">
                <div className="distribution-panel">
                  <div
                    className="donut-chart"
                    style={{
                      "--done": `${
                        dashboardState.batches.length
                          ? (completedInstructorBatches.length / dashboardState.batches.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                  <div className="distribution-legend">
                    <span><strong>{activeInstructorBatches.length}</strong> Active Batches</span>
                    <span><strong>{completedInstructorBatches.length}</strong> Completed Batches</span>
                    <span><strong>{dashboardState.batches.length}</strong> Total Assigned</span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Teaching" subtitle="Assigned Batches">
                <div className="dashboard-table">
                  <div className="dashboard-table-row header">
                    <span>Course</span>
                    <span>Status</span>
                    <span>Students</span>
                  </div>
                  {recentInstructorBatches.map((batch) => (
                    <div className="dashboard-table-row" key={batch.id}>
                      <strong>{batch.course.title}</strong>
                      <span>{formatEnumLabel(batch.status)}</span>
                      <span>{batch.enrollments.length}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </section>

            <section className="dashboard-grid">
              <SectionCard title="Quick Access" subtitle="Primary Instructor Actions">
                <div className="quick-action-grid">
                  <button className="selector-card" type="button" onClick={() => setActiveInstructorSection("batches")}>
                    <strong>Assigned Batches</strong>
                    <span>Select the batch you want to manage.</span>
                  </button>
                  <button className="selector-card" type="button" onClick={() => setActiveInstructorSection("sessions")}>
                    <strong>Sessions & Resources</strong>
                    <span>Update sessions and upload teaching material.</span>
                  </button>
                  <button className="selector-card" type="button" onClick={() => setActiveInstructorSection("attendance")}>
                    <strong>Attendance</strong>
                    <span>Mark live-session student attendance.</span>
                  </button>
                  <button className="selector-card" type="button" onClick={() => setActiveInstructorSection("grading")}>
                    <strong>Submissions & Grading</strong>
                    <span>Review submitted work and save grades.</span>
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Current Batch" subtitle="Selected Overview">
                {selectedBatch ? (
                  <div className="detail-stack">
                    <div className="meta-row">
                      <span className="detail-pill">Batch #{selectedBatch.id}</span>
                      <span className="detail-pill">{formatEnumLabel(selectedBatch.delivery_mode)}</span>
                      <span className="detail-pill">{formatEnumLabel(selectedBatch.status)}</span>
                    </div>
                    <p className="muted-copy">{selectedBatch.course.title}</p>
                  </div>
                ) : (
                  <EmptyState title="No batch selected" body="Choose an assigned batch to manage its sessions." />
                )}
              </SectionCard>
            </section>
          </div>

          <section className="dashboard-grid two-one" hidden={activeInstructorSection !== "batches"}>
            <SectionCard title="Batches" subtitle="Assigned Batches">
              <div className="stack-list">
                {dashboardState.batches.map((batch) => (
                  <button
                    className={`selector-card ${String(batch.id) === String(selectedBatch?.id) ? "selected" : ""}`}
                    key={batch.id}
                    type="button"
                    onClick={() => setSelectedBatchId(String(batch.id))}
                  >
                    <strong>{batch.course.title}</strong>
                    <span>
                      Batch #{batch.id} | {formatEnumLabel(batch.delivery_mode)} | {formatEnumLabel(batch.status)}
                    </span>
                    <span>
                      {formatDate(batch.start_date)} - {formatDate(batch.end_date)} | {batch.enrollments.length} students
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Overview" subtitle="Selected Batch">
              {selectedBatch ? (
                <div className="detail-stack">
                  <div className="meta-row">
                    <span className="detail-pill">Mode: {formatEnumLabel(selectedBatch.delivery_mode)}</span>
                    <span className="detail-pill">Status: {formatEnumLabel(selectedBatch.status)}</span>
                    <span className="detail-pill">Duration: {formatWeeks(selectedBatch.course)}</span>
                  </div>
                  <p className="muted-copy">
                    {selectedBatch.delivery_mode === "live"
                      ? "Live sessions are inherited from the admin-defined batch schedule and can be adjusted if class delivery needs it."
                      : "Recorded sessions are inherited from the admin course plan. Upload videos, notes, and attachments inside each plan."}
                  </p>
                  {selectedBatch.schedule_slots.length > 0 && (
                    <p className="helper-text">
                      Schedule: {selectedBatch.schedule_slots.map((slot) => formatScheduleSlot(slot)).join(" | ")}
                    </p>
                  )}
                </div>
              ) : (
                <EmptyState title="Select a batch" body="Choose a batch to manage inherited sessions and certificates." />
              )}
            </SectionCard>
          </section>

          {selectedBatch && activeInstructorSection === "create-assignment" && selectedBatch.status === "active" && (
            <SectionCard title="Assignments" subtitle="Create Course Assignment">
              <form className="stack-form" onSubmit={handleAssignmentSubmit}>
                <div className="field-grid">
                  <label className="field">
                    <span>{selectedBatch.course.duration_unit === "days" ? "Day Number" : "Week Number"}</span>
                    <select
                      name="week_number"
                      value={assignmentForm.week_number}
                      onChange={updateSimpleForm(setAssignmentForm)}
                    >
                      {selectedBatch.week_plans.map((plan) => (
                        <option key={plan.id} value={plan.week_number}>
                          {getCoursePlanLabel(selectedBatch.course, plan.week_number)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Assignment Type</span>
                    <select
                      name="assignment_type"
                      value={assignmentForm.assignment_type}
                      onChange={updateSimpleForm(setAssignmentForm)}
                    >
                      {assignmentTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          {formatEnumLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>Related Session</span>
                  <select
                    name="session_id"
                    value={assignmentForm.session_id}
                    onChange={updateSimpleForm(setAssignmentForm)}
                  >
                    <option value="">Optional session link</option>
                    {selectedBatch.sessions
                      .filter((session) => String(session.week_number) === assignmentForm.week_number)
                      .map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.title}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field">
                  <span>Title</span>
                  <input
                    name="title"
                    value={assignmentForm.title}
                    onChange={updateSimpleForm(setAssignmentForm)}
                    required
                  />
                </label>

                <label className="field">
                  <span>Description</span>
                  <textarea
                    name="description"
                    rows="4"
                    value={assignmentForm.description}
                    onChange={updateSimpleForm(setAssignmentForm)}
                    required
                  />
                </label>

                <div className="field-grid">
                  <label className="field">
                    <span>Due At</span>
                    <input
                      name="due_at"
                      type="datetime-local"
                      value={assignmentForm.due_at}
                      onChange={updateSimpleForm(setAssignmentForm)}
                    />
                  </label>
                  <label className="field">
                    <span>Max Points</span>
                    <input
                      name="max_points"
                      type="number"
                      min="0"
                      value={assignmentForm.max_points}
                      onChange={updateSimpleForm(setAssignmentForm)}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Resource URL</span>
                  <input
                    name="resource_url"
                    value={assignmentForm.resource_url}
                    onChange={updateSimpleForm(setAssignmentForm)}
                  />
                </label>

                <label className="checkbox-row">
                  <input
                    name="allow_late_submission"
                    type="checkbox"
                    checked={assignmentForm.allow_late_submission}
                    onChange={updateSimpleForm(setAssignmentForm)}
                  />
                  <span>Allow late submission</span>
                </label>

                <button
                  className="primary-button full-width"
                  type="submit"
                  disabled={submitting === "assignment"}
                >
                  {submitting === "assignment" ? "Creating..." : "Create Assignment"}
                </button>
              </form>
            </SectionCard>
          )}

          {selectedBatch && activeInstructorSection === "create-assignment" && selectedBatch.status !== "active" && (
            <SectionCard title="Assignments" subtitle="Create Course Assignment">
              <EmptyState
                title="Batch already completed"
                body="Assignments can only be created while the selected batch is active."
              />
            </SectionCard>
          )}

          {selectedBatch && activeInstructorSection === "sessions" && (
            <SectionCard
              title="Sessions"
              subtitle={`${selectedBatch.course.title} | Batch #${selectedBatch.id}`}
            >
              <div className="detail-stack compact-overview">
                <div className="meta-row">
                  <span className="detail-pill">Mode: {formatEnumLabel(selectedBatch.delivery_mode)}</span>
                  <span className="detail-pill">Status: {formatEnumLabel(selectedBatch.status)}</span>
                  <span className="detail-pill">Duration: {formatWeeks(selectedBatch.course)}</span>
                </div>
                {selectedBatch.schedule_slots.length > 0 && (
                  <p className="helper-text">
                    Default schedule: {selectedBatch.schedule_slots.map((slot) => formatScheduleSlot(slot)).join(" | ")}
                  </p>
                )}
              </div>

              <div className="session-workbench">
                <aside className="session-rail">
                  <div className="subsection-header">
                    <h5>Scheduled Sessions</h5>
                  </div>
                  {selectedBatch.sessions.length === 0 ? (
                    <p className="muted-copy">No sessions created yet.</p>
                  ) : (
                    <div className="stack-list">
                      {selectedBatch.sessions.map((session) => (
                        <article
                          className={`session-card-mini ${
                            String(session.id) === String(focusedSession?.id) ? "selected" : ""
                          }`}
                          key={session.id}
                        >
                          <button
                            className="session-card-trigger"
                            type="button"
                            onClick={() => setFocusedSessionId(String(session.id))}
                          >
                            <strong>{session.title}</strong>
                            <span>{formatDate(session.session_date)}</span>
                            <span>
                              {session.start_time} - {session.end_time}
                            </span>
                            <span>
                              {formatEnumLabel(session.session_mode)} | {formatEnumLabel(session.status)}
                            </span>
                          </button>
                          <div className="session-card-actions">
                            <button
                              className="mini-button"
                              type="button"
                              onClick={() => setFocusedSessionId(String(session.id))}
                            >
                              Edit
                            </button>
                            <button
                              className="mini-button danger"
                              type="button"
                              onClick={() => handleSessionDelete(session.id)}
                              disabled={selectedBatch.status === "completed" || submitting === `delete-session-${session.id}`}
                            >
                              {submitting === `delete-session-${session.id}` ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </aside>

                <div className="session-main-stack">
                  {selectedBatch.status === "active" && (
                    <div className="subsection-block">
                      <div className="subsection-header">
                        <h5>Create Session With Resources</h5>
                      </div>

                      <form className="stack-form" onSubmit={handleSessionCreate}>
                        <div className="field-grid">
                          <label className="field">
                            <span>{selectedBatch.course.duration_unit === "days" ? "Day Number" : "Week Number"}</span>
                            <select name="week_number" value={sessionForm.week_number} onChange={handleSessionFormChange}>
                              {selectedBatch.week_plans.map((plan) => (
                                <option key={plan.id} value={plan.week_number}>
                                  {getCoursePlanLabel(selectedBatch.course, plan.week_number)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>{selectedBatch.delivery_mode === "recorded" ? "Release Date" : "Session Date"}</span>
                            <input
                              name="session_date"
                              type="date"
                              value={sessionForm.session_date}
                              onChange={handleSessionFormChange}
                              required
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span>Title</span>
                          <input name="title" value={sessionForm.title} onChange={handleSessionFormChange} required />
                        </label>

                        <label className="field">
                          <span>Description</span>
                          <textarea
                            name="description"
                            rows="3"
                            value={sessionForm.description}
                            onChange={handleSessionFormChange}
                          />
                        </label>

                        <div className="field-grid">
                          <label className="field">
                            <span>Start Time</span>
                            <input
                              name="start_time"
                              type="time"
                              value={sessionForm.start_time}
                              onChange={handleSessionFormChange}
                              required
                            />
                          </label>
                          <label className="field">
                            <span>End Time</span>
                            <input
                              name="end_time"
                              type="time"
                              value={sessionForm.end_time}
                              onChange={handleSessionFormChange}
                              required
                            />
                          </label>
                        </div>

                        <div className="field-grid">
                          <label className="field">
                            <span>{selectedBatch.delivery_mode === "recorded" ? "Recording URL" : "Session Link"}</span>
                            <input
                              name={selectedBatch.delivery_mode === "recorded" ? "recording_url" : "meeting_url"}
                              value={
                                selectedBatch.delivery_mode === "recorded"
                                  ? sessionForm.recording_url
                                  : sessionForm.meeting_url
                              }
                              onChange={handleSessionFormChange}
                            />
                          </label>
                          <label className="field">
                            <span>Secondary Link</span>
                            <input
                              name={selectedBatch.delivery_mode === "recorded" ? "meeting_url" : "recording_url"}
                              value={
                                selectedBatch.delivery_mode === "recorded"
                                  ? sessionForm.meeting_url
                                  : sessionForm.recording_url
                              }
                              onChange={handleSessionFormChange}
                            />
                          </label>
                        </div>

                        <div className="subsection-block soft">
                          <div className="subsection-header">
                            <h6>Resources To Add Now</h6>
                            <button className="mini-button" type="button" onClick={addComposerResource}>
                              Add Resource
                            </button>
                          </div>

                          <div className="stack-list">
                            {sessionComposerResources.map((resource, index) => (
                              <div className="nested-card soft" key={`composer-resource-${index}`}>
                                <div className="field-grid">
                                  <label className="field">
                                    <span>Title</span>
                                    <input
                                      value={resource.title}
                                      onChange={(event) =>
                                        updateComposerResource(index, "title", event.target.value)
                                      }
                                    />
                                  </label>
                                  <label className="field">
                                    <span>Type</span>
                                    <select
                                      value={resource.resource_type}
                                      onChange={(event) =>
                                        updateComposerResource(index, "resource_type", event.target.value)
                                      }
                                    >
                                      {sessionResourceTypeOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {formatEnumLabel(option)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>

                                <div className="field-grid">
                                  <label className="field">
                                    <span>Input</span>
                                    <select
                                      value={resource.input_mode}
                                      onChange={(event) =>
                                        updateComposerResource(index, "input_mode", event.target.value)
                                      }
                                    >
                                      <option value="file">File Upload</option>
                                      <option value="link">Link / URL</option>
                                    </select>
                                  </label>
                                  {resource.input_mode === "link" ? (
                                    <label className="field">
                                      <span>Resource URL</span>
                                      <input
                                        value={resource.url}
                                        onChange={(event) =>
                                          updateComposerResource(index, "url", event.target.value)
                                        }
                                        placeholder="https://..."
                                      />
                                    </label>
                                  ) : (
                                    <label className="field">
                                      <span>File</span>
                                      <input
                                        type="file"
                                        onChange={(event) =>
                                          updateComposerResource(index, "file", event.target.files?.[0] || null)
                                        }
                                      />
                                    </label>
                                  )}
                                </div>

                                <div className="header-actions">
                                  <span className="helper-text">
                                    {resource.file ? resource.file.name : resource.url ? resource.url : "Optional"}
                                  </span>
                                  <button
                                    className="mini-button danger"
                                    type="button"
                                    onClick={() => removeComposerResource(index)}
                                    disabled={sessionComposerResources.length === 1}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button className="primary-button" type="submit" disabled={submitting === "create-session"}>
                          {submitting === "create-session" ? "Creating..." : "Create Session"}
                        </button>
                      </form>
                    </div>
                  )}

                  <div className="subsection-block">
                    <div className="subsection-header">
                      <h5>Edit Session</h5>
                    </div>

                    {!focusedSession ? (
                      <p className="muted-copy">Select a session card to edit timing, links, and resources.</p>
                    ) : (
                      <div className="nested-card">
                        <div className="row-spread">
                          <div>
                            <h5>{focusedSession.title}</h5>
                            <p className="record-meta">
                              {formatEnumLabel(focusedSession.origin)}
                              {focusedSession.is_customized ? " | Customized" : " | Inherited"}
                            </p>
                          </div>
                          <div className="pill-row">
                            <span className="detail-pill">{formatEnumLabel(focusedSession.session_mode)}</span>
                            <span className="detail-pill">{formatEnumLabel(focusedSession.status)}</span>
                          </div>
                        </div>

                        <div className="field-grid">
                          <label className="field">
                            <span>Title</span>
                            <input
                              value={sessionDrafts[focusedSession.id]?.title || ""}
                              onChange={(event) =>
                                updateSessionDraft(focusedSession.id, "title", event.target.value)
                              }
                              disabled={selectedBatch.status === "completed"}
                            />
                          </label>
                          <label className="field">
                            <span>{focusedSession.session_mode === "recorded" ? "Release Date" : "Session Date"}</span>
                            <input
                              type="date"
                              value={sessionDrafts[focusedSession.id]?.session_date || ""}
                              onChange={(event) =>
                                updateSessionDraft(focusedSession.id, "session_date", event.target.value)
                              }
                              disabled={selectedBatch.status === "completed"}
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span>Description</span>
                          <textarea
                            rows="3"
                            value={sessionDrafts[focusedSession.id]?.description || ""}
                            onChange={(event) =>
                              updateSessionDraft(focusedSession.id, "description", event.target.value)
                            }
                            disabled={selectedBatch.status === "completed"}
                          />
                        </label>

                        <div className="field-grid">
                          <label className="field">
                            <span>Start Time</span>
                            <input
                              type="time"
                              value={sessionDrafts[focusedSession.id]?.start_time || ""}
                              onChange={(event) =>
                                updateSessionDraft(focusedSession.id, "start_time", event.target.value)
                              }
                              disabled={selectedBatch.status === "completed"}
                            />
                          </label>
                          <label className="field">
                            <span>End Time</span>
                            <input
                              type="time"
                              value={sessionDrafts[focusedSession.id]?.end_time || ""}
                              onChange={(event) =>
                                updateSessionDraft(focusedSession.id, "end_time", event.target.value)
                              }
                              disabled={selectedBatch.status === "completed"}
                            />
                          </label>
                        </div>

                        <div className="field-grid">
                          <label className="field">
                            <span>Meeting URL</span>
                            <input
                              value={sessionDrafts[focusedSession.id]?.meeting_url || ""}
                              onChange={(event) =>
                                updateSessionDraft(focusedSession.id, "meeting_url", event.target.value)
                              }
                              disabled={selectedBatch.status === "completed"}
                            />
                          </label>
                          <label className="field">
                            <span>Recording URL</span>
                            <input
                              value={sessionDrafts[focusedSession.id]?.recording_url || ""}
                              onChange={(event) =>
                                updateSessionDraft(focusedSession.id, "recording_url", event.target.value)
                              }
                              disabled={selectedBatch.status === "completed"}
                            />
                          </label>
                        </div>

                        {selectedBatch.status === "active" && (
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => handleSessionSave(focusedSession.id)}
                            disabled={submitting === `session-${focusedSession.id}`}
                          >
                            {submitting === `session-${focusedSession.id}` ? "Saving..." : "Save Session Changes"}
                          </button>
                        )}

                        <div className="subsection-block">
                          <div className="subsection-header">
                            <h6>Session Resources</h6>
                          </div>

                          {focusedSession.resources.length > 0 ? (
                            <div className="record-list">
                              {focusedSession.resources.map((resource) => (
                                <article className="record-item" key={resource.id}>
                                  <div>
                                    <h4>{resource.title}</h4>
                                    <p>{formatEnumLabel(resource.resource_type)}</p>
                                  </div>
                                  {resource.public_url && (
                                    <a href={resolveAssetUrl(resource.public_url)} target="_blank" rel="noreferrer">
                                      Open resource
                                    </a>
                                  )}
                                </article>
                              ))}
                            </div>
                          ) : (
                            <p className="muted-copy">No resources uploaded yet.</p>
                          )}

                          {selectedBatch.status === "active" && (
                            <div className="stack-form">
                              <div className="field-grid">
                                <label className="field">
                                  <span>Resource Title</span>
                                  <input
                                    value={resourceDrafts[focusedSession.id]?.title || ""}
                                    onChange={(event) =>
                                      updateResourceDraft(focusedSession.id, "title", event.target.value)
                                    }
                                  />
                                </label>
                                <label className="field">
                                  <span>Type</span>
                                  <select
                                    value={resourceDrafts[focusedSession.id]?.resource_type || "attachment"}
                                    onChange={(event) =>
                                      updateResourceDraft(focusedSession.id, "resource_type", event.target.value)
                                    }
                                  >
                                    {sessionResourceTypeOptions.map((option) => (
                                      <option key={option} value={option}>
                                        {formatEnumLabel(option)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div className="field-grid">
                                <label className="field">
                                  <span>Upload Type</span>
                                  <select
                                    value={resourceDrafts[focusedSession.id]?.input_mode || "file"}
                                    onChange={(event) =>
                                      updateResourceDraft(focusedSession.id, "input_mode", event.target.value)
                                    }
                                  >
                                    <option value="file">File Upload</option>
                                    <option value="link">Link / URL</option>
                                  </select>
                                </label>
                                {resourceDrafts[focusedSession.id]?.input_mode === "link" ? (
                                  <label className="field">
                                    <span>Resource URL</span>
                                    <input
                                      value={resourceDrafts[focusedSession.id]?.url || ""}
                                      onChange={(event) =>
                                        updateResourceDraft(focusedSession.id, "url", event.target.value)
                                      }
                                      placeholder="https://..."
                                    />
                                  </label>
                                ) : (
                                  <label className="field">
                                    <span>File</span>
                                    <input
                                      type="file"
                                      onChange={(event) =>
                                        updateResourceDraft(
                                          focusedSession.id,
                                          "file",
                                          event.target.files?.[0] || null,
                                        )
                                      }
                                    />
                                  </label>
                                )}
                              </div>
                              <button
                                className="primary-button"
                                type="button"
                                onClick={() => handleResourceUpload(focusedSession.id)}
                                disabled={submitting === `resource-${focusedSession.id}`}
                              >
                                {submitting === `resource-${focusedSession.id}` ? "Uploading..." : "Add Resource"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          <div
            hidden={
              !["week-plan", "attendance", "grading"].includes(activeInstructorSection)
            }
          >
          <SectionCard
            title={selectedInstructorMenuItem.label}
            subtitle={`${selectedBatch.course.title} | Batch #${selectedBatch.id}`}
          >
            {activeInstructorSection === "sessions" && selectedBatch.status === "active" && (
              <div className="subsection-block">
                <div className="subsection-header">
                  <h5>Create Session</h5>
                </div>

                <form className="stack-form" onSubmit={handleSessionCreate}>
                  <div className="field-grid">
                    <label className="field">
                      <span>{selectedBatch.course.duration_unit === "days" ? "Day Number" : "Week Number"}</span>
                      <select name="week_number" value={sessionForm.week_number} onChange={handleSessionFormChange}>
                        {selectedBatch.week_plans.map((plan) => (
                          <option key={plan.id} value={plan.week_number}>
                            {getCoursePlanLabel(selectedBatch.course, plan.week_number)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>{selectedBatch.delivery_mode === "recorded" ? "Release Date" : "Session Date"}</span>
                      <input
                        name="session_date"
                        type="date"
                        value={sessionForm.session_date}
                        onChange={handleSessionFormChange}
                        required
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Title</span>
                    <input name="title" value={sessionForm.title} onChange={handleSessionFormChange} required />
                  </label>

                  <label className="field">
                    <span>Description</span>
                    <textarea
                      name="description"
                      rows="3"
                      value={sessionForm.description}
                      onChange={handleSessionFormChange}
                    />
                  </label>

                  <div className="field-grid">
                    <label className="field">
                      <span>Start Time</span>
                      <input
                        name="start_time"
                        type="time"
                        value={sessionForm.start_time}
                        onChange={handleSessionFormChange}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>End Time</span>
                      <input
                        name="end_time"
                        type="time"
                        value={sessionForm.end_time}
                        onChange={handleSessionFormChange}
                        required
                      />
                    </label>
                  </div>

                  <div className="field-grid">
                    <label className="field">
                      <span>{selectedBatch.delivery_mode === "recorded" ? "Recording URL" : "Session Link"}</span>
                      <input
                        name={selectedBatch.delivery_mode === "recorded" ? "recording_url" : "meeting_url"}
                        value={
                          selectedBatch.delivery_mode === "recorded"
                            ? sessionForm.recording_url
                            : sessionForm.meeting_url
                        }
                        onChange={handleSessionFormChange}
                      />
                    </label>
                    <label className="field">
                      <span>Secondary Link</span>
                      <input
                        name={selectedBatch.delivery_mode === "recorded" ? "meeting_url" : "recording_url"}
                        value={
                          selectedBatch.delivery_mode === "recorded"
                            ? sessionForm.meeting_url
                            : sessionForm.recording_url
                        }
                        onChange={handleSessionFormChange}
                      />
                    </label>
                  </div>

                  <button className="primary-button" type="submit" disabled={submitting === "create-session"}>
                    {submitting === "create-session" ? "Creating..." : "Create Session"}
                  </button>
                </form>
              </div>
            )}

            <div className="week-grid">
              {selectedBatch.week_plans.map((plan) => {
                const weekSessions = selectedBatch.sessions.filter(
                  (session) => session.week_number === plan.week_number,
                );
                const weekAssignments = selectedBatch.assignments.filter(
                  (assignment) => assignment.week_number === plan.week_number,
                );
                const visibleWeekSessions =
                  activeInstructorSection === "attendance"
                    ? weekSessions.filter((session) => session.session_mode === "live")
                    : weekSessions;

                return (
                  <article className="week-card" key={plan.id}>
                    <div className="week-header">
                      <div>
                        <p className="card-eyebrow">{getCoursePlanLabel(selectedBatch.course, plan.week_number)}</p>
                        <h4>{getWeekRangeLabel(selectedBatch, plan.week_number)}</h4>
                      </div>
                      <div className="pill-row">
                        <span className="detail-pill">{weekSessions.length} sessions</span>
                        <span className="detail-pill">{weekAssignments.length} assignments</span>
                      </div>
                    </div>

                    <div className="nested-card soft">
                      <h5>{plan.title}</h5>
                      <p className="muted-copy">{plan.summary || "No plan summary provided yet."}</p>
                    </div>

                    {["sessions", "attendance"].includes(activeInstructorSection) && (
                    <div className="subsection-block">
                      <div className="subsection-header">
                        <h5>{activeInstructorSection === "attendance" ? "Attendance" : "Sessions"}</h5>
                      </div>

                      {visibleWeekSessions.length === 0 ? (
                        <p className="muted-copy">
                          {activeInstructorSection === "attendance"
                            ? "No live sessions available for attendance in this plan."
                            : "No inherited sessions for this plan yet."}
                        </p>
                      ) : (
                        <div className="stack-list">
                          {visibleWeekSessions.map((session) => (
                            <div className="nested-card" key={session.id}>
                              <div className="row-spread">
                                <div>
                                  <h5>{session.title}</h5>
                                  <p className="record-meta">
                                    {formatEnumLabel(session.origin)}
                                    {session.is_customized ? " | Customized" : " | Inherited"}
                                  </p>
                                </div>
                                <div className="pill-row">
                                  <span className="detail-pill">{formatEnumLabel(session.session_mode)}</span>
                                  <span className="detail-pill">{formatEnumLabel(session.status)}</span>
                                </div>
                              </div>

                              {activeInstructorSection === "sessions" && (
                              <>
                              <div className="field-grid">
                                <label className="field">
                                  <span>Title</span>
                                  <input
                                    value={sessionDrafts[session.id]?.title || ""}
                                    onChange={(event) =>
                                      updateSessionDraft(session.id, "title", event.target.value)
                                    }
                                    disabled={selectedBatch.status === "completed"}
                                  />
                                </label>
                                <label className="field">
                                  <span>{session.session_mode === "recorded" ? "Release Date" : "Session Date"}</span>
                                  <input
                                    type="date"
                                    value={sessionDrafts[session.id]?.session_date || ""}
                                    onChange={(event) =>
                                      updateSessionDraft(session.id, "session_date", event.target.value)
                                    }
                                    disabled={selectedBatch.status === "completed"}
                                  />
                                </label>
                              </div>

                              <label className="field">
                                <span>Description</span>
                                <textarea
                                  rows="3"
                                  value={sessionDrafts[session.id]?.description || ""}
                                  onChange={(event) =>
                                    updateSessionDraft(session.id, "description", event.target.value)
                                  }
                                  disabled={selectedBatch.status === "completed"}
                                />
                              </label>

                              <div className="field-grid">
                                <label className="field">
                                  <span>Start Time</span>
                                  <input
                                    type="time"
                                    value={sessionDrafts[session.id]?.start_time || ""}
                                    onChange={(event) =>
                                      updateSessionDraft(session.id, "start_time", event.target.value)
                                    }
                                    disabled={selectedBatch.status === "completed"}
                                  />
                                </label>
                                <label className="field">
                                  <span>End Time</span>
                                  <input
                                    type="time"
                                    value={sessionDrafts[session.id]?.end_time || ""}
                                    onChange={(event) =>
                                      updateSessionDraft(session.id, "end_time", event.target.value)
                                    }
                                    disabled={selectedBatch.status === "completed"}
                                  />
                                </label>
                              </div>

                              <div className="field-grid">
                                <label className="field">
                                  <span>Meeting URL</span>
                                  <input
                                    value={sessionDrafts[session.id]?.meeting_url || ""}
                                    onChange={(event) =>
                                      updateSessionDraft(session.id, "meeting_url", event.target.value)
                                    }
                                    disabled={selectedBatch.status === "completed"}
                                  />
                                </label>
                                <label className="field">
                                  <span>Recording URL</span>
                                  <input
                                    value={sessionDrafts[session.id]?.recording_url || ""}
                                    onChange={(event) =>
                                      updateSessionDraft(session.id, "recording_url", event.target.value)
                                    }
                                    disabled={selectedBatch.status === "completed"}
                                  />
                                </label>
                              </div>

                              {selectedBatch.status === "active" && (
                                <button
                                  className="primary-button"
                                  type="button"
                                  onClick={() => handleSessionSave(session.id)}
                                  disabled={submitting === `session-${session.id}`}
                                >
                                  {submitting === `session-${session.id}` ? "Saving..." : "Save Session Changes"}
                                </button>
                              )}

                              <div className="subsection-block">
                                <div className="subsection-header">
                                  <h6>Session Resources</h6>
                                </div>

                                {session.resources.length > 0 ? (
                                  <div className="record-list">
                                    {session.resources.map((resource) => (
                                      <article className="record-item" key={resource.id}>
                                        <div>
                                          <h4>{resource.title}</h4>
                                          <p>{formatEnumLabel(resource.resource_type)}</p>
                                        </div>
                                        {resource.public_url && (
                                          <a href={resolveAssetUrl(resource.public_url)} target="_blank" rel="noreferrer">
                                            Open resource
                                          </a>
                                        )}
                                      </article>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="muted-copy">No resources uploaded yet.</p>
                                )}

                                {selectedBatch.status === "active" && (
                                  <div className="stack-form">
                                    <div className="field-grid">
                                      <label className="field">
                                        <span>Resource Title</span>
                                        <input
                                          value={resourceDrafts[session.id]?.title || ""}
                                          onChange={(event) =>
                                            updateResourceDraft(session.id, "title", event.target.value)
                                          }
                                        />
                                      </label>
                                      <label className="field">
                                        <span>Type</span>
                                        <select
                                          value={resourceDrafts[session.id]?.resource_type || "attachment"}
                                          onChange={(event) =>
                                            updateResourceDraft(session.id, "resource_type", event.target.value)
                                          }
                                        >
                                          {sessionResourceTypeOptions.map((option) => (
                                            <option key={option} value={option}>
                                              {formatEnumLabel(option)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    </div>
                                    <div className="field-grid">
                                      <label className="field">
                                        <span>Upload Type</span>
                                        <select
                                          value={resourceDrafts[session.id]?.input_mode || "file"}
                                          onChange={(event) =>
                                            updateResourceDraft(session.id, "input_mode", event.target.value)
                                          }
                                        >
                                          <option value="file">File Upload</option>
                                          <option value="link">Link / URL</option>
                                        </select>
                                      </label>
                                      {resourceDrafts[session.id]?.input_mode === "link" ? (
                                        <label className="field">
                                          <span>Resource URL</span>
                                          <input
                                            value={resourceDrafts[session.id]?.url || ""}
                                            onChange={(event) =>
                                              updateResourceDraft(session.id, "url", event.target.value)
                                            }
                                            placeholder="https://..."
                                          />
                                        </label>
                                      ) : (
                                        <label className="field">
                                          <span>File</span>
                                          <input
                                            type="file"
                                            onChange={(event) =>
                                              updateResourceDraft(
                                                session.id,
                                                "file",
                                                event.target.files?.[0] || null,
                                              )
                                            }
                                          />
                                        </label>
                                      )}
                                    </div>
                                    <button
                                      className="primary-button"
                                      type="button"
                                      onClick={() => handleResourceUpload(session.id)}
                                      disabled={submitting === `resource-${session.id}`}
                                    >
                                      {submitting === `resource-${session.id}` ? "Uploading..." : "Upload Resource"}
                                    </button>
                                  </div>
                                )}
                              </div>

                              </>
                              )}

                              {activeInstructorSection === "attendance" && session.session_mode === "live" && (
                                <div className="attendance-section">
                                  <div className="subsection-header">
                                    <h6>Attendance</h6>
                                  </div>

                                  {selectedBatch.enrollments.length === 0 ? (
                                    <p className="muted-copy">No enrolled students available for attendance.</p>
                                  ) : (
                                    <>
                                      <div className="table-wrap">
                                        <table className="data-table">
                                          <thead>
                                            <tr>
                                              <th>Student</th>
                                              <th>Status</th>
                                              <th>Note</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {selectedBatch.enrollments.map((enrollment) => (
                                              <tr key={`${session.id}-${enrollment.student_id}`}>
                                                <td>
                                                  <strong>{enrollment.student.name}</strong>
                                                  <div className="table-subtext">{enrollment.student.email}</div>
                                                </td>
                                                <td>
                                                  <select
                                                    value={
                                                      attendanceDrafts[session.id]?.[enrollment.student_id]?.status ||
                                                      "not_marked"
                                                    }
                                                    onChange={(event) =>
                                                      updateAttendanceDraft(
                                                        session.id,
                                                        enrollment.student_id,
                                                        "status",
                                                        event.target.value,
                                                      )
                                                    }
                                                    disabled={selectedBatch.status === "completed"}
                                                  >
                                                    {attendanceStatusOptions.map((statusOption) => (
                                                      <option key={statusOption} value={statusOption}>
                                                        {formatEnumLabel(statusOption)}
                                                      </option>
                                                    ))}
                                                  </select>
                                                </td>
                                                <td>
                                                  <input
                                                    value={
                                                      attendanceDrafts[session.id]?.[enrollment.student_id]?.note || ""
                                                    }
                                                    onChange={(event) =>
                                                      updateAttendanceDraft(
                                                        session.id,
                                                        enrollment.student_id,
                                                        "note",
                                                        event.target.value,
                                                      )
                                                    }
                                                    disabled={selectedBatch.status === "completed"}
                                                  />
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>

                                      {selectedBatch.status === "active" && (
                                        <button
                                          className="primary-button"
                                          type="button"
                                          onClick={() => handleAttendanceSave(session)}
                                          disabled={submitting === `attendance-${session.id}`}
                                        >
                                          {submitting === `attendance-${session.id}` ? "Saving..." : "Save Attendance"}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    )}

                    {activeInstructorSection === "grading" && (
                    <div className="subsection-block">
                      <div className="subsection-header">
                        <h5>Assignments</h5>
                      </div>

                      {weekAssignments.length === 0 ? (
                        <p className="muted-copy">No assignments created for this plan yet.</p>
                      ) : (
                        <div className="stack-list">
                          {weekAssignments.map((assignment) => (
                            <div className="nested-card" key={assignment.id}>
                              <div className="row-spread">
                                <div>
                                  <h5>{assignment.title}</h5>
                                  <p className="record-meta">
                                    {formatEnumLabel(assignment.assignment_type)}
                                    {assignment.max_points !== null ? ` | ${assignment.max_points} points` : ""}
                                  </p>
                                </div>
                                {assignment.due_at && (
                                  <span className="detail-pill">Due {formatDateTime(assignment.due_at)}</span>
                                )}
                              </div>

                              <p className="muted-copy">{assignment.description}</p>

                              {assignment.submissions.length === 0 ? (
                                <p className="muted-copy">No submissions yet.</p>
                              ) : (
                                <div className="stack-list">
                                  {assignment.submissions.map((submission) => (
                                    <div className="nested-card soft" key={submission.id}>
                                      <div className="row-spread">
                                        <div>
                                          <h6>{submission.student.name}</h6>
                                          <p className="record-meta">{submission.student.email}</p>
                                        </div>
                                        <div className="pill-row">
                                          <span className="detail-pill">{formatEnumLabel(submission.status)}</span>
                                          <span className="detail-pill">
                                            Submitted {formatDateTime(submission.submitted_at)}
                                          </span>
                                        </div>
                                      </div>

                                      {submission.submission_text && (
                                        <p className="muted-copy">{submission.submission_text}</p>
                                      )}
                                      {submission.attachment_url && (
                                        <a href={submission.attachment_url} target="_blank" rel="noreferrer">
                                          Open attachment
                                        </a>
                                      )}

                                      <div className="field-grid">
                                        <label className="field">
                                          <span>Score</span>
                                          <input
                                            type="number"
                                            min="0"
                                            value={submissionDrafts[submission.id]?.score ?? ""}
                                            onChange={(event) =>
                                              updateSubmissionDraft(
                                                submission.id,
                                                "score",
                                                event.target.value,
                                              )
                                            }
                                            disabled={selectedBatch.status === "completed"}
                                          />
                                        </label>
                                        <label className="field">
                                          <span>Status</span>
                                          <select
                                            value={submissionDrafts[submission.id]?.status || "graded"}
                                            onChange={(event) =>
                                              updateSubmissionDraft(
                                                submission.id,
                                                "status",
                                                event.target.value,
                                              )
                                            }
                                            disabled={selectedBatch.status === "completed"}
                                          >
                                            {gradingStatusOptions.map((statusOption) => (
                                              <option key={statusOption} value={statusOption}>
                                                {formatEnumLabel(statusOption)}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      </div>

                                      <label className="field">
                                        <span>Feedback</span>
                                        <textarea
                                          rows="3"
                                          value={submissionDrafts[submission.id]?.feedback || ""}
                                          onChange={(event) =>
                                            updateSubmissionDraft(
                                              submission.id,
                                              "feedback",
                                              event.target.value,
                                            )
                                          }
                                          disabled={selectedBatch.status === "completed"}
                                        />
                                      </label>

                                      {selectedBatch.status === "active" && (
                                        <button
                                          className="primary-button"
                                          type="button"
                                          onClick={() => handleGradeSubmit(submission.id)}
                                          disabled={submitting === `grade-${submission.id}`}
                                        >
                                          {submitting === `grade-${submission.id}` ? "Saving..." : "Save Grade"}
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    )}
                  </article>
                );
              })}
            </div>
          </SectionCard>
          </div>

          <div hidden={activeInstructorSection !== "completion"}>
          <SectionCard title="Completion" subtitle="Batch Offboarding and Certificate Release">
            {selectedBatch.status === "active" ? (
              <>
                <p className="helper-text">
                  Select eligible students, mark the batch completed, and release certificates immediately.
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
                  onClick={handleBatchComplete}
                  disabled={submitting === "batch-complete"}
                >
                  {submitting === "batch-complete" ? "Completing..." : "Mark Batch Completed"}
                </button>
              </>
            ) : (
              <div className="detail-stack">
                <p className="muted-copy">
                  Completed on {formatDateTime(selectedBatch.completed_at)}. Use manual release for students who still need certificates.
                </p>

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
                  onClick={handleCertificateRelease}
                  disabled={submitting === "certificate-release"}
                >
                  {submitting === "certificate-release" ? "Releasing..." : "Release Certificates"}
                </button>

                <div className="record-list">
                  {selectedBatch.certificate_issues.length === 0 ? (
                    <p className="muted-copy">No certificate issues recorded yet.</p>
                  ) : (
                    selectedBatch.certificate_issues.map((issue) => (
                      <article className="record-item" key={issue.id}>
                        <div>
                          <h4>{issue.student.name}</h4>
                          <p>{issue.student.email}</p>
                          <p>Status: {formatEnumLabel(issue.email_status)}</p>
                        </div>
                        <div className="record-actions">
                          <p className="record-meta">
                            Code: {issue.certificate_code}
                            {issue.email_error ? ` | Error: ${issue.email_error}` : ""}
                          </p>
                          {issue.generated_public_url && (
                            <a href={resolveAssetUrl(issue.generated_public_url)} target="_blank" rel="noreferrer">
                              Open Certificate
                            </a>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}
          </SectionCard>
          </div>
        </DashboardWorkspace>
      )}
    </main>
  );
}
