import { WORLD } from '../world/WorldLayout.js';
import { STAND } from './FishStand.js';
import { CHANDLERY } from './Chandlery.js';
import { LANDMARKS } from './Landmarks.js';
import { getLang, onLangChange, tr } from '../i18n/i18n.js';
import {
	waypointDistance, waypointBearingDeg, compassCardinal,
	hasArrivedAtWaypoint, mapPixelToWorld, worldToMapFraction,
} from './WaypointMath.js';

// Minimap (lower right) + expandable Full-Island Map (hotkey N or click minimap).
// Baked once from TerrainData onto a 640x640 canvas (chunked at startup, finished synchronously if
// opened early). Supports Landmark pins (Joe, Marta, Boat, Motorcycle, East Headland Lighthouse)
// and click-to-place custom Waypoint navigation with HUD bearing/distance and 3D world beacon.

const N = 640; // baked canvas size (px)
const EXT = 1280; // metres covered by the bake
const X0 = - EXT / 2, Z0 = - 180 - EXT / 2; // world at canvas (0, 0): the island sits north of the bay
const PPM = N / EXT; // canvas px per metre
const ROWS_PER_FRAME = 48;

const CSS = /* css */`
.gm-map { position: absolute; right: var(--tw-edge); bottom: var(--tw-edge); width: calc(184 * var(--tw-u)); height: calc(184 * var(--tw-u));
	border-radius: 50%; padding: calc(5 * var(--tw-u)); pointer-events: auto; cursor: pointer;
	transition: right var(--tw-slow) var(--tw-ease), opacity var(--tw-med) var(--tw-ease), transform var(--tw-fast) var(--tw-ease); }
.gm-map:hover { transform: scale(1.02); }
.tw-root[data-panel='open'] .gm-map { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }
.gm-map-view { position: relative; width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background: #0b2c48;
	box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 18px rgba(0,0,0,0.45); }
.gm-map-view canvas { position: absolute; left: 0; top: 0; width: ${ N }px; height: ${ N }px; transform-origin: 0 0; image-rendering: auto; }
.gm-map-vig { position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
	background: radial-gradient(circle at 50% 50%, transparent 58%, rgba(4, 12, 20, 0.45) 100%); }
.gm-map-marks { position: absolute; inset: 0; }
.gm-map-key { position: absolute; right: calc(4 * var(--tw-u)); bottom: calc(4 * var(--tw-u)); z-index: 2;
	display: grid; place-items: center; min-width: calc(22 * var(--tw-u)); height: calc(22 * var(--tw-u));
	padding: 0 calc(5 * var(--tw-u)); border-radius: 999px; font: 700 calc(10 * var(--tw-u)) var(--tw-mono);
	color: var(--tw-ink); background: rgba(9, 17, 26, 0.86); box-shadow: 0 2px 6px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.22); }
.gm-mk { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.gm-mk > i { position: absolute; left: 0; top: 0; display: grid; place-items: center; width: calc(20 * var(--tw-u)); height: calc(20 * var(--tw-u));
	margin: calc(-10 * var(--tw-u)) 0 0 calc(-10 * var(--tw-u)); border-radius: 50%; font: 700 calc(10 * var(--tw-u)) var(--tw-font); font-style: normal;
	color: #0b1418; box-shadow: 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.85); }
.gm-mk > i svg { width: 64%; height: 64%; }
.gm-mk.is-joe > i { background: var(--tw-sun); }
.gm-mk.is-marta > i { background: var(--tw-aqua); }
.gm-mk.is-boat > i { background: #f2efe6; }
.gm-mk.is-bike > i { background: #98e67e; }
.gm-mk.is-buggy > i { background: #f5a65b; color: #1a1006; }
.gm-mk.is-lighthouse > i { background: #ef574a; color: #fff; }
.gm-mk.is-waypoint > i { background: #5ce0d2; color: #05201c; animation: gm-map-pulse 1.4s var(--tw-ease-io) infinite; }
.gm-mk.is-rally > i { background: #ffd166; color: #1f1404; animation: gm-map-pulse 1.1s var(--tw-ease-io) infinite; }
.gm-mk.is-peer > i { width: calc(14 * var(--tw-u)); height: calc(14 * var(--tw-u)); margin: calc(-7 * var(--tw-u)) 0 0 calc(-7 * var(--tw-u)); color: #fff; }
.gm-mk > b { position: absolute; left: 0; top: 0; width: 0; height: 0; border-left: calc(5 * var(--tw-u)) solid transparent; border-right: calc(5 * var(--tw-u)) solid transparent;
	border-bottom: calc(7 * var(--tw-u)) solid rgba(255,255,255,0.9); margin: calc(-19 * var(--tw-u)) 0 0 calc(-5 * var(--tw-u)); transform-origin: calc(5 * var(--tw-u)) calc(19 * var(--tw-u)); display: none; }
.gm-mk.is-edge > b { display: block; }
.gm-mk.is-edge > i { transform: scale(0.82); }
.gm-mk.is-hot > i { animation: gm-map-pulse 1.3s var(--tw-ease-io) infinite; }
@keyframes gm-map-pulse { 0%, 100% { box-shadow: 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.85), 0 0 0 0 rgba(255,255,255,0.6); }
	60% { box-shadow: 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.85), 0 0 0 calc(10 * var(--tw-u)) rgba(255,255,255,0); } }
.gm-map-me { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.gm-map-me svg { position: absolute; width: calc(18 * var(--tw-u)); height: calc(18 * var(--tw-u)); left: calc(-9 * var(--tw-u)); top: calc(-10 * var(--tw-u));
	filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
.gm-map-n { position: absolute; left: 0; top: 0; width: calc(14 * var(--tw-u)); height: calc(14 * var(--tw-u)); margin: calc(-7 * var(--tw-u)) 0 0 calc(-7 * var(--tw-u));
	border-radius: 50%; display: grid; place-items: center; font: 700 calc(9 * var(--tw-u)) var(--tw-font); color: #0b1418; background: rgba(255,255,255,0.9);
	box-shadow: 0 1px 2px rgba(0,0,0,0.5); }
.gm-map-fish { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity 600ms var(--tw-ease); }
.gm-map-fish.is-on { opacity: 0.9; }
.gm-map-fish > i { position: absolute; left: calc(-12 * var(--tw-u)); top: calc(-12 * var(--tw-u)); width: calc(24 * var(--tw-u)); height: calc(24 * var(--tw-u));
	border-radius: 50%; border: 1.5px solid rgba(var(--tw-aqua-rgb), 0.9); animation: gm-map-ring 2.2s var(--tw-ease-io) infinite; }
.gm-map-fish > i + i { animation-delay: -1.1s; }
@keyframes gm-map-ring { 0% { transform: scale(0.45); } 100% { transform: scale(1.15); border-color: rgba(var(--tw-aqua-rgb), 0); } }

/* Waypoint distance badge above minimap */
.gm-wp-pill { position: absolute; right: var(--tw-edge); bottom: calc(var(--tw-edge) + 194 * var(--tw-u));
	display: inline-flex; align-items: center; gap: calc(8 * var(--tw-u)); height: calc(30 * var(--tw-u));
	padding: 0 calc(8 * var(--tw-u)) 0 calc(11 * var(--tw-u)); border-radius: 999px; cursor: pointer;
	font: 500 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink); white-space: nowrap;
	opacity: 0; visibility: hidden; transform: translateY(calc(6 * var(--tw-u)));
	transition: opacity var(--tw-med), transform var(--tw-med), right var(--tw-slow) var(--tw-ease), visibility 0s linear var(--tw-med); }
.gm-wp-pill.is-on { opacity: 1; visibility: visible; transform: none; transition-delay: 0s; }
.tw-root[data-panel='open'] .gm-wp-pill { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }
.gm-wp-dot { width: calc(8 * var(--tw-u)); height: calc(8 * var(--tw-u)); border-radius: 50%; background: #5ce0d2; box-shadow: 0 0 8px rgba(92, 224, 210, 0.8); }
.gm-wp-clear { width: calc(18 * var(--tw-u)); height: calc(18 * var(--tw-u)); border-radius: 50%; display: grid; place-items: center;
	color: var(--tw-ink-2); background: rgba(255,255,255,0.1); font-size: calc(12 * var(--tw-u)); line-height: 1; }
.gm-wp-clear:hover { background: rgba(255,255,255,0.22); color: #fff; }

/* Full-Island Interactive Map Modal */
.gm-fullmap { position: absolute; inset: 0; z-index: 42; display: grid; place-items: center; padding: var(--tw-4);
	background: radial-gradient(ellipse at center, rgba(4, 12, 20, 0.45), rgba(3, 8, 14, 0.78));
	opacity: 0; visibility: hidden; pointer-events: none;
	transition: opacity var(--tw-med) var(--tw-ease), visibility 0s linear var(--tw-med); }
.gm-fullmap.is-open { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
.gm-fullmap-card { width: min(92vw, calc(620 * var(--tw-u))); padding: calc(16 * var(--tw-u)) calc(18 * var(--tw-u));
	border-radius: calc(18 * var(--tw-u)); display: flex; flex-direction: column; gap: calc(12 * var(--tw-u)); }
.gm-fullmap-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--tw-3); }
.gm-fullmap-head h2 { margin: 0; font-size: calc(18 * var(--tw-u)); font-weight: 600; color: var(--tw-ink); }
.gm-fullmap-head p { margin: calc(3 * var(--tw-u)) 0 0; font-size: var(--tw-fs-xs); color: var(--tw-ink-3); }
.gm-fullmap-stage { position: relative; width: min(62vh, 84vw, calc(500 * var(--tw-u))); aspect-ratio: 1; margin: 0 auto;
	border-radius: calc(14 * var(--tw-u)); overflow: hidden; background: #0b2c48; cursor: crosshair;
	box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14), 0 12px 32px rgba(0,0,0,0.45); }
.gm-fullmap-stage canvas { width: 100%; height: 100%; display: block; image-rendering: auto; }
.gm-fullmap-line { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.gm-fullmap-marks { position: absolute; inset: 0; pointer-events: none; }
.gm-fm-pin { position: absolute; transform: translate(-50%, -50%); display: grid; place-items: center; }
.gm-fm-pin > i { display: grid; place-items: center; width: calc(22 * var(--tw-u)); height: calc(22 * var(--tw-u));
	border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.9); font-style: normal; }
.gm-fm-pin > i svg { width: 64%; height: 64%; }
.gm-fm-pin.is-joe > i { background: var(--tw-sun); color: #0b1418; }
.gm-fm-pin.is-marta > i { background: var(--tw-aqua); color: #0b1418; }
.gm-fm-pin.is-boat > i { background: #f2efe6; color: #0b1418; }
.gm-fm-pin.is-bike > i { background: #98e67e; color: #0b1418; }
.gm-fm-pin.is-buggy > i { background: #f5a65b; color: #1a1006; }
.gm-fm-pin.is-lighthouse > i { background: #ef574a; color: #fff; }
.gm-fm-pin.is-waypoint > i { background: #5ce0d2; color: #05201c; animation: gm-map-pulse 1.4s var(--tw-ease-io) infinite; }
.gm-fm-pin.is-landmark > i { width: calc(12 * var(--tw-u)); height: calc(12 * var(--tw-u)); background: rgba(255, 214, 102, 0.25); color: #ffd166; border: 1.5px solid #ffd166; box-shadow: none; }
.gm-fm-pin.is-landmark.is-done > i { background: #ffd166; color: #1a1004; }
.gm-fm-pin.is-peer { z-index: 3; }
.gm-fm-pin.is-peer > i { width: calc(16 * var(--tw-u)); height: calc(16 * var(--tw-u)); }
.gm-fm-pin.is-player { z-index: 4; }
.gm-fm-pin.is-player svg { width: calc(20 * var(--tw-u)); height: calc(20 * var(--tw-u)); filter: drop-shadow(0 1px 3px rgba(0,0,0,0.75)); }
.gm-fm-tag { position: absolute; top: 100%; left: 50%; transform: translate(-50%, calc(3 * var(--tw-u))); padding: calc(1 * var(--tw-u)) calc(5 * var(--tw-u));
	border-radius: calc(4 * var(--tw-u)); background: rgba(7, 13, 20, 0.86); color: var(--tw-ink);
	font: 600 calc(10 * var(--tw-u)) var(--tw-font); white-space: nowrap; }
.gm-fm-pin.is-joe .gm-fm-tag { top: auto; bottom: 100%; transform: translate(-80%, calc(-3 * var(--tw-u))); }
.gm-fm-pin.is-marta .gm-fm-tag { transform: translate(-18%, calc(3 * var(--tw-u))); }
.gm-fm-compass { position: absolute; top: calc(10 * var(--tw-u)); left: calc(10 * var(--tw-u)); width: calc(26 * var(--tw-u)); height: calc(26 * var(--tw-u));
	border-radius: 50%; display: grid; place-items: center; font: 700 calc(11 * var(--tw-u)) var(--tw-mono);
	background: rgba(9, 17, 26, 0.84); color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2); pointer-events: none; }
.gm-fm-scale { position: absolute; right: calc(10 * var(--tw-u)); bottom: calc(10 * var(--tw-u)); padding: calc(3 * var(--tw-u)) calc(8 * var(--tw-u));
	border-radius: calc(6 * var(--tw-u)); background: rgba(9, 17, 26, 0.82); font: 600 calc(10 * var(--tw-u)) var(--tw-mono); color: var(--tw-ink-2);
	border-bottom: 2px solid rgba(255,255,255,0.75); pointer-events: none; }
.gm-fullmap-legend { display: flex; flex-wrap: wrap; gap: calc(8 * var(--tw-u)) calc(14 * var(--tw-u)); justify-content: center;
	font-size: var(--tw-fs-xs); color: var(--tw-ink-2); }
.gm-fm-leg { display: inline-flex; align-items: center; gap: calc(5 * var(--tw-u)); }
.gm-fm-swatch { width: calc(10 * var(--tw-u)); height: calc(10 * var(--tw-u)); border-radius: 50%; box-shadow: 0 0 0 1px rgba(255,255,255,0.75); }
.gm-fullmap-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--tw-2); }
.gm-fullmap-status { font: 500 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-aqua); }
.gm-fullmap-btns { display: flex; flex-wrap: wrap; gap: var(--tw-2); margin-left: auto; }
.tw-root.is-photo .gm-fullmap, .tw-root.is-photo .gm-wp-pill { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }

/* short windows: the settings rail (right, vertically centred) reaches down to the corner */
@media (max-height: 860px) {
	.gm-map, .gm-wp-pill { right: calc(var(--tw-edge) + 58 * var(--tw-u)); }
}
@media (max-width: 640px) {
	.gm-map { width: calc(128 * var(--tw-u)); height: calc(128 * var(--tw-u)); }
	.gm-wp-pill { bottom: calc(var(--tw-edge) + 138 * var(--tw-u)); }
}
@media (prefers-reduced-motion: reduce) { .gm-mk.is-hot > i, .gm-mk.is-waypoint > i, .gm-fm-pin.is-waypoint > i, .gm-map-fish > i { animation: none; } }
`;

