'use strict';

const http = require( 'node:http' );
const crypto = require( 'node:crypto' );
const os = require( 'node:os' );

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PAYLOAD_BYTES = 256 * 1024;

function encodeFrame( opcode, payload = Buffer.alloc( 0 ) ) {

	const data = Buffer.isBuffer( payload ) ? payload : Buffer.from( String( payload ), 'utf8' );
	const len = data.length;
	let header;
	if ( len < 126 ) {

		header = Buffer.allocUnsafe( 2 );
		header[ 0 ] = 0x80 | ( opcode & 0x0f );
		header[ 1 ] = len;

	} else if ( len < 65536 ) {

		header = Buffer.allocUnsafe( 4 );
		header[ 0 ] = 0x80 | ( opcode & 0x0f );
		header[ 1 ] = 126;
		header.writeUInt16BE( len, 2 );

	} else {

		header = Buffer.allocUnsafe( 10 );
		header[ 0 ] = 0x80 | ( opcode & 0x0f );
		header[ 1 ] = 127;
		header.writeBigUInt64BE( BigInt( len ), 2 );

	}

	return Buffer.concat( [ header, data ] );

}

function getLocalIPv4List() {

	const ifaces = os.networkInterfaces();
	const list = [];
	for ( const name of Object.keys( ifaces ) ) {

		for ( const info of ifaces[ name ] || [] ) {

			if ( info && info.family === 'IPv4' && ! info.internal && info.address ) {

				list.push( info.address );

			}

		}

	}

	// Sort LAN addresses cleanly (prefer 192.168 / 10 / 100.x Tailscale / 172.16 before misc adapters).
	list.sort( ( a, b ) => {

		const score = ( ip ) => ip.startsWith( '192.168.' ) ? 0 : ip.startsWith( '10.' ) ? 1 : ip.startsWith( '100.' ) ? 2 : 3;
		return score( a ) - score( b );

	} );
	return list;

}

