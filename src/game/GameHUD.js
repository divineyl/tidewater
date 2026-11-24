import { FISH, LURES, LURE_IDS, fishLengthCm } from './FishTable.js';
import { UPGRADES, BOAT_PAINTS, BOAT_PAINT_IDS, nextLevel, FUEL_PRICE } from './Gear.js';
import { FishPortrait } from './FishPortrait.js';
import { LANDMARKS } from './Landmarks.js';
import { RALLY_GATES, RALLY_MEDALS } from './RallyCourse.js';
import { getLang, onLangChange, tr, trFish, trUpgradeName, trUpgradeLabel } from '../i18n/i18n.js';

// DOM for the fishing game, in the look of the rest of the HUD (ui/ui.css tokens, .tw-glass):
//   top right     purse and cooler / hold load
//   bottom centre the fight: line tension with its safe band, the fish's stamina, line out
//   centre        "!" when a fish takes the bait
//   panels        inventory (I / Tab) and the fish stand's offer
//   catch card    full screen: the world dims and blurs, the fish lies side-on in its own studio light
//                 (FishPortrait) with the species above and length, weight, value, record below
const CSS = /* css */`
.gm-purse { position: absolute; top: var(--tw-edge); right: var(--tw-edge); display: flex; gap: var(--tw-3); align-items: center;
	padding: var(--tw-2) var(--tw-4); border-radius: 999px; font: 500 var(--tw-fs-lg) var(--tw-font); color: var(--tw-ink); pointer-events: none;
	transition: transform var(--tw-med) var(--tw-ease), right var(--tw-slow) var(--tw-ease); }
.tw-root[data-panel='open'] .gm-purse { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }
.tw-root.is-photo .gm-panel { display: none; }
.gm-purse.is-bump { animation: gm-bump 420ms var(--tw-ease); }
@keyframes gm-bump { 30% { transform: scale(1.08); } }
.gm-money { font-family: var(--tw-mono); color: var(--tw-sun); font-weight: 600; }
.gm-cooler { display: flex; align-items: center; gap: var(--tw-2); color: var(--tw-ink-2); font-size: var(--tw-fs-md); }
.gm-cooler-bar { width: calc(64 * var(--tw-u)); height: calc(5 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-cooler-bar > span { display: block; height: 100%; width: 0; background: var(--tw-aqua); border-radius: inherit; transition: width var(--tw-med) var(--tw-ease); }
.gm-cooler.is-full .gm-cooler-bar > span { background: var(--tw-coral); }
.gm-fight { position: absolute; left: 50%; bottom: calc(max(calc(72 * var(--tw-u)), 13vh) + calc(58 * var(--tw-u))); transform: translateX(-50%);
	width: calc(360 * var(--tw-u)); padding: var(--tw-3) var(--tw-4); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink);
	opacity: 0; transition: opacity var(--tw-med) var(--tw-ease); pointer-events: none; }
.gm-fight.is-on { opacity: 1; }
.gm-fight-head { display: flex; justify-content: space-between; margin-bottom: var(--tw-2); }
.gm-fight-call { font-weight: 600; letter-spacing: 0.02em; }
.gm-fight-call.is-warn { color: var(--tw-coral); }
.gm-fight-call.is-good { color: var(--tw-aqua); }
.gm-fight-dist { font-family: var(--tw-mono); color: var(--tw-ink-2); }
.gm-tension { position: relative; height: calc(12 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-band { position: absolute; top: 0; bottom: 0; background: rgba(var(--tw-aqua-rgb), 0.28); border-left: 1px solid rgba(var(--tw-aqua-rgb), 0.6); border-right: 1px solid rgba(var(--tw-aqua-rgb), 0.6); }
.gm-danger { position: absolute; top: 0; bottom: 0; right: 0; width: 8%; background: rgba(255, 122, 133, 0.35); }
.gm-needle { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--tw-ink); box-shadow: 0 0 8px rgba(255,255,255,0.6); }
.gm-needle.is-hot { background: var(--tw-coral); box-shadow: 0 0 10px var(--tw-coral); }
.gm-stamina { margin-top: var(--tw-2); display: flex; align-items: center; gap: var(--tw-2); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-stamina-bar { flex: 1; height: calc(4 * var(--tw-u)); border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; }
.gm-stamina-bar > span { display: block; height: 100%; background: var(--tw-sun); }
.gm-bite { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%) scale(0.6); font: 800 calc(56 * var(--tw-u)) var(--tw-font);
	color: var(--tw-sun); text-shadow: 0 0 18px rgba(var(--tw-sun-rgb), 0.8), 0 2px 4px rgba(0,0,0,0.5); opacity: 0; pointer-events: none;
	transition: opacity 120ms, transform 200ms var(--tw-ease); }
.gm-bite.is-on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.gm-cast { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); width: calc(140 * var(--tw-u)); height: calc(5 * var(--tw-u));
	border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; opacity: 0; transition: opacity var(--tw-fast); pointer-events: none; }
.gm-cast.is-on { opacity: 1; }
.gm-cast > span { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--tw-aqua), var(--tw-sun)); }
.gm-dot { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%; background: rgba(255,255,255,0.7); box-shadow: 0 0 3px rgba(0,0,0,0.6); opacity: 0; pointer-events: none; }
.gm-dot.is-on { opacity: 1; }
.gm-panel { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -48%); width: calc(420 * var(--tw-u)); max-height: 70vh; display: flex; flex-direction: column;
	padding: var(--tw-4) var(--tw-5); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink);
	opacity: 0; pointer-events: none; transition: opacity var(--tw-med) var(--tw-ease), transform var(--tw-slow) var(--tw-ease); }
.gm-panel.is-open { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%); }
.gm-panel h2 { margin: 0 0 var(--tw-1); font-size: calc(17 * var(--tw-u)); font-weight: 600; }
.gm-panel p.gm-sub { margin: 0 0 var(--tw-3); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-list { overflow: auto; margin: 0 calc(-1 * var(--tw-2)); padding: 0 var(--tw-2); }
.gm-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: var(--tw-3); align-items: center; padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-row .gm-kg, .gm-row .gm-val { font-family: var(--tw-mono); color: var(--tw-ink-2); }
.gm-row .gm-val { color: var(--tw-sun); }
.gm-row small { color: var(--tw-aqua); margin-left: var(--tw-1); }
.gm-empty { color: var(--tw-ink-3); padding: var(--tw-4) 0; text-align: center; }
.gm-foot { display: flex; justify-content: space-between; align-items: center; margin-top: var(--tw-3); gap: var(--tw-3); }
.gm-btn { font: 600 var(--tw-fs-md) var(--tw-font); color: #0b1418; background: var(--tw-aqua); border: 0; border-radius: 999px; padding: var(--tw-2) var(--tw-4); cursor: pointer; }
.gm-btn[disabled] { opacity: 0.4; cursor: default; }
.gm-btn.is-ghost { background: var(--tw-fill-2); color: var(--tw-ink); }
.gm-mini { font: 500 var(--tw-fs-sm) var(--tw-font); color: var(--tw-ink-2); background: var(--tw-fill); border: 1px solid var(--tw-line); border-radius: 999px; padding: 2px var(--tw-2); cursor: pointer; }
.gm-gauge { display: none; align-items: center; gap: var(--tw-2); color: var(--tw-ink-2); font-size: var(--tw-fs-md); }
.gm-gauge.is-on { display: flex; }
.gm-gauge b { font-family: var(--tw-mono); font-weight: 500; color: var(--tw-ink); }
.gm-fuel-bar > span { background: var(--tw-sun); }
.gm-fuel.is-low .gm-fuel-bar > span { background: var(--tw-coral); }
.gm-sonar-dots { letter-spacing: 1px; color: var(--tw-aqua); }
.gm-shop-row { display: grid; grid-template-columns: 1fr auto; gap: var(--tw-3); align-items: center; padding: var(--tw-2) 0; border-bottom: 1px solid var(--tw-line); }
.gm-shop-sec { margin-top: var(--tw-3); padding: var(--tw-1) 0; font-size: var(--tw-fs-xs); font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--tw-aqua); border-bottom: 1px solid rgba(var(--tw-aqua-rgb), 0.3); }
.gm-shop-sec:first-child { margin-top: 0; }
.gm-shop-row small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); margin-top: 2px; }
.gm-shop-row .gm-have { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-log { margin-top: var(--tw-3); color: var(--tw-ink-3); font-size: var(--tw-fs-sm); line-height: 1.5; }
.gm-row .gm-cm { font-family: var(--tw-mono); color: var(--tw-ink-3); }
.gm-row.has-cm { grid-template-columns: 1fr auto auto auto auto; }

/* Lure badge & Rally timer HUD */
.gm-lure { position: absolute; right: var(--tw-edge); top: calc(var(--tw-edge) + 42 * var(--tw-u)); display: none; align-items: center; gap: var(--tw-2);
	padding: var(--tw-1) var(--tw-3); border-radius: 999px; font: 500 var(--tw-fs-xs) var(--tw-font); color: var(--tw-aqua); pointer-events: none;
	transition: right var(--tw-slow) var(--tw-ease); }
.gm-lure.is-on { display: inline-flex; }
.gm-lure kbd { font: 600 10px var(--tw-mono); padding: 1px 5px; border-radius: 4px; background: var(--tw-fill-2); color: var(--tw-ink); }
.tw-root[data-panel='open'] .gm-lure { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }

.gm-rally { position: absolute; left: 50%; top: var(--tw-edge); transform: translateX(-50%); display: none; align-items: center; gap: var(--tw-3);
	padding: var(--tw-2) var(--tw-4); border-radius: 999px; font: 600 var(--tw-fs-md) var(--tw-mono); color: var(--tw-sun); pointer-events: none; z-index: 20; }
.gm-rally.is-on { display: inline-flex; }

/* Island Journal (J) */
.gm-journal { width: min(92vw, calc(520 * var(--tw-u))); max-height: 76vh; z-index: 44; }
.gm-j-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: var(--tw-3); }
.gm-j-tab { font: 600 var(--tw-fs-xs) var(--tw-font); color: var(--tw-ink-2); background: var(--tw-fill); border: 1px solid var(--tw-line);
	border-radius: 8px; padding: 6px 4px; cursor: pointer; transition: background var(--tw-fast), color var(--tw-fast), border-color var(--tw-fast); }
.gm-j-tab.is-active { background: rgba(var(--tw-aqua-rgb), 0.18); color: var(--tw-aqua); border-color: rgba(var(--tw-aqua-rgb), 0.5); }
.gm-j-card { padding: var(--tw-2) var(--tw-3); border-radius: var(--tw-r-md); background: var(--tw-fill); border: 1px solid var(--tw-line); margin-bottom: var(--tw-2); }
.gm-j-row { display: flex; justify-content: space-between; align-items: center; gap: var(--tw-2); }
.gm-j-title { font-weight: 600; color: var(--tw-ink); }
.gm-j-sub { font-size: var(--tw-fs-xs); color: var(--tw-ink-3); margin-top: 3px; line-height: 1.45; }
.gm-j-prog { height: 5px; border-radius: 99px; background: var(--tw-fill-2); overflow: hidden; margin-top: 6px; }
.gm-j-prog > span { display: block; height: 100%; background: var(--tw-aqua); }
.gm-j-card.is-done { border-color: rgba(var(--tw-aqua-rgb), 0.45); background: rgba(var(--tw-aqua-rgb), 0.08); }
.gm-j-badge { font: 600 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-sun); white-space: nowrap; }
.gm-j-badge.is-done { color: var(--tw-aqua); }
.gm-stand-bounties { margin-top: var(--tw-2); padding-top: var(--tw-2); border-top: 1px solid var(--tw-line); font-size: var(--tw-fs-xs); color: var(--tw-ink-2); }

/* catch card: full screen. The world dims and blurs; the fish lies side-on in its own studio light
   (FishPortrait, a WebGPU canvas) between the name above and the numbers below */
.gm-catch-scrim { position: absolute; inset: 0; pointer-events: none; opacity: 0; visibility: hidden;
	background: radial-gradient(70% 60% at 50% 50%, rgba(10, 22, 34, 0.55) 0%, rgba(4, 9, 15, 0.86) 100%);
	-webkit-backdrop-filter: blur(10px) saturate(0.8); backdrop-filter: blur(10px) saturate(0.8);
	transition: opacity 420ms var(--tw-ease), visibility 0s linear 420ms; }
.gm-catch-scrim.is-on { opacity: 1; visibility: visible; transition: opacity 420ms var(--tw-ease), visibility 0s; }
.gm-catch { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(6px, 1.4vh, 18px);
	padding: var(--tw-6) var(--tw-edge); color: #f4ead6; font: 500 var(--tw-fs-md) var(--tw-font); text-align: center;
	pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 300ms var(--tw-ease), visibility 0s linear 300ms; }
.gm-catch.is-on { opacity: 1; visibility: visible; transition: opacity 300ms var(--tw-ease), visibility 0s; }
.gm-catch-top, .gm-catch-bottom { display: flex; flex-direction: column; align-items: center; opacity: 0; }
.gm-catch.is-on .gm-catch-top { animation: gm-rise 700ms var(--tw-ease) 120ms forwards; }
.gm-catch.is-on .gm-catch-bottom { animation: gm-rise 700ms var(--tw-ease) 520ms forwards; }
@keyframes gm-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.gm-catch-eyebrow { display: flex; align-items: center; justify-content: center; min-height: calc(26 * var(--tw-u)); margin-bottom: var(--tw-2);
	font-size: var(--tw-fs-sm); font-weight: 700; letter-spacing: 0.32em; text-transform: uppercase; color: rgba(244, 234, 214, 0.62); }
.gm-badge { display: inline-flex; align-items: center; gap: 0.5em; padding: calc(4 * var(--tw-u)) calc(12 * var(--tw-u)); border-radius: 4px;
	letter-spacing: 0.22em; font-weight: 800; transform: scale(2.4) rotate(-8deg); opacity: 0; }
.gm-catch.is-on .gm-badge { animation: gm-stamp 520ms cubic-bezier(0.3, 1.5, 0.5, 1) 900ms forwards; }
.gm-badge.is-record { color: #2a1604; background: linear-gradient(100deg, #f3cf8a 0%, #d9a441 40%, #fff0cf 50%, #d9a441 60%, #f3cf8a 100%); background-size: 250% 100%;
	box-shadow: 0 0 0 2px rgba(42, 22, 4, 0.35) inset, 0 0 26px rgba(217, 164, 65, 0.55); }
.gm-catch.is-on .gm-badge.is-record { animation: gm-stamp 520ms cubic-bezier(0.3, 1.5, 0.5, 1) 900ms forwards, gm-shine 2.6s var(--tw-ease-io) 1.6s infinite; }
.gm-badge.is-new { color: #062420; background: #6fd6c6; box-shadow: 0 0 0 2px rgba(6, 36, 32, 0.3) inset, 0 0 22px rgba(111, 214, 198, 0.45); }
.gm-badge.is-plain { color: rgba(244, 234, 214, 0.8); background: none; box-shadow: inset 0 0 0 1px rgba(244, 234, 214, 0.35); }
@keyframes gm-stamp { 0% { transform: scale(2.4) rotate(-8deg); opacity: 0; } 70% { transform: scale(0.94) rotate(-3deg); opacity: 1; } 100% { transform: scale(1) rotate(-3deg); opacity: 1; } }
@keyframes gm-shine { 0% { background-position: 100% 0; } 100% { background-position: -150% 0; } }
.gm-catch h2 { margin: 0; font-family: 'Caveat Brush', 'Kalam', var(--tw-font); font-weight: 400; font-size: clamp(38px, 6.2vw, 92px); line-height: 1; letter-spacing: 0.01em;
	color: #fbf1dc; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.35), 0 8px 30px rgba(0, 0, 0, 0.45); }
.gm-catch-sci { margin-top: calc(4 * var(--tw-u)); font-family: 'Kalam', var(--tw-font); font-style: italic; color: rgba(244, 234, 214, 0.66); font-size: clamp(13px, 1.3vw, 19px); }
.gm-catch-stage { position: relative; width: min(94vw, 1400px, calc(46vh * 2.4)); aspect-ratio: 2.4 / 1; }
.gm-catch-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%;
	-webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%); mask-image: linear-gradient(90deg, transparent 0%, #000 14%, #000 86%, transparent 100%); }
/* the card owns the screen: the minimap and the settings rail step aside */
.tw-root:has(.gm-catch.is-on) .gm-map, .tw-root:has(.gm-catch.is-on) .tw-rail { opacity: 0; pointer-events: none; transition: opacity 300ms; }
.gm-catch-stage::before { content: ''; position: absolute; left: 12%; right: 12%; bottom: 6%; height: 16%; border-radius: 50%;
	background: radial-gradient(closest-side, rgba(0, 0, 0, 0.5), transparent); opacity: 0; }
.gm-catch.is-on .gm-catch-stage::before { animation: gm-fade 900ms var(--tw-ease) 350ms forwards; }
@keyframes gm-fade { to { opacity: 1; } }
.gm-splash { position: absolute; left: 50%; top: 52%; width: 0; height: 0; pointer-events: none; }
.gm-splash i { position: absolute; left: 0; top: 0; width: var(--s); height: var(--s); margin: calc(var(--s) / -2); border-radius: 50%;
	background: radial-gradient(circle at 35% 35%, rgba(255, 255, 255, 0.95), rgba(190, 235, 245, 0.55) 55%, transparent 72%); opacity: 0; }
.gm-catch.is-on .gm-splash i { animation: gm-drop 1100ms cubic-bezier(0.2, 0.7, 0.3, 1) var(--d) forwards; }
@keyframes gm-drop { 0% { opacity: 0; transform: translate(0, 0) scale(0.4); } 12% { opacity: 1; }
	100% { opacity: 0; transform: translate(var(--x), var(--y)) scale(1); } }
.gm-catch-stats { display: flex; justify-content: center; gap: clamp(8px, 1.6vw, 22px); margin-top: var(--tw-2); }
.gm-stat { min-width: clamp(96px, 11vw, 150px); padding: calc(10 * var(--tw-u)) calc(16 * var(--tw-u)) calc(9 * var(--tw-u)); border-radius: 6px;
	background: linear-gradient(180deg, rgba(232, 220, 192, 0.12), rgba(232, 220, 192, 0.05)); box-shadow: inset 0 0 0 1px rgba(214, 180, 110, 0.38), 0 10px 30px rgba(0, 0, 0, 0.25); }
.gm-stat span { display: block; font-size: var(--tw-fs-xs); font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(222, 190, 125, 0.9); }
.gm-stat b { display: block; margin-top: calc(4 * var(--tw-u)); font: 600 clamp(20px, 2.2vw, 32px) var(--tw-mono); color: #fbf1dc; white-space: nowrap; }
.gm-stat b small { font-size: 0.55em; font-weight: 500; color: rgba(244, 234, 214, 0.7); margin-left: 0.2em; }
.gm-stat i { display: block; white-space: nowrap; font-style: normal; font-family: var(--tw-mono); font-size: var(--tw-fs-sm); color: rgba(244, 234, 214, 0.5); margin-top: 2px; }
.gm-stat.is-value b { color: #f0c46a; }
.gm-catch-note { margin-top: var(--tw-3); min-height: 1.4em; color: rgba(244, 234, 214, 0.78); font-family: 'Kalam', var(--tw-font); font-size: clamp(14px, 1.25vw, 19px); line-height: 1.4; }
.gm-catch-note b { color: #f0c46a; font-weight: 700; }
.gm-catch-note.is-warn { color: #ff9a8a; }
.gm-catch-foot { display: flex; align-items: center; justify-content: center; gap: var(--tw-2); margin-top: var(--tw-3); color: rgba(244, 234, 214, 0.5); font-size: var(--tw-fs-sm); }
.gm-catch-foot kbd { font: 600 var(--tw-fs-xs) var(--tw-mono); color: #f4ead6; padding: 2px calc(6 * var(--tw-u)); border-radius: 4px; border: 1px solid rgba(244, 234, 214, 0.3); background: rgba(244, 234, 214, 0.08); }
.gm-catch-timer { width: calc(80 * var(--tw-u)); height: 2px; margin-left: var(--tw-2); border-radius: 2px; background: rgba(244, 234, 214, 0.15); overflow: hidden; }
.gm-catch-timer > span { display: block; height: 100%; width: 100%; background: rgba(244, 234, 214, 0.55); transform-origin: 0 50%; }
.gm-catch.is-on .gm-catch-timer > span { animation: gm-timer var(--gm-catch-ms, 9000ms) linear forwards; }
@keyframes gm-timer { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) {
	.gm-catch.is-on .gm-catch-top, .gm-catch.is-on .gm-catch-bottom { animation: none; opacity: 1; }
	.gm-catch.is-on .gm-badge, .gm-catch.is-on .gm-badge.is-record { animation: none; transform: rotate(-3deg); opacity: 1; }
	.gm-catch.is-on .gm-splash i { animation: none; }
}
@media (max-width: 640px) {
	.gm-catch-stage { width: 96vw; }
	.gm-catch-stats { gap: 6px; }
	.gm-stat { min-width: 0; padding: 8px 10px; }
}
`;

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

