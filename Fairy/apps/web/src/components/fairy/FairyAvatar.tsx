import { t } from "../../lib/i18n";
import {
  FAIRY_EXPRESSION_LABEL_KEYS,
  type FairyAvatarSize,
  type FairyExpression,
} from "./expressions";
import { FairyFace } from "./FairyFace";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import "./FairyAvatar.css";

interface FairyAvatarProps {
  /** 表情状态由调用方按可观测状态推导后传入，组件自身无内部状态机 */
  expression?: FairyExpression;
  size?: FairyAvatarSize;
  /** 装饰性小头像（如消息行）：不参与表情状态机，对读屏隐藏 */
  decorative?: boolean;
  className?: string;
}

/**
 * Fairy 拟人化形象（纯 CSS/SVG 自绘，零素材零依赖）。
 * 动效跟随系统「减弱动态效果」偏好降级为静态表情（matchMedia 开关 + CSS media 双保险）。
 */
export function FairyAvatar({
  expression = "idle",
  size = "md",
  decorative = false,
  className,
}: FairyAvatarProps): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();

  const wrapperClasses = [
    "fairy-avatar",
    `fairy-avatar--${size}`,
    reducedMotion ? "fairy-avatar--static" : undefined,
    className,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  // 静态模式不挂任何动画类，表情仅由五官形状区分
  const motionClasses = reducedMotion
    ? ""
    : ["fairy-float", "fairy-blink", `fairy-avatar--${expression}`].join(" ");

  return (
    <span
      className={wrapperClasses}
      data-testid={decorative ? "fairy-avatar-decorative" : "fairy-avatar"}
      data-expression={expression}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": t(FAIRY_EXPRESSION_LABEL_KEYS[expression]) })}
    >
      <FairyFace expression={expression} motionClasses={motionClasses} />
    </span>
  );
}
