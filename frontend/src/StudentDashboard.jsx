import { useEffect, useMemo, useState } from "react";

import {
  apiRequest,
  formatCurrency,
  formatDate,
  formatEnumLabel,
  formatScheduleSlot,
  formatTime,
  formatWeeks,
  resolveAssetUrl,
} from "./utils";
import {
  DashboardSummary,
  DashboardWorkspace,
  EmptyState,
  SectionCard,
  StatusBanner,
} from "./shared";

const cityOptions = [
  "Agra",
  "Ajmer",
  "Aligarh",
  "Amravati",
  "Amritsar",
  "Asansol",
  "Aurangabad",
  "Bareilly",
  "Belagavi",
  "Bhavnagar",
  "Bhilai",
  "Bhopal",
  "Bhubaneswar",
  "Bikaner",
  "Bilaspur",
  "Chandigarh",
  "Coimbatore",
  "Cuttack",
  "Dehradun",
  "Dhanbad",
  "Durgapur",
  "Erode",
  "Faridabad",
  "Gandhinagar",
  "Gorakhpur",
  "Guntur",
  "Guwahati",
  "Gwalior",
  "Hubballi",
  "Indore",
  "Jabalpur",
  "Jalandhar",
  "Jamnagar",
  "Jamshedpur",
  "Jhansi",
  "Jodhpur",
  "Kanpur",
  "Karnal",
  "Kochi",
  "Kolhapur",
  "Kollam",
  "Kota",
  "Kozhikode",
  "Ludhiana",
  "Madurai",
  "Mangaluru",
  "Meerut",
  "Mysuru",
  "Nagpur",
  "Nashik",
  "Patiala",
  "Prayagraj",
  "Raipur",
  "Rajkot",
  "Ranchi",
  "Salem",
  "Siliguri",
  "Solapur",
  "Surat",
  "Thanjavur",
  "Thiruvananthapuram",
  "Tiruchirappalli",
  "Tirupati",
  "Udaipur",
  "Vadodara",
  "Varanasi",
  "Vijayawada",
  "Visakhapatnam",
];

const occupationOptions = [
  { value: "employee", label: "Employee" },
  { value: "self_employed", label: "Self Employed" },
  { value: "business", label: "Business" },
  { value: "homemaker", label: "Homemaker" },
  { value: "student", label: "Student" },
];

function createEmptyEducation() {
  return {
    qualification: "",
    institution: "",
    field_of_study: "",
    completion_year: "",
  };
}

function createEmptyExperience() {
  return {
    organisation: "",
    post: "",
    description: "",
  };
}

function splitName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || "",
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    last_name: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

function stripIndiaPrefix(value) {
  return String(value || "").replace(/^\+91\s?/, "");
}

function createProfileForm(user, profile) {
  if (profile) {
    return {
      first_name: profile.first_name || "",
      middle_name: profile.middle_name || "",
      last_name: profile.last_name || "",
      mobile_number: stripIndiaPrefix(profile.mobile_number),
      city: profile.city || "",
      occupation: profile.occupation || "student",
      educations:
        profile.educations?.length > 0
          ? profile.educations.map((item) => ({
              qualification: item.qualification || "",
              institution: item.institution || "",
              field_of_study: item.field_of_study || "",
              completion_year: item.completion_year || "",
            }))
          : [createEmptyEducation()],
      experiences:
        profile.experiences?.length > 0
          ? profile.experiences.map((item) => ({
              organisation: item.organisation || "",
              post: item.post || "",
              description: item.description || "",
            }))
          : [createEmptyExperience()],
    };
  }

  return {
    ...splitName(user?.name),
    mobile_number: "",
    city: "",
    occupation: "student",
    educations: [createEmptyEducation()],
    experiences: [createEmptyExperience()],
  };
}

function getProfileInitials(profile, user) {
  if (profile?.first_name || profile?.last_name) {
    return `${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`.toUpperCase() || "S";
  }

  const parts = String(user?.name || user?.email || "Student").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 1) || "S").toUpperCase();
}