export class GameHUD {

	constructor( ui, game ) {

		this.ui = ui;
		this.game = game;
		const style = h( 'style' );
		style.textContent = CSS;
		document.head.append( style );

		this.purse = h( 'div', 'gm-purse tw-glass', `<span class="gm-money">$0</span><span class="gm-cooler"><span class="gm-cooler-label">Cooler</span><span class="gm-cooler-bar"><span></span></span><span class="gm-cooler-kg">0 / 30 kg</span></span><span class="gm-gauge gm-fuel"><span class="gm-fuel-label">Fuel</span><span class="gm-cooler-bar gm-fuel-bar"><span></span></span><b class="gm-fuel-l">40 L</b></span><span class="gm-gauge gm-sonar"><span class="gm-sonar-label">Sonar</span><b class="gm-sonar-d">0 m</b><span class="gm-sonar-dots"></span></span>` );
		this.fuelEl = this.purse.querySelector( '.gm-fuel' );
		this.fuelLabel = this.purse.querySelector( '.gm-fuel-label' );
		this.fuelBar = this.purse.querySelector( '.gm-fuel-bar > span' );
		this.fuelL = this.purse.querySelector( '.gm-fuel-l' );
		this.sonarEl = this.purse.querySelector( '.gm-sonar' );
		this.sonarLabel = this.purse.querySelector( '.gm-sonar-label' );
		this.sonarD = this.purse.querySelector( '.gm-sonar-d' );
		this.sonarDots = this.purse.querySelector( '.gm-sonar-dots' );
		this.moneyEl = this.purse.querySelector( '.gm-money' );
		this.coolerEl = this.purse.querySelector( '.gm-cooler' );
		this.coolerBar = this.purse.querySelector( '.gm-cooler-bar > span' );
		this.coolerKg = this.purse.querySelector( '.gm-cooler-kg' );
		this.coolerLabel = this.purse.querySelector( '.gm-cooler-label' );

		this.fight = h( 'div', 'gm-fight tw-glass', `
			<div class="gm-fight-head"><span class="gm-fight-call">Fish on!</span><span class="gm-fight-dist">0 m</span></div>
			<div class="gm-tension"><span class="gm-band"></span><span class="gm-danger"></span><span class="gm-needle"></span></div>
			<div class="gm-stamina"><span class="gm-stamina-label">Fish</span><span class="gm-stamina-bar"><span></span></span></div>` );
		this.fCall = this.fight.querySelector( '.gm-fight-call' );
		this.fDist = this.fight.querySelector( '.gm-fight-dist' );
		this.fBand = this.fight.querySelector( '.gm-band' );
		this.fNeedle = this.fight.querySelector( '.gm-needle' );
		this.fStam = this.fight.querySelector( '.gm-stamina-bar > span' );
		this.fStamLabel = this.fight.querySelector( '.gm-stamina-label' );

		this.bite = h( 'div', 'gm-bite', '!' );
		this.cast = h( 'div', 'gm-cast', '<span></span>' );
		this.castBar = this.cast.firstChild;
		this.dot = h( 'div', 'gm-dot' );
		this.lureEl = h( 'div', 'gm-lure tw-glass', '<kbd>B</kbd><span class="gm-lure-txt"></span>' );
		this.lureTxt = this.lureEl.querySelector( '.gm-lure-txt' );
		this.rallyEl = h( 'div', 'gm-rally tw-glass', '' );
		this.catchScrim = h( 'div', 'gm-catch-scrim' );
		this.catchCard = h( 'div', 'gm-catch tw-glass' );
		this.catchOpen = false;
		const hud = ui.hud || ui.root;
		hud.append( this.catchScrim, this.purse, this.lureEl, this.rallyEl, this.fight, this.bite, this.cast, this.dot, this.catchCard );

		// panels (interactive)
		this.inv = h( 'div', 'gm-panel tw-glass tw-interactive' );
		this.stand = h( 'div', 'gm-panel tw-glass tw-interactive' );
		this.journal = h( 'div', 'gm-panel gm-journal tw-glass tw-interactive' );
		ui.root.append( this.inv, this.stand, this.journal );
		this.invOpen = false;
		this.standOpen = false;
		this.journalOpen = false;
		this.journalTab = 'bounties';
		this._last = {};
		game.state.onChange( () => this.refresh() );
		this._unsubLang = onLangChange( () => this.refresh() );
		this.refresh();

	}

