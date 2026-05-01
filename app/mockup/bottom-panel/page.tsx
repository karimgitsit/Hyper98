'use client';

/* eslint-disable @next/next/no-html-link-for-pages */

/**
 * MOCKUP — not wired to real data. Static fixtures only.
 * Goal: show a few layout options for a Hyperliquid-style bottom panel
 * that lives inside MarketApp (Open Orders / Order History / Trade History
 * / Funding History / Balances), so we can pick a direction before
 * building it for real.
 *
 * Visit /mockup/bottom-panel
 */

import { useState } from 'react';
import { useArrowKeyListNav } from '@/hooks/useArrowKeyListNav';

type Tab = 'open' | 'history' | 'fills' | 'funding' | 'balances';

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'open', label: 'Open Orders', count: 3 },
  { id: 'history', label: 'Order History', count: 24 },
  { id: 'fills', label: 'Trade History', count: 88 },
  { id: 'funding', label: 'Funding' },
  { id: 'balances', label: 'Balances' },
];

const FAKE_OPEN = [
  { time: '04/30 14:21:08', coin: 'BTC',  type: 'Limit / Gtc', side: 'BUY',  px: '88420.0', sz: '0.012',  filled: '—',          flags: '' },
  { time: '04/30 13:55:42', coin: 'BTC',  type: 'Limit / Gtc', side: 'SELL', px: '90100.0', sz: '0.008',  filled: '—',          flags: 'R' },
  { time: '04/30 11:02:17', coin: 'ETH',  type: 'Limit / Gtc', side: 'BUY',  px: '3200.40', sz: '0.50',   filled: '0.10/0.60',  flags: '' },
];

const FAKE_HISTORY = [
  { time: '04/30 09:41', coin: 'BTC', type: 'Limit', side: 'BUY',  px: '87900.0', sz: '0.020', status: 'Filled' },
  { time: '04/29 22:14', coin: 'SOL', type: 'Limit', side: 'SELL', px: '178.50',  sz: '12.0',  status: 'Cancelled' },
  { time: '04/29 18:02', coin: 'ETH', type: 'Market',side: 'BUY',  px: '3215.60', sz: '0.30',  status: 'Filled' },
  { time: '04/28 15:30', coin: 'BTC', type: 'Limit', side: 'SELL', px: '90400.0', sz: '0.010', status: 'Cancelled' },
];

const FAKE_FILLS = [
  { time: '04/30 09:41:22', coin: 'BTC', side: 'BUY',  px: '87900.0', sz: '0.020', pnl: '+12.40', fee: '0.18' },
  { time: '04/29 22:13:59', coin: 'SOL', side: 'SELL', px: '178.50',  sz: '6.0',   pnl: '-3.20',  fee: '0.05' },
  { time: '04/29 18:02:11', coin: 'ETH', side: 'BUY',  px: '3215.60', sz: '0.30',  pnl: '+0.00',  fee: '0.09' },
];

const FAKE_FUNDING = [
  { time: '04/30 14:00', coin: 'BTC', sz: '0.020', rate: '+0.0125%', payment: '-0.22' },
  { time: '04/30 13:00', coin: 'BTC', sz: '0.020', rate: '+0.0118%', payment: '-0.21' },
  { time: '04/30 12:00', coin: 'ETH', sz: '0.50',  rate: '-0.0042%', payment: '+0.07' },
];

const FAKE_BALANCES = [
  { asset: 'USDC', total: '4,128.42', avail: '2,210.18', inOrders: '1,918.24' },
  { asset: 'PURR', total: '12,400',   avail: '12,400',   inOrders: '0' },
  { asset: 'HYPE', total: '88.20',    avail: '88.20',    inOrders: '0' },
];

