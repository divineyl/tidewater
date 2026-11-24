import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';

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

const { GameState } = await import( '../src/game/GameState.js' );
const { nextLevel, gearStats } = await import( '../src/game/Gear.js' );
const { sanitizeMessage } = await import( '../src/net/NetProtocol.js' );
const { MultiplayerManager } = await import( '../src/net/MultiplayerManager.js' );
const { RemotePlayerAvatar } = await import( '../src/net/RemotePlayerAvatar.js' );
const {
	setLang,
	trWeather,
	trFish,
	trSurface,
	trPhase,
	trCompass,
	trUpgradeName,
	trUpgradeLabel,
} = await import( '../src/i18n/i18n.js' );
const { BoatModel } = await import( '../src/world/BoatModel.js' );
const { Player } = await import( '../src/player/Player.js' );
const { Game } = await import( '../src/game/Game.js' );
const { RallyCourse, evaluateRallyMedal } = await import( '../src/game/RallyCourse.js' );
const { Vector3 } = await import( '../src/engine/index.js' );

const require = createRequire( import.meta.url );
const { createLanServer } = require( '../desktop/lanServer.cjs' );

let passed = 0;
let failed = 0;

async function test( name, fn ) {

	try {

		await fn();
		passed ++;
		console.log( `  ✓ ${ name }` );

	} catch ( err ) {

		failed ++;
		console.log( `  ✗ ${ name } -> ${ err?.message || err }` );

	}

}

function encodeClientFrame( { fin = true, opcode = 0x1, payload = Buffer.alloc( 0 ) } ) {

	const len = payload.length;
	let hdr;
	if ( len < 126 ) {

		hdr = Buffer.allocUnsafe( 2 );
		hdr[ 0 ] = ( fin ? 0x80 : 0 ) | ( opcode & 0x0f );
		hdr[ 1 ] = 0x80 | len;

	} else {

		hdr = Buffer.allocUnsafe( 4 );
		hdr[ 0 ] = ( fin ? 0x80 : 0 ) | ( opcode & 0x0f );
		hdr[ 1 ] = 0x80 | 126;
		hdr.writeUInt16BE( len, 2 );

	}

	const mask = crypto.randomBytes( 4 );
	const masked = Buffer.allocUnsafe( len );
	for ( let i = 0; i < len; i ++ ) masked[ i ] = payload[ i ] ^ mask[ i & 3 ];
	return Buffer.concat( [ hdr, mask, masked ] );

}