	toast( text, ms ) {

		this.ui.toast( text, ms );

	}

	refresh() {

		const s = this.game.state;
		const st = s.stats;
		this.moneyEl.textContent = `$${ s.money.toLocaleString() }`;
		const kg = s.holdKg;
		this.coolerLabel.textContent = tr( s.upgrades.hold > 0 ? 'Hold' : 'Cooler' );
		if ( this.fuelLabel ) this.fuelLabel.textContent = tr( 'Fuel' );
		if ( this.sonarLabel ) this.sonarLabel.textContent = tr( 'Sonar' );
		if ( this.fStamLabel ) this.fStamLabel.textContent = tr( 'Fish' );
		this.coolerKg.textContent = `${ kg.toFixed( 1 ) } / ${ st.holdKg } kg`;
		this.coolerBar.style.width = `${ Math.min( 100, kg / st.holdKg * 100 ) }%`;
		this.coolerEl.classList.toggle( 'is-full', kg > st.holdKg * 0.9 );
		if ( this._last.money !== undefined && this._last.money !== s.money ) {

			this.purse.classList.remove( 'is-bump' );
			void this.purse.offsetWidth;
			this.purse.classList.add( 'is-bump' );

		}

		this._last.money = s.money;
		if ( this.invOpen ) this.renderInventory();
		if ( this.standOpen ) this.vendor && this.vendor.kind === 'shop' ? this.renderShop() : this.renderStand();
		if ( this.journalOpen ) this.renderJournal();

	}

