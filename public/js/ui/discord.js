// Link to this server's Discord community (stronghold-en.dev): title screen corner, lobby and room top bars. It is this
// server's own link, like ui/about.js, not an upstream feature; "Discord" is a brand name, so it is not translated.

import { html } from './components.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

export const DISCORD_URL = 'https://discord.gg/E5c92H6kZW';

// The Discord "Clyde" mark (brand glyph, 127×96 viewBox), drawn in Discord blurple (css .discord-btn)
const CLYDE = 'M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15zM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69z';

/**
 * The Discord button: an <a> styled as a Button (components.js), opening the invite in a new tab.
 * @param {{ class?: string, size?: 'sm'|'md'|'lg', variant?: string, square?: boolean, label?: string }} props
 */
export function DiscordButton({ class: cls, size = 'sm', variant = 'ghost', square = false, label = 'Discord' }) {
  return html`<a href=${DISCORD_URL} target="_blank" rel="noopener noreferrer" title="Discord" aria-label="Discord"
    class=${cx('btn', `btn--${variant}`, `btn--${size}`, square && 'btn--square', 'discord-btn', cls)}>
    <svg class="icon btn__icon discord-btn__icon" viewBox="0 0 127.14 96.36" aria-hidden="true" focusable="false"><path d=${CLYDE} /></svg>
    ${square ? null : html`<span class="btn__label">${label}</span>`}
  </a>`;
}