const NUM = { fontVariantNumeric: 'tabular-nums' as const };
const TH: React.CSSProperties = { textAlign: 'left', padding: '3px 6px', fontWeight: 700, fontSize: 10, borderBottom: '1px solid var(--bevel-dark-1)', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { padding: '2px 6px', whiteSpace: 'nowrap', fontSize: 11 };
const GREEN = 'var(--w98-green, #008000)';
const RED   = 'var(--w98-red, #c00000)';

export default function BottomPanelMockups() {
  return (
    <div style={{ background: '#008080', minHeight: '100vh', padding: 24, fontFamily: '"Perfect DOS VGA 437", "Courier New", monospace', fontSize: 12, color: '#000' }}>
      <h1 style={{ color: '#fff', fontSize: 18, marginBottom: 4 }}>Bottom Panel Mockups</h1>
      <p style={{ color: '#fff', opacity: 0.85, fontSize: 12, marginBottom: 24 }}>
        Hyperliquid-style tabbed panel for MarketApp. Pick one (or mix) to build for real.
        <br />Static data — buttons don&apos;t do anything.
      </p>

      <Section title="Variant A — Tabs at top, count badges, Cancel-All">
        <FakeMarket>
          <PanelA />
        </FakeMarket>
        <Notes>
          Closest to Hyperliquid. Tabs across the top with row counts in parens.
          Sticky header inside scroll area. <strong>Cancel</strong> on each row + <strong>Cancel All</strong> on right.
        </Notes>
      </Section>

      <Section title="Variant B — Tabs + per-coin filter toggle">
        <FakeMarket>
          <PanelB />
        </FakeMarket>
        <Notes>
          Same as A, plus a <strong>This coin only</strong> toggle on the right of the tab bar.
          Useful when you trade many coins but want the panel scoped to the chart you&apos;re looking at.
        </Notes>
      </Section>

      <Section title="Variant C — Collapsible (drag handle + chevron)">
        <FakeMarket>
          <PanelC />
        </FakeMarket>
        <Notes>
          Adds a drag-to-resize handle on the top edge and a collapse chevron in the tab bar.
          Lets you reclaim chart real estate when not actively managing orders.
        </Notes>
      </Section>

      <Section title="Variant D — Compact dropdown selector (saves vertical space)">
        <FakeMarket>
          <PanelD />
        </FakeMarket>
        <Notes>
          Replaces tab row with a dropdown. Smallest chrome, but hides the count badges.
          Good if vertical space is precious; worse for scannability.
        </Notes>
      </Section>
    </div>
  );
}

// ---- Layout shells -------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>{title}</h2>
      {children}
    </div>
  );
}

function Notes({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#fff', opacity: 0.85, fontSize: 11, marginTop: 6, maxWidth: 900 }}>
      {children}
    </div>
  );
}

/** Fake MarketApp frame so the panel mockup sits in something that looks
 *  like the real window (chart + book + trade) above it. Shapes only. */
function FakeMarket({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 1100,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--w98-bg)',
      border: '2px solid',
      borderColor: 'var(--bevel-light-1) var(--bevel-dark-1) var(--bevel-dark-1) var(--bevel-light-1)',
      boxShadow: '1px 1px 0 0 var(--bevel-dark-2)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '3px 4px',
        background: 'linear-gradient(90deg, var(--w98-titlebar-active-start, #000080) 0%, var(--w98-titlebar-active-end, #1084d0) 100%)',
        color: '#fff',
      }}>
        <span style={{ fontWeight: 700, fontSize: 11 }}>BTC/USDC — Market</span>
      </div>
      <div style={{ display: 'flex', height: 280, background: 'var(--w98-bg)', borderTop: '1px solid var(--bevel-dark-1)' }}>
        <FakePanel label="Chart" flex={2.6} dark />
        <FakePanel label="Order Book" flex={1} />
        <FakePanel label="Trade" flex={1.5} />
      </div>
      <div style={{ borderTop: '2px solid var(--bevel-dark-1)' }}>
        {children}
      </div>
    </div>
  );
}

