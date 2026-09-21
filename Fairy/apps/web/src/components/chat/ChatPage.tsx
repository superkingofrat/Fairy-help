import { FormEvent, useEffect, useState } from "react";
import type { ChatMessageDto, Movie, SessionListItem, TripResult } from "@fairy/shared";
import { postChat } from "../../lib/chatApi";
import { t } from "../../lib/i18n";
import { createSession, getSessionMessages, listSessions } from "../../lib/sessionApi";
import { useChatStore } from "../../stores/chatStore";
import { MemorySelfPanel } from "./MemorySelfPanel";
import { MessageStream } from "./MessageStream";
import { RecommendationCard } from "./RecommendationCard";
import { TripTimeline } from "./TripTimeline";

interface ChatMessage {
  id: string;
  role: "user" | "fairy";
  content: string;
  cards: Movie[];
  trips: TripResult[];
}

const SESSION_STORAGE_KEY = "fairy.sessionId";

function dtoToMessage(dto: ChatMessageDto): ChatMessage {
  const recommendation = dto.payload?.events.find((event) => event.type === "recommendation");
  const tripEvent = dto.payload?.events.find((event) => event.type === "trip");
  return {
    id: dto.id,
    role: dto.role === "assistant" ? "fairy" : "user",
    content: dto.content,
    cards: recommendation?.type === "recommendation" ? recommendation.items : [],
    trips: tripEvent && tripEvent.type === "trip" ? [tripEvent.trip] : [],
  };
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) {
    return t("chat.session.justNow");
  }
  if (minutes < 60) {
    return t("chat.session.minutesAgo").replace("{n}", String(minutes));
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return t("chat.session.hoursAgo").replace("{n}", String(hours));
  }
  return t("chat.session.daysAgo").replace("{n}", String(Math.round(hours / 24)));
}

