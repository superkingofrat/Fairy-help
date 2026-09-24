import { z } from "zod";

export const chatActionSchema = z.enum(["return"]);

export const chatRequestSchema = z
  .object({
    // 输入上限与 llmClient.MAX_INPUT_CHARS 对齐：超长消息由契约拒绝而非静默截断
    message: z.string().max(2000),
    movieId: z.string().uuid().optional(),
    // 会话 id 是 Prisma uuid()：非 UUID 会穿透到查询变 500，契约只承诺 404/403
    sessionId: z.string().uuid().optional(),
    action: chatActionSchema.optional(),
  })
  .refine((data) => !data.action || data.movieId !== undefined, {
    message: "action requires movieId",
    path: ["movieId"],
  });

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
