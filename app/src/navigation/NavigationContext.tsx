import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Route } from './types';

interface NavigationContextValue {
  route: Route;
  navigate: (route: Route) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

const INITIAL_ROUTE: Route = { name: 'landing' };

// Dedupe rule: never push a duplicate of the current route, where "duplicate"
// for parameterized routes means the *params* also match. Stops two taps on
// the same spaces row from stacking the same space twice.
function isSameRoute(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;
  if (a.name === 'space' && b.name === 'space') return a.spaceId === b.spaceId;
  if (
    (a.name === 'crossword' || a.name === 'cloze' || a.name === 'flashcards') &&
    (b.name === 'crossword' || b.name === 'cloze' || b.name === 'flashcards')
  ) {
    return a.name === b.name && a.puzzleId === b.puzzleId;
  }
  return true;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([INITIAL_ROUTE]);

  const route = stack[stack.length - 1] ?? INITIAL_ROUTE;

  const navigate = useCallback((next: Route) => {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      if (top && isSameRoute(top, next)) return prev;
      return [...prev, next];
    });
  }, []);

  const goBack = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const value = useMemo(
    () => ({ route, navigate, goBack }),
    [route, navigate, goBack],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