function FakePanel({ label, flex, dark }: { label: string; flex: number; dark?: boolean }) {
  return (
    <div style={{ flex, minWidth: 0, borderLeft: '1px solid var(--bevel-dark-1)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '2px 4px', fontSize: 10, fontWeight: 700, color: '#404040', borderBottom: '1px solid var(--bevel-dark-1)' }}>
        {label}
      </div>
      <div style={{ flex: 1, background: dark ? '#000' : 'var(--w98-bg-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: dark ? '#404040' : '#808080', fontSize: 10 }}>
        (placeholder)
      </div>
    </div>
  );
}

// ---- Variant A -----------------------------------------------------------

function PanelA() {
  const [tab, setTab] = useState<Tab>('open');
  return (
    <div>
      <TabBar tab={tab} setTab={setTab} />
      <PanelBody tab={tab} showCancelAll />
    </div>
  );
}

// ---- Variant B -----------------------------------------------------------

function PanelB() {
  const [tab, setTab] = useState<Tab>('open');
  const [coinOnly, setCoinOnly] = useState(true);
  return (
    <div>
      <TabBar tab={tab} setTab={setTab}
        right={
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#404040' }}>
            <input type="checkbox" checked={coinOnly} onChange={(e) => setCoinOnly(e.target.checked)} />
            This coin only (BTC)
          </label>
        }
      />
      <PanelBody tab={tab} showCancelAll filterCoin={coinOnly ? 'BTC' : undefined} />
    </div>
  );
}

// ---- Variant C -----------------------------------------------------------

function PanelC() {
  const [tab, setTab] = useState<Tab>('open');
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div>
      {/* drag handle */}
      <div style={{ height: 4, background: 'var(--w98-bg-dark)', cursor: 'ns-resize', borderTop: '1px solid var(--bevel-light-1)', borderBottom: '1px solid var(--bevel-dark-2)' }} />
      <TabBar tab={tab} setTab={setTab}
        right={
          <button className="btn" style={{ fontSize: 10, padding: '0 6px', height: 16 }} onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? '▲' : '▼'}
          </button>
        }
      />
      {!collapsed && <PanelBody tab={tab} showCancelAll />}
    </div>
  );
}

// ---- Variant D -----------------------------------------------------------

function PanelD() {
  const [tab, setTab] = useState<Tab>('open');
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderBottom: '1px solid var(--bevel-dark-1)', background: 'var(--w98-bg)' }}>
        <select value={tab} onChange={(e) => setTab(e.target.value as Tab)} style={{ fontSize: 11 }}>
          {TABS.map((t) => <option key={t.id} value={t.id}>{t.label}{t.count != null ? ` (${t.count})` : ''}</option>)}
        </select>
        <button className="btn" style={{ marginLeft: 'auto', fontSize: 10, padding: '0 8px', height: 18 }}>Cancel All</button>
      </div>
      <PanelBody tab={tab} />
    </div>
  );
}

// ---- Shared bits ---------------------------------------------------------

function TabBar({ tab, setTab, right }: { tab: Tab; setTab: (t: Tab) => void; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--bevel-dark-1)', background: 'var(--w98-bg)' }}>
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '4px 10px',
              border: 'none',
              borderRight: '1px solid var(--bevel-dark-1)',
              background: active ? 'var(--w98-bg-light)' : 'transparent',
              fontWeight: active ? 700 : 400,
              fontSize: 11,
              cursor: 'pointer',
              borderBottom: active ? '2px solid var(--w98-bg-light)' : '2px solid transparent',
              marginBottom: -1,
              fontFamily: 'inherit',
            }}
          >
            {t.label}{t.count != null && <span style={{ color: '#606060', marginLeft: 4 }}>({t.count})</span>}
          </button>
        );
      })}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px' }}>
        {right}
      </div>
    </div>
  );
}

function PanelBody({ tab, showCancelAll, filterCoin }: { tab: Tab; showCancelAll?: boolean; filterCoin?: string }) {
  return (
    <div style={{ height: 180, overflow: 'hidden', background: 'var(--w98-bg-light)', borderTop: '1px solid var(--bevel-light-1)', display: 'flex', flexDirection: 'column' }}>
      {tab === 'open' && <OpenOrdersTable showCancelAll={showCancelAll} filterCoin={filterCoin} />}
      {tab === 'history' && <OrderHistoryTable />}
      {tab === 'fills' && <FillsTable />}
      {tab === 'funding' && <FundingTable />}
      {tab === 'balances' && <BalancesTable />}
    </div>
  );
}

