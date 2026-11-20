// Plain-node tests for Milestone 1 systems: i18n, Prefs, Input gamepad shaping.
import {
	getLang, setLang, toggleLang, onLangChange,
	tr, trWeather, trFish, trSurface, trPhase, trCompass, trUpgradeName, trUpgradeLabel,
} from '../src/i18n/i18n.js';
import {
	DEFAULT_PREFS, loadPrefs, savePrefs, resetPrefs, sanitizeVehiclePose, createPrefsStore,
} from '../src/core/Prefs.js';
import { shapeAxis } from '../src/core/Input.js';

let fails = 0;
const ok = ( cond, msg ) => {

	if ( ! cond ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else {

		console.log( 'ok  ', msg );

	}

};

// ---- i18n
{

	setLang( 'zh' );
	ok( getLang() === 'zh', 'i18n defaults/sets to zh cleanly' );
	ok( tr( 'Settings' ) === '系统设置', 'tr translates HUD/UI strings to Simplified Chinese' );
	ok( trWeather( 'storm', 'Storm' ) === '海上雷暴', 'trWeather maps weather presets cleanly' );
	ok( trFish( 'tuna', 'Blackfin tuna' ) === '黑鳍金枪鱼', 'trFish maps species to Chinese' );
	ok( trSurface( 'path' ) === '土路' && trSurface( 'sand' ) === '沙滩', 'trSurface maps all terrain/vehicle surfaces including path' );
	ok( trPhase( 'Golden hour' ) === '金色时刻', 'trPhase translates time-of-day phases' );
	ok( trCompass( 'north-east' ) === '东北方向', 'trCompass translates compass bearings' );
	ok( trUpgradeName( 'line', 'Fishing line' ) === '鱼线', 'trUpgradeName translates gear categories' );
	ok( trUpgradeLabel( 'hold', 2, 'Insulated fish hold' ).includes( '160 kg' ), 'trUpgradeLabel translates upgrade tiers' );

	let notified = '';
	const unsub = onLangChange( ( l ) => { notified = l; } );
	toggleLang();
	ok( getLang() === 'en' && notified === 'en', 'toggleLang switches to en and notifies listeners' );
	ok( tr( 'Settings' ) === 'Settings', 'tr returns English source text when lang=en' );
	unsub();
	notified = '';
	setLang( 'zh' );
	ok( notified === '' && getLang() === 'zh', 'unsubscribed listener does not fire after unsub()' );

}

// ---- Prefs & sanitizeVehiclePose
{

	const mem = new Map();
	const storage = {
		getItem: ( k ) => ( mem.has( k ) ? mem.get( k ) : null ),
		setItem: ( k, v ) => mem.set( k, String( v ) ),
		removeItem: ( k ) => mem.delete( k ),
	};

	const d0 = loadPrefs( storage );
	ok( d0.qualityPreset === DEFAULT_PREFS.qualityPreset && d0.fov === 62, 'loadPrefs returns defaults on empty storage' );

	storage.setItem( 'tidewater.prefs.v1', '{broken-json' );
	const broken = loadPrefs( storage );
	ok( broken.qualityPreset === 'high' && broken.audioVolume === 1, 'loadPrefs recovers gracefully from corrupt JSON' );

	savePrefs( { qualityPreset: 'eco', fov: 150, audioVolume: - 2, camMode: 'first', vehTopSpeed: 100 }, storage );
	const clamped = loadPrefs( storage );
	ok( clamped.qualityPreset === 'eco' && clamped.fov === 100 && clamped.audioVolume === 0 && clamped.camMode === 'first' && clamped.vehTopSpeed === 100, 'savePrefs merges and clamps out-of-range fields' );

	const fakeTerrain = { heightAt: ( x, z ) => ( x > 100 ? - 3.5 : 4.2 ) };
	ok( sanitizeVehiclePose( { x: 48, z: - 80, yaw: 1.2 }, fakeTerrain ) !== null, 'sanitizeVehiclePose keeps dry land pose' );
	ok( sanitizeVehiclePose( { x: 150, z: 0, yaw: 0 }, fakeTerrain ) === null, 'sanitizeVehiclePose rejects underwater pose' );
	ok( sanitizeVehiclePose( { x: 999, z: 0, yaw: 0 }, fakeTerrain ) === null, 'sanitizeVehiclePose rejects out-of-bounds pose' );
	ok( sanitizeVehiclePose( { x: NaN, z: 0, yaw: 0 }, fakeTerrain ) === null, 'sanitizeVehiclePose rejects non-finite coordinates' );

	const store = createPrefsStore( storage );
	store.save( { audioMuted: true, qualityPreset: 'ultra' }, true );
	ok( loadPrefs( storage ).audioMuted === true && loadPrefs( storage ).qualityPreset === 'ultra', 'createPrefsStore persists immediately when requested' );

	const reset = resetPrefs( storage );
	ok( reset.qualityPreset === 'high' && ! mem.has( 'tidewater.prefs.v1' ), 'resetPrefs clears storage and returns defaults' );

}

// ---- Input gamepad axis shaping
{

	ok( shapeAxis( 0.05, 0.14 ) === 0 && shapeAxis( - 0.1, 0.14 ) === 0, 'shapeAxis zeroes values inside deadzone' );
	ok( shapeAxis( 1.0, 0.14 ) === 1 && shapeAxis( - 1.0, 0.14 ) === - 1, 'shapeAxis hits exact +-1 at full deflect' );
	const a = shapeAxis( 0.4, 0.14 );
	const b = shapeAxis( 0.8, 0.14 );
	const neg = shapeAxis( - 0.4, 0.14 );
	ok( a > 0 && b > a && Math.abs( a + neg ) < 1e-6, 'shapeAxis is monotonic and symmetric' );

}

console.log( fails ? `${ fails } failed` : 'all passed' );
process.exit( fails ? 1 : 0 );