function getProfileName(profile, user) {
  if (!profile) {
    return user?.name || "Student";
  }
  return [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ");
}

function applyDiscount(course) {
  const price = Number(course.price || 0);
  const discount = Number(course.discount_percentage || 0);
  if (!discount) {
    return price;
  }
  return Math.max(0, price - (price * discount) / 100);
}

function getAvailableSeats(batch) {
  if (batch.available_seats !== null && batch.available_seats !== undefined) {
    return batch.available_seats;
  }
  if (!batch.capacity) {
    return null;
  }
  return Math.max(0, batch.capacity - Number(batch.enrolled_count || 0));
}

function isBatchSelectable(batch) {
  return batch.status === "active" && !batch.is_full && getAvailableSeats(batch) !== 0;
}

function ProgressBar({ value }) {
  const normalizedValue = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="progress-bar" aria-label={`${normalizedValue}% complete`}>
      <span style={{ width: `${normalizedValue}%` }} />
    </div>
  );
}

function CourseMedia({ course }) {
  const imageUrl = resolveAssetUrl(course.banner_url || course.thumbnail_url);
  if (imageUrl) {
    return <img className="course-media" src={imageUrl} alt="" />;
  }

  return (
    <div className="course-media course-media-fallback">
      <span>{course.title?.slice(0, 2).toUpperCase() || "SM"}</span>
    </div>
  );
}

let razorpayCheckoutScriptPromise = null;

function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (!razorpayCheckoutScriptPromise) {
    razorpayCheckoutScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Unable to load Razorpay Checkout."));
      document.body.appendChild(script);
    });
  }

  return razorpayCheckoutScriptPromise;
}

function NoEnrollmentLanding({ onExplore }) {
  return (
    <section className="student-landing-grid">
      <div className="learning-quote-panel">
        <p className="eyebrow">Learning Momentum</p>
        <h2>One focused hour today can change the shape of tomorrow.</h2>
        <p className="muted-copy">
          Explore course options, review upcoming batches, and pick a direction that matches your current profile.
        </p>
        <button className="primary-button" type="button" onClick={onExplore}>
          Explore Courses
        </button>
      </div>
      <div className="learning-focus-panel">
        <span>01</span>
        <h3>Discover</h3>
        <p>Compare live and recorded learning paths across the academy catalogue.</p>
        <span>02</span>
        <h3>Enroll</h3>
        <p>Your enrolled batches appear here with schedule, resources, assignments, and progress.</p>
        <span>03</span>
        <h3>Complete</h3>
        <p>Track completion and certificate release once your batch is finished.</p>
      </div>
    </section>
  );
}

