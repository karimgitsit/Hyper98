// Builder fee address — the dedicated builder wallet on Hyperliquid.
// Classic (non-unified) account, funded on perp so HL accepts the
// `approveBuilderFee` precondition check. See CHANGELOG 2026-04-20 for
// the full story (mainnet smoke test + unified-account dead-end).
export const BUILDER_ADDRESS = '0x8Af168099F5D2A1A13fB8e72BA4657A8813901e3';

// Builder fee: 5 bps = 0.05%
export const BUILDER_FEE = 50;

// Network selection. Set NEXT_PUBLIC_HL_NETWORK=mainnet in .env.local (or
// the deployment env) to flip. Default testnet — mainnet is opt-in.
// NEXT_PUBLIC_* is read at build time for the client bundle and at startup
// for server routes; both require a redeploy/rebuild to flip.
function parseNetwork(): 'testnet' | 'mainnet' {
  const raw = (process.env.NEXT_PUBLIC_HL_NETWORK ?? 'testnet').toLowerCase().trim();
  return raw === 'mainnet' ? 'mainnet' : 'testnet';
}

export const HL_NETWORK = parseNetwork();
export const IS_TESTNET = HL_NETWORK === 'testnet';

// Hyperliquid Bridge2 contract on Arbitrum. Native USDC sent here is
// credited to the sender's HL account in <1 min. Below the minimum, funds
// are lost — see https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/bridge2
export const BRIDGE_ADDRESS = (IS_TESTNET
  ? '0x08cfc1B6b2dCF36A1480b99353A354AA8AC56f89'
  : '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7') as `0x${string}`;

// Native USDC on the bridge's home chain. Mainnet = circle-issued USDC on
// Arbitrum One; testnet = HL's mock USDC on Arbitrum Sepolia (faucet at
// app.hyperliquid-testnet.xyz/drip).
export const USDC_ADDRESS = (IS_TESTNET
  ? '0x1baAbB04529D43a73232B713C0FE471f7c7334d5'
  : '0xaf88d065e77c8cC2239327C5EDb3A432268e5831') as `0x${string}`;

export const USDC_DECIMALS = 6;

// HL bridge floor. Anything below this is forfeited.
export const MIN_DEPOSIT_USDC = 5;

// HL minimum order notional. The chain rejects any order whose
// `size × px` falls below this threshold. Important for low-priced /
// coarse-szDecimals assets (e.g. DOGE, szDecimals=0): a $10 USD input
// rounds the coin size *down* before the wire, which can land just
// under $10 and trigger "Order must have minimum value of $10". Gate
// the UI on the post-rounding notional so the user sees the buffer
// they need before submitting.
export const MIN_ORDER_NOTIONAL_USD = 10;
