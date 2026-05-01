# hyper98

A Windows 98–themed frontend for [Hyperliquid](https://hyperliquid.xyz) perpetuals — draggable windows, taskbar, Start menu, MS Sans Serif. Live at [hyper98.trade](https://hyper98.trade).

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- wagmi + viem + ConnectKit for wallet connections
- [@nktkas/hyperliquid](https://github.com/nktkas/hyperliquid) SDK
- Zustand for client state, TanStack Query for async
- lightweight-charts for the chart window
- react-rnd for draggable / resizable windows

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

## Environment variables

All vars are `NEXT_PUBLIC_*` and ship with the browser bundle — there are no server-side secrets.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect project ID from [cloud.reown.com](https://cloud.reown.com/). Optional. |
| `NEXT_PUBLIC_HL_NETWORK` | `mainnet` or `testnet`. Defaults to `testnet`. |
| `NEXT_PUBLIC_ADMIN_ADDRESSES` | Comma-separated lowercase `0x...` addresses allowed to open Admin.exe. |

Changing any of these requires a rebuild — Next.js inlines `NEXT_PUBLIC_*` values at build time.

## Deployment

Hosted on Vercel. Pushes to `main` deploy to production at [hyper98.trade](https://hyper98.trade); other branches get preview URLs. Set the env vars above in Vercel project settings.

## License

All rights reserved.
