import { z } from "zod";
import { movieDtoSchema } from "./movieSchemas";
import { tripEventSchema } from "./tripSchemas";

export const sessionRoleSchema = z.enum(["user", "assistant"]);

export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("recommendation"),
    items: z.array(movieDtoSchema),
  }),
  z.object({
    type: z.literal("borrow"),
    success: z.boolean(),
    remainingStock: z.number().nullable(),
    rentalId: z.string().nullable(),
    code: z.string(),
  }),
  z.object({
    type: z.literal("return"),
    success: z.boolean(),
    remainingStock: z.number().nullable(),
    rentalId: z.string().nullable(),
    code: z.string(),
  }),
  tripEventSchema,
]);

export const chatMessagePayloadSchema = z.object({
  events: z.array(chatEventSchema),
});

export const chatMessageDtoSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: sessionRoleSchema,
  content: z.string(),
  payload: chatMessagePayloadSchema.nullable(),
  createdAt: z.string(),
});

export const sessionListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  messageCount: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const sessionIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
