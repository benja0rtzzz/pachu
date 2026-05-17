import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Route } from './types';

interface NavigationContextValue {
  route: Route;
  navigate: (route: Route) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

const INITIAL_ROUTE: Route = { name: 'landing' };

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([INITIAL_ROUTE]);

  const route = stack[stack.length - 1] ?? INITIAL_ROUTE;

  const navigate = useCallback((next: Route) => {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.name === next.name) {
        if (next.name === 'crossword' || next.name === 'cloze' || next.name === 'flashcards') {
          if (
            (top.name === 'crossword' || top.name === 'cloze' || top.name === 'flashcards') &&
            top.puzzleId === next.puzzleId
          ) {
            return prev;
          }
        } else {
          return prev;
        }
      }
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
