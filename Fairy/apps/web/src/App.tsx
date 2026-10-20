import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { MoviesAdminPage } from "./components/admin/MoviesAdminPage";
import { ProfilesAdminPage } from "./components/admin/ProfilesAdminPage";
import { BehaviorPage } from "./components/admin/BehaviorPage";
import { InsightsAdminPage } from "./components/admin/InsightsAdminPage";
import { MemoryAdminPage } from "./components/admin/MemoryAdminPage";
import { ChatPage } from "./components/chat/ChatPage";
import { MovieLibraryPage } from "./components/library/MovieLibraryPage";
import { LoginPage } from "./components/LoginPage";
import { RegisterPage } from "./components/RegisterPage";
import { TripsPage } from "./components/trips/TripsPage";
import { ensureSessionOnBoot, logout } from "./lib/authApi";
import { useAuthStore } from "./stores/authStore";
import { t } from "./lib/i18n";

// 启动门：本地有残留会话时先经 /api/auth/me 验证（失效才刷新/登出），
// 期间渲染占位页而非内部内容，避免未登录用户先看到内部 UI 一闪而过。
function useSessionReady(): boolean {
  const [ready, setReady] = useState(() => useAuthStore.getState().token === null);
  useEffect(() => {
    if (useAuthStore.getState().token === null) {
      setReady(true);
      return;
    }
    let disposed = false;
    void ensureSessionOnBoot().finally(() => {
      if (!disposed) {
        setReady(true);
      }
    });
    return () => {
      disposed = true;
    };
  }, []);
  return ready;
}

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
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const clear = useAuthStore((state) => state.clear);

  const linkClass = "text-slate-600 hover:text-indigo-600";

  function handleLogout(): void {
    if (refreshToken) {
      void logout(refreshToken);
    }
    clear();
  }

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
          <Link to="/movies" className={linkClass}>
            {t("nav.library")}
          </Link>
          {/* 行程入口仅面向顾问/管理员：普通用户无法创建行程（chat dispatch 与 REST 均限
              admin/agent），其列表恒为空。/trips 路由仍对所有登录用户可达，由 owner-scoped
              接口兜底；若要连路由一并收敛，须收窄已归档提案的 owner-read Requirement。 */}
          {user.role === "admin" || user.role === "agent" ? (
            <Link to="/trips" className={linkClass}>
              {t("nav.trips")}
            </Link>
          ) : null}
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
              <Link to="/admin/memories" className={linkClass}>
                {t("nav.memories")}
              </Link>
              <Link to="/admin/insights" className={linkClass}>
                {t("nav.insights")}
              </Link>
            </>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-500 hover:text-indigo-600"
          >
            {t("nav.logout")}
          </button>
        </>
      ) : (
        <>
          <Link to="/login" className={linkClass}>
            {t("nav.login")}
          </Link>
          <Link to="/register" className={linkClass}>
            {t("nav.register")}
          </Link>
        </>
      )}
    </nav>
  );
}

export function App(): JSX.Element {
  const sessionReady = useSessionReady();

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        {t("app.restoring")}
      </div>
    );
  }

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
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/chat"
            element={
              <RequireAuth>
                <ChatPage />
              </RequireAuth>
            }
          />
          <Route
            path="/movies"
            element={
              <RequireAuth>
                <MovieLibraryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/trips"
            element={
              <RequireAuth>
                <TripsPage />
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
          <Route
            path="/admin/insights"
            element={
              <RequireAuth role="admin">
                <InsightsAdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/memories"
            element={
              <RequireAuth role="admin">
                <MemoryAdminPage />
              </RequireAuth>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
