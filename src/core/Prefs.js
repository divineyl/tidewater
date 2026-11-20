// Local user preferences persistence (localStorage), safe in headless Node tests.

const PREFS_KEY = 'tidewater.prefs.v1';

export const DEFAULT_PREFS = Object.freeze( {
	qualityPreset: 'high',
	renderScale: 1,
	aa: 8,
	shadows: true,
	ssr: true,
	audioVolume: 1,
	audioMuted: false,
	weatherAuto: true,
	weatherPreset: 'fair',
	weatherSpeed: 1,
	camMode: 'third',
	fov: 62,
	vehPreset: 'realistic',
	vehTopSpeed: 84,
	vehRider: true,
	vehHeadlight: false,
	motorcyclePose: null,
	buggyPose: null,
} );

function resolveStorage( customStorage ) {

	if ( customStorage ) return customStorage;
	try {

		return typeof localStorage !== 'undefined' ? localStorage : null;

	} catch {

		return null;

	}

}

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );
const finite = ( v, fallback ) => ( typeof v === 'number' && Number.isFinite( v ) ? v : fallback );

export function normalizePrefs( raw ) {

	const src = raw && typeof raw === 'object' ? raw : {};
	const preset = [ 'eco', 'balanced', 'high', 'ultra', 'custom' ].includes( src.qualityPreset ) ? src.qualityPreset : DEFAULT_PREFS.qualityPreset;
	const aaOpts = [ 0, 2, 4, 8, 16 ];
	const aaVal = aaOpts.includes( Number( src.aa ) ) ? Number( src.aa ) : DEFAULT_PREFS.aa;
	const camMode = src.camMode === 'first' || src.camMode === 'third' ? src.camMode : DEFAULT_PREFS.camMode;
	const vehPreset = src.vehPreset === 'arcade' || src.vehPreset === 'realistic' ? src.vehPreset : DEFAULT_PREFS.vehPreset;
	const weatherPreset = typeof src.weatherPreset === 'string' && src.weatherPreset ? src.weatherPreset : DEFAULT_PREFS.weatherPreset;

	const normPose = ( pose ) => {

		if ( ! pose || typeof pose !== 'object' ) return null;
		const { x, z, yaw } = pose;
		return ( Number.isFinite( x ) && Number.isFinite( z ) && Number.isFinite( yaw ) ) ? { x, z, yaw } : null;

	};

	const motorcyclePose = normPose( src.motorcyclePose );
	const buggyPose = normPose( src.buggyPose );

	return {
		qualityPreset: preset,
		renderScale: clamp( finite( Number( src.renderScale ), DEFAULT_PREFS.renderScale ), 0.5, 1 ),
		aa: aaVal,
		shadows: typeof src.shadows === 'boolean' ? src.shadows : DEFAULT_PREFS.shadows,
		ssr: typeof src.ssr === 'boolean' ? src.ssr : DEFAULT_PREFS.ssr,
		audioVolume: clamp( finite( Number( src.audioVolume ), DEFAULT_PREFS.audioVolume ), 0, 1 ),
		audioMuted: typeof src.audioMuted === 'boolean' ? src.audioMuted : DEFAULT_PREFS.audioMuted,
		weatherAuto: typeof src.weatherAuto === 'boolean' ? src.weatherAuto : DEFAULT_PREFS.weatherAuto,
		weatherPreset,
		weatherSpeed: clamp( finite( Number( src.weatherSpeed ), DEFAULT_PREFS.weatherSpeed ), 0.1, 10 ),
		camMode,
		fov: clamp( Math.round( finite( Number( src.fov ), DEFAULT_PREFS.fov ) ), 35, 100 ),
		vehPreset,
		vehTopSpeed: clamp( Math.round( finite( Number( src.vehTopSpeed ), DEFAULT_PREFS.vehTopSpeed ) ), 50, 120 ),
		vehRider: typeof src.vehRider === 'boolean' ? src.vehRider : DEFAULT_PREFS.vehRider,
		vehHeadlight: typeof src.vehHeadlight === 'boolean' ? src.vehHeadlight : DEFAULT_PREFS.vehHeadlight,
		motorcyclePose,
		buggyPose,
	};

}

export function loadPrefs( customStorage = null ) {

	const storage = resolveStorage( customStorage );
	if ( ! storage ) return { ...DEFAULT_PREFS };
	try {

		const raw = storage.getItem( PREFS_KEY );
		if ( ! raw ) return { ...DEFAULT_PREFS };
		return normalizePrefs( JSON.parse( raw ) );

	} catch {

		return { ...DEFAULT_PREFS };

	}

}

export function savePrefs( patch, customStorage = null ) {

	const storage = resolveStorage( customStorage );
	const next = normalizePrefs( { ...loadPrefs( storage ), ...( patch || {} ) } );
	if ( storage ) {

		try {

			storage.setItem( PREFS_KEY, JSON.stringify( next ) );

		} catch { /* ignore quota / private mode */ }

	}

	return next;

}

export function resetPrefs( customStorage = null ) {

	const storage = resolveStorage( customStorage );
	if ( storage ) {

		try {

			if ( typeof storage.removeItem === 'function' ) storage.removeItem( PREFS_KEY );
			else storage.setItem( PREFS_KEY, '' );

		} catch { /* ignore */ }

	}

	return { ...DEFAULT_PREFS };

}

export function sanitizeVehiclePose( pose, terrain ) {

	if ( ! pose || typeof pose !== 'object' ) return null;
	const { x, z, yaw } = pose;
	if ( ! Number.isFinite( x ) || ! Number.isFinite( z ) || ! Number.isFinite( yaw ) ) return null;
	if ( Math.abs( x ) > 450 || Math.abs( z ) > 450 ) return null;
	if ( terrain && typeof terrain.heightAt === 'function' ) {

		const h = terrain.heightAt( x, z );
		if ( ! Number.isFinite( h ) || h <= 0.35 ) return null;

	}

	return { x, z, yaw };

}

export function createPrefsStore( customStorage = null ) {

	const storage = resolveStorage( customStorage );
	let data = loadPrefs( storage );
	let timer = null;

	const writeNow = () => {

		timer = null;
		if ( ! storage ) return;
		try {

			storage.setItem( PREFS_KEY, JSON.stringify( data ) );

		} catch { /* ignore */ }

	};

	return {
		get data() { return data; },
		save( patch, immediate = false ) {

			data = normalizePrefs( { ...data, ...( patch || {} ) } );
			if ( immediate || typeof setTimeout !== 'function' ) {

				if ( timer && typeof clearTimeout === 'function' ) clearTimeout( timer );
				writeNow();

			} else {

				if ( timer ) clearTimeout( timer );
				timer = setTimeout( writeNow, 250 );

			}

			return data;

		},
		flush() {

			if ( timer && typeof clearTimeout === 'function' ) clearTimeout( timer );
			writeNow();

		},
		reset() {

			if ( timer && typeof clearTimeout === 'function' ) clearTimeout( timer );
			timer = null;
			data = resetPrefs( storage );
			return data;

		},
	};

}
