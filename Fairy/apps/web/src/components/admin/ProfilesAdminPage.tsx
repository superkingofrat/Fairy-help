import { useCallback, useEffect, useState } from "react";
import type { Profile, ProfileListItem } from "@fairy/shared";
import { createProfile, fetchProfiles, updateProfile } from "../../lib/profileApi";
import { localizedErrorMessage } from "../../lib/errorMessages";
import { t } from "../../lib/i18n";

interface ProfileFormState {
  name: string;
  avatarUrl: string;
  styleTags: string;
  likeGenres: string;
  avoidFood: string;
  dietPreference: string;
  travelStyle: string;
}

const emptyForm: ProfileFormState = {
  name: "",
  avatarUrl: "",
  styleTags: "",
  likeGenres: "",
  avoidFood: "",
  dietPreference: "",
  travelStyle: "",
};

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function profileToForm(profile: Profile): ProfileFormState {
  return {
    name: profile.name,
    avatarUrl: profile.avatarUrl ?? "",
    styleTags: profile.styleTags.join(", "),
    likeGenres: profile.likeGenres.join(", "),
    avoidFood: profile.avoidFood.join(", "),
    dietPreference: profile.dietPreference ?? "",
    travelStyle: profile.travelStyle ?? "",
  };
}

function formToWritable(form: ProfileFormState) {
  return {
    name: form.name.trim(),
    avatarUrl: form.avatarUrl.trim() || null,
    styleTags: splitCsv(form.styleTags),
    likeGenres: splitCsv(form.likeGenres),
    avoidFood: splitCsv(form.avoidFood),
    dietPreference: form.dietPreference.trim() || null,
    travelStyle: form.travelStyle.trim() || null,
  };
}

function ProfileFormModal(props: {
  title: string;
  form: ProfileFormState;
  formError: string | null;
  onChange: (form: ProfileFormState) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}): JSX.Element {
  const { title, form, formError, onChange, onClose, onSubmit } = props;

  const textField = (label: string, key: keyof ProfileFormState, hint?: string) => (
    <label className="text-sm">
      {label}
      {hint ? <span className="ml-1 text-xs text-slate-400">{hint}</span> : null}
      <input
        value={form[key]}
        onChange={(event) => onChange({ ...form, [key]: event.target.value })}
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-xl font-semibold">{title}</h2>
        {formError ? <p className="mb-4 text-sm text-red-600">{formError}</p> : null}

        <div className="grid gap-3 md:grid-cols-2">
          {textField(t("profiles.form.name"), "name")}
          {textField(t("profiles.form.avatarUrl"), "avatarUrl")}
          {textField(t("profiles.form.styleTags"), "styleTags", t("profiles.form.commaHint"))}
          {textField(t("profiles.form.likeGenres"), "likeGenres", t("profiles.form.commaHint"))}
          {textField(t("profiles.form.avoidFood"), "avoidFood", t("profiles.form.commaHint"))}
          {textField(t("profiles.form.dietPreference"), "dietPreference")}
          {textField(t("profiles.form.travelStyle"), "travelStyle")}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2"
          >
            {t("profiles.actions.cancel")}
          </button>
          <button
            type="submit"
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            {t("profiles.actions.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProfilesAdminPage(): JSX.Element {
  const [users, setUsers] = useState<ProfileListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<ProfileListItem | null>(null);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchProfiles();
      setUsers(data);
    } catch (loadError) {
      setError(localizedErrorMessage(loadError, t, "profiles.error.load"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function openCreateModal(user: ProfileListItem): void {
    setEditingUser(user);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(user: ProfileListItem): void {
    if (!user.profile) {
      return;
    }

    setEditingUser(user);
    setForm(profileToForm(user.profile));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal(): void {
    setModalOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    if (!editingUser) {
      return;
    }

    if (!form.name.trim()) {
      setFormError(t("profiles.error.field.name"));
      return;
    }

    const writable = formToWritable(form);

    try {
      if (editingUser.profile) {
        await updateProfile(editingUser.userId, writable);
      } else {
        await createProfile({ userId: editingUser.userId, ...writable });
      }

      closeModal();
      await loadUsers();
    } catch (submitError) {
      setFormError(localizedErrorMessage(submitError, t, "profiles.error.save"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{t("profiles.title")}</h1>
        <p className="text-slate-600">{t("profiles.subtitle")}</p>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-slate-600">{t("profiles.loading")}</p>
      ) : error ? null : users.length === 0 ? (
        <p className="text-slate-600">{t("profiles.empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">{t("profiles.table.email")}</th>
                <th className="px-4 py-3">{t("profiles.table.role")}</th>
                <th className="px-4 py-3">{t("profiles.table.name")}</th>
                <th className="px-4 py-3">{t("profiles.table.likeGenres")}</th>
                <th className="px-4 py-3">{t("profiles.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.userId} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{user.email}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="px-4 py-3">
                    {user.profile ? user.profile.name : t("profiles.noProfile")}
                  </td>
                  <td className="px-4 py-3">
                    {user.profile ? user.profile.likeGenres.join("、") : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {user.profile ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="text-indigo-600 hover:underline"
                      >
                        {t("profiles.actions.edit")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openCreateModal(user)}
                        className="text-emerald-600 hover:underline"
                      >
                        {t("profiles.actions.create")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && editingUser ? (
        <ProfileFormModal
          title={
            editingUser.profile ? t("profiles.modal.editTitle") : t("profiles.modal.createTitle")
          }
          form={form}
          formError={formError}
          onChange={setForm}
          onClose={closeModal}
          onSubmit={(event) => void handleSubmit(event)}
        />
      ) : null}
    </div>
  );
}
