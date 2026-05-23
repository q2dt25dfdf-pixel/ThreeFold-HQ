"use client";

type DashboardHeroProps = {
  todayLabel: string;
};

export default function DashboardHero({ todayLabel }: DashboardHeroProps) {
  return (
    <section className="relative -mx-4 -mt-20 min-h-[520px] overflow-hidden rounded-none border border-slate-800/80 bg-[#020817] px-5 pb-8 pt-24 text-white shadow-[0_30px_90px_rgba(2,8,23,0.34)] sm:-mx-6 md:mx-0 md:mt-0 md:min-h-[420px] md:rounded-[2.25rem] md:px-12 md:py-14">
      <style jsx>{`
        @media (prefers-reduced-motion: no-preference) {
          .route-dash {
            animation: dashFlow 8s linear infinite;
          }
          .hub-pulse {
            animation: hubPulse 3.8s ease-in-out infinite;
          }
          .node-shimmer {
            animation: nodeShimmer 4.6s ease-in-out infinite;
          }
        }

        @keyframes dashFlow {
          to {
            stroke-dashoffset: -140;
          }
        }

        @keyframes hubPulse {
          0%, 100% {
            opacity: 0.34;
            transform: scale(0.92);
          }
          50% {
            opacity: 0.86;
            transform: scale(1.12);
          }
        }

        @keyframes nodeShimmer {
          0%, 100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_38%,rgba(37,99,235,0.26),transparent_28%),radial-gradient(circle_at_24%_18%,rgba(15,47,111,0.58),transparent_34%),linear-gradient(135deg,#020817_0%,#07122b_45%,#0b1d46_78%,#0f2f6f_120%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(96,165,250,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(96,165,250,0.14)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />
      <div className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-2/3 rounded-full bg-blue-600/18 blur-3xl" />

      <div className="relative z-10 grid min-h-[390px] grid-cols-1 gap-8 md:min-h-[300px] md:grid-cols-[0.9fr_1.25fr] md:items-center">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-300">Operations HQ</p>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{todayLabel}</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-[-0.07em] text-white sm:text-6xl md:text-7xl">
            Today at Threefold
          </h1>
          <p className="mt-5 text-lg font-semibold tracking-[-0.02em] text-blue-300 md:text-2xl">Made by three. Worn by all.</p>
          <div className="mt-7 h-px max-w-sm bg-gradient-to-r from-blue-300/40 to-transparent" />
          <p className="mt-7 max-w-sm text-2xl font-medium leading-tight tracking-[-0.04em] text-white md:text-3xl">
            Built in the Bay.<br />
            Delivered everywhere.
          </p>
        </div>

        <div className="relative min-h-[250px] md:min-h-[340px]">
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 760 440"
            role="img"
            aria-label="Abstract Bay Area logistics route map"
          >
            <defs>
              <filter id="heroGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="routeStroke" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.18" />
                <stop offset="45%" stopColor="#3b82f6" stopOpacity="0.92" />
                <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.24" />
              </linearGradient>
              <linearGradient id="bridgeLight" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#7f1d1d" stopOpacity="0.12" />
                <stop offset="50%" stopColor="#f97316" stopOpacity="0.62" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.24" />
              </linearGradient>
            </defs>

            <path
              d="M256 10 C284 42 294 82 286 118 C279 152 315 171 307 205 C297 246 332 273 320 317 C310 356 344 382 370 425"
              fill="none"
              stroke="#3b82f6"
              strokeOpacity="0.55"
              strokeWidth="2"
              filter="url(#heroGlow)"
            />
            <path
              d="M238 20 C214 70 226 120 208 162 C191 202 214 245 197 289 C181 330 204 373 218 430"
              fill="none"
              stroke="#2563eb"
              strokeOpacity="0.36"
              strokeWidth="1.4"
            />
            <path
              d="M284 62 C232 102 226 145 248 178 C271 211 249 245 276 280 C301 314 288 354 326 405"
              fill="none"
              stroke="#60a5fa"
              strokeOpacity="0.22"
              strokeWidth="1"
            />

            <g opacity="0.34">
              {[
                "M230 90 C260 116 300 128 328 154",
                "M224 154 C252 161 283 183 312 214",
                "M204 235 C246 230 289 246 324 278",
                "M274 107 C310 91 346 100 380 128",
                "M301 300 C348 309 393 332 430 367",
                "M184 302 C219 322 260 329 302 346",
              ].map((path) => (
                <path key={path} d={path} fill="none" stroke="#60a5fa" strokeWidth="0.8" strokeOpacity="0.42" />
              ))}
            </g>

            <path className="route-dash" d="M255 132 C348 128 420 156 493 232" fill="none" stroke="url(#routeStroke)" strokeWidth="1.8" strokeDasharray="16 14" strokeLinecap="round" />
            <path className="route-dash" d="M218 300 C326 256 410 257 493 232" fill="none" stroke="url(#routeStroke)" strokeWidth="1.8" strokeDasharray="18 16" strokeLinecap="round" />
            <path className="route-dash" d="M493 232 C560 180 628 144 735 151" fill="none" stroke="#93c5fd" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="20 18" strokeLinecap="round" />
            <path className="route-dash" d="M493 232 C578 282 642 326 720 396" fill="none" stroke="#60a5fa" strokeOpacity="0.48" strokeWidth="1.2" strokeDasharray="20 18" strokeLinecap="round" />

            <g filter="url(#heroGlow)">
              {[
                [255, 132],
                [304, 178],
                [218, 300],
                [366, 255],
                [493, 232],
                [590, 296],
                [654, 360],
              ].map(([cx, cy], index) => (
                <circle key={`${cx}-${cy}`} className="node-shimmer" cx={cx} cy={cy} r={index === 4 ? 5 : 3.2} fill="#dbeafe" />
              ))}
            </g>

            <g transform="translate(493 232)">
              <circle className="hub-pulse" r="37" fill="#2563eb" filter="url(#heroGlow)" />
              <circle r="19" fill="#2563eb" stroke="#93c5fd" strokeWidth="2" filter="url(#heroGlow)" />
              <circle r="7" fill="#eff6ff" />
              <text x="-40" y="57" fill="#f8fafc" fontSize="23" fontWeight="700" letterSpacing="2.5">BAY AREA</text>
            </g>

            <g className="hidden sm:block" opacity="0.72" transform="translate(430 300)">
              <path d="M0 72 H34 V34 H45 V72 H78 V20 H90 V72 H130 V42 H141 V72 H174 V29 H188 V72 H244" fill="#020817" opacity="0.9" />
              <path d="M0 72 H244" stroke="#60a5fa" strokeOpacity="0.25" />
              <circle cx="39" cy="30" r="1.4" fill="#dbeafe" opacity="0.7" />
              <circle cx="84" cy="16" r="1.4" fill="#dbeafe" opacity="0.7" />
              <circle cx="181" cy="25" r="1.4" fill="#dbeafe" opacity="0.7" />
            </g>

            <g className="hidden sm:block" transform="translate(500 252)" opacity="0.76">
              <path d="M0 118 C66 104 138 104 218 118" fill="none" stroke="url(#bridgeLight)" strokeWidth="4" strokeLinecap="round" />
              <path d="M20 112 C82 46 142 46 198 112" fill="none" stroke="#ef4444" strokeOpacity="0.34" strokeWidth="1.2" />
              <path d="M28 111 V30 M186 111 V30" stroke="#ef4444" strokeOpacity="0.5" strokeWidth="3" />
              <path d="M20 30 H36 M178 30 H194 M24 58 H33 M181 58 H190 M24 87 H33 M181 87 H190" stroke="#f97316" strokeOpacity="0.55" strokeWidth="2" />
              <path d="M28 30 C82 82 132 82 186 30" fill="none" stroke="#ef4444" strokeOpacity="0.24" strokeWidth="1" />
              {[28, 70, 112, 154, 196].map((cx) => (
                <circle key={cx} cx={cx} cy="118" r="1.6" fill="#fb923c" opacity="0.9" />
              ))}
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
