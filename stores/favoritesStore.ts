import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type FavoriteKind = 'perps' | 'spot';

export interface FavoriteEntry {
  coin: string;
  kind: FavoriteKind;
  /** Set for HIP-3 markets — distinguishes "TSLA" on one deployer from another. */
  hip3Dex?: string;
}

interface FavoritesState {
  favorites: FavoriteEntry[];
  toggle: (entry: FavoriteEntry) => void;
  isFavorite: (coin: string, kind: FavoriteKind, hip3Dex?: string) => boolean;
  remove: (coin: string, kind: FavoriteKind, hip3Dex?: string) => void;
}

function sameEntry(a: FavoriteEntry, coin: string, kind: FavoriteKind, hip3Dex?: string): boolean {
  return a.coin === coin && a.kind === kind && (a.hip3Dex ?? null) === (hip3Dex ?? null);
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggle: (entry) => {
        const existing = get().favorites;
        const found = existing.some((f) => sameEntry(f, entry.coin, entry.kind, entry.hip3Dex));
        if (found) {
          set({
            favorites: existing.filter(
              (f) => !sameEntry(f, entry.coin, entry.kind, entry.hip3Dex),
            ),
          });
        } else {
          const clean: FavoriteEntry = {
            coin: entry.coin,
            kind: entry.kind,
            ...(entry.hip3Dex ? { hip3Dex: entry.hip3Dex } : {}),
          };
          set({ favorites: [...existing, clean] });
        }
      },
      isFavorite: (coin, kind, hip3Dex) =>
        get().favorites.some((f) => sameEntry(f, coin, kind, hip3Dex)),
      remove: (coin, kind, hip3Dex) =>
        set({
          favorites: get().favorites.filter(
            (f) => !sameEntry(f, coin, kind, hip3Dex),
          ),
        }),
    }),
    {
      name: 'hyper98:favorites',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