// Wrapper that gives a table the same focus/keyboard/selection chrome:
// scroll container with tabIndex, arrow-key nav, and a render-prop for rows
// that gets `(item, isSelected, ref, onClick)`.
function SelectableTable<T>({
  rows,
  getId,
  header,
  renderRow,
  emptyMessage,
}: {
  rows: T[];
  getId: (r: T) => string;
  header: React.ReactNode;
  renderRow: (
    r: T,
    state: { isSelected: bool; selectedColor: string; mutedColor: string; rowProps: { ref: (el: HTMLElement | null) => void; onClick: () => void; style: React.CSSProperties } },
  ) => React.ReactNode;
  emptyMessage: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { onKeyDown, setRowRef } = useArrowKeyListNav<T>({
    items: rows,
    getId,
    selectedId: selected,
    setSelectedId: setSelected,
  });
  return (
    <div tabIndex={0} onKeyDown={onKeyDown} style={{ flex: 1, overflow: 'auto', outline: 'none' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {header}
        <tbody>
          {rows.map((r) => {
            const id = getId(r);
            const isSel = id === selected;
            const sel: React.CSSProperties = isSel
              ? { background: 'var(--w98-titlebar-active-start, #000080)', color: '#fff' }
              : {};
            return renderRow(r, {
              isSelected: isSel,
              selectedColor: '#fff',
              mutedColor: isSel ? '#dfdfdf' : '#606060',
              rowProps: {
                ref: setRowRef(id),
                onClick: () => setSelected(id),
                style: { cursor: 'default', ...sel },
              },
            });
          })}
          {rows.length === 0 && (
            <tr><td colSpan={99} style={{ textAlign: 'center', padding: 16, color: '#808080' }}>{emptyMessage}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Local alias so the inferred type stays readable in the component above.
type bool = boolean;

function OpenOrdersTable({ showCancelAll, filterCoin }: { showCancelAll?: boolean; filterCoin?: string }) {
  const rows = filterCoin ? FAKE_OPEN.filter((r) => r.coin === filterCoin) : FAKE_OPEN;
  return (
    <SelectableTable
      rows={rows}
      getId={(r) => `${r.time}-${r.coin}-${r.px}`}
      emptyMessage={`No open orders${filterCoin ? ` for ${filterCoin}` : ''}`}
      header={
        <thead>
          <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
            <th style={TH}>Time</th>
            <th style={TH}>Coin</th>
            <th style={TH}>Type</th>
            <th style={TH}>Side</th>
            <th style={{ ...TH, textAlign: 'right' }}>Price</th>
            <th style={{ ...TH, textAlign: 'right' }}>Size</th>
            <th style={{ ...TH, textAlign: 'right' }}>Filled</th>
            <th style={{ ...TH, textAlign: 'center' }}>Flags</th>
            <th style={{ ...TH, textAlign: 'center' }}>
              {showCancelAll && <button className="btn" style={{ fontSize: 9, padding: '0 6px', height: 14 }}>Cancel All</button>}
            </th>
          </tr>
        </thead>
      }
      renderRow={(r, { isSelected, mutedColor, rowProps }) => {
        const sideColor = isSelected ? '#fff' : (r.side === 'BUY' ? GREEN : RED);
        return (
          <tr key={`${r.time}-${r.coin}-${r.px}`} {...rowProps}>
            <td style={{ ...TD, ...NUM }}>{r.time}</td>
            <td style={{ ...TD, fontWeight: 700 }}>{r.coin}</td>
            <td style={TD}>{r.type}</td>
            <td style={{ ...TD, color: sideColor, fontWeight: 700 }}>{r.side === 'BUY' ? 'LONG' : 'SHORT'}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.px}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.sz}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right', color: mutedColor }}>{r.filled}</td>
            <td style={{ ...TD, textAlign: 'center', fontSize: 9, color: mutedColor }}>{r.flags}</td>
            <td style={{ ...TD, textAlign: 'center' }}>
              <button className="btn" style={{ fontSize: 9, padding: '0 6px', height: 14 }}>Cancel</button>
            </td>
          </tr>
        );
      }}
    />
  );
}

function OrderHistoryTable() {
  return (
    <SelectableTable
      rows={FAKE_HISTORY}
      getId={(r) => `${r.time}-${r.coin}-${r.px}`}
      emptyMessage="No order history"
      header={
        <thead>
          <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
            <th style={TH}>Time</th><th style={TH}>Coin</th><th style={TH}>Type</th><th style={TH}>Side</th>
            <th style={{ ...TH, textAlign: 'right' }}>Price</th><th style={{ ...TH, textAlign: 'right' }}>Size</th><th style={TH}>Status</th>
          </tr>
        </thead>
      }
      renderRow={(r, { isSelected, rowProps }) => {
        const sideColor = isSelected ? '#fff' : (r.side === 'BUY' ? GREEN : RED);
        const statusColor = isSelected ? '#fff' : (r.status === 'Filled' ? GREEN : '#606060');
        return (
          <tr key={`${r.time}-${r.coin}-${r.px}`} {...rowProps}>
            <td style={{ ...TD, ...NUM }}>{r.time}</td>
            <td style={{ ...TD, fontWeight: 700 }}>{r.coin}</td>
            <td style={TD}>{r.type}</td>
            <td style={{ ...TD, color: sideColor, fontWeight: 700 }}>{r.side}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.px}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.sz}</td>
            <td style={{ ...TD, color: statusColor }}>{r.status}</td>
          </tr>
        );
      }}
    />
  );
}

function FillsTable() {
  return (
    <SelectableTable
      rows={FAKE_FILLS}
      getId={(r) => `${r.time}-${r.coin}-${r.px}-${r.sz}`}
      emptyMessage="No trade history"
      header={
        <thead>
          <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
            <th style={TH}>Time</th><th style={TH}>Coin</th><th style={TH}>Side</th>
            <th style={{ ...TH, textAlign: 'right' }}>Price</th><th style={{ ...TH, textAlign: 'right' }}>Size</th>
            <th style={{ ...TH, textAlign: 'right' }}>PnL</th><th style={{ ...TH, textAlign: 'right' }}>Fee</th>
          </tr>
        </thead>
      }
      renderRow={(r, { isSelected, mutedColor, rowProps }) => {
        const pnlNum = parseFloat(r.pnl);
        const sideColor = isSelected ? '#fff' : (r.side === 'BUY' ? GREEN : RED);
        const pnlColor = isSelected ? '#fff' : (pnlNum > 0 ? GREEN : pnlNum < 0 ? RED : '#606060');
        return (
          <tr key={`${r.time}-${r.coin}-${r.px}-${r.sz}`} {...rowProps}>
            <td style={{ ...TD, ...NUM }}>{r.time}</td>
            <td style={{ ...TD, fontWeight: 700 }}>{r.coin}</td>
            <td style={{ ...TD, color: sideColor, fontWeight: 700 }}>{r.side}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.px}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.sz}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right', color: pnlColor }}>{r.pnl}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right', color: mutedColor }}>{r.fee}</td>
          </tr>
        );
      }}
    />
  );
}

