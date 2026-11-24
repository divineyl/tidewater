import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks( {
	resolve( specifier, context, nextResolve ) {

		if ( specifier === 'peerjs' ) return { shortCircuit: true, url: 'peerjs-stub://peerjs' };
		return nextResolve( specifier, context );

	},
	load( url, context, nextLoad ) {

		if ( url === 'peerjs-stub://peerjs' ) {

			return {
				shortCircuit: true,
				format: 'module',
				source: 'export class Peer { constructor() {} once() {} on() {} destroy() {} }',
			};

		}

		return nextLoad( url, context );

	},
} );

const { CrabTrapManager, rollTrapHaul, MAX_CRAB_TRAPS, TRAP_SOAK_SEC } = await import( '../src/game/CrabTraps.js' );
const { DIVE_TREASURES, checkTreasureCollect } = await import( '../src/game/DiveTreasures.js' );
const { ACHIEVEMENTS, evaluateAchievements, getTitleLabel } = await import( '../src/game/Achievements.js' );
const { compareSemver } = await import( '../src/util/Semver.js' );
const { shouldSkipFrameForCap } = await import( '../src/engine/Engine.js' );
const { normalizePrefs, DEFAULT_PREFS } = await import( '../src/core/Prefs.js' );
const { GameState } = await import( '../src/game/GameState.js' );
const { sanitizeMessage, QUICK_PHRASES } = await import( '../src/net/NetProtocol.js' );
const { MultiplayerManager } = await import( '../src/net/MultiplayerManager.js' );
const { BoatModel } = await import( '../src/world/BoatModel.js' );
const { RemotePlayerAvatar } = await import( '../src/net/RemotePlayerAvatar.js' );

let passed = 0;
async function test( name, fn ) {

	await fn();
	passed ++;
	console.log( `  ✓ ${ name }` );

}

console.log( 'Milestone 7 (v1.4.0) expansion tests' );

await test( 'CrabTrapManager enforces depth/spacing/max=4 limits, ripens traps, and hauls rewards cleanly', async () => {

	assert.equal( rollTrapHaul( 8, 10, 0.2, () => 0.5 ).items.length, 0 );
	const deepHaul = rollTrapHaul( 24, 50, 1.0, () => 0.1 );
	assert.ok( deepHaul.items.length >= 1 );
	assert.equal( deepHaul.items[ 0 ].id, 'kingCrab' );
	assert.ok( deepHaul.totalValue > 150 );

	const fakeScene = { added: [], removed: [], add( c ) { c.parent = this; this.added.push( c ); }, remove( c ) { c.parent = null; this.removed.push( c ); } };
	const mgr = new CrabTrapManager( { scene: fakeScene } );
	assert.equal( mgr.canDeploy( 10, 10, 1.0 ).reason, 'too_shallow' );
	const t1 = mgr.deploy( 0, 0, 8, 25 );
	assert.ok( t1 );
	assert.equal( mgr.canDeploy( 4, 4, 8 ).reason, 'too_close' );
	for ( let i = 1; i < MAX_CRAB_TRAPS; i ++ ) assert.ok( mgr.deploy( i * 20, 0, 10, 20 ) );
	assert.equal( mgr.canDeploy( 200, 0, 10 ).reason, 'max_traps' );

	for ( let s = 0; s < ( TRAP_SOAK_SEC + 2 ) * 4; s ++ ) mgr.update( 0.25, 0 );
	assert.equal( t1.ready, true );

	const res = mgr.haul( t1.id, () => 0.4 );
	assert.ok( res && res.haul.totalValue > 0 );
	assert.equal( mgr.traps.length, MAX_CRAB_TRAPS - 1 );

	const ser = mgr.serialize();
	const mgr2 = new CrabTrapManager();
	mgr2.loadFromState( ser );
	assert.equal( mgr2.traps.length, MAX_CRAB_TRAPS - 1 );
	mgr.dispose();

} );

