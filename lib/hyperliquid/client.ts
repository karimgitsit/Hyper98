import { HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { IS_TESTNET } from './constants';

const transport = new HttpTransport({ isTestnet: IS_TESTNET });

export const info = new InfoClient({ transport });
