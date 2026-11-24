export const PLAYER_COLORS = [
	'#5ce0d2',
	'#ff7b5c',
	'#ffd166',
	'#8ecae6',
	'#a3e635',
	'#c084fc',
	'#fb7185',
	'#38bdf8',
];

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALLOWED_TYPES = new Set( [ 'hello', 'welcome', 'peer_join', 'peer_leave', 'state', 'world', 'chat', 'catch', 'ping_wp', 'emote', 'tourney_start', 'tourney_score', 'tourney_end' ] );
const ALLOWED_MODES = new Set( [ 'walk', 'swim', 'dive', 'deck', 'boat', 'vehicle', 'coop', 'free' ] );
const ALLOWED_PAINTS = new Set( [ 'stock', 'coral', 'teal', 'sand', 'obsidian', 'pearl' ] );
const ALLOWED_TINTS = new Set( [ 'warm', 'led', 'amber' ] );
const ALLOWED_BOAT_PAINTS = new Set( [ 'classic', 'navy', 'coral', 'emerald', 'sunburst', 'midnight' ] );
const ALLOWED_CAST_PHASES = new Set( [ 'idle', 'casting', 'floating', 'fighting', 'landing' ] );
const ALLOWED_EMOTES = new Set( [ 'wave', 'horn', 'boat_horn', 'cheer', 'gather' ] );
const ALLOWED_TOURNEY_MODES = new Set( [ 'totalKg', 'biggestKg', 'speciesCount' ] );

function clamp( v, lo, hi ) {

	return v < lo ? lo : v > hi ? hi : v;

}

function num( v, fallback = 0, lo = - 1e6, hi = 1e6 ) {

	const n = Number( v );
	return Number.isFinite( n ) ? clamp( n, lo, hi ) : fallback;

}

function cleanStr( v, fallback = '', maxLen = 64 ) {

	if ( typeof v !== 'string' ) return fallback;
	const cleaned = v.replace( /[\x00-\x1f\x7f]/g, ' ' ).replace( /\s+/g, ' ' ).trim().slice( 0, maxLen );
	return cleaned || fallback;

}

export function generateRoomCode() {

	const buf = new Uint8Array( 4 );
	if ( typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function' ) {

		globalThis.crypto.getRandomValues( buf );

	} else {

		for ( let i = 0; i < 4; i ++ ) buf[ i ] = Math.floor( Math.random() * 256 );

	}

	let out = '';
	for ( let i = 0; i < 4; i ++ ) out += CODE_CHARS[ buf[ i ] % CODE_CHARS.length ];
	return `TW-${ out }`;

}

export function normalizeRoomCode( raw ) {

	if ( typeof raw !== 'string' ) return null;
	let s = raw.trim().toUpperCase().replace( /[\s_-]+/g, '' );
	if ( s.startsWith( 'TW' ) && s.length === 6 ) s = s.slice( 2 );
	if ( ! /^[A-Z0-9]{4}$/.test( s ) ) return null;
	return `TW-${ s }`;

}

export function roomCodeToPeerId( code ) {

	const norm = normalizeRoomCode( code );
	if ( ! norm ) return null;
	return `tidewater-v1-${ norm.slice( 3 ).toLowerCase() }`;

}

export function sanitizeName( name, fallback = 'Angler' ) {

	return cleanStr( name, fallback, 16 );

}

export function pickPlayerColor( seedStr = '' ) {

	let h = 0;
	const s = String( seedStr || '' );
	for ( let i = 0; i < s.length; i ++ ) h = ( h * 31 + s.charCodeAt( i ) ) >>> 0;
	return PLAYER_COLORS[ h % PLAYER_COLORS.length ];

}

export function lerpAngle( a, b, t ) {

	const TWO_PI = Math.PI * 2;
	let d = ( ( b - a + Math.PI ) % TWO_PI + TWO_PI ) % TWO_PI - Math.PI;
	return a + d * t;

}

