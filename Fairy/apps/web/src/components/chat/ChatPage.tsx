import { FormEvent, useEffect, useState } from "react";
import type { Movie } from "@fairy/shared";
import { postChat } from "../../lib/chatApi";
import { t } from "../../lib/i18n";
import { useChatStore } from "../../stores/chatStore";
import { MessageStream } from "./MessageStream";
import { RecommendationCard } from "./RecommendationCard";

interface ChatMessage {
  id: string;
  role: "user" | "fairy";
  content: string;
  cards: Movie[];
}

export function ChatPage(): JSX.Element {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRentals = useChatStore((state) => state.activeRentals);
  const refreshRentals = useChatStore((state) => state.refreshRentals);
  const removeActiveRental = useChatStore((state) => state.removeActiveRental);

  useEffect(() => {
    void refreshRentals();
  }, [refreshRentals]);

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

    setMessages((current) => [
      ...current,
      ...(body.movieId
        ? []
        : [{ id: `user-${Date.now()}`, role: "user" as const, content: body.message, cards: [] }]),
      { id: fairyId, role: "fairy", content: "", cards: [] },
    ]);

    try {
      await postChat(body, (event) => {
        if (event.event === "text") {
          const data = event.data as { content: string };
          fairyText += data.content;
        }
        if (event.event === "recommendation") {
          const data = event.data as { items: Movie[] };
          cards = data.items;
        }
        if (event.event === "return") {
          const data = event.data as { success: boolean; rentalId: string | null };
          if (data.success && data.rentalId) {
            removeActiveRental(data.rentalId);
          } else {
            void refreshRentals();
          }
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === fairyId ? { ...message, content: fairyText, cards } : message
          )
        );
      });
    } catch (caught) {
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
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold text-slate-800">{t("chat.title")}</h2>
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
      {messages.length === 0 ? (
        <p className="text-sm text-slate-500">{t("chat.empty")}</p>
      ) : null}
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
  );
}
