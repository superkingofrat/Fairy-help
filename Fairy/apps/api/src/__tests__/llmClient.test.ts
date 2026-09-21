import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAiProvider,
  type AiProvider,
  type ChatMessage,
  type ChatResult,
  type StreamChunk,
  type UsageMetadata,
} from "@fairy/ai-sdk";
import { resetLlmProviderForTests, tryChat } from "../agent/llmClient";

// createAiProvider 换成可操控的桩，isAiProviderError 等其余导出保持真实
vi.mock("@fairy/ai-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fairy/ai-sdk")>();
  return { ...actual, createAiProvider: vi.fn() };
});

const USAGE: UsageMetadata = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
const MESSAGES: ChatMessage[] = [{ role: "user", content: "hi" }];
const ONE_SHOT: ChatResult = {
  text: "完整答案",
  usage: USAGE,
  model: "deepseek-chat",
  provider: "deepseek",
};

async function* streamOf(...items: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const item of items) {
    yield item;
  }
}

async function* streamFailingAfter(chunk: StreamChunk): AsyncGenerator<StreamChunk> {
  yield chunk;
  throw new Error("stream broke");
}

function fakeProvider(
  stream: () => AsyncIterable<StreamChunk>,
  chat: AiProvider["chat"] = vi.fn<AiProvider["chat"]>(),
): AiProvider {
  return {
    name: "deepseek",
    defaultModel: "deepseek-chat",
    stream,
    chat,
    embed: vi.fn<AiProvider["embed"]>(),
  };
}

describe("tryChat (streaming channel)", () => {
  beforeEach(() => {
    resetLlmProviderForTests();
    // 上一个用例的 mockReturnValue 必须清掉，否则泄漏进下一个用例
    vi.mocked(createAiProvider).mockReset();
    vi.stubEnv("AI_PROVIDER", "deepseek");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetLlmProviderForTests();
  });

  it("mirrors each text chunk to onDelta and returns the trimmed stream result", async () => {
    const chat = vi.fn<AiProvider["chat"]>();
    vi.mocked(createAiProvider).mockReturnValue(
      fakeProvider(
        () =>
          streamOf(
            { type: "text", text: "你好" },
            { type: "text", text: "，世界" },
            { type: "done", usage: USAGE, model: "deepseek-chat" },
          ),
        chat,
      ),
    );

    const deltas: string[] = [];
    const result = await tryChat("agent.reply", MESSAGES, undefined, (delta) => deltas.push(delta));

    expect(deltas).toEqual(["你好", "，世界"]);
    expect(result).toEqual({
      text: "你好，世界",
      usage: USAGE,
      model: "deepseek-chat",
      provider: "deepseek",
    });
    expect(chat).not.toHaveBeenCalled();
  });

  it("falls back to one-shot chat when the stream yields no chunks", async () => {
    const chat = vi.fn<AiProvider["chat"]>().mockResolvedValue(ONE_SHOT);
    vi.mocked(createAiProvider).mockReturnValue(fakeProvider(() => streamOf(), chat));

    const deltas: string[] = [];
    const result = await tryChat("agent.reply", MESSAGES, undefined, (delta) => deltas.push(delta));

    expect(deltas).toEqual([]);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(result).toEqual(ONE_SHOT);
  });

  it("falls back to one-shot chat when the stream emits only whitespace", async () => {
    const chat = vi.fn<AiProvider["chat"]>().mockResolvedValue(ONE_SHOT);
    vi.mocked(createAiProvider).mockReturnValue(
      fakeProvider(
        () =>
          streamOf(
            { type: "text", text: "  \n\t" },
            { type: "done", usage: USAGE, model: "deepseek-chat" },
          ),
        chat,
      ),
    );

    const deltas: string[] = [];
    const result = await tryChat("agent.reply", MESSAGES, undefined, (delta) => deltas.push(delta));

    // 空白增量照样逐条镜像（由调用方决定可见性），但不得当成有效输出；
    // 调用方必须拿到回退的完整答案，否则用户只收到空白 text 事件
    expect(deltas).toEqual(["  \n\t"]);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(result).toEqual(ONE_SHOT);
  });

  it("returns the accumulated text when the stream fails mid-way", async () => {
    const chat = vi.fn<AiProvider["chat"]>();
    vi.mocked(createAiProvider).mockReturnValue(
      fakeProvider(() => streamFailingAfter({ type: "text", text: "前半段" }), chat),
    );

    const deltas: string[] = [];
    const result = await tryChat("agent.reply", MESSAGES, undefined, (delta) => deltas.push(delta));

    // 客户端已收到前半段：不能再回退补写造成重复，直接返回已累计文本
    expect(deltas).toEqual(["前半段"]);
    expect(result).toEqual({
      text: "前半段",
      usage: { promptTokens: null, completionTokens: null, totalTokens: null },
      model: "deepseek-chat",
      provider: "deepseek",
    });
    expect(chat).not.toHaveBeenCalled();
  });

  it("uses one-shot chat directly when onDelta is absent", async () => {
    const chat = vi.fn<AiProvider["chat"]>().mockResolvedValue(ONE_SHOT);
    vi.mocked(createAiProvider).mockReturnValue(fakeProvider(() => streamOf(), chat));

    const result = await tryChat("agent.reply", MESSAGES);

    expect(result).toEqual(ONE_SHOT);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("returns null when no provider is configured", async () => {
    // 四个来源任一非空都会尝试建 provider，必须全部清空
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    resetLlmProviderForTests();

    await expect(tryChat("agent.reply", MESSAGES, undefined, () => undefined)).resolves.toBeNull();
  });
});
