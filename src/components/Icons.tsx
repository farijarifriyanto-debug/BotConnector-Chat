import React from 'react'
import { SvgXml } from 'react-native-svg'

// Same line icons as the web Chat. `Stop` is a filled square, drawn separately.
const PATHS = {
  Plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  ArrowDown: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
  Panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  Ghost: '<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.1A10.4 10.4 0 0112 5c5 0 8.5 4 9.5 7a13 13 0 01-2.6 3.9M6.1 6.1A13.3 13.3 0 002.5 12c1 3 4.5 7 9.5 7 1.6 0 3-.4 4.2-1"/>',
  ChevL: '<path d="M15 6l-6 6 6 6"/>',
  ChevR: '<path d="M9 6l6 6-6 6"/>',
  Folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  Bookmark: '<path d="M6 4h12v17l-6-4-6 4z"/>',
  User: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  Trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  Mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/>',
  Speaker: '<path d="M4 10v4h4l5 4V6l-5 4z"/><path d="M16 9a4 4 0 010 6"/><path d="M18.5 6.5a8 8 0 010 11"/>',
  Camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  Laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>',
  Research: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/><path d="M11 8.5v5M8.5 11h5"/>',
  Send: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  Clip: '<path d="M20 11.5l-8.2 8.2a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-8.3 8.3a1.7 1.7 0 01-2.4-2.4l7.6-7.6"/>',
  Globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5S14.4 18.100 12 20.500c-2.4-2.4-3.5-5.200-3.500-8.500S9.600 5.900 12 3.500z"/>',
  Copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  Check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  Refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 5v6h-6"/>',
  Pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  Download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  MenuIcon: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  Close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  Search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  Chevron: '<path d="M6 9l6 6 6-6"/>',
  FileIcon: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  ImageIcon: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M5 17l5-4 3 3 3-2 3 3"/>',
  Sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  Moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
  Auto: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',
  Sliders: '<path d="M5 8h9"/><path d="M18 8h1"/><circle cx="16" cy="8" r="2"/><path d="M5 16h1"/><path d="M10 16h9"/><circle cx="8" cy="16" r="2"/>',
  Share: '<circle cx="6" cy="12" r="2.4"/><circle cx="17" cy="6" r="2.4"/><circle cx="17" cy="18" r="2.4"/><path d="M8.2 11l6.6-3.8M8.2 13l6.6 3.8"/>',
  Left: '<path d="M15 6l-6 6 6 6"/>',
} as const
export type IconName = keyof typeof PATHS | 'Stop'

export function Icon({ name, size = 20, color = '#000', strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const body = name === 'Stop' ? `<rect x="6" y="6" width="12" height="12" rx="2.5" fill="${color}" stroke="none"/>` : PATHS[name]
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  return <SvgXml xml={xml} width={size} height={size} />
}
