'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { useWindowStore } from '@/stores/windowStore';
import { usePriceStore } from '@/stores/priceStore';
import { useDexStore } from '@/stores/dexStore';
import { useOrderBookStore } from '@/stores/orderBookStore';
import { useUserStore } from '@/stores/userStore';
import { useQuickActionStore } from '@/stores/quickActionStore';
import { Dialog } from '@/components/ui/Dialog';
import { LeverageDialog } from '@/components/ui/LeverageDialog';
import { MarginModeDialog, type MarginMode } from '@/components/ui/MarginModeDialog';
import { TpslRow } from '@/components/ui/TpslRow';
import {
  placeOrder,
  placeOrderViaAgent,
  approveBuilderFee,
  marketPrice,
  roundPrice,
  roundSize,
  builderFeeUsd,
  updateLeverage,
  updateLeverageViaAgent,
  perpDexTransfer,
  type Tif,
} from '@/lib/hyperliquid/orders';
import {
  HEADLINE_MAKER_RATE,
  HEADLINE_TAKER_RATE,
  feeUsd,
  formatBpsLabel,
  isDiscounted,
} from '@/lib/hyperliquid/fees';
import { liquidationPrice, marginRequired, orderValue } from '@/lib/hyperliquid/preview';
import {
  annualizeHourlyFunding,
  formatFundingPct,
  nextFundingMs,
  formatCountdown,
} from '@/lib/hyperliquid/funding';
import {
  triggerPxFromRoePct,
  roePctFromTriggerPx,
  isTriggerOnCorrectSide,
} from '@/lib/hyperliquid/tpsl';
import {
  coinToUsdString,
  usdToCoinString,
  pctToInputString,
  clampPct,
  type SizeUnit,
} from '@/lib/hyperliquid/sizeUnit';
import { ensureAgentKey, getStoredAgentKey } from '@/lib/hyperliquid/agent';
import { BUILDER_ADDRESS, IS_TESTNET, MIN_ORDER_NOTIONAL_USD } from '@/lib/hyperliquid/constants';
import { playOrderOutcome, playOrderReject } from '@/lib/sounds/orderOutcome';

type Side = 'long' | 'short';
type OrderType = 'limit' | 'market';

const DEFAULT_COIN = 'BTC';

// M3.2 — gate the order at the same notional / withdrawable math the
// Order Preview displays. >50% of available balance is an aggressive
// single-order size; an extra confirm step here matches HL's
// big-order interstitial. Reduce-only orders skip the gate (they
// decrease exposure rather than committing margin).
const BIG_ORDER_WARNING_THRESHOLD = 0.5;

function isBuilderPlaceholder(): boolean {
  return !BUILDER_ADDRESS || BUILDER_ADDRESS.toLowerCase() === '0x0000000000000000000000000000000000000000';
}

