'use client';

import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWindowStore, type WindowState } from '@/stores/windowStore';
import { WalletProvider } from '@/lib/wallet/WalletProvider';
import { AppWindow } from './AppWindow';
import { ConnectCorner } from './ConnectCorner';
import { DisconnectGuard } from './DisconnectGuard';
import { LoginDialog } from './LoginDialog';
import { Taskbar } from './Taskbar';
import {
  AboutApp,
  ReadmeApp,
} from '@/components/windows/StubApps';
import { MarketsApp } from '@/components/windows/MarketsApp';
import { MarketApp } from '@/components/windows/MarketApp';
import { PositionsApp } from '@/components/windows/PositionsApp';
import { WalletApp } from '@/components/windows/WalletApp';
import { ChartApp } from '@/components/windows/ChartApp';
import { OrderBookApp } from '@/components/windows/OrderBookApp';
import { OrdersApp } from '@/components/windows/OrdersApp';
import { FillsApp } from '@/components/windows/FillsApp';
import { Hip3App } from '@/components/windows/Hip3App';
import { PaintApp } from '@/components/windows/PaintApp';
import { MinesweeperApp } from '@/components/windows/MinesweeperApp';
import { SolitaireApp } from '@/components/windows/SolitaireApp';
import { Magic8BallApp } from '@/components/windows/Magic8BallApp';
import { CalculatorApp } from '@/components/windows/CalculatorApp';
import { AdminApp } from '@/components/windows/AdminApp';
import { SettingsApp } from '@/components/windows/SettingsApp';

function renderApp(w: WindowState): React.ReactNode {
  switch (w.type) {
    case 'chart': return <ChartApp windowId={w.id} />;
    case 'orderbook': return <OrderBookApp windowId={w.id} />;
    case 'market': return <MarketApp windowId={w.id} />;
    case 'markets': return <MarketsApp windowId={w.id} />;
    case 'positions': return <PositionsApp windowId={w.id} />;
    case 'orders': return <OrdersApp windowId={w.id} />;
    case 'wallet': return <WalletApp windowId={w.id} />;
    case 'hip3': return <Hip3App windowId={w.id} />;
    case 'fills': return <FillsApp windowId={w.id} />;
    case 'about': return <AboutApp />;
    case 'readme': return <ReadmeApp />;
    case 'paint': return <PaintApp windowId={w.id} />;
    case 'minesweeper': return <MinesweeperApp windowId={w.id} />;
    case 'solitaire': return <SolitaireApp windowId={w.id} />;
    case 'magic8ball': return <Magic8BallApp />;
    case 'calculator': return <CalculatorApp />;
    case 'admin': return <AdminApp windowId={w.id} />;
    case 'settings': return <SettingsApp windowId={w.id} />;
    default: return null;
  }
}

interface DesktopShellProps {
  bootDone: boolean;
}

/**
 * All wagmi/ConnectKit-dependent UI lives here so the whole tree can be
 * dynamic-imported from `app/page.tsx`. Keeping these imports off the
 * initial page chunk is the biggest first-load-JS win pre-launch — it
 * moves wagmi + viem + connectkit + walletconnect off the critical path.
 */
export function DesktopShell({ bootDone }: DesktopShellProps) {
  // Subscribe to the id set only — re-render the shell when a window is
  // opened or closed, not on every focus/move/resize. Each AppWindow
  // subscribes to its own slice so a focus change touches one component.
  const ids = useWindowStore(useShallow((s) => Object.keys(s.windows)));

  return (
    <WalletProvider>
      <ConnectCorner />
      {ids.map((id) => (
        <AppWindowById key={id} id={id} />
      ))}
      <Taskbar />
      <DisconnectGuard />
      <LoginDialog bootDone={bootDone} />
    </WalletProvider>
  );
}

const AppWindowById = React.memo(function AppWindowById({ id }: { id: string }) {
  const w = useWindowStore((s) => s.windows[id]);
  const body = React.useMemo(() => (w ? renderApp(w) : null), [w?.id, w?.type]);
  if (!w) return null;
  return <AppWindow window={w}>{body}</AppWindow>;
});
