import { startTransition, useEffect, useState } from "react";

import AdminDashboard from "./AdminDashboard";
import InstructorDashboard from "./InstructorDashboard";
import { LandingPage, RoleHome } from "./shared";
import { apiRequest, createInitialLoginForm, navigateTo, tokenStorageKey } from "./utils";

function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [authState, setAuthState] = useState({
    loading: true,
    token: "",
    user: null,
  });
  const [loginForm, setLoginForm] = useState(createInitialLoginForm());
  const [loginState, setLoginState] = useState({
    submitting: false,
    error: "",
  });

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname);
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const savedToken = window.localStorage.getItem(tokenStorageKey);

    async function hydrateAuth() {
      if (!savedToken) {
        if (!ignore) {
          setAuthState({
            loading: false,
            token: "",
            user: null,
          });
        }
        return;
      }

      try {
        const user = await apiRequest("/api/v1/auth/me", { token: savedToken });
        if (!ignore) {
          setAuthState({
            loading: false,
            token: savedToken,
            user,
          });
        }
      } catch {
        window.localStorage.removeItem(tokenStorageKey);
        if (!ignore) {
          setAuthState({
            loading: false,
            token: "",
            user: null,
          });
        }
      }
    }

    hydrateAuth();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (authState.loading) {
      return;
    }

    if (!authState.user && pathname !== "/") {
      navigateTo("/", setPathname);
      return;
    }

    if (authState.user?.role === "admin" && pathname !== "/admin") {
      navigateTo("/admin", setPathname);
      return;
    }

    if (authState.user?.role === "instructor" && pathname !== "/instructor") {
      navigateTo("/instructor", setPathname);
      return;
    }

    if (authState.user?.role === "student" && pathname !== "/portal") {
      navigateTo("/portal", setPathname);
    }
  }, [authState, pathname]);

  function handleLoginInputChange(event) {
    const { name, value } = event.target;
    setLoginForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleLogout() {
    window.localStorage.removeItem(tokenStorageKey);
    setAuthState({
      loading: false,
      token: "",
      user: null,
    });
    startTransition(() => {
      navigateTo("/", setPathname);
    });
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    setLoginState({
      submitting: true,
      error: "",
    });

    try {
      const response = await apiRequest("/api/v1/auth/login", {
        method: "POST",
        body: loginForm,
      });

      window.localStorage.setItem(tokenStorageKey, response.access_token);
      setAuthState({
        loading: false,
        token: response.access_token,
        user: response.user,
      });
      setLoginForm(createInitialLoginForm());
      setLoginState({
        submitting: false,
        error: "",
      });

      startTransition(() => {
        if (response.user.role === "admin") {
          navigateTo("/admin", setPathname);
          return;
        }

        if (response.user.role === "instructor") {
          navigateTo("/instructor", setPathname);
          return;
        }

        navigateTo("/portal", setPathname);
      });
    } catch (error) {
      setLoginState({
        submitting: false,
        error: error.message || "Login failed.",
      });
    }
  }

  if (authState.loading) {
    return (
      <main className="portal-shell">
        <section className="portal-card">
          <p className="brand-mark">Silicon Mango Academy</p>
          <h1>Loading portal</h1>
          <p className="portal-copy">Checking your current session.</p>
        </section>
      </main>
    );
  }

  if (!authState.user) {
    return (
      <LandingPage
        loginForm={loginForm}
        onChange={handleLoginInputChange}
        onSubmit={handleLoginSubmit}
        loginState={loginState}
      />
    );
  }

  if (authState.user.role === "admin") {
    if (pathname !== "/admin") {
      return null;
    }

    return <AdminDashboard token={authState.token} user={authState.user} onLogout={handleLogout} />;
  }

  if (authState.user.role === "instructor") {
    if (pathname !== "/instructor") {
      return null;
    }

    return <InstructorDashboard token={authState.token} user={authState.user} onLogout={handleLogout} />;
  }

  if (pathname !== "/portal") {
    return null;
  }

  return <RoleHome user={authState.user} onLogout={handleLogout} />;
}

export default App;