function connectRawWs( port ) {

	return new Promise( ( resolve, reject ) => {

		const sock = net.connect( { host: '127.0.0.1', port } );
		let rawBuf = Buffer.alloc( 0 );
		let upgraded = false;
		const frames = [];
		const closePromise = new Promise( ( resClose ) => sock.once( 'close', () => resClose( true ) ) );

		const parseServerFrames = () => {

			while ( rawBuf.length >= 2 ) {

				const b0 = rawBuf[ 0 ];
				const b1 = rawBuf[ 1 ];
				const opcode = b0 & 0x0f;
				let len = b1 & 0x7f;
				let off = 2;
				if ( len === 126 ) {

					if ( rawBuf.length < 4 ) return;
					len = rawBuf.readUInt16BE( 2 );
					off = 4;

				}

				if ( rawBuf.length < off + len ) return;
				const pay = rawBuf.subarray( off, off + len );
				rawBuf = rawBuf.subarray( off + len );
				if ( opcode === 0x1 ) frames.push( pay.toString( 'utf8' ) );

			}

		};

		sock.on( 'data', ( chunk ) => {

			rawBuf = Buffer.concat( [ rawBuf, chunk ] );
			if ( ! upgraded ) {

				const idx = rawBuf.indexOf( '\r\n\r\n' );
				if ( idx === - 1 ) return;
				upgraded = true;
				rawBuf = rawBuf.subarray( idx + 4 );
				parseServerFrames();
				resolve( { sock, frames, closePromise } );
				return;

			}

			parseServerFrames();

		} );

		sock.once( 'error', reject );
		sock.once( 'connect', () => {

			const key = crypto.randomBytes( 16 ).toString( 'base64' );
			sock.write(
				`GET / HTTP/1.1\r\nHost: 127.0.0.1:${ port }\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
				`Sec-WebSocket-Key: ${ key }\r\nSec-WebSocket-Version: 13\r\n\r\n`
			);

		} );

	} );

}

console.log( 'Systematic Bug Hunter audit suite' );

await test( 'BUG-01a: lanServer closes sockets exceeding MAX_PAYLOAD_BYTES via fragmented continuation frames', async () => {

	const srv = createLanServer( { port: 0, host: '127.0.0.1' } );
	const { port } = await srv.start();
	const client = await connectRawWs( port );
	try {

		const chunk = Buffer.alloc( 40 * 1024, 0x61 );
		client.sock.write( encodeClientFrame( { fin: false, opcode: 0x1, payload: chunk } ) );
		for ( let i = 0; i < 9; i ++ ) {

			client.sock.write( encodeClientFrame( { fin: false, opcode: 0x0, payload: chunk } ) );

		}

		const closed = await Promise.race( [
			client.closePromise,
			new Promise( ( r ) => setTimeout( () => r( false ), 400 ) ),
		] );
		assert.equal( closed, true, 'Server must destroy sockets sending >256 KiB across fragments' );

	} finally {

		try { client.sock.destroy(); } catch {}
		await srv.stop();

	}

} );

await test( 'BUG-01b & 01c: lanServer routes 36-char peerIds cleanly and never broadcasts missed targeted messages', async () => {

	const srv = createLanServer( { port: 0, host: '127.0.0.1' } );
	const { port } = await srv.start();
	const host = await connectRawWs( port );
	const target = await connectRawWs( port );
	const bystander = await connectRawWs( port );
	const peer36 = 'peer-1234567890123456789012345678901';
	assert.equal( peer36.length, 36 );

	try {

		host.sock.write( encodeClientFrame( { payload: Buffer.from( JSON.stringify( { t: 'hello', from: 'host-1', id: 'host-1' } ) ) } ) );
		target.sock.write( encodeClientFrame( { payload: Buffer.from( JSON.stringify( { t: 'hello', from: peer36, id: peer36 } ) ) } ) );
		bystander.sock.write( encodeClientFrame( { payload: Buffer.from( JSON.stringify( { t: 'hello', from: 'bystander-1', id: 'bystander-1' } ) ) } ) );
		await new Promise( ( r ) => setTimeout( r, 100 ) );
		target.frames.length = 0;
		bystander.frames.length = 0;

		const secretWelcome = JSON.stringify( { t: 'welcome', from: 'host-1', to: peer36, room: 'SECRET' } );
		host.sock.write( encodeClientFrame( { payload: Buffer.from( secretWelcome ) } ) );
		await new Promise( ( r ) => setTimeout( r, 100 ) );

		assert.equal( target.frames.length, 1, '36-char target peer should receive targeted welcome' );
		assert.equal( bystander.frames.length, 0, 'Bystander must not receive 36-char targeted welcome' );

		const missedWelcome = JSON.stringify( { t: 'welcome', from: 'host-1', to: 'offline-peer-xyz', room: 'PRIVATE' } );
		host.sock.write( encodeClientFrame( { payload: Buffer.from( missedWelcome ) } ) );
		await new Promise( ( r ) => setTimeout( r, 100 ) );

		assert.equal( bystander.frames.length, 0, 'Missing target must drop private message instead of broadcasting' );

	} finally {

		for ( const c of [ host, target, bystander ] ) try { c.sock.destroy(); } catch {}
		await srv.stop();

	}

} );

await test( 'BUG-02: GameState & Gear resist prototype keys, NaN poisoning, negative values, and corrupt upgrades', async () => {

	const state = new GameState();
	const ok = state.fromJSON( {
		v: 1,
		money: - 500,
		fuel: - 12,
		lure: 'toString',
		nextId: 'NaN',
		inventory: [
			{ species: 'toString', kg: 1 },
			{ species: 'grunt', kg: - 2 },
			{ species: 'grunt', kg: 0.8 },
			{ species: 'tuna', kg: 4.5, id: 1, value: NaN },
		],
		log: {
			toString: { count: 99, bestKg: 50 },
			grunt: { count: 'bad', bestKg: 'oops' },
			tuna: { count: 2, bestKg: 5 },
		},
		upgrades: {
			line: - 5,
			reel: 999,
			constructor: 2,
		},
		landmarks: {
			toString: { visited: true },
			constructor: { visited: true },
			pier_sunset: { visited: true, photo: true },
		},
	} );
	assert.equal( ok, true );
	assert.equal( state.money, 0 );
	assert.equal( state.fuel, null );
	assert.equal( state.lure, 'standard' );
	assert.equal( Number.isInteger( state._nextId ) && state._nextId >= 2, true );
	assert.equal( state.upgrades.line, 0 );
	assert.equal( state.upgrades.reel, 2 );
	assert.equal( Object.prototype.hasOwnProperty.call( state.log, 'toString' ), false );
	assert.equal( Object.prototype.hasOwnProperty.call( state.log, 'grunt' ), false );
	assert.equal( state.log.tuna?.bestKg, 5 );
	assert.equal( Object.prototype.hasOwnProperty.call( state.landmarks, 'constructor' ), false );
	assert.equal( state.inventory.length, 2 );
	assert.equal( state.inventory.every( ( f ) => Number.isInteger( f.id ) && f.id >= 1 && Number.isFinite( f.value ) && f.value > 0 ), true );
	assert.equal( new Set( state.inventory.map( ( f ) => f.id ) ).size, 2 );

	state.sell();
	assert.equal( Number.isFinite( state.money ) && state.money > 0, true );
	assert.equal( state.setLure( 'toString' ), false );
	assert.equal( state.lure, 'standard' );
	assert.equal( state.spend( NaN ), false );
	assert.equal( state.spend( - 50 ), false );
	assert.equal( Number.isFinite( state.money ), true );
	state.burn( NaN );
	assert.equal( Number.isFinite( state.fuelL ), true );
	assert.equal( nextLevel( { line: - 5 }, 'line' ).index, 1 );
	assert.equal( nextLevel( {}, 'toString' ), null );
	assert.ok( gearStats( { line: - 99 } ).lineKg > 0 );

} );

await test( 'BUG-03a & 03b & 03c: MultiplayerManager blocks guest authority spoofing and syncs active tournament in welcome', async () => {

	const host = new MultiplayerManager( {} );
	host.status = 'connected';
	host.role = 'host';
	host.roomCode = 'TW-1234';
	host._hostId = host.selfId;

	host._handleIncomingMessage( sanitizeMessage( {
		t: 'tourney_start', from: 'evil-guest', id: 'spoofed', mode: 'totalKg', durationSec: 120,
	} ) );
	assert.equal( host.tournament, null, 'Host must reject tourney_start received from network' );

	const guest = new MultiplayerManager( {} );
	guest.status = 'connected';
	guest.role = 'guest';
	guest._hostId = 'real-host';
	guest._handleIncomingMessage( sanitizeMessage( {
		t: 'tourney_start', from: 'not-the-host', id: 'spoofed', mode: 'totalKg', durationSec: 120,
	} ) );
	assert.equal( guest.tournament, null, 'Guest must reject tourney_start from non-host peer' );

	guest._handleIncomingMessage( sanitizeMessage( {
		t: 'tourney_start', from: 'real-host', id: 't_real', mode: 'totalKg', durationSec: 180,
	} ) );
	assert.equal( guest.tournament?.id, 't_real' );

	guest._handleIncomingMessage( sanitizeMessage( {
		t: 'tourney_score', from: 'p2', tourneyId: 'wrong_id', name: 'P2', color: '#5ce0d2', species: 'tuna', kg: 99,
	} ) );
	assert.equal( guest.tournament.scores.has( 'p2' ), false, 'Must ignore tourney_score with wrong tourneyId' );

	guest._handleIncomingMessage( sanitizeMessage( {
		t: 'tourney_end', from: 'not-the-host', tourneyId: 't_real', winnerName: 'Evil',
	} ) );
	assert.equal( guest.tournament.active, true, 'Guest must reject tourney_end from non-host peer' );

	// P2P host relay spoofing + late-joiner tournament sync
	host.startTournament( 'biggestKg', 300 );
	const sentToGuest = [];
	const relayed = [];
	const handlers = {};
	const fakeConn1 = {
		peer: 'peerjs-conn-1',
		open: true,
		on( ev, cb ) { handlers[ ev ] = cb; },
		send( d ) { sentToGuest.push( d ); },
	};
	const fakeConn2 = {
		peer: 'peerjs-conn-2',
		open: true,
		on() {},
		send( d ) { relayed.push( d ); },
	};
	host._bindHostDataConn( fakeConn1 );
	host._hostConns.set( 'observer', fakeConn2 );

	handlers.data( { t: 'hello', from: 'real-guest-1', id: 'real-guest-1', name: 'Bob', color: '#ff7b5c' } );
	const welcomeMsg = sentToGuest.find( ( m ) => m.t === 'welcome' );
	assert.ok( welcomeMsg?.tournament?.active, 'Welcome packet must include active tournament snapshot' );

	const lateJoiner = new MultiplayerManager( {} );
	lateJoiner.status = 'connected';
	lateJoiner.role = 'guest';
	lateJoiner._handleIncomingMessage( sanitizeMessage( welcomeMsg ) );
	assert.equal( lateJoiner.tournament?.active, true );
	assert.equal( lateJoiner.tournament?.mode, 'biggestKg' );

	// Guest sends chat pretending from === host.selfId and tries forging tourney_end
	relayed.length = 0;
	handlers.data( { t: 'tourney_end', from: host.selfId, tourneyId: host.tournament.id, winnerName: 'Bob' } );
	assert.equal( host.tournament.active, true, 'Host must not allow guest conn to end tournament' );
	assert.equal( relayed.some( ( m ) => m.t === 'tourney_end' ), false, 'Host must not relay forged host-only messages' );

	handlers.data( { t: 'chat', from: host.selfId, name: 'Bob', color: '#ff7b5c', text: 'hello' } );
	const chatRelayed = relayed.find( ( m ) => m.t === 'chat' );
	assert.equal( chatRelayed?.from, 'real-guest-1', 'Host relay must overwrite msg.from with authenticated remoteId' );

} );

await test( 'BUG-03d: disconnect while connecting cancels pending timer without setting error status', async () => {

	const OrigWS = globalThis.WebSocket;
	const sockets = [];
	class FakeWebSocket {

		constructor() {

			this._listeners = new Map();
			this.readyState = 0;
			sockets.push( this );

		}

		addEventListener( ev, cb ) {

			if ( ! this._listeners.has( ev ) ) this._listeners.set( ev, [] );
			this._listeners.get( ev ).push( cb );

		}

		emit( ev, arg = {} ) {

			for ( const cb of this._listeners.get( ev ) || [] ) cb( arg );

		}

		close() {

			this.readyState = 3;

		}

	}

	globalThis.WebSocket = FakeWebSocket;
	try {

		const mp = new MultiplayerManager( {} );
		const p = mp.joinLAN( '127.0.0.1:59999', 'Tester' );
		await new Promise( ( r ) => setTimeout( r, 10 ) );
		assert.equal( mp.status, 'connecting' );
		await mp.disconnect( true );
		assert.equal( mp.status, 'offline' );

		// Simulate late socket error/close after disconnect
		sockets[ 0 ].emit( 'error' );
		sockets[ 0 ].emit( 'close' );
		const res = await Promise.race( [
			p,
			new Promise( ( r ) => setTimeout( () => r( { ok: 'timeout' } ), 200 ) ),
		] );
		assert.equal( res.ok, false );
		assert.equal( mp.status, 'offline', 'Stale connecting socket must not clobber offline status with error' );

	} finally {

		globalThis.WebSocket = OrigWS;

	}

} );

await test( 'BUG-04: i18n lookups and BoatModel.setPaint reject prototype property names', async () => {

	setLang( 'zh' );
	try {

		for ( const val of [
			trFish( 'toString', 'FallbackFish' ),
			trWeather( 'constructor', 'Fair' ),
			trSurface( 'valueOf' ),
			trPhase( 'toString' ),
			trCompass( 'constructor' ),
			trUpgradeName( 'toString', 'Line' ),
			trUpgradeLabel( 'toString', 0, '8 lb' ),
		] ) {

			assert.equal( typeof val, 'string', `Expected string translation, got ${ typeof val }` );

		}

		const fakeBoat = { materials: { setHullPaint( top, str ) { this.top = top; this.str = str; } } };
		const picked = BoatModel.prototype.setPaint.call( fakeBoat, 'constructor' );
		assert.equal( picked, 'classic' );

	} finally {

		setLang( 'en' );

	}

} );

await test( 'BUG-05: RemotePlayerAvatar.dispose releases all unique GPU geometries and materials', async () => {

	const avatar = new RemotePlayerAvatar( { id: 'p-leak', name: 'Test', color: '#5ce0d2' } );
	const geos = new Set();
	const mats = new Set();
	avatar.group.traverse( ( obj ) => {

		if ( obj.geometry ) geos.add( obj.geometry );
		if ( obj.material ) mats.add( obj.material );

	} );
	assert.ok( geos.size > 5 && mats.size > 3 );

	let geoDisposed = 0;
	let matDisposed = 0;
	for ( const g of geos ) {

		const orig = g.dispose?.bind( g );
		g.dispose = () => { geoDisposed ++; if ( orig ) orig(); };

	}

	for ( const m of mats ) {

		const orig = m.dispose?.bind( m );
		m.dispose = () => { matDisposed ++; if ( orig ) orig(); };

	}

	const fakeScene = { remove( child ) { child.parent = null; } };
	avatar.group.parent = fakeScene;
	avatar.dispose( fakeScene );

	assert.equal( geoDisposed, geos.size, 'All geometries must be disposed' );
	assert.equal( matDisposed, mats.size, 'All materials must be disposed' );

} );

await test( 'BUG-06a: Player.leaveRemotePeer resolves colliders and avoids NaN when waterMean is null', async () => {

	let resolveCalls = 0;
	const mockPlayer = {
		coop: { peerId: 'host', kind: 'buggy' },
		mp: { getPeerRenderState: () => ( { x: 10, y: 2, z: 5, yaw: 0 } ) },
		waterMean: null,
		position: new Vector3(),
		velocity: new Vector3( 1, 1, 1 ),
		_camY: 2,
		mode: 'coop',
		groundAt: () => 2.0,
		colliders: {
			resolveCapsule( pos ) {

				resolveCalls ++;
				pos.x = 15.0;

			},
		},
	};
	Player.prototype.leaveRemotePeer.call( mockPlayer );
	assert.ok( resolveCalls >= 1, 'leaveRemotePeer must consult colliders.resolveCapsule' );
	assert.equal( mockPlayer.position.x, 15.0 );
	assert.equal( Number.isFinite( mockPlayer.position.y ), true );
	assert.equal( mockPlayer.mode, 'walk' );

} );

await test( 'BUG-06b: Game.update keeps player.busy=true while landing catch card is open', async () => {

	// Verify exact Game.prototype.update behavior with a lightweight stubbed app/game context
	let dismissed = false;
	const player = { mode: 'coop', coop: { kind: 'boat' }, busy: false, prompt: null, position: new Vector3() };
	const stubGame = {
		app: {
			player,
			freeCam: false,
			camera: { position: new Vector3() },
			input: { hit: () => false, mouseDown: false, rightDown: false, enabled: true },
			boatCtl: { driven: false, position: new Vector3(), rpm: 0 },
			settings: { timeOfDay: 12 },
			terrainData: { heightAt: () => - 10 },
		},
		rod: {
			equipped: true,
			state: 'landing',
			t: 0.5,
			lineInWater: false,
			bobber: new Vector3(),
			update() {},
		},
		state: new GameState(),
		fight: null,
		bite: null,
		landing: { species: 'grunt', kg: 0.8, card: { species: 'grunt', kg: 0.8 }, shown: true, cardT: 0 },
		display: { shown: false, hide() {}, show() {} },
		vendors: [],
		rally: null,
		hud: { invOpen: false, standOpen: false, journalOpen: false, catchOpen: true, hideCatch() { dismissed = true; }, update() {} },
		minimap: null,
		guide: null,
		_exploreT: 0,
		_sonarT: 0,
		_lmb: false,
		_rmb: false,
		endLanding() {},
		updateBoat() {},
		updateExploration() {},
		updateVendors() {},
		prompt() { return null; },
	};
	Object.setPrototypeOf( stubGame, Game.prototype );
	stubGame.update( 0.016 );
	assert.equal( player.busy, true, 'player.busy must remain true while landing/catch card is active' );
	assert.equal( dismissed, false );

} );

await test( 'BUG-07: RallyCourse handles 0s time as gold and clamps NaN/negative/huge dt', async () => {

	assert.equal( evaluateRallyMedal( 0 ).tier, 'gold' );
	assert.equal( evaluateRallyMedal( - 5 ).tier, 'finish' );
	assert.equal( evaluateRallyMedal( NaN ).tier, 'finish' );

	const course = new RallyCourse();
	course.start( 'buggy' );
	const mockPlayer = { mode: 'vehicle' };
	const mockVeh = { id: 'buggy', position: new Vector3( 0, 0, 0 ), speed: 10 };
	course.update( NaN, mockPlayer, mockVeh );
	assert.equal( Number.isFinite( course.elapsed ), true );
	course.update( 10, mockPlayer, mockVeh );
	assert.ok( course.elapsed <= 0.25, `Expected clamped dt <= 0.25, got ${ course.elapsed }` );

} );

console.log( `Summary: ${ passed } passed, ${ failed } failed` );
if ( failed > 0 ) process.exit( 1 );
