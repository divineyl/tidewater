import assert from 'node:assert/strict';
import { classifyGpuAdapter } from '../src/engine/gpu/GPU.js';
import { sanitizeMessage, interpolatePeer } from '../src/net/NetProtocol.js';
import { FISH, LURES, LURE_IDS, fishLengthCm } from '../src/game/FishTable.js';
import { habitatAt, pickSpecies, rollWeight } from '../src/game/Bites.js';
import { generateBounties, applyCatchToBounties } from '../src/game/Bounties.js';
import { LANDMARKS, checkLandmarkDiscovery } from '../src/game/Landmarks.js';
import { RALLY_GATES, evaluateRallyMedal } from '../src/game/RallyCourse.js';
import { GameState } from '../src/game/GameState.js';
import { DEFAULT_PREFS, normalizePrefs, buildSaveBundle, parseSaveBundle } from '../src/core/Prefs.js';
import { BOAT_PAINTS, BOAT_PAINT_IDS } from '../src/game/Gear.js';

let passed = 0;
function test( name, fn ) {

	fn();
	passed ++;
	console.log( `  ✓ ${ name }` );

}

console.log( 'Milestone 6 expansion tests' );

test( 'classifyGpuAdapter distinguishes software, integrated, entry, mid, and high-tier GPUs', () => {

	const sw = classifyGpuAdapter( { description: 'Google SwiftShader', isFallbackAdapter: true } );
	assert.equal( sw.tier, 'software' );
	assert.equal( sw.isSoftware, true );
	assert.equal( sw.recommendedPreset, 'potato' );

	const ig = classifyGpuAdapter( { vendor: 'intel', description: 'Intel(R) UHD Graphics 630' } );
	assert.equal( ig.tier, 'integrated' );
	assert.equal( ig.isIntegrated, true );
	assert.equal( ig.recommendedPreset, 'potato' );

	const gtx1050 = classifyGpuAdapter( { vendor: 'nvidia', description: 'NVIDIA GeForce GTX 1050 Ti' } );
	assert.equal( gtx1050.tier, 'entry' );
	assert.equal( gtx1050.isIntegrated, false );
	assert.equal( gtx1050.recommendedPreset, 'eco' );

	const rtx3060 = classifyGpuAdapter( { vendor: 'nvidia', description: 'NVIDIA GeForce RTX 3060' } );
	assert.equal( rtx3060.tier, 'mid' );
	assert.equal( rtx3060.recommendedPreset, 'balanced' );

	const rtx4080 = classifyGpuAdapter( { vendor: 'nvidia', description: 'NVIDIA GeForce RTX 4080' } );
	assert.equal( rtx4080.tier, 'high' );
	assert.equal( rtx4080.recommendedPreset, 'high' );

} );

test( 'NetProtocol v2 sanitizes emotes, tournament events, and extended co-op/fishing states', () => {

	const emote = sanitizeMessage( { t: 'emote', from: 'p1', name: 'Alice', color: '#5ce0d2', kind: 'boat_horn' } );
	assert.equal( emote.kind, 'boat_horn' );
	const badEmote = sanitizeMessage( { t: 'emote', from: 'p1', kind: 'invalid_hack' } );
	assert.equal( badEmote.kind, 'wave' );

	const ts = sanitizeMessage( { t: 'tourney_start', from: 'host', id: 't_1', mode: 'biggestKg', durationSec: 300 } );
	assert.equal( ts.mode, 'biggestKg' );
	assert.equal( ts.durationSec, 300 );

	const sc = sanitizeMessage( { t: 'tourney_score', from: 'p2', tourneyId: 't_1', name: 'Bob', species: 'blueMarlin', kg: 44.5 } );
	assert.equal( sc.species, 'blueMarlin' );
	assert.equal( sc.kg, 44.5 );

	const te = sanitizeMessage( { t: 'tourney_end', from: 'host', tourneyId: 't_1', winnerName: 'Bob' } );
	assert.equal( te.winnerName, 'Bob' );

	const st = sanitizeMessage( {
		t: 'state', from: 'p1', x: 12, y: 2, z: - 8, yaw: 0.4,
		mode: 'coop', boatPaint: 'coral', boatName: 'Sea Fox', castPhase: 'floating',
		bobX: 25, bobY: 0, bobZ: 10, ridingPeerId: 'host',
	} );
	assert.equal( st.mode, 'coop' );
	assert.equal( st.boatPaint, 'coral' );
	assert.equal( st.boatName, 'Sea Fox' );
	assert.equal( st.castPhase, 'floating' );
	assert.equal( st.ridingPeerId, 'host' );

	const interp = interpolatePeer( { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, bobX: 0, bobY: 0, bobZ: 0 }, st, 0.1 );
	assert.ok( interp.bobX > 10 && interp.bobZ > 4 );
	assert.equal( interp.boatPaint, 'coral' );

} );

