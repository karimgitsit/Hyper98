import React from 'react';
import type { AppType } from '@/stores/windowStore';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * All app icons as pixel-art SVGs. Rendered at 32x32 by default,
 * scaled via CSS. `image-rendering: pixelated` keeps them crisp.
 */

export function ChartIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="4" width="28" height="22" fill="#c0c0c0" stroke="#000" />
      <rect x="4" y="7" width="24" height="16" fill="#000" />
      <polyline points="4,20 9,14 13,17 19,10 24,13 28,8" stroke="#00ff00" strokeWidth="1.5" fill="none" />
      <circle cx="9" cy="14" r="1" fill="#ffff00" />
      <circle cx="19" cy="10" r="1" fill="#ffff00" />
      <rect x="6" y="27" width="4" height="2" fill="#808080" />
    </svg>
  );
}

export function OrderbookIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="3" width="26" height="26" fill="#c0c0c0" stroke="#000" />
      <rect x="5" y="5" width="22" height="3" fill="#a80000" />
      <rect x="5" y="9" width="18" height="3" fill="#ff9999" />
      <rect x="5" y="13" width="14" height="3" fill="#ffcccc" />
      <rect x="5" y="17" width="14" height="3" fill="#ccffcc" />
      <rect x="5" y="21" width="18" height="3" fill="#99ff99" />
      <rect x="5" y="25" width="22" height="3" fill="#008000" />
    </svg>
  );
}

export function MarketIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="4" width="28" height="24" fill="#c0c0c0" stroke="#000" />
      <rect x="2" y="4" width="28" height="3" fill="#000080" />
      {/* Chart pane */}
      <rect x="4" y="9" width="13" height="17" fill="#000" stroke="#808080" />
      <polyline points="5,22 8,17 11,19 14,13 16,15" stroke="#00ff00" strokeWidth="1" fill="none" />
      {/* Book pane */}
      <rect x="18" y="9" width="5" height="17" fill="#fff" stroke="#808080" />
      <rect x="18" y="10" width="5" height="2" fill="#a80000" />
      <rect x="18" y="13" width="5" height="2" fill="#ff9999" />
      <rect x="18" y="17" width="5" height="2" fill="#ccffcc" />
      <rect x="18" y="20" width="5" height="2" fill="#99ff99" />
      <rect x="18" y="23" width="5" height="2" fill="#008000" />
      {/* Trade pane */}
      <rect x="24" y="9" width="6" height="17" fill="#c0c0c0" stroke="#808080" />
      <rect x="25" y="11" width="4" height="3" fill="#008000" />
      <rect x="25" y="15" width="4" height="3" fill="#a80000" />
      <rect x="25" y="20" width="4" height="4" fill="#fff" stroke="#808080" strokeWidth="0.5" />
    </svg>
  );
}

export function MarketsIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="5" width="28" height="22" fill="#c0c0c0" stroke="#000" />
      <rect x="4" y="7" width="24" height="3" fill="#000080" />
      <g fontFamily="monospace" fontSize="7" fill="#000">
        <rect x="4" y="11" width="24" height="4" fill="#fff" />
        <rect x="4" y="15" width="24" height="4" fill="#dfdfdf" />
        <rect x="4" y="19" width="24" height="4" fill="#fff" />
        <rect x="4" y="23" width="24" height="3" fill="#dfdfdf" />
      </g>
      <rect x="6" y="12" width="4" height="1" fill="#000" />
      <rect x="22" y="12" width="4" height="1" fill="#008000" />
      <rect x="6" y="16" width="4" height="1" fill="#000" />
      <rect x="22" y="16" width="4" height="1" fill="#a80000" />
      <rect x="6" y="20" width="4" height="1" fill="#000" />
      <rect x="22" y="20" width="4" height="1" fill="#008000" />
    </svg>
  );
}

