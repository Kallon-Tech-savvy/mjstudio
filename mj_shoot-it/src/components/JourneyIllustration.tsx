/** Small inline vectors keep the photographic graphics crisp without image requests. */
export function JourneyIllustration({
  kind,
}: {
  kind: "discover" | "connect" | "keep";
}) {
  return (
    <div
      className={`journey-illustration illustration-${kind}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 100" fill="none" focusable="false">
        <title>Decorative studio illustration</title>
        <ellipse
          cx="80"
          cy="87"
          rx="52"
          ry="7"
          fill="currentColor"
          opacity=".08"
        />
        {kind === "discover" ? (
          <>
            <g transform="rotate(-12 70 48)">
              <rect
                x="28"
                y="15"
                width="65"
                height="68"
                rx="3"
                fill="#e0e4d5"
                stroke="currentColor"
                strokeOpacity=".25"
              />
            </g>
            <g className="illustration-front" transform="rotate(7 90 49)">
              <rect
                x="55"
                y="12"
                width="69"
                height="73"
                rx="3"
                fill="#fffefa"
                stroke="currentColor"
                strokeOpacity=".35"
              />
              <path d="M62 65V20h55v45H62Z" fill="#b8c9b1" />
              <circle cx="100" cy="31" r="7" fill="#f6f3ed" />
              <path d="m62 65 18-25 13 15 9-8 15 18" fill="#63816a" />
              <path d="M77 75h27" stroke="currentColor" strokeOpacity=".4" />
            </g>
          </>
        ) : kind === "connect" ? (
          <>
            <rect
              x="27"
              y="17"
              width="80"
              height="61"
              rx="6"
              fill="#fffefa"
              stroke="currentColor"
              strokeOpacity=".3"
            />
            <path
              d="M39 33h47M39 43h33M39 53h22"
              stroke="currentColor"
              strokeOpacity=".3"
              strokeLinecap="round"
            />
            <g className="illustration-front">
              <path
                d="M86 46h35a7 7 0 0 1 7 7v22a7 7 0 0 1-7 7h-20l-12 7v-7h-3a7 7 0 0 1-7-7V53a7 7 0 0 1 7-7Z"
                fill="#355b47"
              />
              <path
                d="M103 73s-13-8-13-15c0-7 9-9 13-3 4-6 13-4 13 3 0 7-13 15-13 15Z"
                fill="#f4e6d1"
              />
            </g>
          </>
        ) : (
          <>
            <path
              d="m31 41 48-18 50 18-49 21-49-21Z"
              fill="#dce3d2"
              stroke="currentColor"
              strokeOpacity=".3"
            />
            <path
              d="M31 41v30l49 20 49-20V41L80 62 31 41Z"
              fill="#b4c3a8"
              stroke="currentColor"
              strokeOpacity=".3"
            />
            <path d="M80 62v29" stroke="currentColor" strokeOpacity=".3" />
            <g className="illustration-front">
              <rect
                x="59"
                y="9"
                width="43"
                height="53"
                rx="3"
                fill="#fffefa"
                stroke="currentColor"
                strokeOpacity=".3"
              />
              <path
                d="m70 34 8 8 14-17"
                stroke="#355b47"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