	// per frame
	update( { fight, casting, power, bite, aiming, fuel = null, sonar = null, lure = null, rally = null } ) {

		// boat instruments in the purse: fuel while aboard, the fish finder when fitted
		this.fuelEl.classList.toggle( 'is-on', !! fuel );
		if ( fuel ) {

			this.fuelBar.style.width = `${ fuel.litres / fuel.tank * 100 }%`;
			this.fuelL.textContent = `${ fuel.litres.toFixed( 0 ) } L`;
			this.fuelEl.classList.toggle( 'is-low', fuel.litres < fuel.tank * 0.15 );

		}

		this.sonarEl.classList.toggle( 'is-on', !! sonar );
		if ( sonar ) {

			this.sonarD.textContent = `${ sonar.depth.toFixed( 1 ) } m`;
			const n = Math.round( sonar.fish * 4 );
			this.sonarDots.textContent = '●'.repeat( n ) + '○'.repeat( 4 - n );

		}


		this.fight.classList.toggle( 'is-on', !! fight );
		if ( fight ) {

			const T = Math.min( fight.tension, 1.05 );
			this.fNeedle.style.left = `${ T / 1.05 * 100 }%`;
			this.fNeedle.classList.toggle( 'is-hot', fight.tension > fight.band[ 1 ] );
			this.fBand.style.left = `${ fight.band[ 0 ] / 1.05 * 100 }%`;
			this.fBand.style.width = `${ ( fight.band[ 1 ] - fight.band[ 0 ] ) / 1.05 * 100 }%`;
			this.fStam.style.width = `${ fight.stamina * 100 }%`;
			this.fDist.textContent = `${ fight.distance.toFixed( 1 ) } m`;
			let call = 'Reel in', cls = '';
			if ( fight.tension > 0.88 ) { call = 'Ease off!'; cls = 'is-warn'; }
			else if ( fight.surge > 0.55 ) { call = 'It\'s running!'; cls = 'is-warn'; }
			else if ( fight.tension < 0.15 ) { call = 'Slack line!'; cls = 'is-warn'; }
			else if ( fight.tension >= fight.band[ 0 ] && fight.tension <= fight.band[ 1 ] ) { call = 'Good pressure'; cls = 'is-good'; }
			this.fCall.textContent = tr( call );
			this.fCall.className = 'gm-fight-call ' + cls;

		}

		this.bite.classList.toggle( 'is-on', !! bite );
		this.cast.classList.toggle( 'is-on', !! casting );
		if ( casting ) this.castBar.style.width = `${ power * 100 }%`;
		this.dot.classList.toggle( 'is-on', !! aiming && ! this.invOpen && ! this.standOpen && ! this.journalOpen );

		if ( this.lureEl ) {

			const showLure = !! lure && ! this.invOpen && ! this.standOpen && ! this.journalOpen;
			this.lureEl.classList.toggle( 'is-on', showLure );
			if ( showLure && this.lureTxt ) {

				const spec = LURES[ lure ] || LURES.standard;
				this.lureTxt.textContent = tr( spec.name );

			}

		}

		if ( this.rallyEl ) {

			const showRally = !! rally;
			this.rallyEl.classList.toggle( 'is-on', showRally );
			if ( showRally ) {

				const zh = getLang() === 'zh';
				this.rallyEl.textContent = zh
					? `东岬计时赛 · 门 ${ rally.gate }/${ rally.total } · ${ rally.elapsed.toFixed( 1 ) }s`
					: `Rally · Gate ${ rally.gate }/${ rally.total } · ${ rally.elapsed.toFixed( 1 ) }s`;

			}

		}

	}