export function interpolatePeer( cur, target, dt ) {

	if ( ! target ) return cur;
	if ( ! cur ) return { ...target };
	const clampedDt = clamp( Number.isFinite( dt ) ? dt : 0, 0, 0.25 );
	const alpha = 1 - Math.exp( - clampedDt * 14 );
	const out = { ...cur };
	out.x = cur.x + ( target.x - cur.x ) * alpha;
	out.y = cur.y + ( target.y - cur.y ) * alpha;
	out.z = cur.z + ( target.z - cur.z ) * alpha;
	out.yaw = lerpAngle( cur.yaw, target.yaw, alpha );
	out.pitch = cur.pitch + ( target.pitch - cur.pitch ) * alpha;
	out.speed = cur.speed + ( target.speed - cur.speed ) * alpha;
	out.mode = target.mode;
	out.vehId = target.vehId;
	out.paint = target.paint;
	out.lightOn = target.lightOn;
	out.lightTint = target.lightTint;
	out.rodOut = target.rodOut;
	out.boatPaint = target.boatPaint;
	out.boatName = target.boatName;
	out.castPhase = target.castPhase;
	out.catchSpecies = target.catchSpecies;
	out.ridingPeerId = target.ridingPeerId;
	if ( Number.isFinite( target.bobX ) && Number.isFinite( target.bobY ) && Number.isFinite( target.bobZ ) ) {

		out.bobX = Number.isFinite( cur.bobX ) ? cur.bobX + ( target.bobX - cur.bobX ) * alpha : target.bobX;
		out.bobY = Number.isFinite( cur.bobY ) ? cur.bobY + ( target.bobY - cur.bobY ) * alpha : target.bobY;
		out.bobZ = Number.isFinite( cur.bobZ ) ? cur.bobZ + ( target.bobZ - cur.bobZ ) * alpha : target.bobZ;

	} else {

		out.bobX = null;
		out.bobY = null;
		out.bobZ = null;

	}

	return out;

}

