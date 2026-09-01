import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../lib/authApi";
import { useAuthStore } from "../stores/authStore";
import { t } from "../lib/i18n";

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { token, refreshToken, user } = await login(email.trim(), password);
      setSession(token, user, refreshToken);
      navigate(user.role === "admin" ? "/admin/movies" : "/chat");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("login.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold text-slate-800">{t("login.title")}</h1>
        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

        <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-3">
          <label className="text-sm">
            {t("login.email")}
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm">
            {t("login.password")}
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          <Link to="/register" className="text-indigo-600 hover:text-indigo-700">
            {t("login.registerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
