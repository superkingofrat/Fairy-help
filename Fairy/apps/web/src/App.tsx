import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { MoviesAdminPage } from "./components/admin/MoviesAdminPage";
import { ProfilesAdminPage } from "./components/admin/ProfilesAdminPage";
import { BehaviorPage } from "./components/admin/BehaviorPage";
import { ChatPage } from "./components/chat/ChatPage";
import { LoginPage } from "./components/LoginPage";
import { useAuthStore } from "./stores/authStore";
import { t } from "./lib/i18n";

function RequireAuth({ children, role }: { children: JSX.Element; role?: "admin" }): JSX.Element {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function HeaderNav(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);

  const linkClass = "text-slate-600 hover:text-indigo-600";

  return (
    <nav className="flex items-center gap-4 text-sm">
      <Link to="/" className={linkClass}>
        {t("nav.home")}
      </Link>
      {user ? (
        <>
          <Link to="/chat" className={linkClass}>
            {t("nav.chat")}
          </Link>
          {user.role === "admin" ? (
            <>
              <Link to="/admin/movies" className={linkClass}>
                {t("nav.movies")}
              </Link>
              <Link to="/admin/profiles" className={linkClass}>
                {t("nav.profiles")}
              </Link>
              <Link to="/admin/behavior" className={linkClass}>
                {t("nav.behavior")}
              </Link>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => {
              clear();
            }}
            className="text-slate-500 hover:text-indigo-600"
          >
            {t("nav.logout")}
          </button>
        </>
      ) : (
        <Link to="/login" className={linkClass}>
          {t("nav.login")}
        </Link>
      )}
    </nav>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">{t("app.title")}</h1>
              <p className="text-sm text-slate-600">{t("app.subtitle")}</p>
            </div>
            <HeaderNav />
          </div>
        </header>

        <Routes>
          <Route
            path="/"
            element={
              <main className="mx-auto max-w-6xl p-6">
                <p className="text-slate-600">{t("home.welcome")}</p>
              </main>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/chat"
            element={
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/movies"
            element={
              <RequireAuth role="admin">
                <MoviesAdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/profiles"
            element={
              <RequireAuth role="admin">
                <ProfilesAdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/behavior"
            element={
              <RequireAuth role="admin">
                <BehaviorPage />
              </RequireAuth>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
