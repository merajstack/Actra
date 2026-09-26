import React from 'react';

interface ActraLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showLabel?: boolean;
  className?: string;
}

const sizeMap = {
  sm: '20px',
  md: '48px',
  lg: '96px',
} as const;

const loaderStyles = `
  .actra-loader-stage {
    --actra-left: #FF7A1E;
    --actra-right: #F35400;
    --actra-flag: #FFC98A;
    --actra-bar: #C1440C;
    --actra-glow: rgba(243,84,0,0.55);
    position: relative;
    width: var(--actra-loader-size);
    height: var(--actra-loader-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }

  .actra-loader-halo {
    position: absolute;
    width: 70%;
    height: 70%;
    border-radius: 50%;
    background: radial-gradient(circle, var(--actra-glow) 0%, rgba(243,84,0,0) 70%);
    filter: blur(6px);
    animation: actra-loader-halo 3.2s ease-in-out infinite;
    opacity: 0;
  }

  .actra-loader-ring {
    position: absolute;
    inset: 6%;
    border-radius: 50%;
    border: 3px solid transparent;
    border-top-color: var(--actra-left);
    border-right-color: var(--actra-right);
    animation: actra-loader-spin 1.6s linear infinite;
    opacity: .85;
  }

  .actra-loader-mark {
    position: relative;
    width: 58%;
    height: 58%;
    overflow: visible;
    filter: drop-shadow(0 6px 18px rgba(0,0,0,.45));
  }

  .actra-loader-left-leg,
  .actra-loader-right-leg,
  .actra-loader-bar,
  .actra-loader-flag {
    transform-box: fill-box;
  }

  .actra-loader-left-leg {
    fill: var(--actra-left);
    transform-origin: 50% 100%;
    animation: actra-loader-rise-left 3.2s cubic-bezier(.34,1.56,.64,1) infinite;
  }

  .actra-loader-right-leg {
    fill: var(--actra-right);
    transform-origin: 50% 100%;
    animation: actra-loader-rise-right 3.2s cubic-bezier(.34,1.56,.64,1) infinite;
    animation-delay: .18s;
  }

  .actra-loader-bar {
    fill: var(--actra-bar);
    transform-origin: 50% 50%;
    animation: actra-loader-pop-bar 3.2s ease-out infinite;
    animation-delay: .55s;
  }

  .actra-loader-flag {
    fill: var(--actra-flag);
    transform-origin: 0% 100%;
    animation: actra-loader-flutter-flag 3.2s ease-out infinite;
    animation-delay: .78s;
  }

  .actra-loader-label {
    position: absolute;
    bottom: 8%;
    left: 0;
    right: 0;
    color: #8a5a3a;
    letter-spacing: .18em;
    font-size: 10px;
    font-weight: 600;
    text-align: center;
    text-transform: uppercase;
    white-space: nowrap;
    opacity: .75;
  }

  .actra-loader-label span {
    display: inline-block;
    animation: actra-loader-dot-fade 1.4s ease-in-out infinite;
  }

  .actra-loader-label span:nth-child(2) { animation-delay: .18s; }
  .actra-loader-label span:nth-child(3) { animation-delay: .36s; }

  @keyframes actra-loader-halo {
    0%, 15% { opacity: 0; transform: scale(.7); }
    30% { opacity: .55; transform: scale(1); }
    65% { opacity: .75; transform: scale(1.08); }
    88% { opacity: .25; transform: scale(1.05); }
    100% { opacity: 0; transform: scale(.9); }
  }

  @keyframes actra-loader-spin { to { transform: rotate(360deg); } }

  @keyframes actra-loader-rise-left {
    0%, 12% { transform: scaleY(0) translateY(0); opacity: 0; }
    26% { transform: scaleY(1.06); opacity: 1; }
    32%, 82% { transform: scaleY(1); opacity: 1; }
    93% { transform: scaleY(.98); opacity: .35; }
    100% { transform: scaleY(0); opacity: 0; }
  }

  @keyframes actra-loader-rise-right {
    0%, 16% { transform: scaleY(0) translateY(0); opacity: 0; }
    32% { transform: scaleY(1.06); opacity: 1; }
    38%, 82% { transform: scaleY(1); opacity: 1; }
    93% { transform: scaleY(.98); opacity: .35; }
    100% { transform: scaleY(0); opacity: 0; }
  }

  @keyframes actra-loader-pop-bar {
    0%, 46% { transform: scale(0); opacity: 0; }
    58% { transform: scale(1.15); opacity: 1; }
    64%, 82% { transform: scale(1); opacity: 1; }
    93% { transform: scale(.9); opacity: .35; }
    100% { transform: scale(0); opacity: 0; }
  }

  @keyframes actra-loader-flutter-flag {
    0%, 54% { transform: rotate(-40deg) scale(0); opacity: 0; }
    68% { transform: rotate(8deg) scale(1.1); opacity: 1; }
    74% { transform: rotate(-6deg) scale(1); opacity: 1; }
    80%, 82% { transform: rotate(0deg) scale(1); opacity: 1; }
    93% { transform: rotate(0deg) scale(.9); opacity: .35; }
    100% { transform: rotate(-10deg) scale(0); opacity: 0; }
  }

  @keyframes actra-loader-dot-fade {
    0%, 100% { opacity: .15; }
    50% { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .actra-loader-left-leg,
    .actra-loader-right-leg,
    .actra-loader-bar,
    .actra-loader-flag,
    .actra-loader-ring,
    .actra-loader-halo,
    .actra-loader-label span {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
  }
`;

export const ActraLoader: React.FC<ActraLoaderProps> = ({
  size = 'md',
  label = 'Loading',
  showLabel = false,
  className = '',
}) => (
  <span
    className={`actra-loader-stage ${className}`}
    style={{ '--actra-loader-size': sizeMap[size] } as React.CSSProperties}
    role="status"
    aria-label={label}
  >
    <style>{loaderStyles}</style>
    <span className="actra-loader-halo" aria-hidden="true" />
    <span className="actra-loader-ring" aria-hidden="true" />
    <svg className="actra-loader-mark" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon className="actra-loader-left-leg" points="255,150 75,435 195,435" />
      <polygon className="actra-loader-right-leg" points="352,60 300,435 430,435" />
      <rect className="actra-loader-bar" x="222" y="285" width="78" height="75" />
      <polygon className="actra-loader-flag" points="349,55 415,60 447,155" />
    </svg>
    {showLabel && (
      <span className="actra-loader-label" aria-hidden="true">
        {label}<span>.</span><span>.</span><span>.</span>
      </span>
    )}
  </span>
);
