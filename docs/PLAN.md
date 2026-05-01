# Trade UX Parity Plan

Source-of-truth roadmap for bringing the open-trade and close-trade UX up
to parity (and in places past) Hyperliquid's perps UI, while keeping the
Win98 aesthetic.

**Environment.** Production runtime is mainnet
(`NEXT_PUBLIC_HL_NETWORK=mainnet` in `.env.local`). For trade-flow
development — anything that places an order from a new code path
(TP/SL, partial close, Close All, etc.) — flip `.env.local` back to
`testnet` while iterating, then flip to mainnet for a final smoke
before merging. Merged code must work on mainnet (the runtime
default). Do not modify `BUILDER_ADDRESS`, `BUILDER_FEE`, or the
network parsing in `lib/hyperliquid/constants.ts`.

**Process:** one PR per conversation. Save state on disk (this file +
CHANGELOG.md), keep each conversation tightly scoped. See "PR sequence"
at the bottom.

## Comparison summary (why these items)

The full side-by-side comparison was done in the 2026-04-28 session — see
that CHANGELOG entry. Headline gaps vs Hyperliquid:

- No live liquidation price / margin required / order value preview
- No TP/SL on entry
- No margin-mode toggle (cross is implicit)
- Leverage is a fixed-step `<select>`, not a slider with risk warning
- Size unit is coin-only (no USD-denominated input)
- Close is all-or-nothing market only — no partial, no limit-close, no
  Close All, no TP/SL on existing positions

Things hyper98 already wins on (preserve):
- Bid/Mid/Ask price pills (HL only has Mid)
- Inline builder-fee approval flow on first trade
- TESTNET/MAINNET label always visible
- Themed Win98 dialogs vs HL's toasts
- Order-book click → fill price (parity)

## Milestones

### M0 — Shared primitives ✅ DONE 2026-04-23

Shipped (see CHANGELOG 2026-04-23). Nothing to do here. Quick reference:

- ✅ `components/ui/RightClickMenu.tsx` — alias of existing `ContextMenu`.
- ✅ `components/ui/LeverageDialog.tsx` — slider 1→maxLev with liq-risk
  warning at ≥80% of maxLev.
- ✅ `components/ui/MarginModeDialog.tsx` — Cross/Isolated picker. Note:
  the two-step confirm for `hasOpenPosition: true` is **already baked
  into the dialog** — caller just passes the flag.
- ✅ `lib/hyperliquid/preview.ts` (+ `.mjs` for `node --test`) —
  `orderValue`, `marginRequired`, `liquidationPrice`. 11 passing tests
  in `lib/hyperliquid/__tests__/preview.test.mjs`. Default
  `maintenanceMarginFrac = 0.005`; threading per-asset mmf from
  `priceStore.meta.universe` is a TODO for M1.1.
- ✅ `lib/hyperliquid/orders.ts` extended: new `OrderGrouping`,
  `TriggerSpec`, `PlaceOrderInput.triggerOrders`/`grouping`,
  `buildOrdersArray`, `effectiveGrouping`. Defaults to `positionTpsl`
  grouping when triggers are present; triggers are reduce-only on
  opposite side at entry size. Builder attribution preserved on both
  `placeOrder` and `placeOrderViaAgent`.

Open question still owed (was punted from M0): can one signed `order`
action carry mixed-asset reduce-only orders for Close All? Resolve in
the M2.5 conversation, not now.

### M1 — Order entry depth (`components/windows/TradeApp.tsx`)

1. **Live readouts** in Order Preview: Liq Px, Order Value, Margin Req.
2. **Size unit toggle** (coin ↔ USD) on the Size row.
3. **Numeric % input** next to size slider.
4. **Leverage slider modal** — replace `<select>` with pill `10x ▾` →
   `LeverageDialog`.
5. **Margin mode pill** `Cross ▾` + dialog. **If user has open
   positions on that asset, show a second confirm step — matches HL.**