await test( 'DiveTreasures checks submerged swimmer position and rejects surface/collected items', async () => {

	assert.equal( DIVE_TREASURES.length, 8 );
	const target = DIVE_TREASURES[ 0 ];
	assert.equal( checkTreasureCollect( { x: target.x, y: 0.1, z: target.z }, {} ), null, 'Must be submerged' );
	assert.equal( checkTreasureCollect( { x: target.x, y: - 1.5, z: target.z }, {} )?.id, target.id );
	assert.equal( checkTreasureCollect( { x: target.x, y: - 1.5, z: target.z }, { [ target.id ]: true } ), null );
	assert.equal( checkTreasureCollect( { x: target.x, y: - 1.5, z: target.z }, { toString: true } )?.id, target.id );

} );

await test( 'Achievements evaluate all 10 milestones and safely map titles', async () => {

	assert.equal( ACHIEVEMENTS.length, 10 );
	const richState = {
		log: Object.fromEntries( [
			'grunt', 'mullet', 'needlefish', 'sergeant', 'yellowtail', 'chromis', 'tang',
			'goldenTrevally', 'sailfish', 'blueMarlin',
		].map( ( k ) => [ k, { count: 2, bestKg: 5 } ] ) ),
		trapsHauled: 4,
		treasures: Object.fromEntries( DIVE_TREASURES.map( ( t ) => [ t.id, true ] ) ),
		landmarks: Object.fromEntries( Array.from( { length: 8 }, ( _, i ) => [ `lm_${ i }`, { visited: true } ] ) ),
		rallyBest: { motorcycle: 39.5, buggy: null },
		bountiesDone: 6,
	};
	const ev = evaluateAchievements( richState );
	assert.equal( ev.doneCount, 10 );
	assert.equal( getTitleLabel( 'headland_ace', 'zh' ), '东岬车神' );
	assert.equal( getTitleLabel( 'headland_ace', 'en' ), 'Rally Ace' );
	assert.equal( getTitleLabel( 'toString', 'zh' ), '' );

} );

await test( 'Semver comparator and Engine fpsCap throttling behave accurately', async () => {

	assert.equal( compareSemver( 'v1.4.0', '1.3.1' ), 1 );
	assert.equal( compareSemver( '1.3.1', '1.4.0' ), - 1 );
	assert.equal( compareSemver( '1.4.0', 'v1.4.0' ), 0 );
	assert.equal( compareSemver( 'bad', '1.0.0' ), 0 );

	assert.equal( shouldSkipFrameForCap( 1005, 1000, 0 ), false );
	assert.equal( shouldSkipFrameForCap( 1010, 1000, 30 ), true );
	assert.equal( shouldSkipFrameForCap( 1034, 1000, 30 ), false );
	assert.equal( shouldSkipFrameForCap( 1008, 1000, 60 ), true );
	assert.equal( shouldSkipFrameForCap( 1017, 1000, 60 ), false );

} );

await test( 'Prefs v1.4 & GameState sanitize fpsCap, activeTitle, TURN URL, crabTraps, and diveTreasures', async () => {

	assert.equal( DEFAULT_PREFS.fpsCap, 0 );
	const p = normalizePrefs( {
		fpsCap: 60,
		activeTitle: 'headland_ace',
		customTurnUrl: 'turn:relay.tidewater.gg:3478',
		customTurnUser: 'user1',
		customTurnCred: 'secret',
	} );
	assert.equal( p.fpsCap, 60 );
	assert.equal( p.activeTitle, 'headland_ace' );
	assert.equal( p.customTurnUrl, 'turn:relay.tidewater.gg:3478' );

	const badTurn = normalizePrefs( { fpsCap: 144, customTurnUrl: 'http://evil.example.com' } );
	assert.equal( badTurn.fpsCap, 0 );
	assert.equal( badTurn.customTurnUrl, '' );

	const st = new GameState();
	assert.equal( st.recordTreasure( 'pearl_reef_west', 120 ), true );
	assert.equal( st.recordTreasure( 'pearl_reef_west', 120 ), false );
	assert.equal( st.recordTreasure( '__proto__', 999 ), false );
	assert.equal( st.money, 120 );
	st.recordTrapHaul( 85 );
	assert.equal( st.trapsHauled, 1 );
	assert.equal( st.money, 205 );
	st.setCrabTraps( [ { id: 1, x: 10, z: 20, depth: 8, soakSec: 12, ready: false } ] );

	const snap = st.toJSON();
	const st2 = new GameState();
	assert.equal( st2.fromJSON( snap ), true );
	assert.equal( st2.trapsHauled, 1 );
	assert.equal( st2.treasures.pearl_reef_west, true );
	assert.equal( st2.crabTraps.length, 1 );

} );

