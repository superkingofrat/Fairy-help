import type { FairyExpression } from "./expressions";

const TEAL = {
  light: "#5EEAD4",
  mid: "#2DD4BF",
  deep: "#0F766E",
} as const;

/** 全息光环底座：蓝白辉光圆环，所有表情共享 */
function HoloRing(): JSX.Element {
  return (
    <g data-part="ring" className="fairy-ring">
      <ellipse cx="50" cy="89" rx="23" ry="6" fill="url(#fairy-ring-glow)" />
      <ellipse
        cx="50"
        cy="89"
        rx="23"
        ry="6"
        fill="none"
        stroke="#38BDF8"
        strokeWidth="1.8"
        opacity="0.9"
      />
    </g>
  );
}

/** 半透明蝶翼：青绿半透明叠在身后 */
function Wings(): JSX.Element {
  return (
    <g data-part="wings" className="fairy-wings">
      <path
        d="M47 62 C 32 52, 14 50, 8 60 C 6 70, 20 76, 44 70 Z"
        fill="url(#fairy-wing)"
        className="fairy-wing"
      />
      <path
        d="M53 62 C 68 52, 86 50, 92 60 C 94 70, 80 76, 56 70 Z"
        fill="url(#fairy-wing)"
        className="fairy-wing"
      />
    </g>
  );
}

/** 黑白女仆裙装：白色上衣 + 黑色围裙 + 白裙边 + 青色领结 */
function MaidDress(): JSX.Element {
  return (
    <g data-part="dress">
      <path
        d="M36 60 Q50 53 64 60 L69 82 Q50 90 31 82 Z"
        fill="#F8FAFC"
        stroke="#CBD5E1"
        strokeWidth="0.8"
      />
      <path d="M41 73 Q50 69 59 73 L63 86 Q50 92 37 86 Z" fill="#1F2937" />
      <path d="M37 83.5 Q50 88.5 63 83.5 L63 86 Q50 91 37 86 Z" fill="#F8FAFC" />
      <path d="M46.5 60.5 L50 63.5 L53.5 60.5 L52 65.5 L50 67 L48 65.5 Z" fill={TEAL.mid} />
      <circle cx="50" cy="61.8" r="1.3" fill="#ECFEFF" />
    </g>
  );
}

function Eyes({ expression }: { expression: FairyExpression }): JSX.Element {
  if (expression === "happy") {
    return (
      <g
        data-part="eyes-happy"
        stroke="#1D4ED8"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M39.5 43 Q43.5 38.5 47.5 43" />
        <path d="M52.5 43 Q56.5 38.5 60.5 43" />
      </g>
    );
  }

  const eyes = (
    <g data-part="eyes">
      <ellipse cx="43.5" cy="42.5" rx="3.1" ry="4.2" fill="url(#fairy-eye)" />
      <ellipse cx="56.5" cy="42.5" rx="3.1" ry="4.2" fill="url(#fairy-eye)" />
      <circle cx="44.6" cy="41.2" r="1.05" fill="#EFF6FF" />
      <circle cx="57.6" cy="41.2" r="1.05" fill="#EFF6FF" />
      <rect
        className="fairy-eyelid"
        x="40.2"
        y="38"
        width="6.6"
        height="8.8"
        rx="2.6"
        fill="#FFE7D9"
      />
      <rect
        className="fairy-eyelid"
        x="53.2"
        y="38"
        width="6.6"
        height="8.8"
        rx="2.6"
        fill="#FFE7D9"
      />
    </g>
  );

  // 思考时视线偏移（看向右上的全息数据流）
  if (expression === "thinking") {
    return <g transform="translate(1.4 -1.6)">{eyes}</g>;
  }
  return eyes;
}

function Mouth({ expression }: { expression: FairyExpression }): JSX.Element {
  if (expression === "thinking") {
    return <ellipse data-part="mouth-think" cx="50" cy="51.8" rx="1.7" ry="2.1" fill="#9F1239" />;
  }
  if (expression === "speaking") {
    return (
      <ellipse
        data-part="mouth-speak"
        className="fairy-mouth"
        cx="50"
        cy="51.5"
        rx="2.8"
        ry="3.4"
        fill="#9F1239"
      />
    );
  }
  if (expression === "happy") {
    return <path data-part="mouth-happy" d="M44 48.5 Q50 57 56 48.5 Z" fill="#9F1239" />;
  }
  return (
    <path
      data-part="mouth-idle"
      d="M46.5 50 Q50 53.2 53.5 50"
      stroke="#B45309"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
  );
}