export function sanitizeMessage( raw ) {

	let obj = raw;
	if ( typeof obj === 'string' ) {

		try {

			obj = JSON.parse( obj );

		} catch {

			return null;

		}

	}

	if ( ! obj || typeof obj !== 'object' ) return null;
	const t = typeof obj.t === 'string' ? obj.t : '';
	if ( ! ALLOWED_TYPES.has( t ) ) return null;

	const from = cleanStr( obj.from, '', 36 );
	const base = { t };
	if ( from ) base.from = from;
	if ( typeof obj.to === 'string' && obj.to ) base.to = cleanStr( obj.to, '', 36 );

	switch ( t ) {

		case 'hello':
			return {
				...base,
				id: cleanStr( obj.id || from, '', 36 ),
				name: sanitizeName( obj.name ),
				color: /^#[0-9a-fA-F]{6}$/.test( obj.color || '' ) ? obj.color : PLAYER_COLORS[ 0 ],
			};

		case 'welcome':
			return {
				...base,
				room: cleanStr( obj.room, '', 24 ),
				hostId: cleanStr( obj.hostId, '', 36 ),
				peers: Array.isArray( obj.peers )
					? obj.peers.slice( 0, 16 ).map( ( p ) => ( {
						id: cleanStr( p?.id, '', 36 ),
						name: sanitizeName( p?.name ),
						color: /^#[0-9a-fA-F]{6}$/.test( p?.color || '' ) ? p.color : PLAYER_COLORS[ 0 ],
					} ) ).filter( ( p ) => p.id )
					: [],
				world: obj.world && typeof obj.world === 'object' ? sanitizeWorldPayload( obj.world ) : null,
			};

		case 'peer_join':
			return {
				...base,
				id: cleanStr( obj.id || from, '', 36 ),
				name: sanitizeName( obj.name ),
				color: /^#[0-9a-fA-F]{6}$/.test( obj.color || '' ) ? obj.color : PLAYER_COLORS[ 0 ],
			};

		case 'peer_leave':
			return {
				...base,
				id: cleanStr( obj.id || from, '', 36 ),
			};

		case 'state':
			return {
				...base,
				x: num( obj.x, 0, - 2000, 2000 ),
				y: num( obj.y, 2, - 200, 500 ),
				z: num( obj.z, 0, - 2000, 2000 ),
				yaw: num( obj.yaw, 0, - 100, 100 ),
				pitch: num( obj.pitch, 0, - 2, 2 ),
				speed: num( obj.speed, 0, - 60, 60 ),
				mode: ALLOWED_MODES.has( obj.mode ) ? obj.mode : 'walk',
				vehId: obj.vehId === 'motorcycle' || obj.vehId === 'buggy' ? obj.vehId : null,
				paint: ALLOWED_PAINTS.has( obj.paint ) ? obj.paint : 'stock',
				lightOn: !! obj.lightOn,
				lightTint: ALLOWED_TINTS.has( obj.lightTint ) ? obj.lightTint : 'warm',
				rodOut: !! obj.rodOut,
				boatPaint: ALLOWED_BOAT_PAINTS.has( obj.boatPaint ) ? obj.boatPaint : 'classic',
				boatName: cleanStr( obj.boatName, '', 18 ),
				castPhase: ALLOWED_CAST_PHASES.has( obj.castPhase ) ? obj.castPhase : 'idle',
				bobX: Number.isFinite( obj.bobX ) ? num( obj.bobX, 0, - 2000, 2000 ) : null,
				bobY: Number.isFinite( obj.bobY ) ? num( obj.bobY, 0, - 200, 500 ) : null,
				bobZ: Number.isFinite( obj.bobZ ) ? num( obj.bobZ, 0, - 2000, 2000 ) : null,
				catchSpecies: cleanStr( obj.catchSpecies, '', 32 ),
				ridingPeerId: cleanStr( obj.ridingPeerId, '', 36 ),
			};

		case 'world':
			return {
				...base,
				...sanitizeWorldPayload( obj ),
			};

		case 'chat': {

			const text = cleanStr( obj.text, '', 180 );
			if ( ! text ) return null;
			return {
				...base,
				name: sanitizeName( obj.name ),
				color: /^#[0-9a-fA-F]{6}$/.test( obj.color || '' ) ? obj.color : PLAYER_COLORS[ 0 ],
				text,
			};

		}

		case 'catch':
			return {
				...base,
				name: sanitizeName( obj.name ),
				color: /^#[0-9a-fA-F]{6}$/.test( obj.color || '' ) ? obj.color : PLAYER_COLORS[ 0 ],
				species: cleanStr( obj.species, 'Fish', 40 ),
				kg: num( obj.kg, 0.5, 0, 500 ),
				cm: num( obj.cm, 30, 0, 500 ),
				record: !! obj.record,
			};

		case 'ping_wp':
			return {
				...base,
				name: sanitizeName( obj.name ),
				color: /^#[0-9a-fA-F]{6}$/.test( obj.color || '' ) ? obj.color : PLAYER_COLORS[ 0 ],
				x: num( obj.x, 0, - 1000, 1000 ),
				z: num( obj.z, 0, - 1000, 1000 ),
			};

		case 'emote':
			return {
				...base,
				name: sanitizeName( obj.name ),
				color: /^#[0-9a-fA-F]{6}$/.test( obj.color || '' ) ? obj.color : PLAYER_COLORS[ 0 ],
				kind: ALLOWED_EMOTES.has( obj.kind ) ? obj.kind : 'wave',
			};

		case 'tourney_start':
			return {
				...base,
				id: cleanStr( obj.id, 't1', 36 ),
				mode: ALLOWED_TOURNEY_MODES.has( obj.mode ) ? obj.mode : 'totalKg',
				durationSec: num( obj.durationSec, 300, 30, 1800 ),
			};

		case 'tourney_score':
			return {
				...base,
				tourneyId: cleanStr( obj.tourneyId, '', 36 ),
				name: sanitizeName( obj.name ),
				color: /^#[0-9a-fA-F]{6}$/.test( obj.color || '' ) ? obj.color : PLAYER_COLORS[ 0 ],
				species: cleanStr( obj.species, 'grunt', 32 ),
				kg: num( obj.kg, 0.5, 0, 500 ),
			};

		case 'tourney_end':
			return {
				...base,
				tourneyId: cleanStr( obj.tourneyId, '', 36 ),
				winnerName: cleanStr( obj.winnerName, '', 16 ),
			};

		default:
			return null;

	}

}

function sanitizeWorldPayload( obj ) {

	return {
		timeOfDay: num( obj.timeOfDay, 16.2, 0, 24 ),
		timeSpeed: num( obj.timeSpeed, 0, 0, 2 ),
		weatherAuto: obj.weatherAuto !== false,
		weatherPreset: cleanStr( obj.weatherPreset, 'fair', 24 ),
		windSpeed: num( obj.windSpeed, 7, 0, 35 ),
		windDir: num( obj.windDir, 20, - 360, 360 ),
	};

}
