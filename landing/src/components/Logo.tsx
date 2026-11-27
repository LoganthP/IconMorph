/** "Morphling": a tile mid-way through becoming a character. Mirrors the desktop app's LogoMark. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden="true">
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

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 1.27a11 11 0 0 0-3.48 21.46c.55.1.73-.24.73-.53v-1.85c-3.03.66-3.67-1.45-3.67-1.45-.5-1.26-1.21-1.6-1.21-1.6-.99-.68.08-.66.08-.66 1.09.08 1.67 1.12 1.67 1.12.97 1.66 2.54 1.18 3.16.9.1-.7.38-1.18.69-1.45-2.42-.27-4.96-1.21-4.96-5.38 0-1.19.42-2.16 1.12-2.92-.11-.28-.49-1.39.11-2.89 0 0 .92-.29 3 1.12a10.4 10.4 0 0 1 5.46 0c2.08-1.41 3-1.12 3-1.12.6 1.5.22 2.61.11 2.89.7.76 1.12 1.73 1.12 2.92 0 4.18-2.55 5.11-4.98 5.38.39.34.74 1.01.74 2.04v3.02c0 .29.19.63.74.53A11 11 0 0 0 12 1.27Z" />
    </svg>
  );
}
