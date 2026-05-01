'use client';

// M0 alias so callers importing `RightClickMenu` (per spec) get the same
// Win98 portalled menu as `ContextMenu`. One implementation, two names.
export { ContextMenu as RightClickMenu } from './ContextMenu';
export type { ContextMenuItem as RightClickMenuItem } from './ContextMenu';