export function PositionsIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="4" y="4" width="24" height="24" fill="#ffffcc" stroke="#000" />
      <rect x="4" y="4" width="24" height="3" fill="#808080" />
      <line x1="6" y1="11" x2="26" y2="11" stroke="#000" />
      <line x1="6" y1="15" x2="26" y2="15" stroke="#000" />
      <line x1="6" y1="19" x2="26" y2="19" stroke="#000" />
      <line x1="6" y1="23" x2="20" y2="23" stroke="#000" />
      <circle cx="26" cy="23" r="2" fill="#a80000" />
    </svg>
  );
}

export function OrdersIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="4" y="3" width="22" height="26" fill="#fff" stroke="#000" />
      <polyline points="4,3 26,3 28,5 28,29 4,29" fill="none" stroke="#000" />
      <line x1="7" y1="8" x2="23" y2="8" stroke="#000" />
      <line x1="7" y1="12" x2="23" y2="12" stroke="#000" />
      <line x1="7" y1="16" x2="23" y2="16" stroke="#000" />
      <line x1="7" y1="20" x2="18" y2="20" stroke="#000" />
      <rect x="20" y="22" width="6" height="5" fill="#ff0000" stroke="#000" />
      <text x="23" y="26" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#fff">X</text>
    </svg>
  );
}

export function WalletIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="8" width="26" height="18" fill="#4a4a4a" stroke="#000" />
      <rect x="3" y="8" width="26" height="4" fill="#202020" />
      <rect x="6" y="15" width="20" height="9" fill="#ffd700" stroke="#000" />
      <text x="16" y="22" textAnchor="middle" fontFamily="monospace" fontSize="7" fontWeight="bold" fill="#000">USDC</text>
      <circle cx="24" cy="12" r="1" fill="#808080" />
    </svg>
  );
}

export function Hip3Icon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="3" width="26" height="26" fill="#c0c0c0" stroke="#000" />
      <circle cx="16" cy="16" r="10" fill="#000080" stroke="#000" />
      <text x="16" y="20" textAnchor="middle" fontFamily="sans-serif" fontSize="10" fontWeight="bold" fill="#fff">3</text>
    </svg>
  );
}

export function FillsIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="5" width="26" height="22" fill="#fff" stroke="#000" />
      <rect x="3" y="5" width="26" height="4" fill="#006400" />
      <rect x="5" y="11" width="10" height="2" fill="#000" />
      <rect x="17" y="11" width="10" height="2" fill="#008000" />
      <rect x="5" y="15" width="10" height="2" fill="#000" />
      <rect x="17" y="15" width="10" height="2" fill="#a80000" />
      <rect x="5" y="19" width="10" height="2" fill="#000" />
      <rect x="17" y="19" width="10" height="2" fill="#008000" />
      <rect x="5" y="23" width="10" height="2" fill="#000" />
      <rect x="17" y="23" width="10" height="2" fill="#008000" />
    </svg>
  );
}

export function AboutIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <circle cx="16" cy="16" r="13" fill="#0000ee" stroke="#000" />
      <text x="16" y="22" textAnchor="middle" fontFamily="serif" fontSize="18" fontWeight="bold" fontStyle="italic" fill="#fff">i</text>
    </svg>
  );
}

export function ReadmeIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="5" y="3" width="20" height="26" fill="#fff" stroke="#000" />
      <polyline points="5,3 25,3 27,5 27,29 5,29" fill="none" stroke="#000" />
      <line x1="8" y1="8" x2="22" y2="8" stroke="#000" />
      <line x1="8" y1="11" x2="22" y2="11" stroke="#000" />
      <line x1="8" y1="14" x2="22" y2="14" stroke="#000" />
      <line x1="8" y1="17" x2="18" y2="17" stroke="#000" />
      <line x1="8" y1="20" x2="22" y2="20" stroke="#000" />
      <line x1="8" y1="23" x2="16" y2="23" stroke="#000" />
    </svg>
  );
}

