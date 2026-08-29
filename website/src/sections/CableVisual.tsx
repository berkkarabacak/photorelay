/**
 * CableVisual — the product in one picture: a phone, a cable, a computer,
 * photos flowing across. Pure SVG + SMIL, no JS.
 */
export function CableVisual() {
  // Photo mosaics (deterministic pseudo-random via fixed pattern)
  const tiles = Array.from({ length: 24 }, (_, i) => i);
  const path = "M 190 330 C 260 330 260 420 330 420 C 400 420 430 300 500 300";

  return (
    <figure className="w-full max-w-xl">
      <svg viewBox="0 0 640 520" className="w-full" role="img" aria-label="A phone connected by cable to a computer, photos flowing across">
        {/* ---------- phone ---------- */}
        <rect x="30" y="180" width="130" height="250" rx="18" fill="#131316" stroke="#2c2c33" strokeWidth="1.5" />
        <rect x="42" y="196" width="106" height="200" rx="8" fill="#0b0d0c" stroke="#20261f" strokeWidth="1" />
        {/* photo tiles on phone */}
        {tiles.map((i) => (
          <rect
            key={i}
            x={50 + (i % 4) * 24}
            y={204 + Math.floor(i / 4) * 24}
            width="18"
            height="18"
            rx="3"
            fill={i % 5 === 0 ? "#34d399" : "#1d3a2f"}
            opacity={i % 5 === 0 ? 0.95 : 0.7}
          />
        ))}
        <circle cx="95" cy="415" r="8" fill="none" stroke="#2c2c33" strokeWidth="1.5" />

        {/* ---------- computer ---------- */}
        <rect x="500" y="160" width="120" height="200" rx="10" fill="#131316" stroke="#2c2c33" strokeWidth="1.5" />
        <rect x="510" y="172" width="100" height="150" rx="5" fill="#0b0d0c" stroke="#20261f" strokeWidth="1" />
        {/* tiles landing on computer, filling in */}
        {tiles.slice(0, 18).map((i) => (
          <rect
            key={i}
            x={516 + (i % 4) * 24}
            y={178 + Math.floor(i / 4) * 24}
            width="18"
            height="18"
            rx="3"
            fill={i % 4 === 0 ? "#34d399" : "#1d3a2f"}
            opacity={i % 4 === 0 ? 0.95 : 0.7}
          />
        ))}
        <rect x="548" y="360" width="24" height="26" fill="#131316" stroke="#2c2c33" strokeWidth="1.5" />
        <rect x="524" y="386" width="72" height="6" rx="3" fill="#1c1c21" />

        {/* ---------- cable ---------- */}
        <path d={path} fill="none" stroke="#2c2c33" strokeWidth="5" strokeLinecap="round" />
        <path d={path} fill="none" stroke="#34d399" strokeWidth="5" strokeLinecap="round" strokeDasharray="0.1 700" opacity="0.9" />

        {/* photos travelling the cable */}
        {[0, 1, 2].map((d) => (
          <g key={d}>
            <rect width="16" height="16" rx="3" fill="#34d399" x="-8" y="-8">
              <animateMotion dur="3.2s" begin={`${d * 1.05}s`} repeatCount="indefinite" path={path} />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur="3.2s" begin={`${d * 1.05}s`} repeatCount="indefinite" />
            </rect>
          </g>
        ))}

        {/* connector dots */}
        <circle cx="190" cy="330" r="7" fill="#34d399" />
        <circle cx="500" cy="300" r="7" fill="#34d399" />

        {/* subtle labels */}
        <text x="95" y="470" textAnchor="middle" fill="#5b5b66" fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="2">
          THE PHONE
        </text>
        <text x="560" y="470" textAnchor="middle" fill="#5b5b66" fontSize="13" fontFamily="ui-monospace, monospace" letterSpacing="2">
          THE COMPUTER
        </text>
      </svg>
      <figcaption className="mt-2 text-center text-kicker">Fig. 01 — the cable is the interface</figcaption>
    </figure>
  );
}