	// ---- catch card
	// info: GameState.lastCatch ({ species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept })
	showCatch( info, ms = 9000 ) {

		const zh = getLang() === 'zh';
		const f = FISH[ info.species ];
		const fishName = trFish( info.species, f.name );
		const inch = info.cm / 2.54, lb = info.kg * 2.20462;
		const badge = info.record ? `<span class="gm-badge is-record">${ tr( '★ New record' ) }</span>`
			: info.newSpecies ? `<span class="gm-badge is-new">${ tr( 'New species' ) }</span>` : `<span class="gm-badge is-plain">${ tr( 'Catch' ) }</span>`;
		let note;
		if ( ! info.kept ) {

			note = zh
				? `<div class="gm-catch-note is-warn">${ this.game.state.upgrades.hold > 0 ? '鱼舱' : '冰桶' }空间不足 · 你把它放回了海里</div>`
				: `<div class="gm-catch-note is-warn">No room in the ${ this.game.state.upgrades.hold > 0 ? 'hold' : 'cooler' } · you let it go</div>`;

		} else if ( info.record ) {

			note = zh
				? `<div class="gm-catch-note">此前纪录 <b>${ info.prevBestKg.toFixed( 2 ) } kg</b> · ${ info.prevBestCm } cm，本次打破纪录 +${ ( info.kg - info.prevBestKg ).toFixed( 2 ) } kg！</div>`
				: `<div class="gm-catch-note">Previous best <b>${ info.prevBestKg.toFixed( 2 ) } kg</b> · ${ info.prevBestCm } cm. Beaten by ${ ( info.kg - info.prevBestKg ).toFixed( 2 ) } kg.</div>`;

		} else if ( info.newSpecies ) note = `<div class="gm-catch-note">${ tr( 'First one in your fish log.' ) }</div>`;
		else {

			note = zh
				? `<div class="gm-catch-note">历史最佳：${ info.prevBestKg.toFixed( 2 ) } kg · ${ info.prevBestCm } cm</div>`
				: `<div class="gm-catch-note">Your best: ${ info.prevBestKg.toFixed( 2 ) } kg · ${ info.prevBestCm } cm</div>`;

		}

		// splash burst around the fish as it lands in view
		let drops = '';
		for ( let i = 0; i < 26; i ++ ) {

			const a = ( i / 26 ) * Math.PI * 2 + Math.random() * 0.3, r = 90 + Math.random() * 260;
			drops += `<i style="--s:${ ( 4 + Math.random() * 12 ).toFixed( 1 ) }px;--x:${ ( Math.cos( a ) * r * 1.8 ).toFixed( 0 ) }px;--y:${ ( Math.sin( a ) * r * 0.55 - 40 ).toFixed( 0 ) }px;--d:${ ( 250 + Math.random() * 220 ).toFixed( 0 ) }ms"></i>`;

		}

		const c = this.catchCard;
		c.style.setProperty( '--gm-catch-ms', `${ ms }ms` );
		c.innerHTML = `
			<div class="gm-catch-top">
				<div class="gm-catch-eyebrow">${ badge }</div>
				<h2>${ fishName }</h2>
				<div class="gm-catch-sci">${ f.sci || '' }</div>
			</div>
			<div class="gm-catch-stage"><canvas></canvas><div class="gm-splash">${ drops }</div></div>
			<div class="gm-catch-bottom">
				<div class="gm-catch-stats">
					<div class="gm-stat"><span>${ tr( 'Length' ) }</span><b>${ info.cm }<small>cm</small></b><i>${ inch.toFixed( 1 ) } in</i></div>
					<div class="gm-stat"><span>${ tr( 'Weight' ) }</span><b>${ info.kg < 1 ? info.kg.toFixed( 2 ) : info.kg.toFixed( 1 ) }<small>kg</small></b><i>${ lb.toFixed( 1 ) } lb</i></div>
					<div class="gm-stat is-value"><span>${ tr( 'Value' ) }</span><b>$${ info.value }</b><i>${ tr( info.kept ? 'in the cooler' : 'let go' ) }</i></div>
				</div>
				${ note }
				<div class="gm-catch-foot"><kbd>${ tr( 'Click' ) }</kbd> ${ zh ? '或按' : 'or' } <kbd>E</kbd> ${ zh ? '继续' : 'to continue' }<span class="gm-catch-timer"><span></span></span></div>
			</div>`;
		// restart the entrance even when a card is already up
		c.classList.remove( 'is-on' );
		void c.offsetWidth;
		c.classList.add( 'is-on' );
		this.catchScrim.classList.add( 'is-on' );
		this.catchOpen = true;
		// the fish itself: the real model in a studio, drawn live into the stage canvas
		try {

			if ( ! this.portrait ) this.portrait = new FishPortrait();
			if ( this.portrait.attach( c.querySelector( '.gm-catch-stage canvas' ) ) ) this.portrait.show( info.species, info.kg );

		} catch ( e ) {

			console.warn( 'fish portrait unavailable', e );

		}

	}

	hideCatch() {

		this.catchCard.classList.remove( 'is-on' );
		this.catchScrim.classList.remove( 'is-on' );
		this.catchOpen = false;
		if ( this.portrait ) this.portrait.detach();

	}

