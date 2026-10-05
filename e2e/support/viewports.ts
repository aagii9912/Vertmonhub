/**
 * The staff app is desktop-only since UI v3 (owner decision 2026-10-05): the narrowest
 * supported layout is a 1024px laptop. Specs that used to run a 390px phone variant run
 * this compact desktop instead, keeping their "no sideways scroll" checks meaningful.
 */
export const COMPACT_VIEWPORT = { width: 1024, height: 768 } as const;