await test( 'NetProtocol v1.4 & MultiplayerManager handle quick_chat, ping/pong, custom TURN, and synced MP rally', async () => {

	assert.ok( QUICK_PHRASES.biting && QUICK_PHRASES.board );
	const qc = sanitizeMessage( { t: 'quick_chat', from: 'p1', name: 'Bob', phraseId: 'bad_id' } );
	assert.equal( qc.phraseId, 'biting' );
	const rs = sanitizeMessage( { t: 'rally_start', from: 'host', id: 'r_1', countdownSec: 99 } );
	assert.equal( rs.countdownSec, 10 );

	const host = new MultiplayerManager( {
		prefs: {
			data: {
				activeTitle: 'apex_captain',
				customTurnUrl: 'turns:turn.example.com:5349',
				customTurnUser: 'cap',
				customTurnCred: 'pw',
			},
		},
	} );
	const ice = host._buildIceConfig();
	assert.equal( ice.iceServers.some( ( s ) => s.urls === 'turns:turn.example.com:5349' && s.username === 'cap' ), true );

	host.status = 'connected';
	host.role = 'host';
	host._hostId = host.selfId;

	const sent = [];
	host._sendRaw = ( msg ) => sent.push( msg );
	assert.equal( host.startMultiplayerRally( 3 ), true );
	assert.ok( sent.some( ( m ) => m.t === 'rally_start' ) );
	assert.equal( host.rallyRace.active, true );

	host.update( 3.2 );
	assert.equal( host.rallyRace.started, true );
	host.reportRallyProgress( 4, 15.2 );
	host.reportRallyFinish( 38.4, 'buggy' );
	const summary = host.getRallyRaceSummary();
	assert.equal( summary.rows[ 0 ].finishSec, 38.4 );

	const guest = new MultiplayerManager( {} );
	guest.status = 'connected';
	guest.role = 'guest';
	guest._hostId = host.selfId;
	const gSent = [];
	guest._sendRaw = ( m ) => gSent.push( m );
	guest._handleIncomingMessage( sanitizeMessage( { t: 'rally_start', from: 'rogue', id: 'evil', countdownSec: 3 } ) );
	assert.equal( guest.rallyRace, null, 'Non-host rally_start must be blocked' );
	guest._handleIncomingMessage( sanitizeMessage( { t: 'pong', from: host.selfId, to: guest.selfId, seq: 1, ts: performance.now() - 25 } ) );
	assert.ok( Number.isFinite( guest.pingMs ) && guest.pingMs >= 1 );

} );

await test( 'BoatModel.setBoatName and RemotePlayerAvatar stern nameplate work cleanly without DOM', async () => {

	const fakeBoat = { boatName: '', paintId: 'navy', nameplateMesh: { visible: false } };
	const clean = BoatModel.prototype.setBoatName.call( fakeBoat, '  Sea\x00Fox 12345678901234  ' );
	assert.equal( clean.length, 18 );
	assert.equal( fakeBoat.nameplateMesh.visible, true );
	assert.equal( BoatModel.prototype.setBoatName.call( fakeBoat, '' ), '' );
	assert.equal( fakeBoat.nameplateMesh.visible, false );

	const av = new RemotePlayerAvatar( { id: 'np1', name: 'Ally', color: '#5ce0d2' } );
	av.update( 0.016, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, mode: 'boat', boatPaint: 'coral', boatName: 'Marlin', title: 'headland_ace' } );
	assert.equal( av._boatNameMesh.visible, true );
	av.dispose( null );

} );

console.log( `All ${ passed } Milestone 7 (v1.4.0) tests passed.` );
