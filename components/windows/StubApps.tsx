'use client';

export function AboutApp() {
  return (
    <div style={{ padding: 20, fontSize: 11, lineHeight: 1.6, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>hyper98</div>
      <div style={{ color: '#808080', marginBottom: 16 }}>Version 0.1.0</div>
      <div style={{ textAlign: 'left', padding: '0 20px' }}>
        A Windows 98–themed frontend for Hyperliquid.
        <br />
        <br />
        Trade perps and spot on Hyperliquid through a proper desktop
        environment. Draggable windows, real taskbar, no concessions.
        <br />
        <br />
        <b>hyper98.trade</b>
      </div>
      <div style={{ marginTop: 16, fontSize: 10, color: '#808080' }}>
        © 2026 hyper98. Not affiliated with Microsoft or Hyperliquid.
      </div>
    </div>
  );
}

export function ReadmeApp() {
  return (
    <div
      style={{
        padding: 12,
        fontFamily: '"Perfect DOS VGA 437", "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.5,
        background: '#fff',
        height: '100%',
        whiteSpace: 'pre-wrap',
        overflow: 'auto',
      }}
    >
{`hyper98 — readme.txt
====================

Welcome to hyper98, a Windows 98 themed frontend for
Hyperliquid — made for fun and with love for the
Hyperliquid community.

QUICK START
-----------
1. Click Start → Markets to browse available markets.
2. Double-click a market to open Trade + Chart + OrderBook.
3. Connect your wallet via Wallet.exe.
4. Approve the builder fee (5 bps) on first order.
5. Trade.

BUILDER CODE
------------
All orders placed through hyper98 include builder fee
attribution at 0.05% (5 basis points). This is shown
transparently in every order preview. You can review
or revoke this approval at any time via Wallet.exe.

HyperLiquid base fees (taker 0.045% / maker 0.015% at
VIP 0) are unaffected — the builder fee is on top.

Have fun.`}
    </div>
  );
}
