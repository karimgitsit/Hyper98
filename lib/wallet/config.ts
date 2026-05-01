import { createConfig, http } from 'wagmi';
import { arbitrum, arbitrumSepolia } from 'wagmi/chains';
import { coinbaseWallet, metaMask, walletConnect } from '@wagmi/connectors';
import { IS_TESTNET } from '@/lib/hyperliquid/constants';

const chains = IS_TESTNET ? ([arbitrumSepolia] as const) : ([arbitrum] as const);

const walletConnectProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '';

if (!walletConnectProjectId && typeof window !== 'undefined') {
  console.warn(
    '[hyper98] NEXT_PUBLIC_WC_PROJECT_ID is not set. WalletConnect will fail at ' +
    'connect time — create a free project id at https://cloud.reown.com/ and ' +
    'add it to .env.local to enable mobile-wallet connects.',
  );
}

// Explicit connector list — no ConnectKit `getDefaultConfig`, because that
// bundles Safe/Aave Apps SDK and we surface its fake "Aave Account" entry.
// EIP-6963 multi-injected discovery is on by default in wagmi v2, so Rabby,
// Phantom, and other browser extensions auto-appear without any config here.
//
// WalletConnect is always registered (it's a QR-code bridge protocol, never
// an installable extension). Without a project id, clicking it surfaces a
// runtime error rather than silently hiding — that's the right signal.
//
// `ssr: true` defers wagmi's reconnect-on-mount into a `useEffect` rather
// than firing it synchronously during `Hydrate`'s render. Without this,
// Hydrate's render → onMount → reconnect → setState fires while React is
// still rendering Hydrate, which surfaces as
// `Cannot update a component (TradeApp) while rendering a different
// component (Hydrate)` for any subscriber to wagmi state.
//
// Side-effect: the EIP-6963 wallet scan (Rabby, Phantom, …) now runs in
// the same post-commit `useEffect`, so injected wallets surface one paint
// later in LoginDialog. Net behavior is unchanged.
//
// `app/page.tsx` already gates the entire wallet stack behind
// `dynamic(..., { ssr: false })`, so this flag is effectively "force the
// post-mount path"; it is NOT a real SSR opt-in (no cookieStorage /
// initialState plumbing). Don't remove the `dynamic({ ssr: false })`
// expecting this flag to cover SSR — it doesn't.
export const wagmiConfig = createConfig({
  ssr: true,
  chains,
  transports: {
    [arbitrumSepolia.id]: http(),
    [arbitrum.id]: http(),
  },
  connectors: [
    metaMask({
      dappMetadata: {
        name: 'hyper98.trade',
        url: 'https://hyper98.trade',
      },
    }),
    coinbaseWallet({ appName: 'hyper98.trade' }),
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: 'hyper98.trade',
        description: "Trade Hyperliquid like it's 1998.",
        url: 'https://hyper98.trade',
        icons: [],
      },
    }),
  ],
});
