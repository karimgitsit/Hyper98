'use client';
import { useEffect, useState } from 'react';

// Returns null until evaluated on the client, then the boolean match.
// SSR-safe: server render is always null so callers can render nothing
// pre-hydration and avoid a hydration mismatch / layout flicker.
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