test( 'Lures & 3 legendary species obey length bounds and weather/lure gates', () => {

	assert.ok( LURE_IDS.length === 4 && LURES.stormLure && LURES.reefJig && LURES.liveBait );
	for ( const id of [ 'goldenTrevally', 'sailfish', 'blueMarlin' ] ) {

		const f = FISH[ id ];
		assert.ok( f && f.legendary );
		const lo = fishLengthCm( id, f.kg[ 0 ] );
		const hi = fishLengthCm( id, f.kg[ 1 ] );
		assert.ok( lo > 5 && hi < 200 && hi > lo, `${ id } length bounds ${ lo.toFixed( 1 ) }..${ hi.toFixed( 1 ) } cm` );

	}

	const deepHab = habitatAt( { depth: 45, reefDist: 300, pierDist: 400 } );
	let rngSeed = 7;
	const rng = () => ( ( rngSeed = ( rngSeed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );

	// Clear noon with standard lure should NOT spawn blueMarlin or sailfish
	let stormSpawns = 0;
	for ( let i = 0; i < 600; i ++ ) {

		const sp = pickSpecies( deepHab, 12, rng, null, 'standard' );
		if ( sp === 'blueMarlin' || sp === 'sailfish' ) stormSpawns ++;

	}

	assert.equal( stormSpawns, 0 );

	// Stormy weather + stormLure unlocks blueMarlin & sailfish
	let sawMarlin = false;
	for ( let i = 0; i < 600; i ++ ) {

		const sp = pickSpecies( deepHab, 12, rng, { rainIntensity: 0.9, stormIntensity: 0.85, pressure: 996 }, 'stormLure' );
		if ( sp === 'blueMarlin' ) sawMarlin = true;

	}

	assert.ok( sawMarlin, 'Expected blueMarlin to bite during storm with stormLure' );

	// liveBait produces heavier average rollWeight than standard
	let sumStd = 0, sumLive = 0;
	for ( let i = 0; i < 400; i ++ ) {

		sumStd += rollWeight( 'tuna', rng, 'standard' );
		sumLive += rollWeight( 'tuna', rng, 'liveBait' );

	}

	assert.ok( sumLive > sumStd );

} );

test( 'Bounties, scenic landmarks, rally medals, and GameState round-trip work properly', () => {

	const bounties = generateBounties( 2026, 6 );
	assert.equal( bounties.length, 6 );
	const res = applyCatchToBounties( bounties, { species: 'blueMarlin', kg: 22 }, { hour: 21, rainIntensity: 0.8, stormIntensity: 0.8, habitat: { deep: 1 } } );
	assert.ok( res.totalReward > 0 && res.completed.length >= 3 );

	assert.equal( LANDMARKS.length, 8 );
	const d1 = checkLandmarkDiscovery( { x: 296, z: 122 }, {}, false );
	assert.equal( d1.landmark.id, 'lighthouse_point' );
	assert.equal( d1.isNewVisit, true );
	const d2 = checkLandmarkDiscovery( { x: 296, z: 122 }, { lighthouse_point: { visited: true, photo: false } }, true );
	assert.equal( d2.isNewPhoto, true );
	const d3 = checkLandmarkDiscovery( { x: 296, z: 122 }, { lighthouse_point: { visited: true, photo: true } }, true );
	assert.equal( d3, null );

	assert.equal( RALLY_GATES.length, 10 );
	assert.equal( evaluateRallyMedal( 38.5 ).tier, 'gold' );
	assert.equal( evaluateRallyMedal( 50.0 ).tier, 'silver' );
	assert.equal( evaluateRallyMedal( 68.0 ).tier, 'bronze' );
	assert.equal( evaluateRallyMedal( 90.0 ).tier, 'finish' );

	const mem = new Map();
	const storage = { getItem: ( k ) => mem.get( k ) ?? null, setItem: ( k, v ) => mem.set( k, v ) };
	const gs = new GameState( storage );
	assert.equal( gs.setLure( 'stormLure' ), true );
	gs.recordLandmark( 'lighthouse_point', true, 135 );
	const rec = gs.recordRallyTime( 'buggy', 41.2 );
	assert.equal( rec.isRecord, true );

	const gs2 = new GameState( storage );
	assert.equal( gs2.load(), true );
	assert.equal( gs2.lure, 'stormLure' );
	assert.equal( gs2.landmarks.lighthouse_point.photo, true );
	assert.equal( gs2.rallyBest.buggy, 41.2 );
	assert.equal( gs2.money, 135 );

} );

test( 'Prefs & v2 save bundle preserve boatPaint, boatName, and islandRadio', () => {

	assert.equal( BOAT_PAINT_IDS.length, 6 );
	assert.ok( BOAT_PAINTS.navy );
	assert.equal( DEFAULT_PREFS.boatPaint, 'classic' );
	assert.equal( DEFAULT_PREFS.islandRadio, false );

	const np = normalizePrefs( { boatPaint: 'coral', boatName: '  Sea Spray\n ', islandRadio: true } );
	assert.equal( np.boatPaint, 'coral' );
	assert.equal( np.boatName, 'Sea Spray' );
	assert.equal( np.islandRadio, true );

	const json = JSON.stringify( buildSaveBundle( { v: 1, money: 50, inventory: [], log: {}, upgrades: {} }, np ) );
	const parsed = parseSaveBundle( json );
	assert.equal( parsed.ok, true );
	assert.equal( parsed.prefs.boatPaint, 'coral' );
	assert.equal( parsed.prefs.boatName, 'Sea Spray' );
	assert.equal( parsed.prefs.islandRadio, true );

} );

console.log( `\n${ passed } test groups passed.` );
