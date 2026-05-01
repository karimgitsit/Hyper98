'use client';

import { useEffect } from 'react';
import { useWindowStore } from '@/stores/windowStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { marketTitle } from '@/lib/windowTitles';
import { ChartApp } from './ChartApp';
import { OrderBookApp } from './OrderBookApp';
import { TradeApp } from './TradeApp';
import { SpotTradeApp } from './SpotTradeApp';
import { MarketBottomPanel } from './MarketBottomPanel';

export type Section = 'chart' | 'orderbook';

const DEFAULT_SECTIONS_PERPS: Section[] = ['chart', 'orderbook'];
const DEFAULT_SECTIONS_SPOT: Section[] = ['chart', 'orderbook'];

const SECTION_LABELS: Record<Section, string> = {
  chart: 'Chart',
  orderbook: 'Order Book',
};

// Flex weights per section when rendered side-by-side
const SECTION_FLEX: Record<Section, number> = {
  chart: 2.6,
  orderbook: 1,
};

// Trade panel is fixed inside the perps Market window — never popped out
// (per design: trading without a chart is redundant; users open a market
// from Markets.exe to get chart + book + trade together).
const TRADE_FLEX = 1.5;

// Standalone window defaults used when popping a section out
const POPOUT_DIMENSIONS: Record<Section, { width: number; height: number }> = {
  chart: { width: 480, height: 340 },
  orderbook: { width: 220, height: 360 },
};

