import { FormEvent, useState } from "react";
import type { Movie } from "@fairy/shared";
import { postChat } from "../../lib/chatApi";
import { t } from "../../lib/i18n";
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

  async function send(body: { message: string; movieId?: string }): Promise<void> {
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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold text-slate-800">{t("chat.title")}</h2>
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
                    onBorrow={(movieId) => {
                      void send({ message: "", movieId });
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