	// ---- inventory
	toggleInventory( force ) {

		this.invOpen = force ?? ! this.invOpen;
		if ( this.invOpen ) {

			this.closeStand();
			this.toggleJournal( false );
			if ( this.game.minimap ) this.game.minimap.toggleFull( false );
			this.renderInventory();
			releaseMouse();

		}

		this.inv.classList.toggle( 'is-open', this.invOpen );

	}

	toggleJournal( force ) {

		this.journalOpen = force ?? ! this.journalOpen;
		if ( this.journalOpen ) {

			this.toggleInventory( false );
			this.closeStand();
			if ( this.game.minimap ) this.game.minimap.toggleFull( false );
			this.renderJournal();
			releaseMouse();

		}

		this.journal.classList.toggle( 'is-open', this.journalOpen );

	}

	renderJournal() {

		const s = this.game.state;
		const zh = getLang() === 'zh';
		const tabs = [
			[ 'bounties', zh ? '悬赏订单' : 'Bounties' ],
			[ 'lures', zh ? '拟饵与鱼王' : 'Lures & Legends' ],
			[ 'landmarks', zh ? '明信片打卡' : 'Viewpoints' ],
			[ 'rally', zh ? '越野计时赛' : 'Rally Trial' ],
		];

		let body = '';
		if ( this.journalTab === 'bounties' ) {

			const cards = ( s.bounties || [] ).map( ( b ) => {

				const pct = Math.min( 100, Math.round( ( b.progress / b.target ) * 100 ) );
				return `<div class="gm-j-card ${ b.completed ? 'is-done' : '' }">
					<div class="gm-j-row">
						<span class="gm-j-title">${ zh ? b.titleZh : b.titleEn }</span>
						<span class="gm-j-badge ${ b.completed ? 'is-done' : '' }">${ b.completed ? ( zh ? '已完成' : 'Done' ) : `+$${ b.reward }` }</span>
					</div>
					<div class="gm-j-sub">${ zh ? `进度：${ b.progress } / ${ b.target }` : `Progress: ${ b.progress } / ${ b.target }` }</div>
					<div class="gm-j-prog"><span style="width:${ pct }%"></span></div>
				</div>`;

			} ).join( '' );
			body = `${ cards }
				<div class="gm-foot">
					<span class="gm-sub">${ zh ? `累计完成悬赏：${ s.bountiesDone } 单` : `Completed orders: ${ s.bountiesDone }` }</span>
					<button type="button" class="gm-mini" data-refresh-bounties>${ zh ? '刷新今日委托' : 'New orders' }</button>
				</div>`;

		} else if ( this.journalTab === 'lures' ) {

			const lureCards = LURE_IDS.map( ( id ) => {

				const sp = LURES[ id ];
				const active = s.lure === id;
				return `<div class="gm-j-card ${ active ? 'is-done' : '' }">
					<div class="gm-j-row">
						<span class="gm-j-title">${ tr( sp.name ) }</span>
						<button type="button" class="gm-mini" data-pick-lure="${ id }">${ active ? ( zh ? '装备中' : 'Equipped' ) : ( zh ? '切换' : 'Equip' ) }</button>
					</div>
					<div class="gm-j-sub">${ tr( sp.desc ) }</div>
				</div>`;

			} ).join( '' );

			const legendIds = [ 'goldenTrevally', 'sailfish', 'blueMarlin' ];
			const legTipsZh = {
				goldenTrevally: '栖息地：珊瑚礁/浅滩 · 条件：黎明黄昏或使用「礁石铁板拟饵」',
				sailfish: '栖息地：深海远洋 · 条件：晨昏/雨天或使用「深海活饵/暴风沉铅饵」',
				blueMarlin: '栖息地：深海（>20m）· 条件：暴风雨天或装备「暴风沉铅饵」搏斗',
			};
			const legTipsEn = {
				goldenTrevally: 'Habitat: Reef · Dawn/dusk or Reef Metal Jig',
				sailfish: 'Habitat: Deep sea · Dawn/dusk, rain, Live Bait or Storm Plug',
				blueMarlin: 'Habitat: Deep sea · Stormy weather or Heavy Storm Plug',
			};
			const legCards = legendIds.map( ( id ) => {

				const rec = s.log?.[ id ];
				const f = FISH[ id ];
				const caught = rec && rec.count > 0;
				return `<div class="gm-j-card ${ caught ? 'is-done' : '' }">
					<div class="gm-j-row">
						<span class="gm-j-title">${ trFish( id, f.name ) }</span>
						<span class="gm-j-badge ${ caught ? 'is-done' : '' }">${ caught ? `${ rec.bestKg.toFixed( 1 ) } kg` : ( zh ? '未捕获' : 'Uncaught' ) }</span>
					</div>
					<div class="gm-j-sub">${ zh ? legTipsZh[ id ] : legTipsEn[ id ] }</div>
				</div>`;

			} ).join( '' );

			body = `${ lureCards }<div class="gm-shop-sec">${ zh ? '海岛传奇鱼王图鉴' : 'Legendary Boss Fish' }</div>${ legCards }`;

		} else if ( this.journalTab === 'landmarks' ) {

			body = LANDMARKS.map( ( lm ) => {

				const rec = s.landmarks?.[ lm.id ];
				const visited = !! ( rec && ( rec === true || rec.visited ) );
				const photo = !! ( rec && rec.photo );
				const status = photo ? ( zh ? '已拍照打卡 ★' : 'Photo ★' ) : visited ? ( zh ? '已探索 ✓' : 'Visited ✓' ) : `+$${ lm.reward }`;
				return `<div class="gm-j-card ${ visited ? 'is-done' : '' }">
					<div class="gm-j-row">
						<span class="gm-j-title">${ zh ? lm.nameZh : lm.nameEn }</span>
						<div style="display:flex;gap:6px;align-items:center">
							<span class="gm-j-badge ${ visited ? 'is-done' : '' }">${ status }</span>
							<button type="button" class="gm-mini" data-nav-lm="${ lm.id }">${ zh ? '设为导航' : 'Navigate' }</button>
						</div>
					</div>
					<div class="gm-j-sub">${ zh ? lm.hintZh : lm.hintEn }</div>
				</div>`;

			} ).join( '' );

		} else {

			const mb = s.rallyBest?.motorcycle;
			const bb = s.rallyBest?.buggy;
			body = `
				<div class="gm-j-card">
					<div class="gm-j-title">${ zh ? '东岬盘山越野计时赛（共 10 个检查点）' : 'East Headland Off-Road Rally (10 Gates)' }</div>
					<div class="gm-j-sub">${ zh ? '从船屋东侧山路出发一路攀升至灯塔观景台。驾驶摩托车或越野车穿过发光起点门自动开表，或直接点击下方导航起点。' : 'Drive from the boathouse east road up to the lighthouse. Pass gate 1 or press U in any land vehicle to start.' }</div>
				</div>
				<div class="gm-j-card">
					<div class="gm-j-row"><span class="gm-j-title">${ zh ? '奖牌标准' : 'Medals' }</span><span class="gm-j-badge">🥇 ≤${ RALLY_MEDALS.gold.sec }s · 🥈 ≤${ RALLY_MEDALS.silver.sec }s · 🥉 ≤${ RALLY_MEDALS.bronze.sec }s</span></div>
					<div class="gm-j-sub">${ zh ? `金牌奖励 $${ RALLY_MEDALS.gold.reward } · 银牌 $${ RALLY_MEDALS.silver.reward } · 铜牌 $${ RALLY_MEDALS.bronze.reward }` : `Gold +$${ RALLY_MEDALS.gold.reward } · Silver +$${ RALLY_MEDALS.silver.reward } · Bronze +$${ RALLY_MEDALS.bronze.reward }` }</div>
				</div>
				<div class="gm-j-card">
					<div class="gm-j-row"><span class="gm-j-title">${ zh ? '个人最佳圈速' : 'Personal Best' }</span><span class="gm-j-badge">${ zh ? '摩托' : 'Bike' }: ${ mb ? mb.toFixed( 2 ) + 's' : '--' } · ${ zh ? '越野车' : 'Buggy' }: ${ bb ? bb.toFixed( 2 ) + 's' : '--' }</span></div>
					<div class="gm-j-sub" style="display:flex;gap:8px;margin-top:8px">
						<button type="button" class="gm-mini" data-nav-rally>${ zh ? '导航到起点门' : 'Navigate to Start' }</button>
						<button type="button" class="gm-mini" data-start-rally>${ zh ? '立刻开跑 (U)' : 'Start Now (U)' }</button>
					</div>
				</div>`;

		}

		this.journal.innerHTML = `
			<h2>${ zh ? '海岛手账与委托' : 'Island Journal' }</h2>
			<p class="gm-sub">${ zh ? '悬赏订单 · 拟饵与传奇鱼王 · 风景明信片 · 东岬越野计时赛' : 'Daily bounties · Lures & Legends · Postcard spots · Rally' }</p>
			<div class="gm-j-tabs">${ tabs.map( ( [ id, label ] ) => `<button type="button" class="gm-j-tab ${ this.journalTab === id ? 'is-active' : '' }" data-jtab="${ id }">${ label }</button>` ).join( '' ) }</div>
			<div class="gm-list">${ body }</div>
			<div class="gm-foot"><span class="gm-sub">${ zh ? '随时按 J 键打开或关闭' : 'Press J anytime' }</span><button class="gm-btn is-ghost" data-jclose>${ zh ? '关闭 (J)' : 'Close (J)' }</button></div>`;

		this.journal.querySelector( '[data-jclose]' ).onclick = () => this.toggleJournal( false );
		for ( const b of this.journal.querySelectorAll( '[data-jtab]' ) ) b.onclick = () => { this.journalTab = b.dataset.jtab; this.renderJournal(); };

		const refBtn = this.journal.querySelector( '[data-refresh-bounties]' );
		if ( refBtn ) refBtn.onclick = () => { s.refreshBounties( Date.now() ); this.game.toast( tr( 'New island bounties posted!' ) ); };

		for ( const b of this.journal.querySelectorAll( '[data-pick-lure]' ) ) b.onclick = () => {

			s.setLure( b.dataset.pickLure );
			this.game.toast( tr( LURES[ b.dataset.pickLure ].name ) );

		};

		for ( const b of this.journal.querySelectorAll( '[data-nav-lm]' ) ) b.onclick = () => {

			const lm = LANDMARKS.find( ( x ) => x.id === b.dataset.navLm );
			if ( lm && this.game.minimap ) {

				this.game.minimap.setWaypoint( lm.x, lm.z, zh ? lm.nameZh : lm.nameEn );
				this.toggleJournal( false );

			}

		};

		const nr = this.journal.querySelector( '[data-nav-rally]' );
		if ( nr ) nr.onclick = () => {

			this.game.minimap?.setWaypoint( RALLY_GATES[ 0 ].x, RALLY_GATES[ 0 ].z, zh ? '越野赛起点' : 'Rally Start' );
			this.toggleJournal( false );

		};

		const sr = this.journal.querySelector( '[data-start-rally]' );
		if ( sr ) sr.onclick = () => {

			const p = this.game.app?.player;
			if ( p?.mode === 'vehicle' && p.activeVehicle ) {

				this.game.rally?.start( p.activeVehicle.id );
				this.toggleJournal( false );

			} else {

				this.game.toast( tr( 'Drive a motorcycle or buggy first (press E near vehicle)' ) );

			}

		};

	}

