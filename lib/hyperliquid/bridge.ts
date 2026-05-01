/**
 * Arbitrum-side bridge deposit. The HL "deposit" is just an ERC-20 transfer
 * of USDC to the Bridge2 contract — HL credits the sender's account once
 * the tx confirms (<1 min on Arbitrum). Withdrawals go the other direction
 * via the HL exchange API; see `withdrawUsdc` in ./orders.ts.
 */

import { erc20Abi, parseUnits, type WalletClient } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import { BRIDGE_ADDRESS, IS_TESTNET, USDC_ADDRESS, USDC_DECIMALS } from './constants';

const targetChain = IS_TESTNET ? arbitrumSepolia : arbitrum;

export async function depositUsdc(
  wallet: WalletClient,
  amount: string,
): Promise<`0x${string}`> {
  const account = wallet.account;
  if (!account) throw new Error('Wallet not connected');

  // The bridge only exists on its home chain. Ask the wallet for its live
  // chain (not wallet.chain, which is the static viem-side reference and
  // doesn't reflect runtime network switches) and prompt a switch if
  // needed. Without this, writeContract throws ChainMismatchError when
  // the user's wallet is on a different network.
  const currentChainId = await wallet.getChainId();
  if (currentChainId !== targetChain.id) {
    await wallet.switchChain({ id: targetChain.id });
  }

  const value = parseUnits(amount, USDC_DECIMALS);

  return wallet.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [BRIDGE_ADDRESS, value],
    chain: targetChain,
    account,
  });
}