6. **Inline TP/SL** toggle: TP Price + Gain%, SL Price + Loss%. Bracket
   order sent as one signed batch with triggers `reduceOnly: true`.
7. **Available + Position two-row header** replacing the single "Avail"
   line.

### M2 — Position management (`components/windows/PositionsApp.tsx`)

1. **Partial close** in confirm dialog: 25/50/75/100 + custom size.
2. **Limit Close…** second action per row (Bid/Mid/Ask pills,
   reduce-only GTC).
3. **Right-click menu** per row (uses M0 primitive): Market Close ·
   Limit Close… · Set TP/SL… · Adjust Leverage… · Adjust Margin… ·
   Reduce 50%.
4. **Set TP/SL for existing positions** + TP/SL columns in the table.
5. **Close All** toolbar button — **batch into one signed action,
   matching HL.** Confirm dialog lists positions + total notional.
6. **Margin and Funding columns** in the table.

### M3 — Polish

1. **OrderBook click variants** in `components/windows/OrderBookApp.tsx`
   (~line 149): shift+click flips side, double-click fills price+size.
2. **Big-order warning** dialog when `notional > withdrawable * 0.5`.
3. **Header info parity** — Oracle Px, 24h funding rate, funding
   countdown in TradeApp header.
4. **Fee-tier strike-through** — show base fee struck through next to
   actual when discounted.
5. **Sounds** on fill / reject under `public/sounds/`, with a
   settings-store `audio.muted` slice.

## Cross-cutting rules (per AGENTS.md)

- Every order routes through `lib/hyperliquid/orders.ts`. No direct
  `exchangeClient.order(` in components.
- Every order includes `builder: { b: BUILDER_ADDRESS, f: 50 }`.
- Builder-fee + agent-key approval on **first trade**, not on connect.
- Windows respect `minimized` for subscription pausing.
- No `any`. No `box-shadow` for depth. No `border-radius`. No
  transitions.
- `npx tsc --noEmit` and `npm run build` must pass before merge.
- Update `CHANGELOG.md` at the end of each milestone.

## Spike status

- **TP/SL trigger-order shape:** ✅ resolved during M0. The SDK shape is
  `{ trigger: { isMarket, triggerPx, tpsl: 'tp' | 'sl' } }` per
  per-order entry, sent in one signed `order` action with
  `grouping: 'positionTpsl'`. Already implemented in
  `lib/hyperliquid/orders.ts` (`buildOrdersArray`, `effectiveGrouping`).
- **Cross-asset Close All batch:** ❌ still open. Owed by the M2.5
  conversation. Read `node_modules/@nktkas/hyperliquid/**` to confirm
  one signed `order` action can mix asset indices for reduce-only
  closes. If not, fall back to N parallel signed actions.

## PR sequence

One PR per conversation, in order. Don't skip ahead.

1. ~~**Spike + M0** — primitives, preview math, `placeOrder` extension.~~
   ✅ Done 2026-04-23.
2. **M1.1 + M1.7** ← next up — readouts + two-row header. Small, no API risk.
3. **M1.4 + M1.5** — leverage slider + margin-mode pill (with open-
   position confirm step).
4. **M1.6** — TP/SL on entry. Biggest single feature, isolated PR.
5. **M1.2 + M1.3** — size unit toggle + numeric % input.
6. **M2.1 + M2.2** — partial close + limit close.
7. **M2.3 + M2.4 + M2.5 + M2.6** — right-click menu, TP/SL on existing
   positions, Close All, Margin/Funding columns.
8. **M3.1 → M3.5** — one PR per polish item.

## Subagent usage

- **SDK spike** in conversation 1 — `general-purpose` agent reads
  `node_modules/@nktkas/hyperliquid/**` and reports the trigger-order
  shape in <300 words.
- **Builder-fee audit** before M0 ships — "find every call site of
  `exchangeClient.order(` outside `lib/hyperliquid/orders.ts`".
- **Independent code review** before merging each PR — `general-purpose`
  agent with no design context.