export function ChatPage(): JSX.Element {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_STORAGE_KEY),
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [showMemories, setShowMemories] = useState(false);

  const activeRentals = useChatStore((state) => state.activeRentals);
  const refreshRentals = useChatStore((state) => state.refreshRentals);
  const removeActiveRental = useChatStore((state) => state.removeActiveRental);

  useEffect(() => {
    void refreshRentals();
  }, [refreshRentals]);

  useEffect(() => {
    void (async () => {
      try {
        const list = await listSessions();
        setSessions(list);
        const target =
          sessionId && list.some((session) => session.id === sessionId)
            ? sessionId
            : (list[0]?.id ?? null);
        if (target) {
          await openSession(target);
        } else {
          setSessionId(null);
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch {
        setSessionError(t("chat.session.loadError"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openSession(id: string): Promise<void> {
    try {
      const dtos = await getSessionMessages(id);
      setMessages(dtos.map(dtoToMessage));
      setSessionId(id);
      localStorage.setItem(SESSION_STORAGE_KEY, id);
      setSessionError(null);
    } catch {
      setSessionError(t("chat.session.loadError"));
    }
  }

  async function refreshSessionList(): Promise<void> {
    const list = await listSessions();
    setSessions(list);
  }

  async function ensureSession(): Promise<string> {
    if (sessionId) {
      return sessionId;
    }
    const created = await createSession();
    setSessionId(created.id);
    localStorage.setItem(SESSION_STORAGE_KEY, created.id);
    setSessions((current) => [created, ...current]);
    return created.id;
  }

  async function handleNewSession(): Promise<void> {
    try {
      const created = await createSession();
      setSessions((current) => [created, ...current]);
      setMessages([]);
      setSessionId(created.id);
      localStorage.setItem(SESSION_STORAGE_KEY, created.id);
      setError(null);
      setSessionError(null);
    } catch {
      setError(t("chat.session.loadError"));
    }
  }

  async function send(body: {
    message: string;
    movieId?: string;
    action?: "return";
  }): Promise<void> {
    setBusy(true);
    setError(null);
    const fairyId = `fairy-${Date.now()}`;
    let fairyText = "";
    let cards: Movie[] = [];
    let trips: TripResult[] = [];

    setMessages((current) => [
      ...current,
      ...(body.movieId
        ? []
        : [
            {
              id: `user-${Date.now()}`,
              role: "user" as const,
              content: body.message,
              cards: [],
              trips: [],
            },
          ]),
      { id: fairyId, role: "fairy", content: "", cards: [], trips: [] },
    ]);

    try {
      let sid = sessionId;
      if (body.action !== "return") {
        sid = await ensureSession();
      }
      await postChat({ ...body, ...(sid ? { sessionId: sid } : {}) }, (event) => {
        if (event.event === "text") {
          const data = event.data as { content: string };
          fairyText += data.content;
        }
        if (event.event === "recommendation") {
          const data = event.data as { items: Movie[] };
          cards = data.items;
        }
        if (event.event === "trip") {
          const data = event.data as { trip: TripResult };
          trips = [data.trip];
        }
        if (event.event === "return") {
          const data = event.data as { success: boolean; rentalId: string | null };
          if (data.success && data.rentalId) {
            removeActiveRental(data.rentalId);
          } else {
            void refreshRentals();
          }
        }
        if (event.event === "borrow") {
          const data = event.data as {
            success: boolean;
            remainingStock: number | null;
            rentalId: string | null;
            code: string;
          };
          if (data.success && data.rentalId) {
            // 借阅成功：刷新活跃租赁列表，确保「我的借阅」条及时更新
            void refreshRentals();
          } else {
            // 借阅失败：刷新列表确保 isBorrowed 标记正确，并提示用户
            void refreshRentals();
            const msg =
              data.code === "OUT_OF_STOCK"
                ? t("library.error.OUT_OF_STOCK")
                : data.code === "ALREADY_BORROWED"
                  ? t("library.error.ALREADY_BORROWED")
                  : data.code === "MOVIE_NOT_FOUND"
                    ? t("library.error.MOVIE_NOT_FOUND")
                    : t("library.error.borrow");
            setError(msg);
          }
        }
        if (event.event === "done") {
          const data = event.data as { sessionId?: string | null };
          if (data.sessionId && !sessionId) {
            setSessionId(data.sessionId);
            localStorage.setItem(SESSION_STORAGE_KEY, data.sessionId);
          }
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === fairyId ? { ...message, content: fairyText, cards, trips } : message,
          ),
        );
      });
      void refreshSessionList().catch(() => undefined);
    } catch (caught) {
      // 回滚：流异常时移除最后一条乐观插入的 Fairy 空气泡，防止永久空气泡
      setMessages((current) => {
        const last = current[current.length - 1];
        if (last?.role === "fairy" && last.content === "" && last.id === fairyId) {
          return current.slice(0, -1);
        }
        return current;
      });
      setError(caught instanceof Error ? caught.message : t("chat.error"));
    } finally {
      setBusy(false);
      void refreshRentals();
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) {
      return;
    }
    setInput("");
    void send({ message });
  }

  const borrowedIds = new Set(activeRentals.map((rental) => rental.movieId));

  return (
    <div className="mx-auto flex max-w-5xl gap-4 p-6">
      <aside className="w-60 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">{t("chat.session.title")}</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleNewSession()}
            className="rounded bg-indigo-600 px-2 py-1 text-xs text-white disabled:bg-slate-300"
          >
            {t("chat.session.new")}
          </button>
        </div>
        {sessionError ? <p className="mt-2 text-xs text-red-600">{sessionError}</p> : null}
        {sessions.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">{t("chat.session.empty")}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {sessions.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void openSession(session.id)}
                  className={`w-full rounded border px-3 py-2 text-left text-sm ${
                    session.id === sessionId
                      ? "border-indigo-300 bg-indigo-50 text-slate-800"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="block truncate font-medium">
                    {session.title || t("chat.session.untitled")}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {formatUpdatedAt(session.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">{t("chat.title")}</h2>
          <button
            type="button"
            aria-expanded={showMemories}
            onClick={() => setShowMemories((visible) => !visible)}
            className={`rounded border px-3 py-1 text-xs ${
              showMemories
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t("memory.self.title")}
          </button>
        </div>
        {showMemories ? <MemorySelfPanel /> : null}
        {activeRentals.length > 0 ? (
          <section className="rounded-lg border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-slate-700">{t("chat.myRentals")}</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {activeRentals.map((rental) => (
                <li
                  key={rental.rentalId}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
                >
                  <span className="text-sm text-slate-700">{rental.movieTitle}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void send({ message: "", movieId: rental.movieId, action: "return" })
                    }
                    className="rounded-full bg-amber-600 px-2 py-0.5 text-xs text-white disabled:bg-slate-300"
                  >
                    {t("chat.return")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {messages.length === 0 ? <p className="text-sm text-slate-500">{t("chat.empty")}</p> : null}
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div key={message.id} className="rounded-lg bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs uppercase text-slate-400">
                {message.role === "user" ? t("chat.you") : t("app.title")}
              </p>
              <MessageStream content={message.content} />
              {message.cards.length > 0 ? (
                <div className="mt-3 grid gap-3">
                  {message.cards.map((movie) => (
                    <RecommendationCard
                      key={movie.id}
                      movie={movie}
                      disabled={busy}
                      isBorrowed={borrowedIds.has(movie.id)}
                      onBorrow={(movieId) => {
                        void send({ message: "", movieId });
                      }}
                      onReturn={(movieId) => {
                        void send({ message: "", movieId, action: "return" });
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {message.trips.map((trip) => (
                <TripTimeline key={trip.tripId} trip={trip} />
              ))}
            </div>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label className="sr-only" htmlFor="chat-input">
            {t("chat.placeholder")}
          </label>
          <input
            id="chat-input"
            value={input}
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t("chat.placeholder")}
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:bg-slate-300"
          >
            {busy ? t("chat.loading") : t("chat.send")}
          </button>
        </form>
      </main>
    </div>
  );
}
