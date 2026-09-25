export type FairyExpression = "idle" | "thinking" | "speaking" | "happy";

export const FAIRY_EXPRESSIONS: readonly FairyExpression[] = [
  "idle",
  "thinking",
  "speaking",
  "happy",
];

export const FAIRY_EXPRESSION_LABEL_KEYS = {
  idle: "fairy.expression.idle",
  thinking: "fairy.expression.thinking",
  speaking: "fairy.expression.speaking",
  happy: "fairy.expression.happy",
} as const satisfies Record<FairyExpression, string>;

export type FairyAvatarSize = "sm" | "md" | "lg";

/**
 * 表情由前端可观测状态推导：庆祝事件优先（借阅成功），
 * 其次忙碌期按「是否已收到首个 token」区分思考与说话，其余待机。
 */
export function deriveFairyExpression(input: {
  busy: boolean;
  streaming: boolean;
  celebrating: boolean;
}): FairyExpression {
  if (input.celebrating) {
    return "happy";
  }
  if (input.busy) {
    return input.streaming ? "speaking" : "thinking";
  }
  return "idle";
}