function ProfileForm({
  user,
  profile,
  profileForm,
  setProfileForm,
  onSubmit,
  submitting,
}) {
  function updateField(event) {
    const { name, value } = event.target;
    setProfileForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function updateRepeater(key, index, field, value) {
    setProfileForm((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function addRepeater(key, factory) {
    setProfileForm((current) => ({
      ...current,
      [key]: [...current[key], factory()],
    }));
  }

  function removeRepeater(key, index) {
    setProfileForm((current) => ({
      ...current,
      [key]: current[key].length === 1 ? current[key] : current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  return (
    <SectionCard
      title="Profile"
      subtitle="Please let us know more about you so that we can recommend you the personalised courses"
    >
      <form className="profile-form-layout" onSubmit={onSubmit}>
        <div className="profile-avatar-panel">
          <div className="profile-avatar" aria-label="Profile picture">
            {getProfileInitials(profile, user)}
          </div>
          <div>
            <h4>{getProfileName(profile, user)}</h4>
            <p>{user.email}</p>
          </div>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>First Name</span>
            <input
              name="first_name"
              value={profileForm.first_name}
              onChange={updateField}
              required
            />
          </label>

          <label className="field">
            <span>Middle Name</span>
            <input
              name="middle_name"
              value={profileForm.middle_name}
              onChange={updateField}
            />
          </label>

          <label className="field">
            <span>Last Name</span>
            <input
              name="last_name"
              value={profileForm.last_name}
              onChange={updateField}
              required
            />
          </label>

          <label className="field">
            <span>Mobile Number</span>
            <div className="mobile-input">
              <strong>+91</strong>
              <input
                name="mobile_number"
                value={profileForm.mobile_number}
                onChange={updateField}
                inputMode="tel"
                placeholder="9876543210"
                required
              />
            </div>
          </label>

          <label className="field">
            <span>Email ID</span>
            <input value={user.email} readOnly />
          </label>

          <label className="field">
            <span>City</span>
            <input
              name="city"
              list="student-city-options"
              value={profileForm.city}
              onChange={updateField}
              placeholder="Type and select city"
              required
            />
            <datalist id="student-city-options">
              {cityOptions.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>Occupation</span>
            <select name="occupation" value={profileForm.occupation} onChange={updateField} required>
              {occupationOptions.map((occupation) => (
                <option key={occupation.value} value={occupation.value}>
                  {occupation.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="subsection-block">
          <div className="subsection-header">
            <h5>Education</h5>
            <button
              className="mini-button"
              type="button"
              onClick={() => addRepeater("educations", createEmptyEducation)}
            >
              Add Education
            </button>
          </div>

          <div className="stack-list">
            {profileForm.educations.map((education, index) => (
              <div className="nested-card" key={`education-${index}`}>
                <div className="field-grid">
                  <label className="field">
                    <span>Qualification</span>
                    <input
                      value={education.qualification}
                      onChange={(event) =>
                        updateRepeater("educations", index, "qualification", event.target.value)
                      }
                      placeholder="B.Com, B.Tech, Diploma"
                    />
                  </label>
                  <label className="field">
                    <span>Institution</span>
                    <input
                      value={education.institution}
                      onChange={(event) =>
                        updateRepeater("educations", index, "institution", event.target.value)
                      }
                      placeholder="College or school"
                    />
                  </label>
                  <label className="field">
                    <span>Field of Study</span>
                    <input
                      value={education.field_of_study}
                      onChange={(event) =>
                        updateRepeater("educations", index, "field_of_study", event.target.value)
                      }
                      placeholder="Computer science, commerce"
                    />
                  </label>
                  <label className="field">
                    <span>Completion Year</span>
                    <input
                      value={education.completion_year}
                      onChange={(event) =>
                        updateRepeater("educations", index, "completion_year", event.target.value)
                      }
                      placeholder="2026"
                    />
                  </label>
                </div>
                <button
                  className="mini-button danger"
                  type="button"
                  onClick={() => removeRepeater("educations", index)}
                  disabled={profileForm.educations.length === 1}
                >
                  Remove Education
                </button>
              </div>
            ))}
          </div>
        </div>

        {profileForm.occupation === "employee" && (
          <div className="subsection-block">
            <div className="subsection-header">
              <h5>Experience</h5>
              <button
                className="mini-button"
                type="button"
                onClick={() => addRepeater("experiences", createEmptyExperience)}
              >
                Add Experience
              </button>
            </div>

            <div className="stack-list">
              {profileForm.experiences.map((experience, index) => (
                <div className="nested-card" key={`experience-${index}`}>
                  <div className="field-grid">
                    <label className="field">
                      <span>Organisation</span>
                      <input
                        value={experience.organisation}
                        onChange={(event) =>
                          updateRepeater("experiences", index, "organisation", event.target.value)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Post</span>
                      <input
                        value={experience.post}
                        onChange={(event) =>
                          updateRepeater("experiences", index, "post", event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label className="field">
                    <span>Description</span>
                    <textarea
                      rows="3"
                      value={experience.description}
                      onChange={(event) =>
                        updateRepeater("experiences", index, "description", event.target.value)
                      }
                    />
                  </label>
                  <button
                    className="mini-button danger"
                    type="button"
                    onClick={() => removeRepeater("experiences", index)}
                    disabled={profileForm.experiences.length === 1}
                  >
                    Remove Experience
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="primary-button" type="submit" disabled={submitting === "profile"}>
          {submitting === "profile" ? "Saving Profile..." : "Save Profile"}
        </button>
      </form>
    </SectionCard>
  );
}

function ExploreCourses({ courses, searchValue, onSearchChange, onSelectCourse }) {
  const filteredCourses = courses.filter((course) => {
    const haystack = `${course.title} ${course.category} ${course.description}`.toLowerCase();
    return haystack.includes(searchValue.trim().toLowerCase());
  });

  return (
    <SectionCard title="Explore Courses" subtitle="Course Catalogue">
      <div className="student-toolbar">
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by course, category, or skill"
        />
      </div>

      {filteredCourses.length === 0 ? (
        <EmptyState title="No courses found" body="Try another course name, category, or skill." />
      ) : (
        <div className="student-course-grid">
          {filteredCourses.map((course) => {
            const finalPrice = applyDiscount(course);
            return (
              <article className="student-course-card" key={course.id}>
                <CourseMedia course={course} />
                <div className="student-course-body">
                  <div className="course-topline">
                    <span className="course-type">{course.course_type.replace("_", " ")}</span>
                    {course.is_enrolled && <span className="role-pill">Enrolled</span>}
                  </div>
                  <h4>{course.title}</h4>
                  <p className="course-description">{course.description}</p>

                  <div className="meta-row">
                    <span className="detail-pill">{course.category}</span>
                    <span className="detail-pill">{formatWeeks(course)}</span>
                  </div>

                  <div className="student-price-row">
                    <strong>{formatCurrency(finalPrice)}</strong>
                    {Number(course.discount_percentage || 0) > 0 && (
                      <>
                        <span className="student-original-price">{formatCurrency(course.price)}</span>
                        <span>{Number(course.discount_percentage)}% off</span>
                      </>
                    )}
                  </div>

                  {course.tags.length > 0 && (
                    <div className="pill-row">
                      {course.tags.slice(0, 3).map((tag) => (
                        <span className="detail-pill" key={tag.id}>
                          {tag.value}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    className="primary-button full-width"
                    type="button"
                    onClick={() => onSelectCourse(course.id)}
                  >
                    View Course
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function CourseDetail({
  course,
  selectedBatchId,
  checkoutStep,
  submitting,
  onBack,
  onStartEnroll,
  onSelectBatch,
  onContinueToPayment,
  onPay,
}) {
  const finalPrice = applyDiscount(course);
  const activeBatches = course.batches.filter((batch) => batch.status === "active");
  const selectedBatch = course.batches.find((batch) => String(batch.id) === String(selectedBatchId));

  return (
    <div className="detail-stack">
      <button className="ghost-button student-back-button" type="button" onClick={onBack}>
        Back to Catalogue
      </button>

      <section className="course-detail-hero">
        <CourseMedia course={course} />
        <div className="course-detail-copy">
          <div className="course-topline">
            <span className="course-type">{course.course_type.replace("_", " ")}</span>
            {course.is_enrolled && <span className="role-pill">Enrolled</span>}
          </div>
          <h2>{course.title}</h2>
          <p>{course.description}</p>
          <div className="meta-row">
            <span className="detail-pill">{course.category}</span>
            <span className="detail-pill">{formatWeeks(course)}</span>
            <span className="detail-pill">{activeBatches.length} active batches</span>
          </div>
          <div className="student-price-row">
            <strong>{formatCurrency(finalPrice)}</strong>
            {Number(course.discount_percentage || 0) > 0 && (
              <>
                <span className="student-original-price">{formatCurrency(course.price)}</span>
                <span>{Number(course.discount_percentage)}% off</span>
              </>
            )}
          </div>
          {course.syllabus_pdf_path && (
            <a href={resolveAssetUrl(course.syllabus_pdf_path)} target="_blank" rel="noreferrer">
              Open Syllabus
            </a>
          )}
          {checkoutStep === "details" && !course.is_enrolled && (
            <button
              className="primary-button"
              type="button"
              onClick={onStartEnroll}
              disabled={activeBatches.length === 0}
            >
              Purchase Course
            </button>
          )}
        </div>
      </section>

      <section className="dashboard-grid">
        <SectionCard title="Syllabus" subtitle="What You Will Learn">
          {course.syllabus_items.length === 0 ? (
            <p className="muted-copy">Syllabus details are not available yet.</p>
          ) : (
            <div className="stack-list">
              {course.syllabus_items.map((item, index) => (
                <div className="record-item compact" key={item.id}>
                  <strong>{String(index + 1).padStart(2, "0")}</strong>
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Tags" subtitle="Course Focus">
          {course.tags.length === 0 ? (
            <p className="muted-copy">Tags are not available yet.</p>
          ) : (
            <div className="pill-row">
              {course.tags.map((tag) => (
                <span className="detail-pill" key={tag.id}>
                  {tag.value}
                </span>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      {course.is_enrolled ? (
        <SectionCard title="Access" subtitle="Course Already Unlocked">
          <p className="muted-copy">This course is available in My Courses with your batch progress and resources.</p>
        </SectionCard>
      ) : (
        checkoutStep !== "details" && (
          <SectionCard
            title="Enrollment"
            subtitle={checkoutStep === "batch" ? "Select Available Batch" : "Pay Fees"}
          >
            {checkoutStep === "batch" && (
              <div className="detail-stack">
                {activeBatches.length === 0 ? (
                  <EmptyState
                    title="No active batches"
                    body="A new batch must be opened before students can enroll in this course."
                  />
                ) : (
                  <div className="student-batch-grid">
                    {activeBatches.map((batch) => {
                      const availableSeats = getAvailableSeats(batch);
                      return (
                        <button
                          className={`student-batch-option ${
                            String(selectedBatchId) === String(batch.id) ? "selected" : ""
                          }`}
                          key={batch.id}
                          type="button"
                          onClick={() => onSelectBatch(batch.id)}
                          disabled={!isBatchSelectable(batch)}
                        >
                          <span className="card-eyebrow">Batch #{batch.id}</span>
                          <strong>
                            {formatDate(batch.start_date)} to {formatDate(batch.end_date)}
                          </strong>
                          <small>
                            {formatEnumLabel(batch.delivery_mode)} | {formatEnumLabel(batch.status)}
                          </small>
                          <small>
                            Seats: {batch.enrolled_count}
                            {batch.capacity ? ` / ${batch.capacity}` : ""}
                            {availableSeats !== null ? ` | ${availableSeats} left` : ""}
                          </small>
                          {batch.assigned_instructor_name && <small>{batch.assigned_instructor_name}</small>}
                          {batch.schedule_slots[0] && <small>{formatScheduleSlot(batch.schedule_slots[0])}</small>}
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  className="primary-button"
                  type="button"
                  onClick={onContinueToPayment}
                  disabled={!selectedBatchId}
                >
                  Continue to Payment
                </button>
              </div>
            )}

            {checkoutStep === "payment" && selectedBatch && (
              <div className="payment-layout">
                <div className="payment-summary">
                  <p className="card-eyebrow">Order Summary</p>
                  <h4>{course.title}</h4>
                  <p className="muted-copy">
                    Batch #{selectedBatch.id} | {formatDate(selectedBatch.start_date)} to{" "}
                    {formatDate(selectedBatch.end_date)}
                  </p>
                  <div className="student-price-row">
                    <strong>{formatCurrency(finalPrice)}</strong>
                    <span>Payable now</span>
                  </div>
                </div>

                <form className="stack-form" onSubmit={onPay}>
                  <button className="primary-button" type="submit" disabled={submitting === "payment"}>
                    {submitting === "payment" ? "Opening Checkout..." : "Purchase Course"}
                  </button>
                  <button className="ghost-button" type="button" onClick={onStartEnroll}>
                    Change Batch
                  </button>
                </form>
              </div>
            )}
          </SectionCard>
        )
      )}
    </div>
  );
}

function CourseProgressCard({ enrollment }) {
  return (
    <article className="student-progress-card">
      <CourseMedia course={enrollment.course} />
      <div className="student-course-body">
        <div className="row-spread">
          <div>
            <p className="card-eyebrow">{formatEnumLabel(enrollment.delivery_mode)}</p>
            <h4>{enrollment.course.title}</h4>
          </div>
          <span className="detail-pill">{enrollment.progress_percent}%</span>
        </div>

        <ProgressBar value={enrollment.progress_percent} />

        <div className="student-progress-stats">
          <span>
            <strong>{enrollment.completed_sessions}</strong>
            Sessions Done
          </span>
          <span>
            <strong>{enrollment.assignments_submitted}</strong>
            Submitted
          </span>
          <span>
            <strong>{enrollment.resources_total}</strong>
            Resources
          </span>
        </div>

        <p className="record-meta">
          {formatDate(enrollment.start_date)} to {formatDate(enrollment.end_date)}
          {enrollment.assigned_instructor_name ? ` | ${enrollment.assigned_instructor_name}` : ""}
        </p>

        {enrollment.next_session ? (
          <div className="nested-card soft">
            <p className="card-eyebrow">Next Session</p>
            <h5>{enrollment.next_session.title}</h5>
            <p className="record-meta">
              {formatDate(enrollment.next_session.session_date)} | {formatTime(enrollment.next_session.start_time)} -{" "}
              {formatTime(enrollment.next_session.end_time)}
            </p>
            <div className="link-row">
              {enrollment.next_session.meeting_url && (
                <a href={enrollment.next_session.meeting_url} target="_blank" rel="noreferrer">
                  Join Live
                </a>
              )}
              {enrollment.next_session.recording_url && (
                <a href={enrollment.next_session.recording_url} target="_blank" rel="noreferrer">
                  Open Recording
                </a>
              )}
            </div>
          </div>
        ) : (
          <p className="muted-copy">No upcoming session scheduled.</p>
        )}

        {enrollment.recent_resources.some((resource) => resource.public_url) && (
          <div className="link-row">
            {enrollment.recent_resources
              .filter((resource) => resource.public_url)
              .map((resource) => (
                <a key={resource.id} href={resolveAssetUrl(resource.public_url)} target="_blank" rel="noreferrer">
                  {resource.title}
                </a>
              ))}
          </div>
        )}

        {enrollment.certificate?.generated_public_url && (
          <a href={resolveAssetUrl(enrollment.certificate.generated_public_url)} target="_blank" rel="noreferrer">
            Open Certificate
          </a>
        )}
        {enrollment.payment?.receipt_public_url && (
          <a href={resolveAssetUrl(enrollment.payment.receipt_public_url)} target="_blank" rel="noreferrer">
            Open Receipt
          </a>
        )}
      </div>
    </article>
  );
}

function MyCourses({ enrollments, onExplore }) {
  if (enrollments.length === 0) {
    return <NoEnrollmentLanding onExplore={onExplore} />;
  }

  const averageProgress = Math.round(
    enrollments.reduce((total, enrollment) => total + enrollment.progress_percent, 0) / enrollments.length,
  );
  const submittedAssignments = enrollments.reduce(
    (total, enrollment) => total + enrollment.assignments_submitted,
    0,
  );
  const totalAssignments = enrollments.reduce(
    (total, enrollment) => total + enrollment.assignments_total,
    0,
  );

  return (
    <div className="detail-stack">
      <DashboardSummary
        items={[
          { label: "Enrolled Courses", value: enrollments.length, helper: "Active learning paths" },
          { label: "Average Progress", value: `${averageProgress}%`, helper: "Across enrolled batches" },
          { label: "Assignments", value: `${submittedAssignments}/${totalAssignments}`, helper: "Submitted work" },
          {
            label: "Certificates",
            value: enrollments.filter((enrollment) => enrollment.certificate?.generated_public_url).length,
            helper: "Released certificates",
          },
        ]}
      />

      <SectionCard title="My Courses" subtitle="Progress Overview">
        <div className="student-progress-grid">
          {enrollments.map((enrollment) => (
            <CourseProgressCard enrollment={enrollment} key={enrollment.enrollment_id} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export default function StudentDashboard({ token, user, onLogout }) {
  const [dashboardState, setDashboardState] = useState({
    loading: true,
    error: "",
    profile: null,
    profile_complete: false,
    enrolled_courses: [],
    explore_courses: [],
  });
  const [profileForm, setProfileForm] = useState(createProfileForm(user, null));
  const [activeSection, setActiveSection] = useState("profile");
  const [notice, setNotice] = useState({ type: "", message: "" });
  const [submitting, setSubmitting] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [checkoutStep, setCheckoutStep] = useState("catalogue");
  const [lastReceipt, setLastReceipt] = useState(null);

  async function loadDashboard() {
    try {
      setDashboardState((current) => ({ ...current, loading: true, error: "" }));
      const response = await apiRequest("/api/v1/student/dashboard", { token });
      setDashboardState({
        loading: false,
        error: "",
        profile: response.profile,
        profile_complete: response.profile_complete,
        enrolled_courses: response.enrolled_courses || [],
        explore_courses: response.explore_courses || [],
      });
      setProfileForm(createProfileForm(user, response.profile));
      if (!response.profile_complete) {
        setActiveSection("profile");
      } else if (activeSection === "profile" && response.enrolled_courses?.length > 0) {
        setActiveSection("my-courses");
      } else if (activeSection === "profile") {
        setActiveSection("my-courses");
      }
    } catch (error) {
      if (error.status === 401) {
        onLogout();
        return;
      }

      setDashboardState({
        loading: false,
        error: error.message || "Unable to load the student dashboard.",
        profile: null,
        profile_complete: false,
        enrolled_courses: [],
        explore_courses: [],
      });
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [token]);

  const workspaceUser = useMemo(
    () => ({
      ...user,
      name: getProfileName(dashboardState.profile, user),
    }),
    [dashboardState.profile, user],
  );
  const selectedCourse = useMemo(
    () =>
      dashboardState.explore_courses.find((course) => String(course.id) === String(selectedCourseId)) ||
      null,
    [dashboardState.explore_courses, selectedCourseId],
  );

  const studentMenuItems = [
    {
      id: "profile",
      label: "Profile",
      shortLabel: "PR",
      description: "Personal details and background",
    },
    {
      id: "explore",
      label: "Explore Courses",
      shortLabel: "EX",
      description: "Catalogue and upcoming batches",
    },
    {
      id: "my-courses",
      label: "My Courses",
      shortLabel: "MC",
      description: "Progress, resources, and certificates",
    },
  ];

  const activeMenuItem = studentMenuItems.find((item) => item.id === activeSection) || studentMenuItems[0];

  function handleSectionChange(nextSection) {
    if (!dashboardState.profile_complete && nextSection !== "profile") {
      setNotice({
        type: "error",
        message: "Complete your profile first so course recommendations can be personalised.",
      });
      setActiveSection("profile");
      return;
    }

    setNotice({ type: "", message: "" });
    setLastReceipt(null);
    if (nextSection !== "explore") {
      setSelectedCourseId("");
      setSelectedBatchId("");
      setCheckoutStep("catalogue");
    }
    setActiveSection(nextSection);
  }

  function handleSelectCourse(courseId) {
    setSelectedCourseId(String(courseId));
    setSelectedBatchId("");
    setCheckoutStep("details");
    setNotice({ type: "", message: "" });
    setLastReceipt(null);
  }

  function handleBackToCatalogue() {
    setSelectedCourseId("");
    setSelectedBatchId("");
    setCheckoutStep("catalogue");
    setNotice({ type: "", message: "" });
    setLastReceipt(null);
  }

  function handleStartEnrollment() {
    setCheckoutStep("batch");
    setNotice({ type: "", message: "" });
  }

  function handleContinueToPayment() {
    if (!selectedBatchId) {
      setNotice({ type: "error", message: "Select an available batch before payment." });
      return;
    }
    setCheckoutStep("payment");
    setNotice({ type: "", message: "" });
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    const educations = profileForm.educations
      .filter((item) => item.qualification.trim())
      .map((item) => ({
        qualification: item.qualification,
        institution: item.institution || null,
        field_of_study: item.field_of_study || null,
        completion_year: item.completion_year || null,
      }));
    const experiences =
      profileForm.occupation === "employee"
        ? profileForm.experiences
            .filter((item) => item.organisation.trim() && item.post.trim())
            .map((item) => ({
              organisation: item.organisation,
              post: item.post,
              description: item.description || null,
            }))
        : [];

    if (educations.length === 0) {
      setNotice({ type: "error", message: "Add at least one education entry." });
      return;
    }

    if (profileForm.occupation === "employee" && experiences.length === 0) {
      setNotice({ type: "error", message: "Add at least one organisation and post for your experience." });
      return;
    }

    setSubmitting("profile");
    try {
      setNotice({ type: "", message: "" });
      await apiRequest("/api/v1/student/profile", {
        method: "PUT",
        token,
        body: {
          first_name: profileForm.first_name,
          middle_name: profileForm.middle_name || null,
          last_name: profileForm.last_name,
          mobile_number: profileForm.mobile_number.trim().startsWith("+91")
            ? profileForm.mobile_number.trim()
            : `+91 ${profileForm.mobile_number.trim()}`,
          city: profileForm.city,
          occupation: profileForm.occupation,
          educations,
          experiences,
        },
      });
      await loadDashboard();
      setActiveSection("my-courses");
      setNotice({ type: "success", message: "Profile saved successfully." });
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Unable to save profile." });
    } finally {
      setSubmitting("");
    }
  }

  async function handlePayAndEnroll(event) {
    event.preventDefault();
    if (!selectedCourse || !selectedBatchId) {
      setNotice({ type: "error", message: "Select a course and batch before payment." });
      return;
    }

    setSubmitting("payment");
    try {
      setNotice({ type: "", message: "" });
      const checkoutOrder = await apiRequest(`/api/v1/student/batches/${selectedBatchId}/payment-order`, {
        method: "POST",
        token,
      });
      await loadRazorpayCheckout();

      const paymentResult = await new Promise((resolve, reject) => {
        const checkout = new window.Razorpay({
          key: checkoutOrder.key_id,
          amount: checkoutOrder.amount_in_paise,
          currency: checkoutOrder.currency,
          name: "Silicon Mango Academy",
          description: checkoutOrder.course_title,
          order_id: checkoutOrder.order_id,
          prefill: {
            name: checkoutOrder.student_name,
            email: checkoutOrder.student_email,
            contact: checkoutOrder.student_contact || "",
          },
          notes: {
            receipt_id: checkoutOrder.receipt_id,
            batch_id: String(checkoutOrder.batch_id),
          },
          theme: {
            color: "#8f6a2f",
          },
          handler: async (response) => {
            try {
              const verifiedPayment = await apiRequest("/api/v1/student/payments/verify", {
                method: "POST",
                token,
                body: {
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                },
              });
              resolve(verifiedPayment);
            } catch (error) {
              reject(error);
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment popup closed before completion.")),
          },
        });

        checkout.on("payment.failed", (response) => {
          reject(new Error(response.error?.description || "Payment failed."));
        });
        checkout.open();
      });

      await loadDashboard();
      setSelectedCourseId("");
      setSelectedBatchId("");
      setCheckoutStep("catalogue");
      setActiveSection("my-courses");
      setLastReceipt(paymentResult.payment || null);
      setNotice({
        type: "success",
        message: "Payment successful. Receipt generated and course access is available in My Courses.",
      });
    } catch (error) {
      setNotice({ type: "error", message: error.message || "Unable to complete enrollment." });
    } finally {
      setSubmitting("");
    }
  }

  if (dashboardState.loading) {
    return (
      <main className="dashboard-shell">
        <SectionCard title="Loading" subtitle="Preparing student workspace">
          <p className="muted-copy">Fetching your profile, course catalogue, and enrolled batches.</p>
        </SectionCard>
      </main>
    );
  }

  if (dashboardState.error) {
    return (
      <main className="dashboard-shell">
        <SectionCard title="Error" subtitle="Student dashboard unavailable">
          <p className="feedback error">{dashboardState.error}</p>
        </SectionCard>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <DashboardWorkspace
        title="Student Dashboard"
        items={studentMenuItems}
        activeItem={activeSection}
        onChange={handleSectionChange}
        user={workspaceUser}
        role="student"
        onLogout={onLogout}
      >
        <div className="workspace-page-title">
          <div>
            <p className="card-eyebrow">Student Dashboard</p>
            <h1>{activeMenuItem.label}</h1>
            <p>{activeMenuItem.description}</p>
          </div>
          <div className="profile-mini">
            <span>{getProfileInitials(dashboardState.profile, workspaceUser)}</span>
            <strong>{workspaceUser.name}</strong>
          </div>
        </div>

        <StatusBanner notice={notice} />
        {lastReceipt && (
          <div className="record-item compact">
            <div>
              <h4>Receipt Generated</h4>
              <p>Receipt #{lastReceipt.reference_id}</p>
            </div>
            {lastReceipt.receipt_public_url && (
              <a href={resolveAssetUrl(lastReceipt.receipt_public_url)} target="_blank" rel="noreferrer">
                Open Receipt
              </a>
            )}
          </div>
        )}

        {activeSection === "profile" && (
          <ProfileForm
            user={user}
            profile={dashboardState.profile}
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            onSubmit={handleProfileSubmit}
            submitting={submitting}
          />
        )}

        {activeSection === "explore" && (
          selectedCourse ? (
            <CourseDetail
              course={selectedCourse}
              selectedBatchId={selectedBatchId}
              checkoutStep={checkoutStep}
              submitting={submitting}
              onBack={handleBackToCatalogue}
              onStartEnroll={handleStartEnrollment}
              onSelectBatch={(batchId) => setSelectedBatchId(String(batchId))}
              onContinueToPayment={handleContinueToPayment}
              onPay={handlePayAndEnroll}
            />
          ) : (
            <ExploreCourses
              courses={dashboardState.explore_courses}
              searchValue={courseSearch}
              onSearchChange={setCourseSearch}
              onSelectCourse={handleSelectCourse}
            />
          )
        )}

        {activeSection === "my-courses" && (
          <MyCourses
            enrollments={dashboardState.enrolled_courses}
            onExplore={() => handleSectionChange("explore")}
          />
        )}
      </DashboardWorkspace>
    </main>
  );
}
