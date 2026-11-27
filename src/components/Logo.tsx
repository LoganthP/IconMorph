/** "Morphling": a tile mid-way through becoming a character. Mirrors assets/brand/mark.svg. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden>
      <defs>
        <path id="lm-b" d="M58 58 C50 40 50 24 56 14 C68 20 84 34 92 50 L108 50 C116 34 132 20 144 14 C150 24 150 40 142 58 C162 64 174 82 174 106 L174 136 C174 162 156 180 130 180 L70 180 C44 180 26 162 26 136 L26 106 C26 82 38 64 58 58 Z" />
        <clipPath id="lm-l"><path d="M0 0 H96 C86 70 120 120 100 200 H0 Z" /></clipPath>
        <clipPath id="lm-r"><path d="M96 0 C86 70 120 120 100 200 H200 V0 Z" /></clipPath>
      </defs>
      <use href="#lm-b" fill="#B7C9B2" clipPath="url(#lm-l)" />
      <use href="#lm-b" fill="#E8A68C" clipPath="url(#lm-r)" />
      <circle cx="76" cy="118" r="10" fill="#293B32" />
      <circle cx="126" cy="118" r="10" fill="#293B32" />
      <path d="M92 140 Q101 149 110 140" stroke="#293B32" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-[-0.03em] ${className ?? ""}`}>
      iconmorph<span className="text-peach">.</span>
    </span>
  );
}