- **Parallel investigations** when needed (e.g. M1.5 needs both "how
  does HL handle margin-mode change with open positions" AND "what does
  the SDK expose for `updateIsolatedMargin`" — fire in one message).

Don't delegate the actual implementation — the parent loses
understanding of the code and review becomes shallow.

## Kickoff prompt (paste into a new conversation — M2.3 + M2.4 + M2.5 + M2.6)

> You're picking up trade-UX work on hyper98.trade at
> `/Users/karim/Desktop/Hyper98`. Read `AGENTS.md`, `BRIEF.md`, and
> `docs/PLAN.md` (full roadmap) before doing anything.
>
> **Network.** Production runtime is mainnet
> (`NEXT_PUBLIC_HL_NETWORK=mainnet` in `.env.local`). Flip to `testnet`
> while iterating any new order path, then back to mainnet for the
> final smoke before merging. Do not modify `BUILDER_ADDRESS`,
> `BUILDER_FEE`, or the network parsing in
> `lib/hyperliquid/constants.ts`.
>
> **Scope of this conversation: M2.3 + M2.4 + M2.5 + M2.6 only —
> right-click menu, TP/SL on existing positions, Close All toolbar
> button, Margin / Funding columns in `PositionsApp.tsx`.** Stop after
> the PR is ready for review. Do not skip ahead.
>
> M0, M1.1–M1.7, and M2.1+M2.2 are done (see CHANGELOG entries
> 2026-04-23 and 2026-04-28). Primitives in place:
>
> - `components/ui/RightClickMenu.tsx` — alias of `ContextMenu` from
>   M0. Use this for the per-row menu in M2.3.
> - `components/windows/PositionsApp.tsx` — now has Market / Limit…
>   per-row buttons with the partial-size selector
>   (`CloseSizeSelector`). Reuse this subcomponent for any new size
>   pickers in M2.4 / M2.5.
> - `lib/hyperliquid/orders.ts` — `placeOrder` /
>   `placeOrderViaAgent` (with builder attribution + `triggerOrders`
>   + `grouping` from M0). For M2.4, sending a fresh TP/SL bracket
>   onto an existing position uses the same `triggerOrders` payload
>   with `grouping: 'positionTpsl'` — but **without the entry leg**;
>   the M0 `buildOrdersArray` always emits the entry first, so this
>   needs a small extension (or a sibling helper that emits trigger-
>   only `orders[]`).
> - `lib/hyperliquid/closeSize.ts` — `computeCloseSize` for any
>   reduce-only sizing math you do in M2.5.
>
> ## Deliverable — M2.3 + M2.4 + M2.5 + M2.6
>
> - **M2.3 — Right-click menu per row.** Items: Market Close · Limit
>   Close… · Set TP/SL… · Adjust Leverage… · Adjust Margin… ·
>   Reduce 50%. Reuse the M2.1/M2.2 dialogs for the close items,
>   open a new dialog for Set TP/SL…, reuse `LeverageDialog` /
>   `MarginModeDialog` from M0 for the leverage / margin items, and
>   wire "Reduce 50%" as a one-click market-close-50% (skip the
>   confirm dialog — right-click is already the confirm step).
> - **M2.4 — Set TP/SL on existing positions** + TP/SL columns in
>   the Positions table. The columns show the resting bracket
>   trigger prices (read from open orders for that asset where
>   `t.trigger.tpsl` is set). The Set TP/SL… dialog reuses the
>   M1.6 TpslRow inputs (Gain%/Loss% ↔ Price) but anchored to the
>   position's entry, not the current order price.
> - **M2.5 — Close All toolbar button.** Confirm dialog lists
>   positions + total notional + total fee preview. **Cardinal
>   spike: resolve whether one signed `order` action can carry
>   reduce-only closes for mixed asset indices** — read
>   `node_modules/@nktkas/hyperliquid/**` and check the
>   `OrderParameters.orders[].a` field (does HL accept mixed `a`
>   values in one action?). If yes, batch into one signed action
>   matching HL's UI. If no, fall back to N parallel signed
>   actions.
> - **M2.6 — Margin and Funding columns.** Pull `marginUsed` from
>   `Position` (already on the userStore type) and the per-asset
>   funding rate from `priceStore.markets[].funding`.
>
> ## Constraints (from `AGENTS.md`)
>
> - All order placement still routes through
>   `lib/hyperliquid/orders.ts`. Do not call `exchangeClient.order()`
>   from components.
> - Every order includes `builder: { b: BUILDER_ADDRESS, f: 50 }`
>   (already baked into `placeOrder`).
> - Builder-fee + agent-key approval flow on first trade — reuse the
>   retry-after-builder-fee pattern. The retry helper currently
>   lives at the bottom of `PositionsApp.tsx` as `submitCloseOrder`.
>   If M2.5's batched Close All uses the same dance, promote
>   `submitCloseOrder` into `lib/hyperliquid/orders.ts` and reuse
>   it from both call-sites.
> - Reduce-only must be set on every close order. No exceptions.
> - No new dependencies. No `any`. No `border-radius`. No
>   transitions. No `box-shadow` for depth. Bevel borders only.
>
> ## Subagent usage
>
> - **SDK spike (parallel with implementation start):** fire a
>   `general-purpose` agent on `node_modules/@nktkas/hyperliquid/**`
>   to confirm whether one signed `order` action can mix asset
>   indices. <300 word report. Pre-requisite for M2.5's batching
>   decision.
> - **Independent code-reviewer subagent** on the diff before
>   declaring done — fresh eyes on (a) the right-click menu's
>   focus/keyboard semantics, (b) the M2.4 trigger-only payload
>   vs the M0 entry-first `buildOrdersArray`, (c) the M2.5 batch
>   atomicity (if one leg fails do all roll back, or do partial
>   fills land?), (d) any new `useUserStore` selectors for
>   "Cannot update a component while rendering" regressions.
> - Do NOT delegate the actual implementation.
>
> ## Before you finish
>
> 1. `node --test lib/hyperliquid/__tests__/preview.test.mjs` —
>    `pass 11`. Same for `tpsl.test.mjs` (`pass 10`),
>    `sizeUnit.test.mjs` (`pass 11`), `closeSize.test.mjs`
>    (`pass 11`). If you factor anything new into a `.mjs`, add
>    tests as a new file.
> 2. `npx tsc --noEmit` — must pass.
> 3. `npm run build` — must pass.
> 4. Live preview smoke via `preview_*` tools (NOT
>    Claude-in-Chrome): start `dev`, reload, check the dev console —
>    must be **no new errors** beyond the pre-existing
>    `@walletconnect/modal-core` preload error, the
>    `NEXT_PUBLIC_WC_PROJECT_ID` warn, and the `Lit is in dev mode`
>    warn.
> 5. Manual smoke (you cannot do this; flag for the user): on
>    testnet first, open two positions on different assets. Test
>    each of: right-click menu items, Set TP/SL on the existing
>    positions and verify the TP/SL columns populate, Close All
>    and verify both positions are closed (one action if M2.5's
>    spike said "yes batch", else N actions). Flip to mainnet for
>    the final smoke before merging.
> 6. **Update `CHANGELOG.md`.** Add a new top entry dated to today,
>    headed `## YYYY-MM-DD — Week 6 (cont'd): M2.3 + M2.4 + M2.5 +
>    M2.6 right-click menu + TP/SL on existing positions + Close
>    All + margin/funding columns`. Follow the existing format
>    (State / The change / Files / Verification / Follow-ups).
> 7. Tell me you're done and that the next conversation should
>    start at **M3.1 — OrderBook click variants (shift+click flips
>    side, double-click fills price+size)**.

For subsequent conversations, the prompt is ~5 lines: "Read
AGENTS.md and docs/PLAN.md. Implement [milestone IDs] only. Stop
when ready for review."
