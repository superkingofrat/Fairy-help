import { useEffect, useState } from "react";
import { deriveFairyExpression, type FairyExpression } from "./expressions";

/** 开心表情持续时长（毫秒）——借阅成功后的短暂庆祝，随后回退当前真实状态 */
export const FAIRY_HAPPY_DURATION_MS = 2000;

export interface UseFairyExpressionResult {
  expression: FairyExpression;
  celebrate: () => void;
}

/**
 * 把流式/忙碌状态推导成表情，并提供一次性庆祝入口（借阅成功）。
 * 组件本身不持有表情状态机，调用方只喂可观测状态，便于测试与复用。
 */
export function useFairyExpression(input: {
  busy: boolean;
  streaming: boolean;
}): UseFairyExpressionResult {
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (!celebrating) {
      return;
    }
    const timer = setTimeout(() => setCelebrating(false), FAIRY_HAPPY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [celebrating]);

  return {
    expression: deriveFairyExpression({ ...input, celebrating }),
    celebrate: () => setCelebrating(true),
  };
}
