// The Unstable Unicorns wordmark: two lines of condensed rounded caps painted with the brand
// rainbow, with a striped horn standing in for the A of UNSTABLE.

export function Horn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="uu-horn" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#8fc94b" />
          <stop offset="1" stopColor="#25bbee" />
        </linearGradient>
        <mask id="uu-horn-stripes">
          <rect width="40" height="64" fill="#fff" />
          <polygon points="0,20 40,14 40,19 0,25" fill="#000" />
          <polygon points="0,36 40,30 40,35 0,41" fill="#000" />
          <polygon points="0,52 40,46 40,51 0,57" fill="#000" />
        </mask>
      </defs>
      <polygon points="20,0 39,64 1,64" fill="url(#uu-horn)" mask="url(#uu-horn-stripes)" />
    </svg>
  );
}

export function Wordmark({ size = 'lg', tagline = false }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean }) {
  return (
    <div className={`brand brand-${size}`}>
      <h1 className="wordmark" aria-label="Unstable Unicorns">
        <span className="wm-line" aria-hidden="true">
          UNST<span className="wm-horn"><Horn /></span>BLE
        </span>
        <span className="wm-line" aria-hidden="true">UNICORNS</span>
      </h1>
      {tagline && (
        <p className="tagline">
          <span>Build a unicorn army. Betray your friends.</span>
          <span>Unicorns are your friends now.</span>
        </p>
      )}
    </div>
  );
}
