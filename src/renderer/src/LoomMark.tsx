/**
 * Loom's mark, in the toolbar beside the wordmark.
 *
 * The warp thread running top to bottom, and the weft looped around it - once to
 * the right, once to the left. Drawn inline rather than loaded from the packaged
 * icon: it sits at 20px next to 20px text, where a downscaled bitmap is soft
 * exactly where the eye is most critical.
 *
 * The geometry is `scripts/generate-icon.mjs`'s full drawing, so the mark in the
 * window and the mark in the taskbar are one drawing. Change one, change the
 * other.
 */
export function LoomMark({ size = 20 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="url(#loom-madder)"
      strokeWidth={11}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <defs>
        {/* userSpaceOnUse, not the objectBoundingBox default. Two reasons, and
            the first is a hard bug: the warp is a vertical line, so its bounding
            box has zero width, and a bounding-box gradient on a zero-width shape
            renders nothing at all - the warp simply vanished. The second is that
            one ramp should span the whole mark rather than restart inside every
            path, which is also what the icon generator does. */}
        <linearGradient id="loom-madder" gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="90" y2="90">
          <stop offset="0" stopColor="#e9664c" />
          <stop offset="1" stopColor="#ba3842" />
        </linearGradient>
      </defs>
      {/* The warp. */}
      <path d="M50 8.5 V91.5" />
      {/* The weft, out to the right and back. */}
      <path d="M50 17 C76 17 83 24 83 31.5 C83 39 76 45 50 45" />
      {/* And out to the left, lower down - the offset is what keeps the whole
          thing from reading as a letter. */}
      <path d="M50 55 C24 55 17 61 17 68.5 C17 76 24 83 50 83" />
    </svg>
  )
}