	renderInventory() {

		const s = this.game.state;
		const zh = getLang() === 'zh';
		const rows = s.inventory.map( ( f ) => `<div class="gm-row has-cm"><span>${ trFish( f.species, FISH[ f.species ].name ) }${ f.record ? `<small>${ tr( 'record' ) }</small>` : '' }</span><span class="gm-cm">${ f.cm ?? Math.round( fishLengthCm( f.species, f.kg ) ) } cm</span><span class="gm-kg">${ f.kg.toFixed( 2 ) } kg</span><span class="gm-val">$${ f.value }</span><button class="gm-mini" data-release="${ f.id }">${ tr( 'Release' ) }</button></div>` ).join( '' );
		const logged = Object.entries( s.log ).filter( ( [ k, v ] ) => Object.prototype.hasOwnProperty.call( FISH, k ) && v && Number.isFinite( v.bestKg ) ).map( ( [ k, v ] ) => zh
			? `${ trFish( k, FISH[ k ].name ) }：累计 ${ v.count } 条，最大 ${ v.bestKg.toFixed( 2 ) } kg · ${ v.bestCm ?? Math.round( fishLengthCm( k, v.bestKg ) ) } cm`
			: `${ FISH[ k ].name }: ${ v.count } caught, best ${ v.bestKg.toFixed( 2 ) } kg · ${ v.bestCm ?? Math.round( fishLengthCm( k, v.bestKg ) ) } cm` ).join( '<br>' );
		this.inv.innerHTML = `
			<h2>${ tr( s.upgrades.hold > 0 ? 'Fish hold' : 'Cooler' ) }</h2>
			<p class="gm-sub">${ zh ? `${ s.inventory.length } 条鱼 · ${ s.holdKg.toFixed( 1 ) } / ${ s.stats.holdKg } kg · 估值 $${ s.holdValue }` : `${ s.inventory.length } fish · ${ s.holdKg.toFixed( 1 ) } of ${ s.stats.holdKg } kg · worth $${ s.holdValue }` }</p>
			<div class="gm-list">${ rows || `<div class="gm-empty">${ tr( 'Nothing yet. Cast from the pier, the beach or the boat.' ) }</div>` }</div>
			${ logged ? `<div class="gm-log"><b>${ tr( 'Fish log' ) }</b><br>${ logged }</div>` : '' }
			<div class="gm-foot"><span class="gm-sub">${ tr( 'Sell at the fish stand by the pier' ) }</span><button class="gm-btn is-ghost" data-close>${ tr( 'Close (I)' ) }</button></div>`;
		this.inv.querySelector( '[data-close]' ).onclick = () => this.toggleInventory( false );
		for ( const b of this.inv.querySelectorAll( '[data-release]' ) ) b.onclick = () => s.release( Number( b.dataset.release ) );

	}

	// ---- fish stand
	openStand( vendor ) {

		this.standOpen = true;
		this.vendor = vendor;
		this.toggleInventory( false );
		this.toggleJournal( false );
		if ( this.game.minimap ) this.game.minimap.toggleFull( false );
		if ( vendor.kind === 'shop' ) this.renderShop();
		else this.renderStand();
		this.stand.classList.add( 'is-open' );
		releaseMouse();

	}

