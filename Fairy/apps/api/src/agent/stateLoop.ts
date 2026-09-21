import type { Profile } from "@fairy/shared";
import * as profileService from "../services/profileService";
import * as rentalService from "../services/rentalService";
import * as memoryService from "../memory/memoryService";
import { classifyIntent } from "./intentClassifier";
import { buildMemoryBlock, trimHistoryToBudget } from "./contextBuilder";
import { plan } from "./planner";
import { dispatch, type ToolObservation } from "./toolDispatcher";
import { returnMovieTool } from "../tools/returnMovieTool";
import { synthesize, type SynthesizedResponse } from "./responseSynthesizer";
import type { Role } from "../middleware/auth";

export async function runChatTurn(
  input: {
    userId: string;
    message: string;
    movieId?: string;
    action?: "return";
    history?: string;
    role?: Role;
  },
  onDelta?: (delta: string) => void,
): Promise<SynthesizedResponse> {
  // 画像一次查询：dispatch（行程身份门禁）与 synthesize（回复人设）共用
  const profile: Profile | null = await profileService.getByUserId(input.userId).catch(() => null);
  // FU-14：记忆中心检索——仅注入本用户（profileId）的记忆，检索失败降级为空
  // FU-16：以用户当前消息作语义查询——embed 可用时按相关度召回，缺省/无向量时混合或结构化兜底
  const memories = profile
    ? await memoryService.searchMemories(profile.userId, { query: input.message }).catch(() => [])
    : [];

  if (input.action === "return" && input.movieId) {
    const result = await returnMovieTool({
      userId: input.userId,
      movieId: input.movieId,
    });
    const observation: ToolObservation =
      result.success && result.data
        ? {
            kind: "return",
            success: true,
            remainingStock: result.data.remainingStock,
            rentalId: result.data.rentalId,
            code: "OK",
          }
        : {
            kind: "return",
            success: false,
            remainingStock: null,
            rentalId: null,
            code: result.error ?? "INTERNAL_ERROR",
          };
    // FU-20：prompt token 预算——在进入合成前裁剪历史，记忆不裁剪
    const historyText = trimHistoryToBudget(input.history ?? "", buildMemoryBlock(memories));
    return synthesize(
      observation,
      {
        message: input.message,
        profile,
        memories,
        history: historyText,
      },
      onDelta,
    );
  }

  const intent = await classifyIntent({
    message: input.message,
    movieId: input.movieId,
    history: input.history,
  });
  const planned = plan(intent);
  const observation = await dispatch(planned, input.userId, input.role, input.message, profile);

  if (observation.kind === "none" && observation.reason === "return_unresolved") {
    const activeRentals = await rentalService.listActiveRentals(input.userId).catch(() => []);
    const historyText = trimHistoryToBudget(input.history ?? "", buildMemoryBlock(memories));
    return synthesize(
      observation,
      {
        message: input.message,
        profile,
        memories,
        activeRentals,
        history: historyText,
      },
      onDelta,
    );
  }

  const historyText = trimHistoryToBudget(input.history ?? "", buildMemoryBlock(memories));
  return synthesize(
    observation,
    {
      message: input.message,
      profile,
      memories,
      history: historyText,
    },
    onDelta,
  );
}
