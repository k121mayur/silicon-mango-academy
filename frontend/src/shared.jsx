import { useState } from "react";

import { formatEnumLabel } from "./utils";

export function scrollToLogin() {
  document.getElementById("login-panel")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function LandingPage({
  loginForm,
  onChange,
  onSubmit,
  loginState,
  signupForm,
  onSignupChange,
  onSignupSubmit,
  signupState,
}) {
  const [authMode, setAuthMode] = useState("signup");

  return (
    <main className="page-shell">
      <header className="hero-header">
        <div>
          <p className="brand-mark">Silicon Mango Academy</p>
          <h1 className="brand-title">Learn practical skills with structured guidance and measurable progress.</h1>
        </div>

        <button className="ghost-button" type="button" onClick={scrollToLogin}>
          Sign In
        </button>
      </header>

      <section className="hero-layout">
        <div className="hero-copy">
          <p className="eyebrow">Explore. Practice. Grow.</p>
          <h2 className="hero-heading">Build momentum with courses, live batches, recordings, assignments, and certificates.</h2>
          <p className="hero-text">
            Sign up with your email and password, complete your learner profile, and enter a dashboard
            shaped around courses, progress, resources, and upcoming sessions.
          </p>

          <div className="hero-points">
            <div className="feature-chip">Personalised recommendations</div>
            <div className="feature-chip">Live and recorded learning</div>
            <div className="feature-chip">Progress and certificates</div>
          </div>

          <div className="hero-cta">
            <button className="primary-button" type="button" onClick={scrollToLogin}>
              Start Learning
            </button>
            <span className="secondary-note">Existing admin and instructor accounts can sign in here too.</span>
          </div>
        </div>

        <section className="login-panel" id="login-panel">
          <div className="panel-badge">{authMode === "signup" ? "Student Signup" : "Login"}</div>
          <h3>{authMode === "signup" ? "Create your student account" : "Sign in to Silicon Mango Academy"}</h3>
          <p className="panel-copy">
            {authMode === "signup"
              ? "Use your email and password. Your profile form opens after your first login."
              : "Admin, instructor, and student accounts authenticate with email and password."}
          </p>

          <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
            <button
              className={`auth-mode-button ${authMode === "signup" ? "active" : ""}`}
              type="button"
              onClick={() => setAuthMode("signup")}
            >
              Sign Up
            </button>
            <button
              className={`auth-mode-button ${authMode === "login" ? "active" : ""}`}
              type="button"
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
          </div>

          {authMode === "signup" ? (
            <form className="stack-form" onSubmit={onSignupSubmit}>
              <label className="field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={signupForm.email}
                  onChange={onSignupChange}
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength="6"
                  value={signupForm.password}
                  onChange={onSignupChange}
                  placeholder="Create a password"
                  required
                />
              </label>

              {signupState.error && <p className="feedback error">{signupState.error}</p>}

              <button className="primary-button full-width" type="submit" disabled={signupState.submitting}>
                {signupState.submitting ? "Creating account..." : "Sign Up"}
              </button>
            </form>
          ) : (
            <form className="stack-form" onSubmit={onSubmit}>
              <label className="field">
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={loginForm.email}
                  onChange={onChange}
                  placeholder="admin@siliconmango.academy"
                  required
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={onChange}
                  placeholder="Enter your password"
                  required
                />
              </label>

              {loginState.error && <p className="feedback error">{loginState.error}</p>}

              <button className="primary-button full-width" type="submit" disabled={loginState.submitting}>
                {loginState.submitting ? "Signing in..." : "Login"}
              </button>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}

export function SectionCard({ title, subtitle, children, action }) {
  return (
    <section className="dashboard-card">
      <div className="card-header">
        <div>
          <p className="card-eyebrow">{title}</p>
          <h3>{subtitle}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DashboardWorkspace({
  title = "Workspace",
  items,
  activeItem,
  onChange,
  user,
  role,
  onLogout,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const activeLabel = items.find((item) => item.id === activeItem)?.label || "Dashboard";
  const userInitial = user?.name?.charAt(0)?.toUpperCase() || role?.charAt(0)?.toUpperCase() || "U";

  return (
    <section className={`workspace-layout ${collapsed ? "collapsed" : ""}`}>
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-header">
          {!collapsed && (
            <div>
              <p className="brand-mark">Silicon Mango</p>
              <h2>Academy</h2>
            </div>
          )}
          <button
            className="menu-toggle"
            type="button"
            aria-label={collapsed ? "Expand side menu" : "Collapse side menu"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((current) => !current)}
          >
            {collapsed ? ">" : "<"}
          </button>
        </div>

        <div className="workspace-profile">
          <span>{userInitial}</span>
          {!collapsed && (
            <div>
              <strong>{user?.name || role || "User"}</strong>
              <small>{title}</small>
            </div>
          )}
        </div>

        <nav className="workspace-nav" aria-label={`${title} sections`}>
          {items.map((item) => (
            <button
              className={`workspace-nav-item ${item.id === activeItem ? "active" : ""}`}
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => onChange(item.id)}
            >
              <span className="workspace-nav-icon" aria-hidden="true">
                {item.shortLabel}
              </span>
              {!collapsed && (
                <span className="workspace-nav-copy">
                  <strong>{item.label}</strong>
                  {item.description && <small>{item.description}</small>}
                </span>
              )}
            </button>
          ))}
        </nav>

      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <span>Home</span>
          <strong>{activeLabel}</strong>
          <button className="ghost-button" type="button" onClick={onLogout}>
            Logout
          </button>
        </header>

        <div className="workspace-content">{children}</div>
      </div>
    </section>
  );
}

export function TextRepeater({ label, values, onChange, onAdd, onRemove, placeholder }) {
  return (
    <div className="repeater-block">
      <div className="repeater-header">
        <span>{label}</span>
        <button className="mini-button" type="button" onClick={onAdd}>
          Add
        </button>
      </div>

      {values.map((value, index) => (
        <div className="inline-row" key={`${label}-${index}`}>
          <input
            value={value}
            onChange={(event) => onChange(index, event.target.value)}
            placeholder={placeholder}
          />
          <button
            className="mini-button danger"
            type="button"
            onClick={() => onRemove(index)}
            disabled={values.length === 1}
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

export function FaqRepeater({ items, onChange, onAdd, onRemove }) {
  return (
    <div className="repeater-block">
      <div className="repeater-header">
        <span>FAQs</span>
        <button className="mini-button" type="button" onClick={onAdd}>
          Add FAQ
        </button>
      </div>

      {items.map((item, index) => (
        <div className="faq-grid" key={`faq-${index}`}>
          <input
            value={item.question}
            onChange={(event) => onChange(index, "question", event.target.value)}
            placeholder="Question"
          />
          <textarea
            value={item.answer}
            onChange={(event) => onChange(index, "answer", event.target.value)}
            placeholder="Answer"
            rows="3"
          />
          <button
            className="mini-button danger"
            type="button"
            onClick={() => onRemove(index)}
            disabled={items.length === 1}
          >
            Remove FAQ
          </button>
        </div>
      ))}
    </div>
  );
}

export function ScheduleRepeater({
  items,
  onChange,
  onAdd,
  onRemove,
  weekdayOptions,
  scheduleMode = "weekly",
}) {
  const isDayMode = scheduleMode === "daily";

  return (
    <div className="repeater-block">
      <div className="repeater-header">
        <span>{isDayMode ? "Daily Schedule" : "Weekly Schedule"}</span>
        {!isDayMode && (
          <button className="mini-button" type="button" onClick={onAdd}>
            Add Slot
          </button>
        )}
      </div>

      {items.map((item, index) => (
        <div className="schedule-grid" key={`slot-${index}`}>
          {isDayMode ? (
            <label className="field">
              <span>Date</span>
              <input type="date" value={item.specific_date} readOnly />
            </label>
          ) : (
            <label className="field">
              <span>Weekday</span>
              <select
                value={item.weekday}
                onChange={(event) => onChange(index, "weekday", event.target.value)}
              >
                {weekdayOptions.map((weekday) => (
                  <option key={weekday} value={weekday}>
                    {formatEnumLabel(weekday)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Start</span>
            <input
              type="time"
              value={item.start_time}
              onChange={(event) => onChange(index, "start_time", event.target.value)}
            />
          </label>
          <label className="field">
            <span>End</span>
            <input
              type="time"
              value={item.end_time}
              onChange={(event) => onChange(index, "end_time", event.target.value)}
            />
          </label>
          {isDayMode ? (
            <div className="field">
              <span>Day</span>
              <input value={`Day ${index + 1}`} readOnly />
            </div>
          ) : (
            <>
              <label className="field">
                <span>Repeat Every</span>
                <input
                  type="number"
                  min="1"
                  value={item.repeat_every_weeks}
                  onChange={(event) => onChange(index, "repeat_every_weeks", event.target.value)}
                />
              </label>
              <button
                className="mini-button danger"
                type="button"
                onClick={() => onRemove(index)}
                disabled={items.length === 1}
              >
                Remove Slot
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function StatusBanner({ notice }) {
  if (!notice.message) {
    return null;
  }
  return <p className={`feedback ${notice.type}`}>{notice.message}</p>;
}

export function DashboardSummary({ items }) {
  return (
    <section className="summary-grid">
      {items.map((item) => (
        <article className="summary-tile" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.helper && <p className="summary-helper">{item.helper}</p>}
        </article>
      ))}
    </section>
  );
}

export function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      <p className="muted-copy">{body}</p>
    </div>
  );
}

export function SelectionChecklist({
  items,
  selectedIds,
  onToggle,
  searchValue,
  onSearchChange,
  emptyMessage,
}) {
  const filteredItems = items.filter((item) => {
    const haystack = `${item.name} ${item.email}`.toLowerCase();
    return haystack.includes(searchValue.trim().toLowerCase());
  });

  return (
    <div className="checklist-block">
      <input
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search students"
      />

      {filteredItems.length === 0 ? (
        <p className="muted-copy">{emptyMessage}</p>
      ) : (
        <div className="checklist-list">
          {filteredItems.map((item) => (
            <label className="checkbox-row" key={item.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => onToggle(item.id)}
              />
              <span>
                {item.name} ({item.email})
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function RoleHome({ user, onLogout }) {
  return (
    <main className="portal-shell">
      <section className="portal-card">
        <p className="brand-mark">Silicon Mango Academy</p>
        <h1>{user.role[0].toUpperCase() + user.role.slice(1)} Portal</h1>
        <p className="portal-copy">
          Signed in as {user.name}. Student-facing workflows are still deferred, but your role-based login is active.
        </p>

        <div className="portal-actions">
          <button className="ghost-button" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </section>
    </main>
  );
}