export function PaintIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      {/* Palette/canvas */}
      <rect x="3" y="6" width="22" height="16" fill="#fff" stroke="#000" />
      {/* Color swatches */}
      <rect x="5" y="8" width="3" height="3" fill="#a80000" />
      <rect x="8" y="8" width="3" height="3" fill="#ffff00" />
      <rect x="11" y="8" width="3" height="3" fill="#008000" />
      <rect x="14" y="8" width="3" height="3" fill="#000080" />
      <rect x="17" y="8" width="3" height="3" fill="#800080" />
      {/* Brush handle */}
      <rect x="18" y="14" width="10" height="2" fill="#a08040" transform="rotate(30 18 14)" />
      {/* Brush tip */}
      <rect x="15" y="16" width="4" height="3" fill="#000080" transform="rotate(30 15 16)" />
      {/* Paint drip */}
      <circle cx="12" cy="22" r="2" fill="#000080" />
      <rect x="3" y="24" width="22" height="4" fill="#c0c0c0" stroke="#000" />
    </svg>
  );
}

export function MinesweeperIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="3" width="26" height="26" fill="#c0c0c0" stroke="#000" />
      {/* Raised cell */}
      <rect x="6" y="6" width="20" height="20" fill="#c0c0c0" />
      <path d="M6 6 H26 V7 H7 V26 H6 Z" fill="#fff" />
      <path d="M26 6 V26 H6 V25 H25 V6 Z" fill="#808080" />
      {/* Mine */}
      <circle cx="16" cy="16" r="6" fill="#000" />
      <rect x="15" y="9" width="2" height="3" fill="#000" />
      <rect x="15" y="20" width="2" height="3" fill="#000" />
      <rect x="9" y="15" width="3" height="2" fill="#000" />
      <rect x="20" y="15" width="3" height="2" fill="#000" />
      <rect x="14" y="14" width="2" height="2" fill="#fff" />
    </svg>
  );
}

export function SolitaireIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      {/* Back card */}
      <rect x="4" y="6" width="16" height="22" fill="#fff" stroke="#000" />
      <rect x="5" y="7" width="14" height="20" fill="#a80000" />
      {/* Front card */}
      <rect x="12" y="4" width="16" height="22" fill="#fff" stroke="#000" />
      <text x="14" y="11" fontFamily="serif" fontSize="7" fontWeight="bold" fill="#a80000">A</text>
      <text x="14" y="16" fontFamily="serif" fontSize="6" fill="#a80000">♥</text>
      <text x="20" y="23" fontFamily="serif" fontSize="9" fill="#a80000">♥</text>
    </svg>
  );
}

export function Magic8BallIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      {/* Black ball */}
      <circle cx="16" cy="16" r="13" fill="#000" stroke="#000" />
      <circle cx="12" cy="12" r="3" fill="#3a3a3a" opacity="0.7" />
      {/* White circle with "8" */}
      <circle cx="16" cy="16" r="6" fill="#fff" stroke="#000" />
      <text x="16" y="20" textAnchor="middle" fontFamily="serif" fontSize="9" fontWeight="bold" fill="#000">8</text>
    </svg>
  );
}

export function CalculatorIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      {/* Body */}
      <rect x="5" y="3" width="22" height="26" fill="#c0c0c0" stroke="#000" />
      <path d="M5 3 H27 V4 H6 V29 H5 Z" fill="#fff" />
      <path d="M27 3 V29 H5 V28 H26 V3 Z" fill="#808080" />
      {/* Display */}
      <rect x="7" y="5" width="18" height="5" fill="#a8d8a8" stroke="#000" />
      <rect x="20" y="6" width="4" height="3" fill="#000" />
      {/* Buttons */}
      <rect x="7" y="12" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="11" y="12" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="15" y="12" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="19" y="12" width="3" height="3" fill="#a80000" stroke="#000" strokeWidth="0.5" />
      <rect x="7" y="16" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="11" y="16" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="15" y="16" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="19" y="16" width="3" height="3" fill="#a80000" stroke="#000" strokeWidth="0.5" />
      <rect x="7" y="20" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="11" y="20" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="15" y="20" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="19" y="20" width="3" height="3" fill="#a80000" stroke="#000" strokeWidth="0.5" />
      <rect x="7" y="24" width="7" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="15" y="24" width="3" height="3" fill="#fff" stroke="#000" strokeWidth="0.5" />
      <rect x="19" y="24" width="3" height="3" fill="#a80000" stroke="#000" strokeWidth="0.5" />
    </svg>
  );
}