function createLanServer( { port = 5195, host = '0.0.0.0' } = {} ) {

	let server = null;
	let activePort = port;
	const clients = new Set();

	function sendToSocket( sock, opcode, payload ) {

		if ( sock && ! sock.destroyed && sock.writable ) {

			try {

				sock.write( encodeFrame( opcode, payload ) );

			} catch {

				// Socket closed mid-write; cleanup handler removes it.

			}

		}

	}

	function broadcast( payloadText, excludeClient = null ) {

		const frame = encodeFrame( 0x1, Buffer.from( payloadText, 'utf8' ) );
		for ( const c of clients ) {

			if ( c === excludeClient || c.socket.destroyed || ! c.socket.writable ) continue;
			try {

				c.socket.write( frame );

			} catch {

				// Ignore broken pipe; error/close fires cleanup.

			}

		}

	}

	function attachSocket( socket ) {

		const client = {
			socket,
			buf: Buffer.alloc( 0 ),
			fragChunks: [],
			fragOpcode: 0,
			peerId: null,
		};
		clients.add( client );

		const cleanup = () => {

			if ( ! clients.has( client ) ) return;
			clients.delete( client );
			if ( client.peerId ) {

				broadcast( JSON.stringify( { t: 'peer_leave', id: client.peerId } ), client );

			}

		};

		socket.on( 'data', ( chunk ) => {

			client.buf = Buffer.concat( [ client.buf, chunk ] );
			while ( client.buf.length >= 2 ) {

				const b0 = client.buf[ 0 ];
				const b1 = client.buf[ 1 ];
				const fin = ( b0 & 0x80 ) !== 0;
				const opcode = b0 & 0x0f;
				const masked = ( b1 & 0x80 ) !== 0;
				let len = b1 & 0x7f;
				let offset = 2;

				if ( len === 126 ) {

					if ( client.buf.length < offset + 2 ) break;
					len = client.buf.readUInt16BE( offset );
					offset += 2;

				} else if ( len === 127 ) {

					if ( client.buf.length < offset + 8 ) break;
					const bigLen = client.buf.readBigUInt64BE( offset );
					if ( bigLen > BigInt( MAX_PAYLOAD_BYTES ) ) {

						socket.destroy();
						return;

					}

					len = Number( bigLen );
					offset += 8;

				}

				if ( len > MAX_PAYLOAD_BYTES ) {

					socket.destroy();
					return;

				}

				const maskLen = masked ? 4 : 0;
				if ( client.buf.length < offset + maskLen + len ) break;

				let payload;
				if ( masked ) {

					const maskKey = client.buf.subarray( offset, offset + 4 );
					offset += 4;
					payload = Buffer.allocUnsafe( len );
					for ( let i = 0; i < len; i ++ ) {

						payload[ i ] = client.buf[ offset + i ] ^ maskKey[ i & 3 ];

					}

				} else {

					payload = Buffer.from( client.buf.subarray( offset, offset + len ) );

				}

				client.buf = client.buf.subarray( offset + len );

				if ( opcode === 0x8 ) {

					sendToSocket( socket, 0x8 );
					socket.end();
					return;

				}

				if ( opcode === 0x9 ) {

					sendToSocket( socket, 0xA, payload );
					continue;

				}

				if ( opcode === 0xA ) continue;

				if ( opcode === 0x1 || opcode === 0x2 ) {

					if ( fin ) {

						handleTextMessage( client, payload.toString( 'utf8' ) );

					} else {

						client.fragOpcode = opcode;
						client.fragChunks = [ payload ];

					}

				} else if ( opcode === 0x0 && client.fragChunks.length > 0 ) {

					client.fragChunks.push( payload );
					if ( fin ) {

						const full = Buffer.concat( client.fragChunks );
						const origOp = client.fragOpcode;
						client.fragChunks = [];
						client.fragOpcode = 0;
						if ( origOp === 0x1 ) handleTextMessage( client, full.toString( 'utf8' ) );

					}

				}

			}

		} );

		socket.on( 'close', cleanup );
		socket.on( 'error', cleanup );

	}

	function handleTextMessage( client, text ) {

		try {

			const parsed = JSON.parse( text );
			if ( parsed && parsed.from && ! client.peerId ) {

				client.peerId = String( parsed.from ).slice( 0, 32 );

			}

			if ( parsed && parsed.to ) {

				const target = String( parsed.to );
				for ( const c of clients ) {

					if ( c !== client && c.peerId === target ) {

						sendToSocket( c.socket, 0x1, text );
						return;

					}

				}

			}

		} catch {

			// Forward plain text payloads transparently if non-JSON.

		}

		broadcast( text, client );

	}

	function tryListen( candidatePort ) {

		return new Promise( ( resolve, reject ) => {

			const srv = http.createServer( ( _req, res ) => {

				res.writeHead( 200, { 'Content-Type': 'application/json; charset=utf-8' } );
				res.end( JSON.stringify( { app: 'tidewater-lan', ok: true, clients: clients.size } ) );

			} );

			srv.on( 'upgrade', ( req, socket ) => {

				const upgrade = String( req.headers.upgrade || '' ).toLowerCase();
				const key = req.headers[ 'sec-websocket-key' ];
				if ( upgrade !== 'websocket' || ! key ) {

					socket.write( 'HTTP/1.1 400 Bad Request\r\n\r\n' );
					socket.destroy();
					return;

				}

				const accept = crypto.createHash( 'sha1' ).update( key + WS_GUID ).digest( 'base64' );
				socket.write(
					'HTTP/1.1 101 Switching Protocols\r\n' +
					'Upgrade: websocket\r\n' +
					'Connection: Upgrade\r\n' +
					`Sec-WebSocket-Accept: ${ accept }\r\n` +
					'\r\n'
				);
				socket.setNoDelay( true );
				attachSocket( socket );

			} );

			srv.once( 'error', ( err ) => {

				srv.close();
				reject( err );

			} );

			srv.listen( candidatePort, host, () => {

				server = srv;
				const addr = srv.address();
				activePort = typeof addr === 'object' && addr ? addr.port : candidatePort;
				resolve( { port: activePort, addresses: getAddresses() } );

			} );

		} );

	}

	function getAddresses() {

		const ips = getLocalIPv4List();
		if ( ips.length === 0 ) return [ `127.0.0.1:${ activePort }` ];
		return ips.map( ( ip ) => `${ ip }:${ activePort }` );

	}

	async function start() {

		if ( server ) return { port: activePort, addresses: getAddresses() };
		let lastErr = null;
		const attempts = port === 0 ? [ 0 ] : Array.from( { length: 11 }, ( _, i ) => port + i );
		for ( const p of attempts ) {

			try {

				return await tryListen( p );

			} catch ( err ) {

				lastErr = err;
				if ( err && err.code === 'EADDRINUSE' && port !== 0 ) continue;
				throw err;

			}

		}

		throw lastErr || new Error( 'Failed to bind LAN WebSocket server' );

	}

	async function stop() {

		for ( const c of [ ...clients ] ) {

			try {

				c.socket.destroy();

			} catch {

				// Ignore already closed socket.

			}

		}

		clients.clear();
		if ( ! server ) return;
		const srv = server;
		server = null;
		await new Promise( ( resolve ) => {

			srv.close( () => resolve() );

		} );

	}

	return {
		start,
		stop,
		getPort: () => activePort,
		getAddresses,
		clientCount: () => clients.size,
	};

}

module.exports = { createLanServer, encodeFrame };
