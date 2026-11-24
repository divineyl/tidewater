import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
	PLAYER_COLORS,
	generateRoomCode,
	normalizeRoomCode,
	roomCodeToPeerId,
	sanitizeName,
	lerpAngle,
	interpolatePeer,
	sanitizeMessage,
} from '../src/net/NetProtocol.js';
import { DEFAULT_PREFS, normalizePrefs } from '../src/core/Prefs.js';
import { getLang, setLang, tr } from '../src/i18n/i18n.js';

const require = createRequire( import.meta.url );
const { createLanServer } = require( '../desktop/lanServer.cjs' );

let passed = 0;
async function testAsync( name, fn ) {

	await fn();
	passed ++;
	console.log( `  ✓ ${ name }` );

}

function connectWs( port ) {

	return new Promise( ( resolve, reject ) => {

		const ws = new WebSocket( `ws://127.0.0.1:${ port }` );
		const queue = [];
		const waiters = [];

		ws.addEventListener( 'message', ( ev ) => {

			const txt = String( ev.data );
			if ( waiters.length ) waiters.shift()( txt );
			else queue.push( txt );

		} );

		ws.addEventListener( 'open', () => {

			resolve( {
				ws,
				sendJson: ( obj ) => ws.send( JSON.stringify( obj ) ),
				nextJson: () => new Promise( ( res, rej ) => {

					if ( queue.length ) return res( JSON.parse( queue.shift() ) );
					const t = setTimeout( () => rej( new Error( 'Timed out waiting for WS frame' ) ), 2500 );
					waiters.push( ( txt ) => { clearTimeout( t ); res( JSON.parse( txt ) ); } );

				} ),
			} );

		} );

		ws.addEventListener( 'error', ( err ) => reject( err ) );

	} );

}

console.log( 'Milestone 5 multiplayer tests' );

await testAsync( 'NetProtocol generates/normalizes room codes and sanitizes payloads & angles', async () => {

	for ( let i = 0; i < 10; i ++ ) {

		const code = generateRoomCode();
		assert.match( code, /^TW-[A-Z0-9]{4}$/ );
		assert.equal( normalizeRoomCode( code.toLowerCase() ), code );

	}

	assert.equal( normalizeRoomCode( ' ab12 ' ), 'TW-AB12' );
	assert.equal( normalizeRoomCode( 'tw-4829' ), 'TW-4829' );
	assert.equal( normalizeRoomCode( 'bad-too-long' ), null );
	assert.equal( roomCodeToPeerId( 'TW-4829' ), 'tidewater-v1-4829' );

	assert.equal( sanitizeName( '  \x00Xiao\tMing\n ' ), 'Xiao Ming' );
	assert.equal( sanitizeName( '' ), 'Angler' );

	// Shortest-arc angle wrap
	const mid = lerpAngle( 0.1, Math.PI * 2 - 0.1, 0.5 );
	assert.ok( Math.abs( mid ) < 1e-6 || Math.abs( mid - Math.PI * 2 ) < 1e-6 );

	const next = interpolatePeer( { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0 }, { x: 10, y: 2, z: - 10, yaw: 1, pitch: 0.2, speed: 5, mode: 'walk', paint: 'teal' }, 0.1 );
	assert.ok( next.x > 5 && next.z < - 5 && next.mode === 'walk' && next.paint === 'teal' );

	// Sanitize valid & drop malicious messages
	const st = sanitizeMessage( { t: 'state', from: 'p1', x: 99999, y: 3, z: - 10, yaw: 1.2, mode: 'vehicle', vehId: 'buggy', paint: 'coral', lightOn: true } );
	assert.equal( st.x, 2000 );
	assert.equal( st.vehId, 'buggy' );
	assert.equal( sanitizeMessage( { t: 'unknown_type' } ), null );
	assert.equal( sanitizeMessage( { t: 'chat', text: '   ' } ), null );
	assert.ok( PLAYER_COLORS.length >= 6 );

} );

await testAsync( 'LAN WebSocket server completes handshake, relays targeted/broadcast messages, and emits peer_leave', async () => {

	const srv = createLanServer( { host: '127.0.0.1', port: 0 } );
	const info = await srv.start();
	assert.ok( info.port > 0 );
	assert.ok( info.addresses.length >= 1 );

	const c1 = await connectWs( info.port );
	const c2 = await connectWs( info.port );
	assert.equal( srv.clientCount(), 2 );

	// c1 announces hello; c2 receives broadcast
	c1.sendJson( { t: 'hello', from: 'host_1', id: 'host_1', name: 'Host', color: '#5ce0d2' } );
	const m1 = await c2.nextJson();
	assert.equal( m1.from, 'host_1' );

	// c2 announces hello; c1 receives it and sends targeted welcome
	c2.sendJson( { t: 'hello', from: 'guest_2', id: 'guest_2', name: 'Friend', color: '#ff7b5c' } );
	const m2 = await c1.nextJson();
	assert.equal( m2.from, 'guest_2' );

	c1.sendJson( { t: 'welcome', from: 'host_1', to: 'guest_2', room: '127.0.0.1', hostId: 'host_1', peers: [] } );
	const w = await c2.nextJson();
	assert.equal( w.t, 'welcome' );

	// Socket close emits peer_leave to remaining client
	c2.ws.close();
	const leave = await c1.nextJson();
	assert.equal( leave.t, 'peer_leave' );
	assert.equal( leave.id, 'guest_2' );

	c1.ws.close();
	await srv.stop();

} );

await testAsync( 'Prefs & i18n support Multiplayer nickname and Chinese UI labels', async () => {

	assert.equal( DEFAULT_PREFS.mpName, '' );
	assert.equal( normalizePrefs( { mpName: '  阿明\n  ' } ).mpName, '阿明' );

	const prev = getLang();
	try {

		setLang( 'zh' );
		for ( const key of [
			'Multiplayer', 'Your nickname', 'Connection mode', 'P2P Room Code',
			'LAN / Virtual LAN', 'Create P2P Room', 'Start LAN Host',
			'Share waypoint', 'Disconnect', 'Send',
		] ) {

			assert.notEqual( tr( key ), key, `Expected Chinese translation for "${ key }"` );

		}

	} finally {

		setLang( prev );

	}

} );

console.log( `\nAll ${ passed } Milestone 5 tests passed.` );