export function MarketApp({ windowId }: { windowId: string }) {
  const win = useWindowStore((s) => s.windows[windowId]);
  const updateProps = useWindowStore((s) => s.updateProps);
  const setTitle = useWindowStore((s) => s.setTitle);
  const openWindow = useWindowStore((s) => s.open);
  const closeWindow = useWindowStore((s) => s.close);

  const props = win?.props ?? {};
  const coin = (props.coin as string | undefined) ?? 'BTC';
  const kind = (props.kind as 'perps' | 'spot' | undefined) ?? 'perps';
  const hip3Dex = props.hip3Dex as string | undefined;
  const rawSections = props.sections as Section[] | undefined;
  const isFavorite = useFavoritesStore((s) => s.isFavorite(coin, kind, hip3Dex));
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const sections: Section[] =
    rawSections && rawSections.length > 0
      ? rawSections
      : kind === 'spot'
        ? DEFAULT_SECTIONS_SPOT
        : DEFAULT_SECTIONS_PERPS;

  // Initialize persisted `sections` prop so later pop-outs have something to remove.
  useEffect(() => {
    if (!rawSections) {
      updateProps(windowId, { sections });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep window title (titlebar + taskbar) in sync when the user switches
  // markets via the in-window dropdown — otherwise the chrome still names
  // the original market while the panels show a different one.
  useEffect(() => {
    setTitle(windowId, marketTitle('market', coin, kind));
  }, [coin, kind, windowId, setTitle]);

  // For spot windows there is no fixed Trade panel, so closing the unified
  // window when every poppable section is gone still makes sense. For perps
  // the Trade panel is always there, so the window only closes if the user
  // explicitly closes it.
  useEffect(() => {
    if (kind === 'spot' && rawSections && rawSections.length === 0) {
      closeWindow(windowId);
    }
  }, [kind, rawSections, closeWindow, windowId]);

  const popOut = (section: Section) => {
    if (!win) return;
    const dim = POPOUT_DIMENSIONS[section];
    // Position the standalone window near the unified window's edge
    const x = Math.max(20, Math.min(win.x + win.width + 12, window.innerWidth - dim.width - 20));
    const y = Math.max(20, Math.min(win.y, window.innerHeight - dim.height - 40));
    openWindow(section, {
      title: marketTitle(section, coin, kind),
      props: { coin, kind },
      x,
      y,
    });
    const nextSections = sections.filter((s) => s !== section);
    updateProps(windowId, { sections: nextSections });
  };

  // Stack vertically when the window is narrow
  const stacked = (win?.width ?? 0) < 700;

  if (!win) return null;

  // Both perps and spot get a fixed Trade panel — perps via TradeApp
  // (leverage, margin mode, TP/SL), spot via SpotTradeApp (simple
  // buy/sell against the user's spot balance, no leverage). Switching
  // pairs in Markets.exe re-uses the same Market window and updates
  // `kind`, so this has to react on every render.
  const showTrade = true;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'var(--w98-bg)',
      }}
    >
      {/* Top row: chart / book / trade. Flex-grows so the bottom panel
          gets a fixed slice (220px) at the bottom. */}
      <div
        style={{
          display: 'flex',
          flexDirection: stacked ? 'column' : 'row',
          flex: 1,
          minHeight: 0,
          gap: 2,
        }}
      >
        {sections.map((section, idx) => (
          <div
            key={section}
            style={{
              flex: SECTION_FLEX[section],
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              borderLeft: !stacked && idx > 0 ? '1px solid var(--bevel-dark-1)' : undefined,
              borderTop: stacked && idx > 0 ? '1px solid var(--bevel-dark-1)' : undefined,
            }}
          >
            <SectionHeader label={SECTION_LABELS[section]} onPopOut={() => popOut(section)} />
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
              {section === 'chart' && <ChartApp windowId={windowId} />}
              {section === 'orderbook' && <OrderBookApp windowId={windowId} />}
            </div>
          </div>
        ))}
        {showTrade && (
          <div
            style={{
              flex: TRADE_FLEX,
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              borderLeft: !stacked && sections.length > 0 ? '1px solid var(--bevel-dark-1)' : undefined,
              borderTop: stacked && sections.length > 0 ? '1px solid var(--bevel-dark-1)' : undefined,
            }}
          >
            <SectionHeader
              label={kind === 'spot' ? 'Spot Trade' : 'Trade'}
              leftAction={
                <FavoriteStar
                  active={isFavorite}
                  onClick={() => toggleFavorite({ coin, kind, hip3Dex })}
                  label={
                    isFavorite
                      ? `Remove ${coin} from Favorites`
                      : `Add ${coin} to Favorites`
                  }
                />
              }
            />
            <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
              {kind === 'spot' ? (
                <SpotTradeApp windowId={windowId} />
              ) : (
                <TradeApp windowId={windowId} />
              )}
            </div>
          </div>
        )}
      </div>
      {/* Bottom panel: account-wide tabs (orders / fills / funding / balances). */}
      <div
        style={{
          height: 220,
          flexShrink: 0,
          borderTop: '2px solid var(--bevel-dark-1)',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <MarketBottomPanel coin={coin} />
      </div>
    </div>
  );
}

function SectionHeader({
  label,
  onPopOut,
  leftAction,
}: {
  label: string;
  onPopOut?: () => void;
  leftAction?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '2px 4px',
        background: 'var(--w98-bg)',
        borderBottom: '1px solid var(--bevel-dark-1)',
        fontSize: 10,
        fontWeight: 700,
        gap: 4,
        flexShrink: 0,
      }}
    >
      <span style={{ color: '#404040' }}>{label}</span>
      {leftAction}
      {onPopOut && (
        <button
          className="pill-btn"
          onClick={onPopOut}
          title={`Pop ${label} out into its own window`}
          style={{
            marginLeft: 'auto',
            fontSize: 9,
            padding: '0 4px',
            height: 14,
            lineHeight: '12px',
          }}
        >
          Pop out ↗
        </button>
      )}
    </div>
  );
}

function FavoriteStar({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      aria-pressed={active}
      style={{
        marginLeft: 'auto',
        background: 'transparent',
        border: 'none',
        padding: '0 4px',
        fontSize: 12,
        lineHeight: '14px',
        height: 14,
        cursor: 'var(--click-cursor, default)',
        color: active ? '#c79b00' : '#808080',
      }}
    >
      {active ? '★' : '☆'}
    </button>
  );
}
