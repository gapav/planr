/**
 * Clean vector interpretation of the owner's angled goal-area reference.
 * The curves retain that reference's shallow perspective and 664:450 frame.
 * CSS crops this artwork; it never stretches its horizontal/vertical axes.
 */
export function CourtArtwork() {
  return <svg className="overview-court-art" viewBox="0 0 664 450" preserveAspectRatio="xMidYMid meet" fill="none" aria-hidden="true" focusable="false">
    <path d="M0 0H664V450H0Z" fill="var(--grep-lilac)" />
    <g transform="translate(664 0) scale(-1 1)">
      <path d="M-12 103 C98 137 242 211 307 291 C340 331 351 392 338 462 L-12 462Z" fill="var(--grep-apricot)" />
    </g>
    <g transform="translate(664 0) scale(-1 1)" stroke="#fffefd" strokeWidth="4" strokeLinecap="round" opacity=".86">
      <path d="M-12 103 C98 137 242 211 307 291 C340 331 351 392 338 462" />
      <path d="M-14 9 C172 12 371 93 500 198 C593 274 633 354 650 458" strokeDasharray="15 21" strokeWidth="3" />
      <path d="M178 137L223 159" />
    </g>
  </svg>;
}