const ICON = {
	fish: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 12c3-4 7-6 11-6 3 0 5 2 7 4l-2 2 2 2c-2 2-4 4-7 4-4 0-8-2-11-6Zm12-1.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg>',
	anchor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M7 11h10M4 14c1 4 4 6 8 6s7-2 8-6"/></svg>',
	boat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v9H6l6-9Zm1 2 5 7h-5V5ZM3 14h18l-3 5H6l-3-5Z"/></svg>',
	bike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.2" cy="17" r="3.4"/><circle cx="17.8" cy="17" r="3.4"/><path d="M6.2 17 10 11.5h4.5l3.3 5.5M14.5 11.5 13 8.5h-2.5"/></svg>',
	buggy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="17" r="3"/><circle cx="17.5" cy="17" r="3"/><path d="M3.5 15v-2.5L7 9h7.5l3 3.5H20.5V15"/><path d="M9.5 17h5"/></svg>',
	lighthouse: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 8.5 5h7L12 2Zm-2 4v3h4V6h-4Zm-.8 4-1.4 11h8.4L14.8 10H9.2ZM4 7.5 7 9v1.5L4 12V7.5Zm16 0V12l-3-1.5V9l3-1.5Z"/></svg>',
	waypoint: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a6.5 6.5 0 0 0-6.5 6.5c0 4.6 6.5 12.5 6.5 12.5s6.5-7.9 6.5-12.5A6.5 6.5 0 0 0 12 2Zm0 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>',
	player: '<svg viewBox="0 0 24 24"><path d="M12 2 20 21 12 16.5 4 21Z" fill="#fff" stroke="#0b1418" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

const mix = ( a, b, t ) => [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ];
const sat = ( x ) => Math.min( 1, Math.max( 0, x ) );
const smooth = ( e0, e1, x ) => {

	const t = sat( ( x - e0 ) / ( e1 - e0 ) );
	return t * t * ( 3 - 2 * t );

};

// map palette (sRGB 0..255)
const C = {
	deep: [ 12, 44, 78 ], mid: [ 22, 104, 150 ], shallow: [ 62, 186, 190 ], foam: [ 186, 232, 226 ],
	grassSea: [ 34, 110, 108 ], rubble: [ 30, 84, 104 ],
	sand: [ 232, 216, 172 ], wet: [ 206, 190, 150 ], grass: [ 128, 160, 88 ], scrub: [ 88, 128, 64 ], forest: [ 52, 92, 50 ],
	rock: [ 132, 134, 126 ], path: [ 205, 182, 136 ], scarp: [ 176, 146, 104 ], pad: [ 196, 184, 162 ],
};

export class Minimap {

	constructor( parent, game ) {

		this.game = game;
		const style = h( 'style' );
		style.textContent = CSS;
		document.head.append( style );

		this.el = h( 'div', 'gm-map tw-glass tw-interactive', `<div class="gm-map-view"><canvas width="${ N }" height="${ N }"></canvas><div class="gm-map-vig"></div>
			<div class="gm-map-marks"></div>
			<div class="gm-map-me">${ ICON.player }</div></div><span class="gm-map-key">N</span>` );
		this.el.setAttribute( 'role', 'button' );
		this.el.setAttribute( 'tabindex', '-1' );
		this.el.dataset.tip = tr( 'Full island map (N)' );
		this.view = this.el.querySelector( '.gm-map-view' );
		this.canvas = this.el.querySelector( 'canvas' );
		this.marks = this.el.querySelector( '.gm-map-marks' );
		parent.append( this.el );

		// Waypoint HUD badge above minimap
		this.wpPill = h( 'div', 'gm-wp-pill tw-glass tw-interactive', '<span class="gm-wp-dot"></span><span class="gm-wp-text"></span><button type="button" class="gm-wp-clear" aria-label="Clear">&times;</button>' );
		this.wpText = this.wpPill.querySelector( '.gm-wp-text' );
		this.wpClearBtn = this.wpPill.querySelector( '.gm-wp-clear' );
		parent.append( this.wpPill );

		const mk = ( kind, icon ) => {

			const e = h( 'div', 'gm-mk is-' + kind, `<b></b><i>${ icon }</i>` );
			this.marks.append( e );
			return { el: e, arrow: e.firstChild };

		};

		this.waypoint = null;
		this.fullOpen = false;
		this._canvasSynced = false;
		this.peerMarkers = new Map();

		this.markers = [
			{ id: 'joe', ...mk( 'joe', ICON.fish ), pos: () => ( { x: STAND.x, z: STAND.z } ) },
			{ id: 'marta', ...mk( 'marta', ICON.anchor ), pos: () => ( { x: CHANDLERY.x, z: CHANDLERY.z } ) },
			{ id: 'lighthouse', ...mk( 'lighthouse', ICON.lighthouse ), pos: () => WORLD.lighthouse?.position || null },
			{ id: 'waypoint', ...mk( 'waypoint', ICON.waypoint ), pos: () => this.waypoint, hideWhen: () => ! this.waypoint },
			{ id: 'rally', ...mk( 'rally', ICON.waypoint ), pos: () => game.rally?.active ? game.rally.getNextGate() : null, hideWhen: () => ! game.rally?.active },
			{ id: 'boat', ...mk( 'boat', ICON.boat ), pos: () => {

				const b = game.app.boatCtl;
				return b ? { x: b.position.x, z: b.position.z } : null;

			}, hideWhen: () => {

				const p = game.app.player;
				return p.mode === 'boat' || p.mode === 'deck';

			} },
			{ id: 'bike', ...mk( 'bike', ICON.bike ), pos: () => {

				const vm = game.app.vehicleManager;
				const v = ( vm && vm.vehicles.find( vh => vh.id === 'motorcycle' ) ) || game.app.motorcycle;
				return v ? { x: v.position.x, z: v.position.z } : null;

			}, hideWhen: () => {

				const p = game.app.player;
				return p.mode === 'vehicle' && p.activeVehicle && p.activeVehicle.id === 'motorcycle';

			} },
			{ id: 'buggy', ...mk( 'buggy', ICON.buggy ), pos: () => {

				const vm = game.app.vehicleManager;
				const v = ( vm && vm.vehicles.find( vh => vh.id === 'buggy' ) ) || game.app.buggy;
				return v ? { x: v.position.x, z: v.position.z } : null;

			}, hideWhen: () => {

				const p = game.app.player;
				return p.mode === 'vehicle' && p.activeVehicle && p.activeVehicle.id === 'buggy';

			} },
		];
		this.north = h( 'div', 'gm-map-n', 'N' );
		this.marks.append( this.north );
		this.fish = [ h( 'div', 'gm-map-fish', '<i></i><i></i>' ), h( 'div', 'gm-map-fish', '<i></i><i></i>' ) ];
		this.fish.forEach( ( f ) => this.marks.prepend( f ) );
		this._fishPts = [];
		this._fishT = 0;

		this.radiusM = 110; // world radius shown (m), eased between on foot and at sea
		this._hot = new Set();
		this._size = 0;
		this._bake = { row: 0, ctx: this.canvas.getContext( '2d' ), img: null, h: null, done: false };
		this._bake.img = this._bake.ctx.createImageData( N, N );
		this._bake.h = new Float32Array( N * N );
		this._viewSize = - 1;
		if ( typeof ResizeObserver !== 'undefined' ) {

			this._ro = new ResizeObserver( () => {

				this._viewSize = this.view.clientWidth;

			} );
			this._ro.observe( this.view );

		}

		// Build Full-Island Map modal
		const uiRoot = parent.closest( '.tw-root' ) || parent;
		this.fullEl = h( 'div', 'gm-fullmap tw-interactive', `
			<div class="gm-fullmap-card tw-glass">
				<header class="gm-fullmap-head">
					<div>
						<h2 class="gm-fm-title"></h2>
						<p class="gm-fm-sub"></p>
					</div>
					<button type="button" class="tw-icon-btn gm-fm-close" aria-label="Close">&times;</button>
				</header>
				<div class="gm-fullmap-stage">
					<canvas width="${ N }" height="${ N }"></canvas>
					<svg class="gm-fullmap-line" viewBox="0 0 100 100" preserveAspectRatio="none">
						<line x1="0" y1="0" x2="0" y2="0" stroke="#5ce0d2" stroke-width="0.65" stroke-dasharray="1.8 1.4" stroke-linecap="round" opacity="0"/>
					</svg>
					<div class="gm-fullmap-marks"></div>
					<span class="gm-fm-compass">N</span>
					<span class="gm-fm-scale">200 m</span>
				</div>
				<div class="gm-fullmap-legend"></div>
				<footer class="gm-fullmap-foot">
					<span class="gm-fullmap-status"></span>
					<div class="gm-fullmap-btns">
						<button type="button" class="gm-mini gm-fm-lh"></button>
						<button type="button" class="gm-mini gm-fm-clear"></button>
						<button type="button" class="gm-btn is-ghost gm-fm-done"></button>
					</div>
				</footer>
			</div>` );
		uiRoot.append( this.fullEl );

		this.fmTitle = this.fullEl.querySelector( '.gm-fm-title' );
		this.fmSub = this.fullEl.querySelector( '.gm-fm-sub' );
		this.fmStage = this.fullEl.querySelector( '.gm-fullmap-stage' );
		this.fullCanvas = this.fmStage.querySelector( 'canvas' );
		this.fullCtx = this.fullCanvas.getContext( '2d' );
		this.fmLine = this.fmStage.querySelector( '.gm-fullmap-line line' );
		this.fmMarks = this.fmStage.querySelector( '.gm-fullmap-marks' );
		this.fmLegend = this.fullEl.querySelector( '.gm-fullmap-legend' );
		this.fmStatus = this.fullEl.querySelector( '.gm-fullmap-status' );
		this.fmBtnLh = this.fullEl.querySelector( '.gm-fm-lh' );
		this.fmBtnClear = this.fullEl.querySelector( '.gm-fm-clear' );
		this.fmBtnDone = this.fullEl.querySelector( '.gm-fm-done' );
		this.fmBtnClose = this.fullEl.querySelector( '.gm-fm-close' );

		const fmPin = ( kind, icon, withTag = false ) => {

			const el = h( 'div', 'gm-fm-pin is-' + kind, `<i>${ icon }</i>${ withTag ? '<span class="gm-fm-tag"></span>' : '' }` );
			this.fmMarks.append( el );
			return { el, tag: withTag ? el.querySelector( '.gm-fm-tag' ) : null };

		};

		this.fullPins = {
			joe: fmPin( 'joe', ICON.fish, true ),
			marta: fmPin( 'marta', ICON.anchor, true ),
			lighthouse: fmPin( 'lighthouse', ICON.lighthouse, true ),
			boat: fmPin( 'boat', ICON.boat, false ),
			bike: fmPin( 'bike', ICON.bike, false ),
			buggy: fmPin( 'buggy', ICON.buggy, false ),
			waypoint: fmPin( 'waypoint', ICON.waypoint, false ),
			player: ( () => {

				const el = h( 'div', 'gm-fm-pin is-player', ICON.player );
				this.fmMarks.append( el );
				return { el, arrow: el.firstChild };

			} )(),
		};

		this.landmarkPins = LANDMARKS.map( ( lm ) => {

			const el = h( 'div', 'gm-fm-pin is-landmark', '<i></i>' );
			const f = worldToMapFraction( lm.x, lm.z, X0, Z0, EXT );
			el.style.left = `${ ( sat( f.u ) * 100 ).toFixed( 2 ) }%`;
			el.style.top = `${ ( sat( f.v ) * 100 ).toFixed( 2 ) }%`;
			this.fmMarks.append( el );
			return { lm, el };

		} );

		// Interactions
		this.el.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			this.toggleFull();

		} );
		this.wpPill.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			this.toggleFull( true );

		} );
		this.wpClearBtn.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			this.clearWaypoint();

		} );
		this.fullEl.addEventListener( 'click', ( e ) => {

			if ( e.target === this.fullEl ) this.toggleFull( false );

		} );
		this.fmBtnClose.addEventListener( 'click', ( e ) => { e.stopPropagation(); this.toggleFull( false ); } );
		this.fmBtnDone.addEventListener( 'click', ( e ) => { e.stopPropagation(); this.toggleFull( false ); } );
		this.fmBtnClear.addEventListener( 'click', ( e ) => { e.stopPropagation(); this.clearWaypoint(); } );
		this.fmBtnLh.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			const lh = WORLD.lighthouse?.position;
			if ( lh ) this.setWaypoint( lh.x, lh.z, 'Lighthouse' );

		} );
		this.fmStage.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			const rect = this.fmStage.getBoundingClientRect();
			const px = e.clientX - rect.left;
			const py = e.clientY - rect.top;
			const { x, z } = mapPixelToWorld( px, py, rect.width, X0, Z0, EXT );
			this.setWaypoint( x, z );

		} );
		this.fmStage.addEventListener( 'contextmenu', ( e ) => {

			e.preventDefault();
			e.stopPropagation();
			this.clearWaypoint();

		} );

		this._unsubLang = onLangChange( () => this._relocalize() );
		this._relocalize();

	}

	_relocalize() {

		this.el.dataset.tip = tr( 'Full island map (N)' );
		this.fmTitle.textContent = tr( 'Island map' );
		this.fmSub.textContent = tr( 'Click anywhere to place a waypoint · Right-click to clear' );
		this.fmBtnLh.textContent = tr( 'Pin Lighthouse' );
		this.fmBtnClear.textContent = tr( 'Clear waypoint' );
		this.fmBtnDone.textContent = tr( 'Close (N)' );
		this.fmBtnClose.setAttribute( 'aria-label', tr( 'Close' ) );
		if ( this.fullPins.joe.tag ) this.fullPins.joe.tag.textContent = tr( 'Joe' );
		if ( this.fullPins.marta.tag ) this.fullPins.marta.tag.textContent = tr( 'Marta' );
		if ( this.fullPins.lighthouse.tag ) this.fullPins.lighthouse.tag.textContent = tr( 'Lighthouse' );
		this.fmLegend.innerHTML = [
			[ '#ffffff', tr( 'Player' ) ],
			[ '#ef574a', tr( 'Lighthouse' ) ],
			[ '#98e67e', tr( 'Motorcycle' ) ],
			[ '#f5a65b', tr( 'Buggy' ) ],
			[ '#f2efe6', tr( 'Boat' ) ],
			[ 'var(--tw-sun)', tr( 'Joe' ) ],
			[ 'var(--tw-aqua)', tr( 'Marta' ) ],
			[ '#5ce0d2', tr( 'Waypoint' ) ],
		].map( ( [ c, label ] ) => `<span class="gm-fm-leg"><span class="gm-fm-swatch" style="background:${ c }"></span>${ label }</span>` ).join( '' );
		this._syncWaypointUI();

	}

	toggleFull( force ) {

		const open = force ?? ! this.fullOpen;
		if ( open === this.fullOpen ) return open;
		this.fullOpen = open;
		if ( open ) {

			if ( this.game.hud ) {

				this.game.hud.toggleInventory( false );
				this.game.hud.toggleJournal?.( false );
				this.game.hud.closeStand();

			}

			while ( ! this._bake.done ) this._bakeStep();
			this._syncFullCanvas();
			if ( typeof document !== 'undefined' && document.pointerLockElement ) document.exitPointerLock();
			this._relocalize();
			this._updateFullMarkers();

		} else if ( typeof document !== 'undefined' ) {

			const a = document.activeElement;
			if ( a && this.fullEl.contains( a ) ) a.blur();

		}

		this.fullEl.classList.toggle( 'is-open', open );
		return open;

	}

	setWaypoint( x, z, label = null ) {

		const cx = Math.min( X0 + EXT - 20, Math.max( X0 + 20, x ) );
		const cz = Math.min( Z0 + EXT - 20, Math.max( Z0 + 20, z ) );
		this.waypoint = { x: cx, z: cz, label };
		if ( this.game.app.waypointBeacon ) {

			this.game.app.waypointBeacon.setTarget( cx, cz, this.game.app.terrainData );

		}

		this._syncWaypointUI();
		if ( this.fullOpen ) this._updateFullMarkers();
		const pos = this._playerXZ();
		const dist = Math.round( waypointDistance( pos.x, pos.z, cx, cz ) );
		const card = compassCardinal( waypointBearingDeg( pos.x, pos.z, cx, cz ), getLang() );
		const title = label ? tr( label ) : tr( 'Waypoint set' );
		this.game.toast( `${ title } · ${ dist } m ${ card }`, 2200 );

	}

	clearWaypoint( silent = false ) {

		if ( ! this.waypoint ) return;
		this.waypoint = null;
		if ( this.game.app.waypointBeacon ) this.game.app.waypointBeacon.clear();
		this._syncWaypointUI();
		if ( this.fullOpen ) this._updateFullMarkers();
		if ( ! silent ) this.game.toast( tr( 'Waypoint cleared' ), 1600 );

	}

	_playerXZ() {

		const app = this.game.app, p = app.player;
		const src = app.freeCam ? app.camera.position : ( p ? p.position : app.camera.position );
		return { x: src.x, z: src.z };

	}

	_syncWaypointUI() {

		const wp = this.waypoint;
		const on = !! wp;
		if ( on !== this._lastWpOn ) {

			this._lastWpOn = on;
			this.wpPill.classList.toggle( 'is-on', on );
			this.fmBtnClear.disabled = ! wp;

		}

		if ( ! wp ) {

			if ( this._lastWpText !== '' ) {

				this._lastWpText = '';
				this.fmStatus.textContent = '';

			}

			return;

		}

		const pos = this._playerXZ();
		const dist = Math.round( waypointDistance( pos.x, pos.z, wp.x, wp.z ) );
		const card = compassCardinal( waypointBearingDeg( pos.x, pos.z, wp.x, wp.z ), getLang() );
		const name = wp.label ? tr( wp.label ) : tr( 'Waypoint' );
		const text = `${ name } · ${ dist } m ${ card }`;
		if ( text !== this._lastWpText ) {

			this._lastWpText = text;
			this.wpText.textContent = text;
			this.fmStatus.textContent = text;

		}

	}

	_syncFullCanvas() {

		if ( this._canvasSynced || ! this._bake.done ) return;
		this.fullCtx.drawImage( this.canvas, 0, 0 );
		this._canvasSynced = true;

	}

	_updateFullMarkers() {

		const placePct = ( pinObj, x, z, show = true ) => {

			pinObj.el.style.display = show ? '' : 'none';
			if ( ! show ) return null;
			const f = worldToMapFraction( x, z, X0, Z0, EXT );
			const u = sat( f.u ) * 100, v = sat( f.v ) * 100;
			pinObj.el.style.left = `${ u.toFixed( 2 ) }%`;
			pinObj.el.style.top = `${ v.toFixed( 2 ) }%`;
			return { u, v };

		};

		const app = this.game.app, cam = app.camera;
		const ppos = this._playerXZ();
		const puv = placePct( this.fullPins.player, ppos.x, ppos.z, true );
		if ( this.landmarkPins ) {

			const lms = this.game?.state?.landmarks || {};
			for ( const lp of this.landmarkPins ) {

				const rec = lms[ lp.lm.id ];
				const done = !! ( rec && ( rec === true || rec.visited ) );
				lp.el.classList.toggle( 'is-done', done );

			}

		}
		const e = cam.matrixWorld.elements;
		let fx = - e[ 8 ], fz = - e[ 10 ];
		const hdgRad = Math.atan2( fx, - fz );
		this.fullPins.player.arrow.style.transform = `rotate(${ hdgRad.toFixed( 3 ) }rad)`;

		placePct( this.fullPins.joe, STAND.x, STAND.z, true );
		placePct( this.fullPins.marta, CHANDLERY.x, CHANDLERY.z, true );
		const lh = WORLD.lighthouse?.position;
		placePct( this.fullPins.lighthouse, lh ? lh.x : 0, lh ? lh.z : 0, !! lh );

		const boat = app.boatCtl;
		placePct( this.fullPins.boat, boat ? boat.position.x : 0, boat ? boat.position.z : 0, !! boat );

		const vm = app.vehicleManager;
		const bike = ( vm && vm.vehicles.find( vh => vh.id === 'motorcycle' ) ) || app.motorcycle;
		placePct( this.fullPins.bike, bike ? bike.position.x : 0, bike ? bike.position.z : 0, !! bike );
		const buggy = ( vm && vm.vehicles.find( vh => vh.id === 'buggy' ) ) || app.buggy;
		placePct( this.fullPins.buggy, buggy ? buggy.position.x : 0, buggy ? buggy.position.z : 0, !! buggy );

		if ( this.waypoint && puv ) {

			const wuv = placePct( this.fullPins.waypoint, this.waypoint.x, this.waypoint.z, true );
			this.fmLine.setAttribute( 'x1', puv.u.toFixed( 2 ) );
			this.fmLine.setAttribute( 'y1', puv.v.toFixed( 2 ) );
			this.fmLine.setAttribute( 'x2', wuv.u.toFixed( 2 ) );
			this.fmLine.setAttribute( 'y2', wuv.v.toFixed( 2 ) );
			this.fmLine.setAttribute( 'opacity', '0.92' );

		} else {

			placePct( this.fullPins.waypoint, 0, 0, false );
			this.fmLine.setAttribute( 'opacity', '0' );

		}

		for ( const pm of this.peerMarkers.values() ) {

			if ( ! pm.latest ) {

				pm.fullEl.style.display = 'none';
				continue;

			}

			pm.fullEl.style.display = '';
			const f = worldToMapFraction( pm.latest.x, pm.latest.z, X0, Z0, EXT );
			pm.fullEl.style.left = `${ ( sat( f.u ) * 100 ).toFixed( 2 ) }%`;
			pm.fullEl.style.top = `${ ( sat( f.v ) * 100 ).toFixed( 2 ) }%`;

		}

	}

	// style writes only when the value changes
	_setStyle( el, prop, value ) {

		const k = '__gm_' + prop;
		if ( el[ k ] === value ) return;
		el[ k ] = value;
		el.style[ prop ] = value;

	}

	_toggle( el, cls, on ) {

		const k = '__gm_c_' + cls;
		if ( el[ k ] === on ) return;
		el[ k ] = on;
		el.classList.toggle( cls, on );

	}

	highlight( ids = [] ) {

		this._hot = new Set( ids );
		for ( const m of this.markers ) this._toggle( m.el, 'is-hot', this._hot.has( m.id ) );

	}

	// ---- bake (chunked)
	_bakeStep() {

		const B = this._bake;
		if ( B.done ) return;
		const T = this.game.app.terrainData;
		const res = T.res, tex = T.texel, org = T.origin;
		const idx = ( x, z ) => {

			const i = Math.floor( ( x - org ) / tex ), j = Math.floor( ( z - org ) / tex );
			return i < 0 || j < 0 || i >= res || j >= res ? - 1 : j * res + i;

		};

		const d = B.img.data;
		const end = Math.min( N, B.row + ROWS_PER_FRAME );
		for ( let py = B.row; py < end; py ++ ) for ( let px = 0; px < N; px ++ ) {

			const x = X0 + ( px + 0.5 ) / PPM, z = Z0 + ( py + 0.5 ) / PPM;
			const hgt = T.heightAt( x, z );
			B.h[ py * N + px ] = hgt;
			const k = idx( x, z );
			let c;
			if ( hgt < 0 ) {

				const dep = - hgt;
				c = dep < 6 ? mix( C.shallow, C.mid, smooth( 0.3, 6, dep ) ) : mix( C.mid, C.deep, smooth( 6, 40, dep ) );
				if ( k >= 0 ) {

					c = mix( c, C.grassSea, ( T.seagrass[ k ] / 255 ) * 0.55 );
					c = mix( c, C.rubble, ( T.rubble[ k ] / 255 ) * 0.6 );

				}

				c = mix( c, C.foam, smooth( 0.5, 0.0, dep ) * 0.45 );

			} else {

				const rock = k >= 0 ? T.rock[ k ] : 0, sand = k >= 0 ? T.sand[ k ] / 255 : 0;
				c = mix( C.grass, C.scrub, smooth( 4, 16, hgt ) );
				c = mix( c, C.forest, smooth( 12, 40, hgt ) );
				c = mix( c, C.sand, Math.max( sand, smooth( 1.6, 0.4, hgt ) ) );
				c = mix( c, C.wet, smooth( 0.5, 0.0, hgt ) * 0.6 );
				c = mix( c, C.rock, smooth( 0.35, 0.7, rock ) );
				if ( k >= 0 ) {

					c = mix( c, C.path, ( T.path[ k ] / 255 ) * 0.85 );
					c = mix( c, C.scarp, ( T.scarp[ k ] / 255 ) * 0.5 );

				}

				// hill shading, light from the north-west
				const e = 2.5;
				const gx = ( T.heightAt( x + e, z ) - T.heightAt( x - e, z ) ) / ( 2 * e );
				const gz = ( T.heightAt( x, z + e ) - T.heightAt( x, z - e ) ) / ( 2 * e );
				const nl = ( - gx * - 0.6 + - gz * - 0.6 + 1 * 0.53 ) / Math.sqrt( gx * gx + gz * gz + 1 );
				const s = 0.7 + 0.45 * sat( nl / 0.53 );
				c = [ c[ 0 ] * s, c[ 1 ] * s, c[ 2 ] * s ];

			}

			const o = ( py * N + px ) * 4;
			d[ o ] = c[ 0 ]; d[ o + 1 ] = c[ 1 ]; d[ o + 2 ] = c[ 2 ]; d[ o + 3 ] = 255;

		}

		B.row = end;
		if ( B.row < N ) return;

		// coastline: a thin pale line where the height crosses sea level
		for ( let py = 1; py < N - 1; py ++ ) for ( let px = 1; px < N - 1; px ++ ) {

			const i = py * N + px, a = B.h[ i ] >= 0;
			if ( a && ( B.h[ i - 1 ] < 0 || B.h[ i + 1 ] < 0 || B.h[ i - N ] < 0 || B.h[ i + N ] < 0 ) ) {

				const o = i * 4;
				d[ o ] = d[ o ] * 0.3 + 245 * 0.7; d[ o + 1 ] = d[ o + 1 ] * 0.3 + 241 * 0.7; d[ o + 2 ] = d[ o + 2 ] * 0.3 + 228 * 0.7;

			}

		}

		const ctx = B.ctx;
		ctx.putImageData( B.img, 0, 0 );
		const P = ( x, z ) => [ ( x - X0 ) * PPM, ( z - Z0 ) * PPM ];

		// village & landmark pads
		ctx.fillStyle = `rgb(${ C.pad.join( ',' ) })`;
		for ( const p of T.pads || [] ) {

			const [ cx, cy ] = P( p.x, p.z );
			const r = Math.max( 1.5, p.radius * 0.8 * PPM );
			ctx.fillRect( cx - r, cy - r, 2 * r, 2 * r );

		}

		// the pier and its head
		const W = WORLD.pier;
		ctx.fillStyle = '#d9c7a0';
		ctx.strokeStyle = 'rgba(40, 30, 20, 0.55)';
		ctx.lineWidth = 0.6;
		const [ px0, pz0 ] = P( W.x - Math.max( W.width, 3 ) / 2, W.zStart );
		const [ px1, pz1 ] = P( W.x + Math.max( W.width, 3 ) / 2, W.zEnd );
		ctx.fillRect( px0, pz0, px1 - px0, pz1 - pz0 );
		ctx.strokeRect( px0, pz0, px1 - px0, pz1 - pz0 );
		const [ hx0, hz0 ] = P( W.x - W.headWidth / 2, W.zEnd - W.headDepth );
		const [ hx1, hz1 ] = P( W.x + W.headWidth / 2, W.zEnd );
		ctx.fillRect( hx0, hz0, hx1 - hx0, hz1 - hz0 );
		ctx.strokeRect( hx0, hz0, hx1 - hx0, hz1 - hz0 );
		B.done = true;
		B.img = null;
		this._syncFullCanvas();

	}

	// ---- per frame
	update( dt ) {

		this._bakeStep();
		const app = this.game.app, cam = app.camera, p = app.player;
		if ( this._viewSize < 0 || ! this._ro ) this._viewSize = this.view.clientWidth;
		const size = this._viewSize;
		if ( ! size ) return;
		const R = size / 2;

		// forward (xz) of the view
		const e = cam.matrixWorld.elements;
		let fx = - e[ 8 ], fz = - e[ 10 ];
		const fl = Math.hypot( fx, fz );
		if ( fl < 1e-4 ) {

			fx = 0; fz = - 1;

		} else {

			fx /= fl; fz /= fl;

		}

		const rx = - fz, rz = fx; // right
		const x = cam.position.x, z = cam.position.z;

		// zoom: close on foot, mid on bike, wide at sea
		const want = p.mode === 'boat' || p.mode === 'deck' || p.mode === 'swim' ? 240 : p.mode === 'vehicle' ? 165 : 110;
		this.radiusM += ( want - this.radiusM ) * ( 1 - Math.exp( - dt * 1.5 ) );
		const kpm = R / this.radiusM; // css px per metre

		// map: player at the centre, forward up
		const rot = - Math.PI / 2 - Math.atan2( fz, fx );
		const s = kpm / PPM;
		this._setStyle( this.canvas, 'transform', `translate(${ R }px, ${ R }px) rotate(${ rot }rad) scale(${ s }) translate(${ - ( x - X0 ) * PPM }px, ${ - ( z - Z0 ) * PPM }px)` );

		const place = ( el, dx, dz, edgeInset, arrow ) => {

			let sx = ( dx * rx + dz * rz ) * kpm, sy = - ( dx * fx + dz * fz ) * kpm;
			const r = Math.hypot( sx, sy ), max = R - edgeInset;
			const edge = r > max;
			if ( edge ) {

				sx *= max / r; sy *= max / r;

			}

			this._setStyle( el, 'transform', `translate(${ R + sx }px, ${ R + sy }px)` );
			if ( arrow && edge ) this._setStyle( arrow, 'transform', `rotate(${ Math.atan2( sx, - sy ) }rad)` );
			return edge;

		};

		for ( const m of this.markers ) {

			const q = m.pos();
			const hide = ! q || ( m.hideWhen && m.hideWhen() );
			this._setStyle( m.el, 'display', hide ? 'none' : '' );
			if ( hide ) continue;
			const edge = place( m.el, q.x - x, q.z - z, 12, m.arrow );
			this._toggle( m.el, 'is-edge', edge );

		}

		const netPeers = app.mp?.getPeersList?.() || [];
		const seenPeers = new Set();
		for ( const np of netPeers ) {

			seenPeers.add( np.id );
			let pm = this.peerMarkers.get( np.id );
			if ( ! pm ) {

				const miniEl = h( 'div', 'gm-mk is-peer', '<b></b><i></i>' );
				miniEl.querySelector( 'i' ).style.background = np.color || '#5ce0d2';
				this.marks.append( miniEl );
				const fullEl = h( 'div', 'gm-fm-pin is-peer', '<i></i><span class="gm-fm-tag"></span>' );
				fullEl.querySelector( 'i' ).style.background = np.color || '#5ce0d2';
				fullEl.querySelector( '.gm-fm-tag' ).textContent = np.name || '';
				this.fmMarks.append( fullEl );
				pm = { miniEl, arrow: miniEl.firstChild, fullEl, tag: fullEl.querySelector( '.gm-fm-tag' ), latest: np };
				this.peerMarkers.set( np.id, pm );

			} else {

				pm.latest = np;
				if ( pm.tag && pm.tag.textContent !== np.name ) pm.tag.textContent = np.name;

			}

			const edge = place( pm.miniEl, np.x - x, np.z - z, 10, pm.arrow );
			this._toggle( pm.miniEl, 'is-edge', edge );

		}

		for ( const [ pid, pm ] of this.peerMarkers.entries() ) {

			if ( ! seenPeers.has( pid ) ) {

				pm.miniEl.remove();
				pm.fullEl.remove();
				this.peerMarkers.delete( pid );

			}

		}

		// Waypoint live distance & arrival clear
		if ( this.waypoint ) {

			const pxz = this._playerXZ();
			if ( hasArrivedAtWaypoint( pxz.x, pxz.z, this.waypoint.x, this.waypoint.z, 12 ) ) {

				this.clearWaypoint( true );
				this.game.toast( tr( 'Arrived at waypoint' ), 2600 );

			} else {

				this._syncWaypointUI();

			}

		}

		if ( this.fullOpen ) this._updateFullMarkers();

		// the N on the rim
		place( this.north, 0, - 1e6, 9 );

		// fish finder: the richest water nearby, refreshed now and then
		const finder = this.game.state.stats.finder;
		this._fishT -= dt;
		if ( finder && this._fishT <= 0 ) {

			this._fishT = 1.5;
			this._fishPts = this._richest( x, z, this.radiusM * 0.85 );

		}

		for ( let i = 0; i < this.fish.length; i ++ ) {

			const q = finder ? this._fishPts[ i ] : null;
			this._toggle( this.fish[ i ], 'is-on', !! q );
			if ( q ) place( this.fish[ i ], q.x - x, q.z - z, 14 );

		}

	}

	// the two richest points on a coarse polar grid around (x, z), at least 25 m apart
	_richest( x, z, r ) {

		const g = this.game, T = g.app.terrainData;
		const pts = [];
		for ( let ring = 1; ring <= 3; ring ++ ) for ( let a = 0; a < 12; a ++ ) {

			const ang = ( a / 12 ) * Math.PI * 2 + ring * 0.4, d = r * ring / 3;
			const px = x + Math.cos( ang ) * d, pz = z + Math.sin( ang ) * d;
			const depth = - T.heightAt( px, pz );
			if ( depth < 1 ) continue;
			const hab = g.habitatAtPoint( px, pz, depth );
			let rich = 0;
			for ( const k in hab ) rich += hab[ k ];
			if ( rich > 0.7 ) pts.push( { x: px, z: pz, rich } );

		}

		pts.sort( ( a, b ) => b.rich - a.rich );
		const out = [];
		for ( const q of pts ) if ( out.every( ( o ) => Math.hypot( o.x - q.x, o.z - q.z ) > 25 ) ) {

			out.push( q );
			if ( out.length === 2 ) break;

		}

		return out;

	}

}