export function AdminIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      {/* Locked briefcase — admin/management */}
      <rect x="4" y="10" width="24" height="18" fill="#808080" stroke="#000" />
      <rect x="4" y="10" width="24" height="3" fill="#202020" />
      {/* Handle */}
      <rect x="12" y="6" width="8" height="5" fill="none" stroke="#000" strokeWidth="1.5" />
      {/* Lock / key plate */}
      <rect x="14" y="16" width="4" height="6" fill="#ffd700" stroke="#000" />
      <circle cx="16" cy="18" r="1" fill="#000" />
      {/* Gold trim stripes */}
      <rect x="4" y="18" width="24" height="1" fill="#ffd700" />
    </svg>
  );
}

export function SettingsIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} style={{ imageRendering: 'pixelated' }}>
      {/* Control Panel style — yellow folder with wrench */}
      <rect x="2" y="9" width="28" height="20" fill="#ffd700" stroke="#000" />
      <rect x="2" y="9" width="10" height="3" fill="#ffd700" stroke="#000" />
      <rect x="3" y="12" width="26" height="16" fill="#ffffcc" stroke="#000" />
      {/* Wrench body */}
      <rect x="14" y="15" width="4" height="9" fill="#808080" stroke="#000" strokeWidth="0.5" />
      {/* Wrench head */}
      <rect x="11" y="13" width="10" height="4" fill="#808080" stroke="#000" strokeWidth="0.5" />
      <rect x="11" y="13" width="3" height="2" fill="#c0c0c0" />
      <rect x="18" y="13" width="3" height="2" fill="#c0c0c0" />
    </svg>
  );
}

export function ShutdownIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} style={{ imageRendering: 'pixelated' }}>
      <circle cx="10" cy="11" r="6" fill="none" stroke="#a80000" strokeWidth="2" />
      <rect x="9" y="3" width="2" height="7" fill="#a80000" />
    </svg>
  );
}

export function StartLogo({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} style={{ imageRendering: 'pixelated' }}>
      <path d="M1,3 L7,2 L7,8 L1,8 Z" fill="#ff0000" />
      <path d="M8,2 L15,1 L15,8 L8,8 Z" fill="#00ff00" />
      <path d="M1,9 L7,9 L7,15 L1,14 Z" fill="#0000ff" />
      <path d="M8,9 L15,9 L15,15 L8,15 Z" fill="#ffff00" />
    </svg>
  );
}

export const APP_ICONS: Record<AppType, React.FC<IconProps>> = {
  chart: ChartIcon,
  orderbook: OrderbookIcon,
  market: MarketIcon,
  markets: MarketsIcon,
  positions: PositionsIcon,
  orders: OrdersIcon,
  wallet: WalletIcon,
  hip3: Hip3Icon,
  fills: FillsIcon,
  about: AboutIcon,
  readme: ReadmeIcon,
  paint: PaintIcon,
  minesweeper: MinesweeperIcon,
  solitaire: SolitaireIcon,
  magic8ball: Magic8BallIcon,
  calculator: CalculatorIcon,
  admin: AdminIcon,
  settings: SettingsIcon,
};

export function AppIcon({ type, size = 32, className }: { type: AppType } & IconProps) {
  const Icon = APP_ICONS[type];
  return <Icon size={size} className={className} />;
}