export function TradeApp({ windowId }: { windowId: string }) {
  const props = useWindowStore((s) => s.windows[windowId]?.props) ?? {};
  const minimized = useWindowStore((s) => s.windows[windowId]?.minimized) ?? false;
  const updateProps = useWindowStore((s) => s.updateProps);
  const coin = (props.coin as string | undefined) ?? DEFAULT_COIN;
  // HIP-3 trading: when set, this window targets a deployer dex. Asset
  // metadata (assetIndex, szDecimals, maxLeverage, markPx, oraclePx) is
  // sourced from dexStore instead of priceStore, but the SDK call path
  // is identical — the global asset id (100000 + perpDexIndex*10000 + i)
  // encodes the dex on the wire.
  const hip3Dex = (props.hip3Dex as string | undefined) ?? null;

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Main-dex market data
  const getMarket = usePriceStore((s) => s.getMarket);
  const fetchMarkets = usePriceStore((s) => s.fetchMarkets);
  const markets = usePriceStore((s) => s.markets);
  const mainMarket = getMarket(coin);

  // HIP-3 market data
  const fetchDexAssets = useDexStore((s) => s.fetchDexAssets);
  const fetchDexes = useDexStore((s) => s.fetchDexes);
  const hip3Asset = useDexStore((s) =>
    hip3Dex ? s.assetsByDex[hip3Dex]?.find((a) => a.coin === coin) : undefined,
  );

  // Pull HIP-3 dex meta on mount when this window targets a deployer dex
  useEffect(() => {
    if (!hip3Dex) return;
    fetchDexes();
    fetchDexAssets(hip3Dex);
    if (minimized) return;
    const t = setInterval(() => fetchDexAssets(hip3Dex), 10_000);
    return () => clearInterval(t);
  }, [hip3Dex, minimized, fetchDexes, fetchDexAssets]);

  const markPx = hip3Dex ? (hip3Asset?.markPx ?? 0) : (mainMarket?.markPx ?? 0);
  const szDecimals = hip3Dex ? (hip3Asset?.szDecimals ?? 4) : (mainMarket?.szDecimals ?? 4);
  const assetIndex = hip3Dex ? hip3Asset?.assetIndex : mainMarket?.assetIndex;

  // Unified read-only view of the asset's metadata so downstream code
  // (max leverage, liq calc, oracle / funding readouts, "is asset
  // resolved" checks) doesn't have to branch on `hip3Dex` everywhere.
  // For HIP-3 assets the per-dex `info.metaAndAssetCtxs({ dex })` call
  // gives us the same fields priceStore extracts for main-dex perps.
  const market = hip3Dex
    ? hip3Asset
      ? {
          coin,
          maxLeverage: hip3Asset.maxLeverage,
          maintenanceMarginFraction: hip3Asset.maintenanceMarginFraction,
          onlyIsolated: hip3Asset.onlyIsolated,
          oraclePx: hip3Asset.oraclePx,
          funding: hip3Asset.funding,
        }
      : undefined
    : mainMarket;

  // Order book for best bid/ask (and to fill limit price by default)
  const book = useOrderBookStore((s) => s.books[coin]);
  const subscribeBook = useOrderBookStore((s) => s.subscribe);
  const unsubscribeBook = useOrderBookStore((s) => s.unsubscribe);

  // User state. M1.7's "Current Position" + M1.1's cross-cushion liq calc
  // need a slice of positions + marginSummary, so TradeApp polls userStore
  // on its own (paused when minimized) — matches PositionsApp/WalletApp's
  // pattern. Selectors return primitives so a `clear()` from WalletApp
  // (which writes fresh `[]` / `null`) doesn't trigger a spurious
  // re-render here via reference inequality.
  // For HIP-3 windows, source margin/withdrawable from the per-dex
  // clearinghouse snapshot. With `dexAbstraction` enabled the user's
  // main `withdrawable` ALSO supplies orders on this dex, but the
  // per-dex view is the authoritative "what's deposited here".
  const mainWithdrawable = useUserStore((s) => s.withdrawable) ?? 0;
  const hip3State = useUserStore((s) =>
    hip3Dex ? s.hip3States[hip3Dex] : undefined,
  );
  const abstraction = useUserStore((s) => s.abstraction);
  const dexAbstractionEnabled = abstraction === 'dexAbstraction';
  // On a unified account spot and perp share one bucket, so spot USDC is
  // spendable for perp orders without a class transfer. HL's perp
  // clearinghouseState still reports `withdrawable: 0` in that mode, which
  // left the slider's `sliderBasis` (and the "Available to Trade" readout)
  // stuck at 0 even though the user could place orders fine. Fold the
  // unified spot USDC in here so both reflect real buying power. Skipped on
  // HIP-3 dexes — unified abstraction is a main-perp/spot construct.
  const spotUsdc = useUserStore(
    (s) => s.spotBalances.find((b) => b.coin === 'USDC')?.total ?? 0,
  );
  const unifiedExtraUsdc =
    !hip3Dex && abstraction === 'unifiedAccount' ? spotUsdc : 0;
  const withdrawable = hip3Dex
    ? (hip3State?.withdrawable ?? 0) + (dexAbstractionEnabled ? mainWithdrawable : 0)
    : mainWithdrawable + unifiedExtraUsdc;
  const currentPosSzi = useUserStore((s) => s.positions.find((p) => p.coin === coin)?.szi ?? 0);
  const currentPosLeverage = useUserStore(
    (s) => s.positions.find((p) => p.coin === coin)?.leverage ?? null,
  );
  const currentPosLeverageType = useUserStore(
    (s) => s.positions.find((p) => p.coin === coin)?.leverageType ?? null,
  );
  const accountValue = useUserStore((s) => {
    if (hip3Dex) return s.hip3States[hip3Dex]?.marginSummary.accountValue;
    return s.marginSummary?.accountValue;
  });
  const totalMarginUsed = useUserStore((s) => {
    if (hip3Dex) return s.hip3States[hip3Dex]?.marginSummary.totalMarginUsed;
    return s.marginSummary?.totalMarginUsed;
  });
  const fetchUserState = useUserStore((s) => s.fetchUserState);
  // M3.4 — per-user fee rates for the Order Preview's base-fee
  // strike-through. `null` until userFees lands (or wallet
  // disconnected) → render falls back to the headline VIP-0 schedule
  // and the row matches the pre-M3.4 layout exactly.
  const feeRates = useUserStore((s) => s.feeRates);

  // Quick fill from order book — single click sets price, shift+click
  // also flips side, double-click also fills cumulative size at the
  // clicked level. One consolidated signal so the consumer effect
  // below fires exactly once per click. See `stores/quickActionStore`.
  const quickFill = useQuickActionStore((s) => s.quickFill);

  useEffect(() => {
    if (hip3Dex) return;
    if (!market) fetchMarkets();
  }, [hip3Dex, market, fetchMarkets]);

  // M3.3 — keep oraclePx + funding fresh while TradeApp is open.
  // `fetchMarkets` is debounced 5s in priceStore, so co-existing with
  // MarketsApp/PositionsApp's own 10s polls is a no-op when they're
  // running; when TradeApp is the only window open this is the only
  // path that refreshes the displayed funding rate. Paused on minimized
  // to honor the subscription-lifecycle rule. Skipped for HIP-3 — the
  // dedicated `fetchDexAssets` interval keeps that side fresh.
  useEffect(() => {
    if (minimized || hip3Dex) return;
    fetchMarkets();
    const t = setInterval(() => fetchMarkets(), 10_000);
    return () => clearInterval(t);
  }, [minimized, hip3Dex, fetchMarkets]);

  useEffect(() => {
    if (minimized) return;
    subscribeBook(coin);
    return () => unsubscribeBook(coin);
  }, [coin, minimized, subscribeBook, unsubscribeBook]);

  useEffect(() => {
    if (!address || minimized) return;
    fetchUserState(address);
    const t = setInterval(() => fetchUserState(address), 10_000);
    return () => clearInterval(t);
  }, [address, minimized, fetchUserState]);

  // Form state
  const [side, setSide] = useState<Side>('long');
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [tif, setTif] = useState<Tif>('Gtc');
  const [price, setPrice] = useState<string>('');
  // Price shortcut dropdown (Bid/Mid/Ask). Held as transient state so the
  // <select> resets back to the placeholder after each pick.
  const [priceShortcut, setPriceShortcut] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [reduceOnly, setReduceOnly] = useState(false);
  // M1.2 — size unit toggle. `size` holds the user's typed string in
  // whatever unit is currently displayed; `sizeNum` (below) derives the
  // canonical coin amount from it. The value that goes to the SDK is
  // always coin via the existing `roundSize(sizeNum, …)` path.
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>('coin');
  // M1.3 — numeric % input. `sizePct` is the slider's snap value; the
  // input string is kept separately so users can type intermediate
  // states (empty, "37.5") without round-tripping through `sizePct`.
  const [sizePct, setSizePct] = useState(0);
  const [sizePctInput, setSizePctInput] = useState<string>('');
  // TP/SL on entry (M1.6). The four input strings are kept independent —
  // typing a price recomputes the matching ROE% and vice versa, so the
  // user can drive either field in either row. Empty == not set; on
  // submit, only populated rows are appended to the bracket.
  const [tpslOpen, setTpslOpen] = useState(false);
  const [tpPriceInput, setTpPriceInput] = useState('');
  const [tpGainPctInput, setTpGainPctInput] = useState('');
  const [slPriceInput, setSlPriceInput] = useState('');
  const [slLossPctInput, setSlLossPctInput] = useState('');
  // Local user choices for leverage / margin mode. `null` means "fall back
  // to the open position (if any) or HL default". Reset on coin change so a
  // session-scoped pick doesn't leak across assets. After confirm we set
  // these so the pill reflects the new value immediately, ahead of the
  // userStore polling tick that confirms it server-side.
  const [leverageOverride, setLeverageOverride] = useState<number | null>(null);
  const [marginOverride, setMarginOverride] = useState<MarginMode | null>(null);
  const [leverageDialogOpen, setLeverageDialogOpen] = useState(false);
  const [marginDialogOpen, setMarginDialogOpen] = useState(false);

  useEffect(() => {
    setLeverageOverride(null);
    setMarginOverride(null);
    setLeverageDialogOpen(false);
    setMarginDialogOpen(false);
    // Clear any TP/SL the user typed for the prior coin — the prices /
    // ROEs are anchored to that coin's entry price and leverage and
    // would silently mislead at the new coin's price scale.
    setTpslOpen(false);
    setTpPriceInput('');
    setTpGainPctInput('');
    setSlPriceInput('');
    setSlLossPctInput('');
    // M3.2 — drop any pending big-order warning. Its pct was computed
    // against the prior coin's notional; confirming it would send an
    // order against a coin the user has since switched away from.
    setBigOrderWarningPct(null);
  }, [coin]);

  // Coin picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);

  // Initial price from best bid/ask
  useEffect(() => {
    if (orderType === 'limit' && !price && book) {
      const ref = side === 'long' ? book.bids[0]?.px : book.asks[0]?.px;
      if (ref) setPrice(roundPrice(ref, szDecimals));
    }
  }, [book, orderType, price, side, szDecimals]);

  // Quick fill subscription (M3.1). Side flip applies even in market
  // mode (size-only fill is still useful) but price only fills when a
  // limit price field is visible. Size fill snaps the unit back to
  // coin since the order book level size is a coin amount; the user's
  // prior USD selection would otherwise misinterpret the number.
  //
  // `lastQuickFillSeq` guards against the effect re-running for the
  // same click when an unrelated dep changes (e.g. user toggles
  // limit↔market between click and effect resolution would otherwise
  // re-flip side a second time on the same `flipSide: true` payload).
  const lastQuickFillSeq = useRef<number | null>(null);
  useEffect(() => {
    if (!quickFill || quickFill.coin !== coin) return;
    if (lastQuickFillSeq.current === quickFill.seq) return;
    lastQuickFillSeq.current = quickFill.seq;
    if (quickFill.flipSide) {
      setSide((s) => (s === 'long' ? 'short' : 'long'));
    }
    if (orderType === 'limit') {
      setPrice(quickFill.px);
    }
    if (quickFill.sz !== undefined) {
      setSize(quickFill.sz);
      setSizeUnit('coin');
      setSizePct(0);
      setSizePctInput('');
    }
  }, [quickFill, coin, orderType]);

  // Close coin picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [pickerOpen]);

  // Autofocus picker search input when opened
  useEffect(() => {
    if (pickerOpen) {
      setPickerSearch('');
      setTimeout(() => pickerInputRef.current?.focus(), 0);
    }
  }, [pickerOpen]);

  // For HIP-3 windows the picker pulls from the dex's universe so the
  // user can quick-switch between markets on the same deployer (e.g.
  // flx:TSLA → flx:NVDA) without going back to Hip3App.
  const dexAssetsForPicker = useDexStore((s) =>
    hip3Dex ? s.assetsByDex[hip3Dex] : undefined,
  );
  const filteredMarkets = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (hip3Dex) {
      const list = (dexAssetsForPicker ?? []).map((a) => ({
        coin: a.coin,
        markPx: a.markPx,
      }));
      if (!q) return list;
      return list.filter((m) => m.coin.toLowerCase().includes(q));
    }
    if (!q) return markets;
    return markets.filter((m) => m.coin.toLowerCase().includes(q));
  }, [hip3Dex, dexAssetsForPicker, markets, pickerSearch]);

  // M3.3 — funding-countdown tick. The displayed string is recomputed
  // each second from `Date.now()`; we only store `now` in state so the
  // component re-renders. Paused on `minimized` so a hidden window
  // doesn't burn a wakeup per second. HL pays funding hourly on the
  // hour (UTC); see `lib/hyperliquid/funding.mjs` for the math.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (minimized) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [minimized]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  // M3.2 — when non-null, the warning dialog is shown for an order whose
  // notional is `pct`% of withdrawable. Cancel nulls this; Confirm calls
  // executeSubmit() directly, bypassing the gate. Holding the percentage
  // (not just a boolean) snapshots the value at click time so a
  // user-typed size change while the dialog is up doesn't quietly
  // rewrite the message they're confirming against.
  const [bigOrderWarningPct, setBigOrderWarningPct] = useState<number | null>(null);

  const sizeInputNum = parseFloat(size) || 0;
  const limitPxNum = parseFloat(price) || 0;
  const effectivePx = orderType === 'market'
    ? markPx
    : (limitPxNum || markPx);
  // Derive the coin amount from the user's typed value + current unit.
  // In USD mode we divide by `effectivePx`; the existing submit path
  // then `roundSize(sizeNum, …)`s this for the wire — coin remains the
  // single source of truth for downstream code.
  const sizeNum = sizeUnit === 'usd' && effectivePx > 0
    ? sizeInputNum / effectivePx
    : sizeInputNum;
  const notional = sizeNum * effectivePx;
  const isMaker = orderType === 'limit' && tif === 'Alo';
  // M3.4 — both rates plumbed through so the Order Preview can render
  // headline (struck through) + effective when discounted, and so the
  // Total fee row uses the *effective* base fee rather than the
  // headline. `feeRates` is null until userFees lands; fall back to the
  // VIP-0 headline schedule on both lanes (headline === effective →
  // `isDiscounted` returns false → no visual change vs pre-M3.4).
  const headlineBaseRate = isMaker
    ? (feeRates?.headlineAdd ?? HEADLINE_MAKER_RATE)
    : (feeRates?.headlineCross ?? HEADLINE_TAKER_RATE);
  const effectiveBaseRate = isMaker
    ? (feeRates?.userAdd ?? headlineBaseRate)
    : (feeRates?.userCross ?? headlineBaseRate);
  const baseFee = feeUsd(notional, effectiveBaseRate);
  const headlineBaseFee = feeUsd(notional, headlineBaseRate);
  const baseFeeDiscounted = isDiscounted(effectiveBaseRate, headlineBaseRate);
  const builderFee = builderFeeUsd(notional);
  const totalFee = baseFee + builderFee;

  // Effective leverage / margin mode the user is operating under right
  // now. Order of precedence:
  //   1. session override (set when the user confirms a dialog)
  //   2. open position on this coin (mirrors HL state)
  //   3. asset constraint (`onlyIsolated`) or HL default (cross)
  // 50× is a conservative upper-bound default for assets without a
  // tracked position; the dialog clamps to `market.maxLeverage` on open.
  const hasOpenPosition = currentPosSzi !== 0;
  const onlyIsolated = market?.onlyIsolated ?? false;
  const effectiveLeverage = leverageOverride ?? currentPosLeverage ?? 10;
  // `onlyIsolated` is a hard asset constraint — it must win over a stale
  // user override and over a stale `currentPosLeverageType` (HL can flip
  // an asset to onlyIsolated post-deploy). Falls through to user choice
  // → open-position mirror → HL's cross default.
  const effectiveMarginMode: MarginMode = onlyIsolated
    ? 'isolated'
    : (marginOverride ?? currentPosLeverageType ?? 'cross');
  const isCross = effectiveMarginMode === 'cross';

  // Slider basis = buying power (max notional an order can open). Plain
  // `withdrawable` ignores leverage and goes to 0 the moment all free
  // USDC is locked in margin — at that point the slider became dead
  // weight even though cross accounts can still open against equity.
  // Fall back to `accountValue × leverage` when withdrawable is empty
  // but there's account equity, so the thumb stays meaningful.
  const sliderBasis = withdrawable > 0
    ? withdrawable * effectiveLeverage
    : (accountValue ?? 0) * effectiveLeverage;

  // Live readouts (M1.1). Only valid once size > 0 and (for limit) a price
  // is entered — otherwise show em-dash like HL.
  const previewReady =
    sizeNum > 0 && effectivePx > 0 &&
    (orderType === 'market' || limitPxNum > 0);
  const oVal = previewReady ? orderValue(effectivePx, sizeNum) : 0;
  const marginReq = previewReady ? marginRequired(effectivePx, sizeNum, effectiveLeverage) : 0;
  // Post-rounding notional. `roundSize` (toFixed at szDecimals) can land
  // a $10 USD-mode input *below* $10 on coarse assets (e.g. DOGE,
  // szDecimals=0: $10/$0.1061 = 94.25 → "94" → $9.97). HL rejects with
  // "Order must have minimum value of $10". We gate `canSubmit` and
  // surface the gap inline so the user can bump the size before
  // submitting rather than discovering it from the rejection dialog.
  const roundedSizeNum = previewReady ? parseFloat(roundSize(sizeNum, szDecimals)) : 0;
  const roundedNotional = roundedSizeNum * effectivePx;
  const belowMinNotional = previewReady && roundedNotional > 0 && roundedNotional < MIN_ORDER_NOTIONAL_USD;
  // M1.5 threads `isCross` from the new margin-mode state. For isolated
  // positions the cross cushion (accountValue − marginUsed) does not
  // apply, so those fields are dropped — `liquidationPrice` then yields
  // the conservative isolated-only liq.
  const liqPx = previewReady
    ? liquidationPrice({
        side,
        entryPx: effectivePx,
        size: sizeNum,
        leverage: effectiveLeverage,
        isCross,
        accountValue: isCross ? accountValue : undefined,
        marginUsed: isCross ? totalMarginUsed : undefined,
        maintenanceMarginFrac: market?.maintenanceMarginFraction,
      })
    : 0;

  // TP/SL on entry (M1.6). The user can drive either field in either
  // row; both rows are optional. We treat a parsed input as "set" only
  // when it parses to a finite, positive number — empty / zero / NaN
  // counts as "user didn't fill this field". The signed `roePctFromTriggerPx`
  // doubles as a side-of-entry validator: a negative ROE means the
  // trigger sits on the wrong side of entry for the chosen TP/SL leg.
  const tpPxNum = parseFloat(tpPriceInput);
  const slPxNum = parseFloat(slPriceInput);
  const tpSet = tpslOpen && Number.isFinite(tpPxNum) && tpPxNum > 0;
  const slSet = tpslOpen && Number.isFinite(slPxNum) && slPxNum > 0;
  const tpValid = tpSet && previewReady && isTriggerOnCorrectSide(side, 'tp', effectivePx, tpPxNum);
  const slValid = slSet && previewReady && isTriggerOnCorrectSide(side, 'sl', effectivePx, slPxNum);
  const tpslHasError = tpslOpen && previewReady && ((tpSet && !tpValid) || (slSet && !slValid));

  // Keep the displayed Gain % / Loss % in sync when leverage or side
  // changes after the user has typed a TP/SL *price*. Price is the
  // anchor (it's what HL ultimately receives); the ROE readout
  // rescales linearly with leverage. Without this, the %-field keeps
  // showing the value computed against the prior leverage and silently
  // misleads the user. We only re-derive when the row is "set" — empty
  // rows stay empty.
  useEffect(() => {
    if (!tpslOpen || !previewReady) return;
    if (tpSet) {
      const pct = roePctFromTriggerPx({
        side, kind: 'tp', entryPx: effectivePx, leverage: effectiveLeverage, triggerPx: tpPxNum,
      });
      setTpGainPctInput(formatPct(pct));
    }
    if (slSet) {
      const pct = roePctFromTriggerPx({
        side, kind: 'sl', entryPx: effectivePx, leverage: effectiveLeverage, triggerPx: slPxNum,
      });
      setSlLossPctInput(formatPct(pct));
    }
    // Intentionally narrow deps: re-derive on side / leverage / entry-px
    // shifts. We do NOT depend on `tpPxNum` / `slPxNum` here because
    // the field-onChange handlers already keep the % in sync when the
    // user edits the price, and adding them here would clobber an
    // in-flight % edit (handler clears the price → effect would
    // immediately rewrite the user's % keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, effectiveLeverage, effectivePx, tpslOpen, previewReady]);

  const canSubmit =
    isConnected &&
    !submitting &&
    // M3.2 — while the warning dialog is up, the submit button must be
    // disabled too: the modal backdrop blocks pointer events on the
    // button, but the button itself can still receive keyboard focus
    // (no focus trap) and Enter/Space would re-fire `onSubmit` →
    // re-set `bigOrderWarningPct` → leave a stale dialog. Gating
    // `canSubmit` here is the simplest single source of truth.
    bigOrderWarningPct === null &&
    assetIndex !== undefined &&
    sizeNum > 0 &&
    (orderType === 'market' || parseFloat(price) > 0) &&
    !tpslHasError &&
    !belowMinNotional;

  const maxLev = market?.maxLeverage ?? 50;

  // M3.3 — header parity readouts. Oracle Px is sourced from
  // `assetCtx.oraclePx` (priceStore extracts it alongside markPx). The
  // 24h figure is the hourly `funding` rate annualized linearly
  // (matches HL's UI). The countdown ticks against `now` (1Hz), is
  // pure-math from `Date.now()` and the next top-of-hour boundary, and
  // freezes when the window is minimized.
  const oraclePx = market?.oraclePx ?? 0;
  const annualizedFunding = market ? annualizeHourlyFunding(market.funding) : 0;
  const fundingMs = market ? Math.max(0, nextFundingMs(now) - now) : 0;
  const countdownText = market ? formatCountdown(fundingMs) : '00:00:00';

  const bestBid = book?.bids[0]?.px;
  const bestAsk = book?.asks[0]?.px;

  // Issue the SDK action that backs both the leverage and margin-mode
  // pills. HL's `updateLeverage` is one call regardless of which field
  // changed — confirmed via the SDK spike in this PR.
  async function issueLeverageUpdate(lev: number, mode: MarginMode) {
    if (assetIndex === undefined) return;
    const wantsCross = mode === 'cross';
    const connectedAddr = walletClient?.account?.address;
    const agentKey = connectedAddr ? getStoredAgentKey(connectedAddr) : null;
    if (agentKey) {
      await updateLeverageViaAgent(agentKey, assetIndex, lev, wantsCross);
    } else if (walletClient) {
      await updateLeverage(walletClient, assetIndex, lev, wantsCross);
    }
  }

  async function handleLeverageConfirm(newLev: number) {
    try {
      await issueLeverageUpdate(newLev, effectiveMarginMode);
      setLeverageOverride(newLev);
    } catch (err) {
      setStatusMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Leverage update failed',
      });
    }
  }

  async function handleMarginModeConfirm(newMode: MarginMode) {
    try {
      await issueLeverageUpdate(effectiveLeverage, newMode);
      setMarginOverride(newMode);
    } catch (err) {
      setStatusMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Margin mode update failed',
      });
    }
  }

  async function onSubmit() {
    if (!walletClient || !market || assetIndex === undefined) return;
    if (isBuilderPlaceholder()) {
      setStatusMsg({
        kind: 'err',
        text: 'Builder address not configured. See constants.ts — order cannot be placed until the hyper98 builder wallet is set.',
      });
      return;
    }

    // Re-run TP/SL side-of-entry validation at submit time. The button is
    // already disabled via `canSubmit` when this would fire, but a stale
    // form (e.g. user typed entry price after typing TP) could land here
    // briefly — surface an explicit Win98 error dialog rather than
    // silently sending the bad bracket.
    if (tpslOpen && previewReady) {
      if (tpSet && !tpValid) {
        setStatusMsg({
          kind: 'err',
          text: side === 'long'
            ? 'Take Profit must be above the entry price for a long.'
            : 'Take Profit must be below the entry price for a short.',
        });
        return;
      }
      if (slSet && !slValid) {
        setStatusMsg({
          kind: 'err',
          text: side === 'long'
            ? 'Stop Loss must be below the entry price for a long.'
            : 'Stop Loss must be above the entry price for a short.',
        });
        return;
      }
    }

    // M3.2 — Big-order interstitial. Reduce-only skips: the leg trims
    // existing exposure rather than committing fresh margin. Gated on
    // `withdrawable > 0` so a freshly-funded account that hasn't polled
    // yet (or a disconnected/uninitialized state) can't trip the
    // warning at a 0/0 ratio. Uses the same `notional` value that drives
    // Order Preview — single source of truth. Returns without setting
    // `submitting`; the dialog's modal backdrop blocks the underlying
    // submit button so the user can't double-fire.
    if (
      !reduceOnly &&
      withdrawable > 0 &&
      notional > withdrawable * BIG_ORDER_WARNING_THRESHOLD
    ) {
      setBigOrderWarningPct((notional / withdrawable) * 100);
      return;
    }

    await executeSubmit();
  }

  async function executeSubmit() {
    if (!walletClient || !market || assetIndex === undefined) return;
    setSubmitting(true);
    setStatusMsg({ kind: 'info', text: 'Preparing order...' });

    const connectedAddr = walletClient.account?.address;
    if (!connectedAddr) {
      setSubmitting(false);
      setStatusMsg({ kind: 'err', text: 'Wallet not connected.' });
      return;
    }

    let agentKey = getStoredAgentKey(connectedAddr);
    if (!agentKey) {
      setStatusMsg({
        kind: 'info',
        text: 'First trade — approve session key in wallet...',
      });
      try {
        agentKey = await ensureAgentKey(walletClient, connectedAddr);
      } catch (err) {
        setSubmitting(false);
        setStatusMsg({
          kind: 'err',
          text: err instanceof Error ? err.message : 'Session key approval failed',
        });
        return;
      }
    }

    const sendOrder = (orderInput: Parameters<typeof placeOrder>[1]) =>
      placeOrderViaAgent(agentKey!, orderInput);

    try {
      const roundedSize = roundSize(sizeNum, szDecimals);
      let roundedPx: string;
      if (orderType === 'market') {
        roundedPx = roundPrice(marketPrice(markPx, side === 'long'), szDecimals);
      } else {
        roundedPx = roundPrice(parseFloat(price), szDecimals);
      }

      // Belt-and-braces min-notional check on the *exact wire values*
      // we're about to send. The render-time `belowMinNotional` already
      // gates `canSubmit`, but recompute against `roundedSize` × `roundedPx`
      // so a stale render or a price tick between gate and submit can't
      // sneak a sub-$10 order through to HL's rejection.
      const wireNotional = parseFloat(roundedSize) * parseFloat(roundedPx);
      if (wireNotional > 0 && wireNotional < MIN_ORDER_NOTIONAL_USD) {
        setSubmitting(false);
        setStatusMsg({
          kind: 'err',
          text: `Order value $${wireNotional.toFixed(2)} is below Hyperliquid's $${MIN_ORDER_NOTIONAL_USD} minimum after size rounding. Increase the size slightly.`,
        });
        playOrderReject();
        return;
      }

      // Build the optional TP/SL bracket. `placeOrder`'s extension
      // appends both legs to the same signed action with
      // `grouping: 'positionTpsl'` (default when triggers are set), so
      // one signature carries entry + TP + SL with one builder
      // attribution. Trigger fills are aggressive market on trigger.
      // Tick-size rounding can in pathological cases (microscopic
      // ROE %, low-szDecimals asset) collapse a barely-valid trigger
      // back onto entry — recheck side after rounding and abort with
      // a Win98 dialog rather than sending a degenerate bracket.
      const tpRounded = tpValid ? roundPrice(tpPxNum, szDecimals) : null;
      const slRounded = slValid ? roundPrice(slPxNum, szDecimals) : null;
      if (tpRounded !== null && !isTriggerOnCorrectSide(side, 'tp', parseFloat(roundedPx), parseFloat(tpRounded))) {
        setSubmitting(false);
        setStatusMsg({
          kind: 'err',
          text: 'Take Profit price rounded onto the entry price. Move it further from entry or pick a higher Gain %.',
        });
        playOrderReject();
        return;
      }
      if (slRounded !== null && !isTriggerOnCorrectSide(side, 'sl', parseFloat(roundedPx), parseFloat(slRounded))) {
        setSubmitting(false);
        setStatusMsg({
          kind: 'err',
          text: 'Stop Loss price rounded onto the entry price. Move it further from entry or pick a higher Loss %.',
        });
        playOrderReject();
        return;
      }
      const triggerOrders =
        tpRounded || slRounded
          ? {
              ...(tpRounded ? { tp: { triggerPx: tpRounded } } : {}),
              ...(slRounded ? { sl: { triggerPx: slRounded } } : {}),
            }
          : undefined;

      const orderInput = {
        asset: assetIndex,
        isBuy: side === 'long',
        price: roundedPx,
        size: roundedSize,
        reduceOnly,
        orderType,
        tif,
        ...(triggerOrders ? { triggerOrders } : {}),
      };

      setStatusMsg({ kind: 'info', text: 'Signing with agent...' });
      let res;
      try {
        res = await sendOrder(orderInput);
      } catch (err) {
        const errStr = err instanceof Error ? err.message : String(err);
        if (!/builder/i.test(errStr)) throw err;
        setStatusMsg({
          kind: 'info',
          text: 'Builder fee not approved. Sign approval in wallet...',
        });
        await approveBuilderFee(walletClient, '0.05%');
        setStatusMsg({ kind: 'info', text: 'Approved. Retrying order...' });
        res = await sendOrder(orderInput);
      }

      const statuses = res?.response?.data?.statuses ?? [];
      const first: unknown = statuses[0];
      if (first && typeof first === 'object' && 'error' in first && (first as { error?: unknown }).error) {
        const errStr = String((first as { error?: unknown }).error);
        if (/builder/i.test(errStr)) {
          setStatusMsg({
            kind: 'info',
            text: 'Builder fee not approved. Sign approval...',
          });
          try {
            await approveBuilderFee(walletClient, '0.05%');
            setStatusMsg({ kind: 'info', text: 'Approved. Retrying order...' });
            const retry = await sendOrder(orderInput);
            const retryStatus = retry?.response?.data?.statuses?.[0];
            setStatusMsg({ kind: 'ok', text: formatStatus(retryStatus) });
            // M3.5 — sound is keyed off the per-leg status, not the
            // wrapper kind: a `kind: 'ok'` retry with a `resting` body
            // chimes a `ding`, a fill chimes `chimes`, and a per-leg
            // error (somehow) still chords. Builder approval itself
            // doesn't trigger a sound — info / preparing states are
            // silent.
            playOrderOutcome(retryStatus);
          } catch (e) {
            setStatusMsg({
              kind: 'err',
              text: e instanceof Error ? e.message : 'Builder fee approval failed',
            });
            playOrderReject();
          }
        } else {
          setStatusMsg({ kind: 'err', text: errStr });
          playOrderReject();
        }
      } else {
        setStatusMsg({ kind: 'ok', text: formatStatus(first) });
        playOrderOutcome(first);
      }
    } catch (e) {
      setStatusMsg({
        kind: 'err',
        text: e instanceof Error ? e.message : 'Order failed',
      });
      playOrderReject();
    } finally {
      setSubmitting(false);
    }
  }

  // M1.2 — flip the displayed value in-place so the user keeps context.
  // Empty / zero / non-finite input or no entry price: just flip the unit
  // without rewriting the string. Round-trip is bounded by one tick of
  // szDecimals (e.g. ~$0.30 on BTC at $30k); see the comment at the top
  // of `lib/hyperliquid/sizeUnit.mjs`.
  function toggleSizeUnit() {
    const num = parseFloat(size);
    if (!Number.isFinite(num) || num <= 0 || effectivePx <= 0) {
      setSizeUnit((u) => (u === 'coin' ? 'usd' : 'coin'));
      return;
    }
    if (sizeUnit === 'coin') {
      setSize(coinToUsdString(num, effectivePx));
      setSizeUnit('usd');
    } else {
      setSize(usdToCoinString(num, effectivePx, szDecimals));
      setSizeUnit('coin');
    }
  }

  // M1.3 — apply a percentage of buying power (`sliderBasis`) as the new
  // size, in the currently-displayed unit. Used by both the slider and
  // the numeric % input. With no basis or no price the slider can't
  // compute a size, so we leave the user's typed `size` untouched rather
  // than wiping it — clobbering their input would feel like a bug.
  function applySizePct(pct: number) {
    setSizePct(pct);
    if (sliderBasis <= 0 || effectivePx <= 0) return;
    const next = pctToInputString({
      pct, withdrawable: sliderBasis, px: effectivePx, szDecimals, unit: sizeUnit,
    });
    setSize(next);
  }

  if (!isConnected) {
    return (
      <div style={{ padding: 16, textAlign: 'center', fontSize: 11 }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Trade.exe</div>
        <div style={{ color: '#808080', marginBottom: 16 }}>
          Connect your wallet to place orders.
        </div>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button className="btn primary" onClick={show}>
              Connect Wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11 }}>
      {/* Header */}
      <div style={{
        padding: '4px 6px',
        borderBottom: '1px solid var(--bevel-dark-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        position: 'relative',
      }}>
        {/* Coin picker button */}
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <button
            className="pill-btn"
            style={{ fontWeight: 700 }}
            onClick={() => setPickerOpen((o) => !o)}
          >
            {coin}-USD ▾
          </button>
          {pickerOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 9999,
              background: 'var(--w98-bg)',
              border: '2px solid',
              borderColor: 'var(--bevel-light-1) var(--bevel-dark-2) var(--bevel-dark-2) var(--bevel-light-1)',
              boxShadow: '2px 2px 4px rgba(0,0,0,0.4)',
              minWidth: 180,
              padding: 4,
            }}>
              <input
                ref={pickerInputRef}
                className="input"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search..."
                style={{ width: '100%', marginBottom: 4, boxSizing: 'border-box' }}
              />
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {filteredMarkets.map((m) => (
                  <div
                    key={m.coin}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '3px 6px',
                      cursor: 'pointer',
                      fontSize: 11,
                      background: m.coin === coin ? '#a8c8f0' : 'transparent',
                      color: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      if (m.coin !== coin) (e.currentTarget as HTMLDivElement).style.background = '#d4d0c8';
                    }}
                    onMouseLeave={(e) => {
                      if (m.coin !== coin) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }}
                    onMouseDown={() => {
                      updateProps(windowId, { coin: m.coin });
                      setPickerOpen(false);
                      setPrice('');
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{m.coin}-USD</span>
                    <span className="mono" style={{ color: '#808080' }}>
                      {formatPx(m.markPx)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <span className="mono" style={{ color: '#808080' }}>
          {markPx > 0 ? formatPx(markPx) : '—'}
        </span>

        {/* Leverage pill (M1.4) */}
        <button
          className="pill-btn"
          style={{ fontWeight: 700 }}
          onClick={() => setLeverageDialogOpen(true)}
          title="Adjust leverage"
        >
          {effectiveLeverage}x ▾
        </button>

        {/* Margin-mode pill (M1.5). Disabled when the asset is `onlyIsolated`. */}
        <button
          className="pill-btn"
          onClick={() => setMarginDialogOpen(true)}
          disabled={onlyIsolated}
          title={onlyIsolated ? 'This asset only supports isolated margin' : 'Change margin mode'}
          style={{ opacity: onlyIsolated ? 0.6 : 1 }}
        >
          {effectiveMarginMode === 'cross' ? 'Cross' : 'Isolated'} ▾
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#808080' }}>
          {IS_TESTNET ? 'TESTNET' : 'MAINNET'}
        </span>
      </div>

      {/* M3.3 — Oracle Px / 24h funding / funding countdown. Second header
          strip; same bevel-bottom border as the row above. Each cell is
          label + value, grey label / monospace value. The countdown is
          fixed-width (8 chars by contract from formatCountdown), so the
          per-second tick can't reflow the row. `flexWrap: wrap` means
          280px-wide windows wrap to a second visual line rather than
          horizontally overflowing. */}
      <div style={{
        padding: '3px 6px',
        borderBottom: '1px solid var(--bevel-dark-1)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        fontSize: 10,
      }}>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
          <span style={{ color: '#808080', fontSize: 9 }}>Oracle</span>
          <span className="mono">{oraclePx > 0 ? `$${formatPx(oraclePx)}` : '—'}</span>
        </span>
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
          <span style={{ color: '#808080', fontSize: 9 }} title="Annualized 24h funding (hourly × 24 × 365)">
            24h
          </span>
          <span
            className={
              market && Number.isFinite(annualizedFunding) && annualizedFunding !== 0
                ? `mono ${annualizedFunding > 0 ? 'green' : 'red'}`
                : 'mono'
            }
          >
            {market ? formatFundingPct(annualizedFunding, 4) : '—'}
          </span>
        </span>
        <span
          style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline', marginLeft: 'auto' }}
          title="Time until next funding tick (hourly, on the hour UTC)"
        >
          <span style={{ color: '#808080', fontSize: 9 }}>Funding in</span>
          <span className="mono">{countdownText}</span>
        </span>
      </div>

      {/* Side toggle */}
      <div style={{ display: 'flex', gap: 2, padding: 6 }}>
        <button
          className={`btn ${side === 'long' ? 'btn-long pressed' : ''}`}
          onClick={() => setSide('long')}
          style={{ flex: 1 }}
        >
          LONG
        </button>
        <button
          className={`btn ${side === 'short' ? 'btn-short pressed' : ''}`}
          onClick={() => setSide('short')}
          style={{ flex: 1 }}
        >
          SHORT
        </button>
      </div>

      {/* Order type tabs */}
      <div style={{ padding: '0 6px', display: 'flex', gap: 2 }}>
        <button
          className={`btn ${orderType === 'limit' ? 'pressed' : ''}`}
          onClick={() => setOrderType('limit')}
          style={{ flex: 1, minWidth: 0 }}
        >
          Limit
        </button>
        <button
          className={`btn ${orderType === 'market' ? 'pressed' : ''}`}
          onClick={() => setOrderType('market')}
          style={{ flex: 1, minWidth: 0 }}
        >
          Market
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Two-row availability header (M1.7) — matches Hyperliquid's layout. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#808080', padding: '0 2px' }}>
          <span>Available to Trade:</span>
          <span className="mono">${withdrawable.toFixed(2)} USDC</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#808080', padding: '0 2px' }}>
          <span>Current Position:</span>
          <span className="mono">{formatCurrentPosition(currentPosSzi, coin, szDecimals)}</span>
        </div>

        {orderType === 'limit' && (
          <Row label="Price">
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%' }}>
              <input
                className="input mono"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={bestBid && bestAsk ? formatPx((bestBid + bestAsk) / 2) : markPx.toString()}
                style={{ flex: 1, minWidth: 0 }}
              />
              {/* Bid/Mid/Ask shortcut as a single dropdown so the row fits
                  without horizontal scroll. Picking an option sets the
                  price input and resets the select back to the placeholder. */}
              <select
                className="select"
                value={priceShortcut}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'bid' && bestBid) setPrice(formatPx(bestBid));
                  else if (v === 'mid' && bestBid && bestAsk) setPrice(formatPx((bestBid + bestAsk) / 2));
                  else if (v === 'ask' && bestAsk) setPrice(formatPx(bestAsk));
                  setPriceShortcut('');
                }}
                title="Price shortcut"
                aria-label="Price shortcut"
                style={{ flexShrink: 0 }}
              >
                <option value="">Set…</option>
                <option value="bid">Bid</option>
                <option value="mid">Mid</option>
                <option value="ask">Ask</option>
              </select>
            </div>
          </Row>
        )}

        <Row label="Size">
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, width: '100%' }}>
            <input
              className="input mono"
              value={size}
              onChange={(e) => {
                const v = e.target.value;
                setSize(v);
                // Bidirectional Size ↔ slider: derive the slider/% from
                // the typed size so the thumb tracks the user's input.
                // No basis / no price → slider stays at 0; otherwise any
                // 0-100 value updates the slider position.
                const num = parseFloat(v);
                if (!Number.isFinite(num) || num <= 0 || sliderBasis <= 0 || effectivePx <= 0) {
                  setSizePct(0);
                  setSizePctInput('');
                  return;
                }
                const usdValue = sizeUnit === 'usd' ? num : num * effectivePx;
                const pct = clampPct((usdValue / sliderBasis) * 100);
                setSizePct(pct);
                setSizePctInput(
                  pct === 0 ? '' : (Number.isInteger(pct) ? String(pct) : pct.toFixed(1))
                );
              }}
              placeholder={sizeUnit === 'usd' ? '0.00' : '0.0'}
              style={{ flex: 1, minWidth: 0 }}
            />
            {/* M1.2 — Coin ⇄ USD toggle. Clicking converts the displayed
                value in-place so the user doesn't lose context. The
                underlying coin size that goes to the SDK is derived
                from `size` + `sizeUnit` via `sizeNum`. */}
            <button
              className="pill-btn"
              onClick={toggleSizeUnit}
              title={`Switch size unit (currently ${sizeUnit === 'coin' ? coin : 'USD'})`}
              style={{ minWidth: 48 }}
            >
              {sizeUnit === 'coin' ? coin : 'USD'} ⇄
            </button>
          </div>
        </Row>

        {/* Size slider + numeric % input (M1.3). step=1 so the thumb
            tracks any size→% derived value smoothly (with step=25 some
            browsers snap programmatic values to step boundaries, which
            broke the bidirectional feel the user expected). */}
        <div style={{ padding: '2px 6px 0 66px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              type="range"
              className="trackbar"
              min={0}
              max={100}
              step={1}
              value={sizePct}
              onChange={(e) => {
                const pct = parseFloat(e.target.value);
                applySizePct(pct);
                setSizePctInput(
                  pct === 0 ? '' : (Number.isInteger(pct) ? String(pct) : pct.toFixed(1))
                );
              }}
            />
            <div className="trackbar-ticks" />
          </div>
          <input
            className="input mono"
            value={sizePctInput}
            onChange={(e) => {
              const raw = e.target.value;
              setSizePctInput(raw);
              if (raw === '') {
                setSizePct(0);
                setSize('');
                return;
              }
              const n = parseFloat(raw);
              if (!Number.isFinite(n)) return;
              applySizePct(clampPct(n));
            }}
            placeholder="0"
            style={{ width: 36, boxSizing: 'border-box', textAlign: 'right' }}
            aria-label="Size as percent of available"
          />
          <span style={{ fontSize: 10, color: '#808080' }}>%</span>
        </div>

        {orderType === 'limit' && (
          <Row label="TIF">
            <select
              className="select"
              value={tif}
              onChange={(e) => setTif(e.target.value as Tif)}
            >
              <option value="Gtc">GTC</option>
              <option value="Ioc">IOC</option>
              <option value="Alo">ALO (maker only)</option>
            </select>
          </Row>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input
            type="checkbox"
            checked={reduceOnly}
            onChange={(e) => setReduceOnly(e.target.checked)}
          />
          Reduce-only
        </label>

        {/* Add TP/SL on entry (M1.6). One signed action carries the entry
            and both bracket legs via the M0 `triggerOrders` extension. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <input
            type="checkbox"
            checked={tpslOpen}
            onChange={(e) => setTpslOpen(e.target.checked)}
          />
          Add TP/SL
        </label>

        {tpslOpen && (
          <TpslRows
            side={side}
            entryPx={effectivePx}
            leverage={effectiveLeverage}
            tpPriceInput={tpPriceInput}
            tpGainPctInput={tpGainPctInput}
            slPriceInput={slPriceInput}
            slLossPctInput={slLossPctInput}
            tpInvalid={tpSet && previewReady && !tpValid}
            slInvalid={slSet && previewReady && !slValid}
            onTpPriceChange={(raw) => {
              setTpPriceInput(raw);
              const px = parseFloat(raw);
              if (!Number.isFinite(px) || px <= 0 || !previewReady) {
                setTpGainPctInput('');
                return;
              }
              const pct = roePctFromTriggerPx({
                side, kind: 'tp', entryPx: effectivePx, leverage: effectiveLeverage, triggerPx: px,
              });
              setTpGainPctInput(formatPct(pct));
            }}
            onTpGainPctChange={(raw) => {
              setTpGainPctInput(raw);
              const pct = parseFloat(raw);
              if (!Number.isFinite(pct) || !previewReady) {
                setTpPriceInput('');
                return;
              }
              const px = triggerPxFromRoePct({
                side, kind: 'tp', entryPx: effectivePx, leverage: effectiveLeverage, roePct: pct,
              });
              setTpPriceInput(px > 0 ? formatPx(px) : '');
            }}
            onSlPriceChange={(raw) => {
              setSlPriceInput(raw);
              const px = parseFloat(raw);
              if (!Number.isFinite(px) || px <= 0 || !previewReady) {
                setSlLossPctInput('');
                return;
              }
              const pct = roePctFromTriggerPx({
                side, kind: 'sl', entryPx: effectivePx, leverage: effectiveLeverage, triggerPx: px,
              });
              setSlLossPctInput(formatPct(pct));
            }}
            onSlLossPctChange={(raw) => {
              setSlLossPctInput(raw);
              const pct = parseFloat(raw);
              if (!Number.isFinite(pct) || !previewReady) {
                setSlPriceInput('');
                return;
              }
              const px = triggerPxFromRoePct({
                side, kind: 'sl', entryPx: effectivePx, leverage: effectiveLeverage, roePct: pct,
              });
              setSlPriceInput(px > 0 ? formatPx(px) : '');
            }}
          />
        )}
      </div>

      {/* Order preview — readouts (M1.1) + fees */}
      <div className="fieldset" style={{ margin: '4px 6px' }}>
        <div className="fieldset-legend">Order Preview</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 12px', fontSize: 10 }}>
          <span style={{ color: '#808080' }}>Liq Px</span>
          <span className="mono">{previewReady && liqPx > 0 ? `$${formatPx(liqPx)}` : '—'}</span>

          <span style={{ color: '#808080' }}>Order Value</span>
          <span
            className="mono"
            style={belowMinNotional ? { color: '#c00000' } : undefined}
          >
            {previewReady ? `$${oVal.toFixed(2)}` : '—'}
          </span>

          {belowMinNotional && (
            <span
              style={{
                gridColumn: '1 / -1',
                color: '#c00000',
                fontSize: 10,
                lineHeight: 1.3,
              }}
            >
              Below ${MIN_ORDER_NOTIONAL_USD} min after size rounding (wire: ${roundedNotional.toFixed(2)}). Increase size.
            </span>
          )}

          <span style={{ color: '#808080' }}>Margin Required</span>
          <span className="mono">{previewReady ? `$${marginReq.toFixed(2)}` : '—'}</span>

          {tpslOpen && (
            <>
              <span style={{ color: '#808080' }}>TP Trigger</span>
              <span className="mono">
                {tpValid ? `$${formatPx(tpPxNum)}` : tpSet ? '✗ wrong side' : '—'}
              </span>
              <span style={{ color: '#808080' }}>SL Trigger</span>
              <span className="mono">
                {slValid ? `$${formatPx(slPxNum)}` : slSet ? '✗ wrong side' : '—'}
              </span>
            </>
          )}

          <span style={{ color: '#808080' }}>
            Base fee ({isMaker ? 'maker' : 'taker'} {formatBpsLabel(effectiveBaseRate)}
            {baseFeeDiscounted && feeRates?.discountSource ? ` · ${feeRates.discountSource}` : ''})
          </span>
          <span className="mono">
            {baseFeeDiscounted && (
              <>
                <s style={{ color: '#a0a0a0' }}>${headlineBaseFee.toFixed(4)}</s>{' '}
              </>
            )}
            ${baseFee.toFixed(4)}
          </span>

          <span style={{ color: '#808080' }}>Builder fee (5bps)</span>
          <span className="mono">${builderFee.toFixed(4)}</span>

          <span style={{ color: '#808080', fontWeight: 700, borderTop: '1px solid var(--bevel-dark-1)' }}>Total fee</span>
          <span className="mono" style={{ borderTop: '1px solid var(--bevel-dark-1)', fontWeight: 700 }}>
            ${totalFee.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Status — inline for ok/info, dialog for err */}
      {statusMsg && statusMsg.kind !== 'err' && (
        <div
          style={{
            margin: '0 6px 4px',
            padding: '4px 6px',
            fontSize: 10,
            background: statusMsg.kind === 'ok' ? '#d0ffd0' : '#ffffcc',
            border: '1px solid #808080',
            wordBreak: 'break-word',
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {statusMsg && statusMsg.kind === 'err' && hip3Dex && /insufficient margin/i.test(statusMsg.text) ? (
        <Hip3InsufficientMarginDialog
          dex={hip3Dex}
          dexWithdrawable={hip3State?.withdrawable ?? 0}
          mainWithdrawable={mainWithdrawable}
          walletClient={walletClient ?? null}
          walletAddress={address ?? null}
          onClose={() => setStatusMsg(null)}
          onTransferred={async () => {
            if (address) await fetchUserState(address, { force: true });
          }}
        />
      ) : statusMsg && statusMsg.kind === 'err' && (
        <Dialog
          icon="error"
          title="Order failed"
          body={<span style={{ fontSize: 11 }}>{statusMsg.text}</span>}
          buttons={[{ label: 'OK', onClick: () => setStatusMsg(null), primary: true, autoFocus: true }]}
          onClose={() => setStatusMsg(null)}
        />
      )}

      {leverageDialogOpen && (
        <LeverageDialog
          coin={coin}
          maxLeverage={maxLev}
          current={effectiveLeverage}
          onConfirm={handleLeverageConfirm}
          onClose={() => setLeverageDialogOpen(false)}
        />
      )}

      {marginDialogOpen && (
        <MarginModeDialog
          coin={coin}
          current={effectiveMarginMode}
          hasOpenPosition={hasOpenPosition}
          onConfirm={handleMarginModeConfirm}
          onClose={() => setMarginDialogOpen(false)}
        />
      )}

      {bigOrderWarningPct !== null && (
        <Dialog
          icon="warn"
          title="Big order warning"
          body={
            <span style={{ fontSize: 11 }}>
              This order is {bigOrderWarningPct.toFixed(1)}% of your available balance. Continue?
            </span>
          }
          buttons={[
            {
              label: 'Cancel',
              onClick: () => setBigOrderWarningPct(null),
              autoFocus: true,
            },
            {
              label: 'Confirm',
              primary: true,
              onClick: () => {
                setBigOrderWarningPct(null);
                void executeSubmit();
              },
            },
          ]}
          onClose={() => setBigOrderWarningPct(null)}
        />
      )}

      {/* Submit */}
      <div style={{ padding: 6, marginTop: 'auto' }}>
        <button
          className={`btn ${side === 'long' ? 'btn-long' : 'btn-short'}`}
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{ width: '100%', opacity: canSubmit ? 1 : 0.6 }}
        >
          {submitting ? 'Submitting...' : `${side === 'long' ? 'Buy / Long' : 'Sell / Short'} ${coin}`}
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', alignItems: 'center', gap: 6 }}>
      <span style={{ color: '#808080', fontSize: 11 }}>{label}</span>
      {children}
    </div>
  );
}

function formatPx(n: number): string {
  if (n >= 10000) return n.toFixed(0);
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

interface TpslRowsProps {
  side: Side;
  entryPx: number;
  leverage: number;
  tpPriceInput: string;
  tpGainPctInput: string;
  slPriceInput: string;
  slLossPctInput: string;
  tpInvalid: boolean;
  slInvalid: boolean;
  onTpPriceChange: (raw: string) => void;
  onTpGainPctChange: (raw: string) => void;
  onSlPriceChange: (raw: string) => void;
  onSlLossPctChange: (raw: string) => void;
}

function TpslRows({
  tpPriceInput,
  tpGainPctInput,
  slPriceInput,
  slLossPctInput,
  tpInvalid,
  slInvalid,
  onTpPriceChange,
  onTpGainPctChange,
  onSlPriceChange,
  onSlLossPctChange,
}: TpslRowsProps) {
  // Tinted background only — no border-radius, no shadow. Red tint when
  // the user typed a price on the wrong side of entry; the submit button
  // is already disabled in that case.
  const tpBg = tpInvalid ? '#ffd0d0' : undefined;
  const slBg = slInvalid ? '#ffd0d0' : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 18 }}>
      <TpslRow
        label="TP"
        priceLabel="Price"
        pctLabel="Gain %"
        priceValue={tpPriceInput}
        pctValue={tpGainPctInput}
        bg={tpBg}
        onPriceChange={onTpPriceChange}
        onPctChange={onTpGainPctChange}
      />
      <TpslRow
        label="SL"
        priceLabel="Price"
        pctLabel="Loss %"
        priceValue={slPriceInput}
        pctValue={slLossPctInput}
        bg={slBg}
        onPriceChange={onSlPriceChange}
        onPctChange={onSlLossPctChange}
      />
    </div>
  );
}

function formatCurrentPosition(szi: number, coin: string, szDecimals: number): string {
  if (!Number.isFinite(szi) || szi === 0) return `0 ${coin}`;
  const sign = szi > 0 ? '+' : '-';
  return `${sign}${Math.abs(szi).toFixed(szDecimals)} ${coin}`;
}

/**
 * HIP-3 markets have isolated per-dex collateral, so HL's "insufficient
 * margin" reject on a HIP-3 order means the deployer dex's USDC balance is
 * too low — even when the user's main perp account is flush. The plain
 * "Order failed" dialog buries that. This variant explains it inline and
 * lets the user transfer USDC straight from main perps without leaving the
 * trade window. After a successful transfer we just close — the user
 * re-clicks Buy/Long themselves so they can re-confirm the order params.
 *
 * Transfer requires the main wallet (sendAsset is a user-signed action;
 * agents can't sign it). If only an agent is connected we still render the
 * info but disable the button.
 */
function Hip3InsufficientMarginDialog({
  dex,
  dexWithdrawable,
  mainWithdrawable,
  walletClient,
  walletAddress,
  onClose,
  onTransferred,
}: {
  dex: string;
  dexWithdrawable: number;
  mainWithdrawable: number;
  walletClient: import('viem').WalletClient | null;
  walletAddress: `0x${string}` | null;
  onClose: () => void;
  onTransferred: () => Promise<void> | void;
}) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [transferErr, setTransferErr] = useState<string | null>(null);

  const amountNum = parseFloat(amount) || 0;
  const canSign = !!walletClient && !!walletAddress;
  const canSubmit =
    !submitting && canSign && amountNum > 0 && amountNum <= mainWithdrawable;

  async function onTransfer() {
    if (!walletClient || !walletAddress) return;
    setSubmitting(true);
    setTransferErr(null);
    try {
      await perpDexTransfer(walletClient, {
        amount: amountNum.toString(),
        sourceDex: '',
        destinationDex: dex,
        walletAddress,
      });
      await onTransferred();
      onClose();
    } catch (e) {
      setTransferErr(e instanceof Error ? e.message : 'Transfer failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      icon="error"
      title="Insufficient collateral on HIP-3 dex"
      onClose={onClose}
      body={
        <div style={{ fontSize: 11, lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            HIP-3 markets use <b>isolated collateral per deployer dex</b>.
            Your main perps balance can&apos;t back orders on{' '}
            <span className="mono">{dex}</span> until you transfer USDC into
            it.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '2px 12px',
              padding: '4px 6px',
              background: 'var(--w98-bg)',
              border: '1px solid var(--bevel-dark-1)',
            }}
          >
            <span style={{ color: '#808080' }}>
              In <span className="mono">{dex}</span>:
            </span>
            <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
              ${dexWithdrawable.toFixed(2)}
            </span>
            <span style={{ color: '#808080' }}>In main perps:</span>
            <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
              ${mainWithdrawable.toFixed(2)}
            </span>
          </div>
          <label style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 6 }}>
            <input
              className="input mono"
              placeholder="Amount (USDC)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
              autoFocus
            />
            <button
              className="btn"
              style={{ fontSize: 10, padding: '2px 6px', minWidth: 'auto' }}
              onClick={() => setAmount(mainWithdrawable > 0 ? mainWithdrawable.toFixed(2) : '')}
              disabled={mainWithdrawable <= 0 || submitting}
            >
              Max
            </button>
          </label>
          {!canSign && (
            <div style={{ fontSize: 10, color: 'var(--w98-red)' }}>
              Transfer requires the main wallet — agents can&apos;t sign
              sendAsset. Reconnect with your wallet to move funds.
            </div>
          )}
          {amountNum > mainWithdrawable && mainWithdrawable > 0 && (
            <div style={{ fontSize: 10, color: 'var(--w98-red)' }}>
              Amount exceeds main perps withdrawable (${mainWithdrawable.toFixed(2)}).
            </div>
          )}
          {transferErr && (
            <div
              style={{
                padding: '4px 6px',
                fontSize: 10,
                background: '#ffd0d0',
                border: '1px solid #808080',
                wordBreak: 'break-word',
              }}
            >
              {transferErr}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#808080' }}>
            After the transfer completes, click Buy / Long again to place
            the order.
          </div>
        </div>
      }
      buttons={[
        { label: 'Cancel', onClick: onClose },
        {
          label: submitting
            ? 'Transferring...'
            : `Transfer $${amountNum > 0 ? amountNum.toFixed(2) : '0.00'} from main perps`,
          onClick: onTransfer,
          primary: true,
          disabled: !canSubmit,
        },
      ]}
    />
  );
}

// Status object shape varies — try to render it usefully.
interface FilledStatus { filled: { totalSz: string; avgPx: string; oid: number } }
interface RestingStatus { resting: { oid: number } }
function formatStatus(s: unknown): string {
  if (!s) return 'Order sent.';
  if (typeof s === 'string') return s;
  if (typeof s === 'object') {
    const obj = s as Partial<FilledStatus & RestingStatus & { error?: string }>;
    if (obj.error) return obj.error;
    if (obj.filled) {
      return `Filled ${obj.filled.totalSz} @ ${obj.filled.avgPx} (oid ${obj.filled.oid})`;
    }
    if (obj.resting) {
      return `Resting on book (oid ${obj.resting.oid})`;
    }
  }
  return JSON.stringify(s);
}