function FundingTable() {
  return (
    <SelectableTable
      rows={FAKE_FUNDING}
      getId={(r) => `${r.time}-${r.coin}`}
      emptyMessage="No funding history"
      header={
        <thead>
          <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
            <th style={TH}>Time</th><th style={TH}>Coin</th>
            <th style={{ ...TH, textAlign: 'right' }}>Position</th>
            <th style={{ ...TH, textAlign: 'right' }}>Rate</th>
            <th style={{ ...TH, textAlign: 'right' }}>Payment</th>
          </tr>
        </thead>
      }
      renderRow={(r, { isSelected, rowProps }) => {
        const payNum = parseFloat(r.payment);
        const payColor = isSelected ? '#fff' : (payNum > 0 ? GREEN : payNum < 0 ? RED : '#606060');
        return (
          <tr key={`${r.time}-${r.coin}`} {...rowProps}>
            <td style={{ ...TD, ...NUM }}>{r.time}</td>
            <td style={{ ...TD, fontWeight: 700 }}>{r.coin}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.sz}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.rate}</td>
            <td style={{ ...TD, ...NUM, textAlign: 'right', color: payColor }}>{r.payment}</td>
          </tr>
        );
      }}
    />
  );
}

function BalancesTable() {
  return (
    <SelectableTable
      rows={FAKE_BALANCES}
      getId={(r) => r.asset}
      emptyMessage="No balances"
      header={
        <thead>
          <tr style={{ background: 'var(--w98-bg)', position: 'sticky', top: 0 }}>
            <th style={TH}>Asset</th>
            <th style={{ ...TH, textAlign: 'right' }}>Total</th>
            <th style={{ ...TH, textAlign: 'right' }}>Available</th>
            <th style={{ ...TH, textAlign: 'right' }}>In Orders</th>
          </tr>
        </thead>
      }
      renderRow={(r, { mutedColor, rowProps }) => (
        <tr key={r.asset} {...rowProps}>
          <td style={{ ...TD, fontWeight: 700 }}>{r.asset}</td>
          <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.total}</td>
          <td style={{ ...TD, ...NUM, textAlign: 'right' }}>{r.avail}</td>
          <td style={{ ...TD, ...NUM, textAlign: 'right', color: mutedColor }}>{r.inOrders}</td>
        </tr>
      )}
    />
  );
}
