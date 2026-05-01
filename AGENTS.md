# Agent instructions

You are working on hyper98.trade — a Windows 98 themed frontend for
Hyperliquid. Read `BRIEF.md` for context. This file tells you how to
work in this repo.

## Stack

- Next.js 15 (App Router) + TypeScript + React 19
- Zustand for global state
- react-rnd for window drag/resize primitives
- wagmi + viem + ConnectKit for wallet connection
- @nktkas/hyperliquid for the Hyperliquid SDK
- lightweight-charts for candlesticks
- No Tailwind. No component libraries beyond ConnectKit.
- Styling is raw CSS in `app/globals.css` using Win98 design tokens.

## Commands

```bash
npm install        # first-time setup
npm run dev        # dev server on localhost:3000
npm run build      # production build
npx tsc --noEmit   # typecheck
```

## Directory structure

```
app/              Next.js App Router pages + layout + globals.css
stores/           Zustand stores (windowStore, priceStore, userStore)
components/
  desktop/        Window manager, taskbar, start menu, desktop icons
  windows/        Per-app window contents (TradeApp, ChartApp, etc.)
  ui/             Win98 primitives + pixel icons
lib/
  hyperliquid/    SDK clients, agent wallet, builder fee logic
  wallet/         wagmi config + provider
```

## Rules

### Aesthetic (non-negotiable)

- No rounded corners anywhere. Zero. `border-radius: 0` is the default.
- No hover animations, no transitions, no smooth scroll.
- Depth comes from 2-tone bevel borders only:
  - Raised: `border-color: #fff #808080 #808080 #fff`
  - Sunken: `border-color: #808080 #fff #fff #808080`
  - Never use `box-shadow` for depth.
- Fonts: MS Sans Serif for UI. Monospace for numbers only. That's it.
- `image-rendering: pixelated` on every icon.
- Colors: use the CSS variables in `globals.css`. Do not introduce new
  colors without checking `:root` first.
- Win98 behaviors:
  - Click taskbar button when focused → minimize
  - Double-click title bar → maximize/restore
  - Click anywhere in window → focus + bring to front

### Code conventions

- All windows are opened via `useWindowStore((s) => s.open)`. Never
  render windows manually in page.tsx — the window store is the source
  of truth.
- Every app component receives `windowId: string` as its first prop and
  can use it to open sibling windows.
- WebSocket subscriptions must be tied to visible windows (not
  minimized). Use the `minimized` field from windowStore to pause
  subscriptions.
- Multiple windows watching the same coin share one subscription via
  the price/book stores. Reference-count unsubscribes.
- No `any`. If you need to silence TypeScript, add a `// TODO` comment
  explaining why and what proper type should go there.

### Trading safety

- All order placement goes through `lib/hyperliquid/orders.ts`. Do not
  call `exchangeClient.order()` directly from components.
- Every order must include the builder attribution:
  `builder: { b: BUILDER_ADDRESS, f: 50 }`. Never ship code that places
  orders without it.
- Default environment is testnet. Switching to mainnet requires
  explicit user confirmation (env variable, not just a code change).
- Builder fee approval check happens on first trade attempt, not on
  wallet connect. Do not prompt users to approve before they're trying
  to trade.
- Agent wallet approval: same — on first trade, not on connect.

### When adding a new window type

1. Add the type to `AppType` union in `stores/windowStore.ts`
2. Add defaults (title, dimensions) to `APP_DEFAULTS` in same file
3. Add icon to `components/ui/Icons.tsx` + register in `APP_ICONS`
4. Create component in `components/windows/`
5. Register in `renderApp()` switch in `app/page.tsx`
6. Add to Start menu in `components/desktop/StartMenu.tsx` if appropriate
7. Add to desktop icons in `components/desktop/DesktopIcons.tsx` if it's
   a top-level app (singleton)

### Before committing

- Run `npx tsc --noEmit` — must pass
- Run `npm run build` — must pass
- Verify in browser: all existing windows still open/close/drag/resize
- No console errors on page load

## Build plan

Working through weeks in order. Do not skip ahead.

- **Week 1** (done) — Window manager scaffold, all apps stubbed
- **Week 2** — Wallet connect, read-only SDK integration, real Markets +
  Positions + Wallet windows
- **Week 3** — Trade + OrderBook + Chart on testnet. First real orders
  with builder code attribution.
- **Week 4** — Orders, Fills, HIP-3 Markets, full Wallet app
- **Week 5** — Workspace save/load, window linking, right-click menus,
  sounds, BSOD on disconnect
- **Week 6** — Mainnet launch, revenue worker, admin dashboard

Current week: check the last entry in `CHANGELOG.md`. If unclear, ask.

## What to ask about, what to just do

**Just do:**
- Implement the current week's tasks following the plan
- Refactor for clarity when working in a file
- Fix bugs you find
- Add types where missing
- Update CHANGELOG.md at the end of each session

**Ask first:**
- Any change to the fee rate, builder address, or environment config
- Adding new dependencies
- Deviating from the aesthetic rules above
- Skipping ahead in the build plan
- Architectural changes to the window store or subscription lifecycle

## Known decisions

- Domain: hyper98.trade
- Builder fee: 0.05% (5 bps, `f: 50` in API)
- Wallet strategy: external wallets only via ConnectKit
- Mobile: explicitly not supported
- Default environment: testnet until week 6

## Open TODOs for the human

- Register hyper98.trade domain
- Grab social handles

Builder wallet `0x8Af168099F5D2A1A13fB8e72BA4657A8813901e3` is funded
and pinned in `lib/hyperliquid/constants.ts`; do not change it.
