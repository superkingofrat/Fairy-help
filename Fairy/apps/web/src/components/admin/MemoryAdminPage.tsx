import { useCallback, useEffect, useState } from "react";
import type { MemoryKind, MemoryListItem, ProfileListItem } from "@fairy/shared";
import { fetchProfiles } from "../../lib/profileApi";
import { createMemory, deleteMemory, fetchMemories, updateMemory } from "../../lib/memoryApi";
import { t } from "../../lib/i18n";

const MEMORY_KINDS: MemoryKind[] = ["preference", "fact", "intent"];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function MemoryAdminPage(): JSX.Element {
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [kindFilter, setKindFilter] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemoryListItem | null>(null);
  const [users, setUsers] = useState<ProfileListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<MemoryKind>("preference");
  const [content, setContent] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<MemoryListItem | null>(null);

  const loadMemories = useCallback(async (currentPage: number, kind: string, keyword: string) => {
    setLoading(true);
    setError(null);

    try {
      const feed = await fetchMemories({
        page: currentPage,
        limit: 20,
        ...(kind ? { kind: kind as MemoryKind } : {}),
        ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
      });
      setMemories(feed.items);
      setTotalPages(feed.pagination.totalPages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("memory.error.load"));
      setMemories([]);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemories(page, kindFilter, appliedKeyword);
  }, [appliedKeyword, kindFilter, loadMemories, page]);

  function changeKindFilter(value: string): void {
    setKindFilter(value);
    setPage(1);
  }

  function searchByKeyword(): void {
    setAppliedKeyword(keywordDraft);
    setPage(1);
  }

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);

    try {
      setUsers(await fetchProfiles());
    } catch (loadError) {
      setUsersError(loadError instanceof Error ? loadError.message : t("memory.error.users"));
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  function openCreateModal(): void {
    setEditing(null);
    setUserId("");
    setKind("preference");
    setContent("");
    setFormError(null);
    setModalOpen(true);
    void loadUsers();
  }

  function openEditModal(item: MemoryListItem): void {
    setEditing(item);
    setKind(item.kind);
    setContent(item.content);
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal(): void {
    setModalOpen(false);
    setEditing(null);
    setUserId("");
    setKind("preference");
    setContent("");
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const trimmed = content.trim();
    if (!trimmed) {
      setFormError(t("memory.error.field.content"));
      return;
    }
    if (!editing && !userId) {
      setFormError(t("memory.error.field.user"));
      return;
    }

    try {
      if (editing) {
        await updateMemory(editing.id, { kind, content: trimmed });
      } else {
        await createMemory({ userId, kind, content: trimmed });
      }

      closeModal();
      setPage(1);
      await loadMemories(1, kindFilter, appliedKeyword);
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : t("memory.error.save"));
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }

    setError(null);

    try {
      await deleteMemory(deleteTarget.id);
      setDeleteTarget(null);
      setPage(1);
      await loadMemories(1, kindFilter, appliedKeyword);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t("memory.error.delete"));
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("memory.title")}</h1>
          <p className="text-slate-600">{t("memory.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          {t("memory.actions.create")}
        </button>
      </div>

      <div className="mb-4 flex gap-3">
        <input
          value={keywordDraft}
          onChange={(event) => setKeywordDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              searchByKeyword();
            }
          }}
          placeholder={t("memory.filter.keyword")}
          className="w-72 rounded border border-slate-300 px-3 py-2"
        />
        <button
          type="button"
          onClick={searchByKeyword}
          className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-50"
        >
          {t("memory.filter.search")}
        </button>
        <select
          value={kindFilter}
          onChange={(event) => changeKindFilter(event.target.value)}
          className="rounded border border-slate-300 px-3 py-2"
        >
          <option value="">{t("memory.filter.all")}</option>
          {MEMORY_KINDS.map((kindOption) => (
            <option key={kindOption} value={kindOption}>
              {t(`memory.kind.${kindOption}` as never)}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-slate-600">{t("memory.loading")}</p>
      ) : error ? null : memories.length === 0 ? (
        <p className="text-slate-600">{t("memory.empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3">{t("memory.table.time")}</th>
                <th className="px-4 py-3">{t("memory.table.email")}</th>
                <th className="px-4 py-3">{t("memory.table.kind")}</th>
                <th className="px-4 py-3">{t("memory.table.content")}</th>
                <th className="px-4 py-3">{t("memory.table.session")}</th>
                <th className="px-4 py-3">{t("memory.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {memories.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-xs">{formatTime(item.createdAt)}</td>
                  <td className="px-4 py-3">{item.email}</td>
                  <td className="px-4 py-3">{t(`memory.kind.${item.kind}` as never)}</td>
                  <td className="max-w-xs px-4 py-3">
                    <span className="block truncate" title={item.content}>
                      {item.content}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" title={item.sessionId ?? undefined}>
                    {item.sessionId ? item.sessionId.slice(0, 8) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        className="text-indigo-600 hover:underline"
                      >
                        {t("memory.actions.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="text-red-600 hover:underline"
                      >
                        {t("memory.actions.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded border border-slate-300 px-3 py-2 disabled:opacity-40"
          >
            {t("memory.page.prev")}
          </button>
          <span className="text-slate-600">
            {t("memory.page.info")
              .replace("{page}", String(page))
              .replace("{totalPages}", String(totalPages))}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            className="rounded border border-slate-300 px-3 py-2 disabled:opacity-40"
          >
            {t("memory.page.next")}
          </button>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 className="mb-4 text-xl font-semibold">
              {editing ? t("memory.modal.editTitle") : t("memory.modal.createTitle")}
            </h2>
            {formError ? <p className="mb-4 text-sm text-red-600">{formError}</p> : null}

            {!editing ? (
              <label className="block text-sm">
                {t("memory.form.user")}
                {usersLoading ? (
                  <span className="ml-1 text-xs text-slate-400">{t("memory.loading")}</span>
                ) : null}
                <select
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  disabled={usersLoading}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:opacity-60"
                >
                  <option value="">{t("memory.form.userPlaceholder")}</option>
                  {users.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.email}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!editing && usersError ? (
              <p className="mt-2 text-sm text-red-600">{usersError}</p>
            ) : null}

            <label className="mt-4 block text-sm">
              {t("memory.form.kind")}
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as MemoryKind)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              >
                {MEMORY_KINDS.map((kindOption) => (
                  <option key={kindOption} value={kindOption}>
                    {t(`memory.kind.${kindOption}` as never)}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-sm">
              {t("memory.form.content")}
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded border border-slate-300 px-4 py-2"
              >
                {t("memory.actions.cancel")}
              </button>
              <button
                type="submit"
                className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
              >
                {t("memory.actions.save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">{t("memory.delete.title")}</h3>
            <p className="mt-2 text-slate-600">{t("memory.delete.message")}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded border border-slate-300 px-4 py-2"
              >
                {t("memory.actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
              >
                {t("memory.actions.delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