/** 思考表情：头顶三颗错峰流动的全息点点 */
function ThinkingDots(): JSX.Element {
  return (
    <g data-part="think-dots" className="fairy-think-dots">
      <circle className="fairy-think-dot" cx="38" cy="15" r="2" fill="#38BDF8" />
      <circle className="fairy-think-dot" cx="50" cy="12.5" r="2.2" fill="#38BDF8" />
      <circle className="fairy-think-dot" cx="62" cy="15" r="2" fill="#38BDF8" />
    </g>
  );
}

/** 开心表情：四周闪烁的星光 */
function Sparkles(): JSX.Element {
  const star = "M0 -4.5 Q1 -1 4.5 0 Q1 1 0 4.5 Q-1 1 -4.5 0 Q-1 -1 0 -4.5 Z";
  return (
    <g data-part="sparkles" className="fairy-sparkles">
      <path
        className="fairy-sparkle"
        d={star}
        transform="translate(18 30) scale(0.85)"
        fill="#FDE68A"
      />
      <path className="fairy-sparkle" d={star} transform="translate(82 26)" fill="#FDE68A" />
      <path
        className="fairy-sparkle"
        d={star}
        transform="translate(24 64) scale(0.6)"
        fill="#7DD3FC"
      />
    </g>
  );
}

/**
 * Fairy 自绘形象（纯 SVG，零素材）：青绿短发+呆毛、蓝瞳、白色女仆头饰、
 * 黑白裙装、半透明蝶翼、全息光环底座、蓝白主色。按 expression 切换五官部件。
 */
export function FairyFace({
  expression,
  motionClasses,
}: {
  expression: FairyExpression;
  motionClasses: string;
}): JSX.Element {
  return (
    <svg
      viewBox="0 0 100 100"
      className={["fairy-avatar-svg", motionClasses].filter(Boolean).join(" ")}
      role="presentation"
      focusable="false"
    >
      <defs>
        <linearGradient id="fairy-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TEAL.light} />
          <stop offset="100%" stopColor={TEAL.deep} />
        </linearGradient>
        <linearGradient id="fairy-eye" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <radialGradient id="fairy-wing" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(94,234,212,0.75)" />
          <stop offset="100%" stopColor="rgba(45,212,191,0.35)" />
        </radialGradient>
        <radialGradient id="fairy-ring-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(56,189,248,0.55)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0)" />
        </radialGradient>
      </defs>
      <HoloRing />
      <Wings />
      <MaidDress />
      <g className={expression === "thinking" ? "fairy-head-tilt" : undefined}>
        <ellipse cx="50" cy="39" rx="19" ry="18.5" fill="url(#fairy-hair)" />
        <path
          d="M31.5 38 Q33 21 50 21 Q67 21 68.5 38 Q63 27 50 28 Q37 27 31.5 38 Z"
          fill={TEAL.mid}
        />
        <path d="M31 40 Q28 52 33 60 L37 58 Q33 50 34.5 41 Z" fill={TEAL.mid} />
        <path d="M69 40 Q72 52 67 60 L63 58 Q67 50 65.5 41 Z" fill={TEAL.mid} />
        <path d="M50 22 Q55 10 67 7 Q60 15 57 26 Q54 24 50 22 Z" fill={TEAL.mid} />
        <ellipse cx="50" cy="42" rx="15.5" ry="14.5" fill="#FFE7D9" />
        <path
          d="M32.5 31 Q50 19 67.5 31 L66 35 Q50 24 34 35 Z"
          fill="#F8FAFC"
          stroke="#E2E8F0"
          strokeWidth="0.6"
        />
        <circle cx="29.5" cy="31" r="5.2" fill="#F8FAFC" />
        <circle cx="70.5" cy="31" r="5.2" fill="#F8FAFC" />
        <g stroke={TEAL.deep} strokeWidth="1.4" strokeLinecap="round" fill="none">
          <path d="M39.5 36.5 Q43 35 46.5 36.5" />
          <path d="M53.5 36.5 Q57 35 60.5 36.5" />
        </g>
        <Eyes expression={expression} />
        <Mouth expression={expression} />
        {expression === "happy" ? (
          <g fill="#FDA4AF" opacity="0.55">
            <ellipse cx="38.5" cy="48.5" rx="2.6" ry="1.5" />
            <ellipse cx="61.5" cy="48.5" rx="2.6" ry="1.5" />
          </g>
        ) : null}
      </g>
      {expression === "thinking" ? <ThinkingDots /> : null}
      {expression === "happy" ? <Sparkles /> : null}
    </svg>
  );
}
