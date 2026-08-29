import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { MoviesAdminPage } from "./components/admin/MoviesAdminPage";
import { ProfilesAdminPage } from "./components/admin/ProfilesAdminPage";
import { BehaviorPage } from "./components/admin/BehaviorPage";
import { ChatPage } from "./components/chat/ChatPage";
import { t } from "./lib/i18n";

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
            <nav className="flex gap-4 text-sm">
              <Link to="/" className="text-slate-600 hover:text-indigo-600">
                {t("nav.home")}
              </Link>
              <Link to="/chat" className="text-slate-600 hover:text-indigo-600">
                {t("nav.chat")}
              </Link>
              <Link to="/admin/movies" className="text-slate-600 hover:text-indigo-600">
                {t("nav.movies")}
              </Link>
              <Link to="/admin/profiles" className="text-slate-600 hover:text-indigo-600">
                {t("nav.profiles")}
              </Link>
              <Link to="/admin/behavior" className="text-slate-600 hover:text-indigo-600">
                {t("nav.behavior")}
              </Link>
            </nav>
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
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/admin/movies" element={<MoviesAdminPage />} />
          <Route path="/admin/profiles" element={<ProfilesAdminPage />} />
          <Route path="/admin/behavior" element={<BehaviorPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