	closeStand() {

		this.standOpen = false;
		this.stand.classList.remove( 'is-open' );

	}

	renderStand() {

		const s = this.game.state;
		const v = this.vendor || { name: 'Fish buyer' };
		const zh = getLang() === 'zh';
		const rows = s.inventory.map( ( f ) => `<div class="gm-row has-cm"><span>${ trFish( f.species, FISH[ f.species ].name ) }</span><span class="gm-cm">${ f.cm ?? Math.round( fishLengthCm( f.species, f.kg ) ) } cm</span><span class="gm-kg">${ f.kg.toFixed( 2 ) } kg</span><span class="gm-val">$${ f.value }</span><button class="gm-mini" data-sell="${ f.id }">${ tr( 'Sell' ) }</button></div>` ).join( '' );
		const bRows = ( s.bounties || [] ).map( ( b ) => `<div>${ b.completed ? '✅' : '•' } ${ zh ? b.titleZh : b.titleEn } (${ b.progress }/${ b.target }) · +$${ b.reward }</div>` ).join( '' );
		this.stand.innerHTML = `
			<h2>${ tr( v.name ) }</h2>
			<p class="gm-sub">${ s.inventory.length ? tr( v.greeting || 'Let\'s see what you caught.' ) : tr( v.idle || 'Come back when you\'ve got fish.' ) }</p>
			<div class="gm-list">${ rows || `<div class="gm-empty">${ tr( 'Your cooler is empty.' ) }</div>` }</div>
			${ bRows ? `<div class="gm-stand-bounties"><b>${ zh ? '乔的今日悬赏（完成即发奖金）：' : 'Today\'s Bounties (auto-paid):' }</b>${ bRows }</div>` : '' }
			<div class="gm-foot"><button class="gm-btn is-ghost" data-close>${ tr( 'Leave (E)' ) }</button><button class="gm-btn" data-all ${ s.inventory.length ? '' : 'disabled' }>${ zh ? '全部出售' : 'Sell all' } · $${ s.holdValue }</button></div>`;
		this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
		this.stand.querySelector( '[data-all]' ).onclick = () => this.game.sellAll();
		for ( const b of this.stand.querySelectorAll( '[data-sell]' ) ) b.onclick = () => this.game.sell( [ Number( b.dataset.sell ) ] );

	}

}

GameHUD.prototype.renderShop = function () {

	const s = this.game.state;
	const v = this.vendor;
	const zh = getLang() === 'zh';
	const renderRow = ( key ) => {

		if ( ! Object.prototype.hasOwnProperty.call( UPGRADES, key ) ) return '';
		const track = UPGRADES[ key ];
		const idx = Math.max( 0, Math.min( track.levels.length - 1, s.upgrades[ key ] | 0 ) );
		const cur = track.levels[ idx ];
		const next = nextLevel( s.upgrades, key );
		const curLabel = trUpgradeLabel( key, idx, cur.label );
		const nextLabel = next ? trUpgradeLabel( key, next.index, next.label ) : curLabel;
		const btn = next
			? `<button class="gm-btn" data-buy="${ key }" ${ next.cost > s.money ? 'disabled' : '' }>$${ next.cost }</button>`
			: `<span class="gm-have">${ tr( 'Top of the line' ) }</span>`;
		return `<div class="gm-shop-row"><span>${ trUpgradeName( key, track.name ) }：${ next ? nextLabel : curLabel }<small>${ zh ? '当前' : 'Now' }：${ curLabel }</small></span>${ btn }</div>`;

	};

	const missing = s.stats.fuelL - s.fuelL;
	const fuelRow = `<div class="gm-shop-row"><span>${ zh ? '船用柴油' : 'Diesel' } · $${ FUEL_PRICE.toFixed( 2 ) } / L<small>${ zh ? '油箱存量' : 'Tank' }：${ s.fuelL.toFixed( 0 ) } / ${ s.stats.fuelL } L</small></span>${ missing > 0.5 ? `<button class="gm-btn" data-fuel ${ s.money < FUEL_PRICE ? 'disabled' : '' }>${ zh ? '加满' : 'Fill' } · $${ s.refuelCost() }</button>` : `<span class="gm-have">${ tr( 'Full' ) }</span>` }</div>`;
	const curBoatPaint = this.game.app?.boat?.paintId || 'classic';
	const paintBtns = BOAT_PAINT_IDS.map( ( pid ) => {

		const active = pid === curBoatPaint;
		return `<button class="gm-mini" data-boat-paint="${ pid }" style="${ active ? 'border-color:var(--tw-aqua);color:var(--tw-aqua)' : '' }">${ tr( BOAT_PAINTS[ pid ].label ) }</button>`;

	} ).join( ' ' );
	const boatRow = `<div class="gm-shop-row"><span>${ zh ? '渔船涂装改装（免费切换）' : 'Boat Hull Paint (Free)' }<small>${ zh ? '当前' : 'Now' }：${ tr( ( BOAT_PAINTS[ curBoatPaint ] || BOAT_PAINTS.classic ).label ) }</small></span><span style="display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;max-width:56%">${ paintBtns }</span></div>`;
	const sec = ( key ) => `<div class="gm-shop-sec">${ tr( key ) }</div>`;
	const content = [
		sec( 'Fishing gear' ),
		renderRow( 'line' ), renderRow( 'reel' ), renderRow( 'rod' ),
		sec( 'Boat upgrades' ),
		fuelRow, boatRow, renderRow( 'hold' ), renderRow( 'fuel' ), renderRow( 'engine' ), renderRow( 'fishFinder' ), renderRow( 'lights' ),
		sec( 'Land vehicle garage' ),
		renderRow( 'vehTires' ), renderRow( 'vehEngine' ), renderRow( 'vehSuspension' ), renderRow( 'vehLights' ),
	].join( '' );
	this.stand.innerHTML = `
		<h2>${ tr( v.name ) }</h2>
		<p class="gm-sub">${ tr( v.greeting ) } · ${ zh ? `持有金币 $${ s.money.toLocaleString() }` : `You have $${ s.money.toLocaleString() }` }</p>
		<div class="gm-list">${ content }</div>
		<div class="gm-foot"><span class="gm-sub">${ tr( 'Upgrades take effect at once' ) }</span><button class="gm-btn is-ghost" data-close>${ tr( 'Leave (E)' ) }</button></div>`;
	this.stand.querySelector( '[data-close]' ).onclick = () => this.closeStand();
	for ( const b of this.stand.querySelectorAll( '[data-buy]' ) ) b.onclick = () => this.game.buy( b.dataset.buy );
	for ( const b of this.stand.querySelectorAll( '[data-boat-paint]' ) ) b.onclick = () => {

		const id = b.dataset.boatPaint;
		this.game.app?.boat?.setPaint?.( id );
		this.game.app?.prefs?.save?.( { boatPaint: id } );
		this.game.app?.ui?.syncFromApp?.();
		this.renderShop();

	};
	const f = this.stand.querySelector( '[data-fuel]' );
	if ( f ) f.onclick = () => this.game.refuel();

};

function releaseMouse() {

	try {

		if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

	} catch ( e ) { /* ignore */ }

}
