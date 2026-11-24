import { Peer } from 'peerjs';
import { Vector3 } from '../engine/index.js';
import { G } from '../engine/render/Frame.js';
import { FISH } from '../game/FishTable.js';
import { getTitleLabel } from '../game/Achievements.js';
import { getLang, tr, trFish } from '../i18n/i18n.js';
import {
	generateRoomCode,
	normalizeRoomCode,
	roomCodeToPeerId,
	sanitizeName,
	pickPlayerColor,
	sanitizeMessage,
	interpolatePeer,
	QUICK_PHRASES,
} from './NetProtocol.js';
import { RemotePlayerAvatar } from './RemotePlayerAvatar.js';

const PEER_ICE_CONFIG = {
	iceServers: [
		{ urls: 'stun:stun.l.google.com:19302' },
		{ urls: 'stun:global.stun.twilio.com:3478' },
	],
};

const HOST_ONLY_TYPES = new Set( [ 'welcome', 'world', 'peer_join', 'peer_leave', 'tourney_start', 'tourney_end', 'rally_start' ] );

const _proj = new Vector3();
const _camFwd = new Vector3();
const _toPeer = new Vector3();

function genClientId() {

	return 'p_' + Math.random().toString( 36 ).slice( 2, 10 ) + Date.now().toString( 36 ).slice( - 4 );

}

function parseLanUrl( raw ) {

	let s = String( raw || '' ).trim();
	if ( ! s ) return null;
	if ( ! /^wss?:\/\//i.test( s ) ) s = 'ws://' + s;
	try {

		const u = new URL( s );
		if ( ! u.hostname ) return null;
		if ( ! u.port ) u.port = '5195';
		return { url: u.toString(), display: `${ u.hostname }:${ u.port }` };

	} catch {

		return null;

	}

}

export class MultiplayerManager {

	constructor( app ) {

		this.app = app;
		this.selfId = genClientId();
		this.selfColor = pickPlayerColor( this.selfId );
		const savedName = app?.prefs?.data?.mpName;
		this.nickname = sanitizeName( savedName || `Angler-${ this.selfId.slice( 2, 5 ).toUpperCase() }` );

		this.status = 'offline'; // 'offline' | 'connecting' | 'connected' | 'error'
		this.role = 'none'; // 'none' | 'host' | 'guest'
		this.transportMode = 'p2p'; // 'p2p' | 'lan'
		this.roomCode = '';
		this.addresses = [];
		this.errorMessage = '';

		this.peers = new Map();
		this._peerJs = null;
		this._hostConns = new Map();
		this._guestConn = null;
		this._ws = null;
		this._hostId = null;
		this._connGen = 0;
		this._connectTimer = null;

		this._sendTimer = 0;
		this._worldTimer = 0;
		this._pingTimer = 0;
		this._pingSeq = 0;
		this.pingMs = null;
		this._reconnectTimer = null;
		this._reconnectAttempts = 0;
		this._lastJoinTarget = null;
		this._lastYaw = 0;
		this._lastMode = '';
		this._lastWeatherKey = '';

		this.tournament = null;
		this.rallyRace = null;
		this.onStateChange = null;
		this.onChat = null;
		this.onTournamentChange = null;
		this.onRallyRaceChange = null;

	}

	setNickname( name, persist = true ) {

		this.nickname = sanitizeName( name, 'Angler' );
		if ( persist && this.app?.prefs ) {

			this.app.prefs.save( { mpName: this.nickname } );

		}

		return this.nickname;

	}

	isDesktopAvailable() {

		return Boolean( typeof window !== 'undefined' && window.tidewaterDesktop && window.tidewaterDesktop.isDesktop );

	}

	_buildIceConfig() {

		const iceServers = PEER_ICE_CONFIG.iceServers.map( ( s ) => ( { ...s } ) );
		const p = this.app?.prefs?.data;
		if ( p && typeof p.customTurnUrl === 'string' && /^turns?:[^\s]+$/i.test( p.customTurnUrl ) ) {

			const entry = { urls: p.customTurnUrl };
			if ( p.customTurnUser ) entry.username = p.customTurnUser;
			if ( p.customTurnCred ) entry.credential = p.customTurnCred;
			iceServers.push( entry );

		}

		return { iceServers };

	}

	_emitState() {

		if ( typeof this.onStateChange === 'function' ) {

			try {

				this.onStateChange( this.getSummary() );

			} catch { /* ignore UI callback errors */ }

		}

	}

	_emitChat( entry ) {

		if ( typeof this.onChat === 'function' ) {

			try {

				this.onChat( entry );

			} catch { /* ignore */ }

		}

	}

	getSummary() {

		return {
			status: this.status,
			role: this.role,
			transportMode: this.transportMode,
			roomCode: this.roomCode,
			addresses: [ ...this.addresses ],
			errorMessage: this.errorMessage,
			nickname: this.nickname,
			title: this.app?.prefs?.data?.activeTitle || '',
			pingMs: this.pingMs,
			peerCount: this.peers.size,
			peers: this.getPeersList(),
		};

	}

	getPeersList() {

		const out = [];
		for ( const p of this.peers.values() ) {

			const st = p.renderState || p.targetState;
			out.push( {
				id: p.id,
				name: p.name,
				color: p.color,
				title: p.title || '',
				x: st ? st.x : 0,
				y: st ? st.y : 0,
				z: st ? st.z : 0,
				yaw: st ? st.yaw : 0,
				mode: st ? st.mode : 'walk',
			} );

		}

		return out;

	}

	async hostP2P( rawName ) {

		await this.disconnect( true );
		if ( rawName !== undefined ) this.setNickname( rawName );

		this.status = 'connecting';
		this.role = 'host';
		this.transportMode = 'p2p';
		this.errorMessage = '';
		this._hostId = this.selfId;
		this._emitState();

		for ( let attempt = 0; attempt < 3; attempt ++ ) {

			const code = generateRoomCode();
			const peerId = roomCodeToPeerId( code );
			const res = await this._tryOpenPeerHost( code, peerId );
			if ( res.ok ) {

				this._emitChat( { kind: 'system', text: `${ tr( 'Room created' ) }: ${ code }` } );
				return res;

			}

			if ( res.retryable && attempt < 2 ) continue;
			this.status = 'error';
			this.role = 'none';
			this.errorMessage = res.error;
			this._emitState();
			return res;

		}

		return { ok: false, error: 'Failed to allocate room code' };

	}

	_tryOpenPeerHost( code, peerId ) {

		const gen = this._connGen;
		return new Promise( ( resolve ) => {

			let settled = false;
			let peer;
			try {

				peer = new Peer( peerId, { debug: 0, config: this._buildIceConfig() } );

			} catch ( err ) {

				resolve( { ok: false, error: err?.message || String( err ) } );
				return;

			}

			this._peerJs = peer;

			const cancelStale = () => {

				settled = true;
				clearTimeout( timer );
				if ( this._connectTimer === timer ) this._connectTimer = null;
				try { peer.destroy(); } catch { /* ignore */ }
				if ( this._peerJs === peer ) this._peerJs = null;
				resolve( { ok: false, error: 'Cancelled' } );

			};

			const timer = setTimeout( () => {

				if ( settled ) return;
				if ( gen !== this._connGen ) return cancelStale();
				settled = true;
				if ( this._connectTimer === timer ) this._connectTimer = null;
				try { peer.destroy(); } catch { /* ignore */ }
				if ( this._peerJs === peer ) this._peerJs = null;
				resolve( { ok: false, error: tr( 'Signaling server timed out' ) } );

			}, 12000 );
			this._connectTimer = timer;

			peer.once( 'open', () => {

				if ( settled ) return;
				if ( gen !== this._connGen ) return cancelStale();
				settled = true;
				clearTimeout( timer );
				if ( this._connectTimer === timer ) this._connectTimer = null;
				this.status = 'connected';
				this.roomCode = code;
				this.addresses = [];
				this._emitState();
				resolve( { ok: true, roomCode: code } );

			} );

			peer.on( 'connection', ( conn ) => this._bindHostDataConn( conn ) );

			peer.on( 'error', ( err ) => {

				if ( gen !== this._connGen ) {

					if ( ! settled ) cancelStale();
					return;

				}

				const msg = err?.type === 'unavailable-id'
					? 'Room ID collision'
					: ( err?.message || tr( 'P2P connection error' ) );
				if ( ! settled ) {

					settled = true;
					clearTimeout( timer );
					if ( this._connectTimer === timer ) this._connectTimer = null;
					try { peer.destroy(); } catch { /* ignore */ }
					if ( this._peerJs === peer ) this._peerJs = null;
					resolve( { ok: false, retryable: err?.type === 'unavailable-id', error: msg } );

				} else if ( this.status === 'connected' ) {

					this.errorMessage = msg;
					this._emitState();

				}

			} );

		} );

	}

	_bindHostDataConn( conn ) {

		let remoteId = null;

		conn.on( 'data', ( raw ) => {

			const msg = sanitizeMessage( raw );
			if ( ! msg ) return;
			if ( msg.t === 'hello' ) {

				remoteId = msg.id || msg.from || conn.peer;
				if ( ! remoteId || remoteId === this.selfId ) return;
				this._hostConns.set( remoteId, conn );
				this._upsertPeer( remoteId, msg.name, msg.color, true, msg.title );

				const welcome = {
					t: 'welcome',
					from: this.selfId,
					to: remoteId,
					room: this.roomCode,
					hostId: this.selfId,
					peers: this._allMemberDescriptors(),
					world: this._captureWorldSnapshot(),
					tournament: this._captureTournamentSnapshot(),
				};
				try { conn.send( welcome ); } catch { /* ignore */ }

				this._broadcastP2P( {
					t: 'peer_join',
					from: this.selfId,
					id: remoteId,
					name: msg.name,
					color: msg.color,
					title: msg.title || '',
				}, remoteId );
				return;

			}

			if ( ! remoteId ) {

				if ( msg.from && msg.from !== this.selfId ) remoteId = msg.from;
				else return;

			}

			if ( HOST_ONLY_TYPES.has( msg.t ) ) return;
			msg.from = remoteId;
			this._handleIncomingMessage( msg );
			this._broadcastP2P( msg, remoteId );

		} );

		const onDrop = () => {

			if ( ! remoteId ) return;
			if ( this._hostConns.get( remoteId ) === conn ) this._hostConns.delete( remoteId );
			this._removePeer( remoteId );
			this._broadcastP2P( { t: 'peer_leave', from: this.selfId, id: remoteId }, remoteId );

		};

		conn.on( 'close', onDrop );
		conn.on( 'error', onDrop );

	}

	async joinP2P( rawCode, rawName ) {

		const norm = normalizeRoomCode( rawCode );
		if ( ! norm ) {

			const err = tr( 'Invalid room code' );
			this.status = 'error';
			this.errorMessage = err;
			this._emitState();
			return { ok: false, error: err };

		}

		await this.disconnect( true );
		if ( rawName !== undefined ) this.setNickname( rawName );

		this.status = 'connecting';
		this.role = 'guest';
		this.transportMode = 'p2p';
		this.roomCode = norm;
		this.errorMessage = '';
		this._emitState();

		const hostPeerId = roomCodeToPeerId( norm );
		this._lastJoinTarget = { mode: 'p2p', target: norm };
		const gen = this._connGen;

		return new Promise( ( resolve ) => {

			let settled = false;
			let peer;
			try {

				peer = new Peer( { debug: 0, config: this._buildIceConfig() } );

			} catch ( err ) {

				this.status = 'error';
				this.errorMessage = err?.message || String( err );
				this._emitState();
				resolve( { ok: false, error: this.errorMessage } );
				return;

			}

			this._peerJs = peer;

			const cancelStale = () => {

				settled = true;
				clearTimeout( timer );
				if ( this._connectTimer === timer ) this._connectTimer = null;
				try { peer.destroy(); } catch { /* ignore */ }
				if ( this._peerJs === peer ) this._peerJs = null;
				resolve( { ok: false, error: 'Cancelled' } );

			};

			const fail = ( message ) => {

				if ( settled ) return;
				if ( gen !== this._connGen ) return cancelStale();
				settled = true;
				clearTimeout( timer );
				if ( this._connectTimer === timer ) this._connectTimer = null;
				this.status = 'error';
				this.role = 'none';
				this.errorMessage = message;
				try { peer.destroy(); } catch { /* ignore */ }
				if ( this._peerJs === peer ) this._peerJs = null;
				this._emitState();
				resolve( { ok: false, error: message } );

			};

			const timer = setTimeout( () => fail( tr( 'Room connection timed out' ) ), 12000 );
			this._connectTimer = timer;

			peer.once( 'open', () => {

				if ( gen !== this._connGen ) return cancelStale();
				const conn = peer.connect( hostPeerId, { reliable: true, serialization: 'json' } );
				this._guestConn = conn;

				conn.once( 'open', () => {

					if ( gen !== this._connGen ) return cancelStale();
					try {

						conn.send( {
							t: 'hello',
							from: this.selfId,
							id: this.selfId,
							name: this.nickname,
							color: this.selfColor,
							title: this.app?.prefs?.data?.activeTitle || '',
						} );

					} catch ( err ) {

						fail( err?.message || String( err ) );

					}

				} );

				conn.on( 'data', ( raw ) => {

					if ( gen !== this._connGen ) return;
					const msg = sanitizeMessage( raw );
					if ( ! msg ) return;
					if ( msg.t === 'welcome' && ! settled ) {

						settled = true;
						clearTimeout( timer );
						if ( this._connectTimer === timer ) this._connectTimer = null;
						this.status = 'connected';
						this._handleIncomingMessage( msg );
						this._emitState();
						resolve( { ok: true, roomCode: norm } );
						return;

					}

					this._handleIncomingMessage( msg );

				} );

				conn.on( 'close', () => {

					if ( gen !== this._connGen ) {

						if ( ! settled ) cancelStale();
						return;

					}

					if ( ! settled ) {

						fail( tr( 'Host closed connection' ) );

					} else if ( this.status === 'connected' ) {

						this._emitChat( { kind: 'system', text: tr( 'Disconnected from room' ) } );
						const tgt = this._lastJoinTarget;
						this.disconnect( true ).then( () => this._scheduleReconnect( tgt ) );

					}

				} );

				conn.on( 'error', () => fail( tr( 'Failed to connect to room host' ) ) );

			} );

			peer.on( 'error', ( err ) => {

				const msg = err?.type === 'peer-unavailable'
					? tr( 'Room not found or host offline' )
					: ( err?.message || tr( 'P2P connection error' ) );
				fail( msg );

			} );

		} );

	}

	async hostLAN( rawName, port = 5195 ) {

		if ( ! this.isDesktopAvailable() ) {

			const err = tr( 'LAN hosting requires Desktop Edition' );
			this.status = 'error';
			this.errorMessage = err;
			this._emitState();
			return { ok: false, error: err };

		}

		await this.disconnect( true );
		if ( rawName !== undefined ) this.setNickname( rawName );

		this.status = 'connecting';
		this.role = 'host';
		this.transportMode = 'lan';
		this.errorMessage = '';
		this._hostId = this.selfId;
		this._emitState();

		try {

			const res = await window.tidewaterDesktop.startLanHost( port );
			this.addresses = Array.isArray( res?.addresses ) ? res.addresses : [];
			this.roomCode = this.addresses[ 0 ] || `127.0.0.1:${ res.port }`;
			const wsRes = await this._connectLanWebSocket( `ws://127.0.0.1:${ res.port }`, true );
			if ( ! wsRes.ok ) {

				await window.tidewaterDesktop.stopLanHost().catch( () => {} );
				return wsRes;

			}

			this._emitChat( { kind: 'system', text: `${ tr( 'LAN room listening' ) }: ${ this.roomCode }` } );
			return { ok: true, port: res.port, addresses: this.addresses, roomCode: this.roomCode };

		} catch ( err ) {

			this.status = 'error';
			this.role = 'none';
			this.errorMessage = err?.message || String( err );
			this._emitState();
			return { ok: false, error: this.errorMessage };

		}

	}

	async joinLAN( rawAddress, rawName ) {

		const parsed = parseLanUrl( rawAddress );
		if ( ! parsed ) {

			const err = tr( 'Invalid IP or address' );
			this.status = 'error';
			this.errorMessage = err;
			this._emitState();
			return { ok: false, error: err };

		}

		await this.disconnect( true );
		if ( rawName !== undefined ) this.setNickname( rawName );

		this.status = 'connecting';
		this.role = 'guest';
		this.transportMode = 'lan';
		this.roomCode = parsed.display;
		this.addresses = [ parsed.display ];
		this.errorMessage = '';
		this._lastJoinTarget = { mode: 'lan', target: parsed.display };
		this._emitState();

		return this._connectLanWebSocket( parsed.url, false );

	}

	_connectLanWebSocket( wsUrl, asHost ) {

		const gen = this._connGen;
		return new Promise( ( resolve ) => {

			let settled = false;
			let ws;
			try {

				ws = new WebSocket( wsUrl );

			} catch ( err ) {

				const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
				const msg = isHttps
					? tr( 'HTTPS browser blocks ws:// LAN connections; use Desktop Edition or P2P room code' )
					: ( err?.message || String( err ) );
				this.status = 'error';
				this.role = 'none';
				this.errorMessage = msg;
				this._emitState();
				resolve( { ok: false, error: msg } );
				return;

			}

			this._ws = ws;

			const cancelStale = () => {

				settled = true;
				clearTimeout( timer );
				if ( this._connectTimer === timer ) this._connectTimer = null;
				try { ws.close(); } catch { /* ignore */ }
				if ( this._ws === ws ) this._ws = null;
				resolve( { ok: false, error: 'Cancelled' } );

			};

			const fail = ( message ) => {

				if ( settled ) return;
				if ( gen !== this._connGen ) return cancelStale();
				settled = true;
				clearTimeout( timer );
				if ( this._connectTimer === timer ) this._connectTimer = null;
				try { ws.close(); } catch { /* ignore */ }
				if ( this._ws === ws ) this._ws = null;
				this.status = 'error';
				this.role = 'none';
				this.errorMessage = message;
				this._emitState();
				resolve( { ok: false, error: message } );

			};

			const timer = setTimeout( () => fail( tr( 'LAN connection timed out' ) ), 10000 );
			this._connectTimer = timer;

			ws.addEventListener( 'open', () => {

				if ( gen !== this._connGen ) return cancelStale();
				try {

					ws.send( JSON.stringify( {
						t: 'hello',
						from: this.selfId,
						id: this.selfId,
						name: this.nickname,
						color: this.selfColor,
						title: this.app?.prefs?.data?.activeTitle || '',
					} ) );

				} catch ( err ) {

					fail( err?.message || String( err ) );
					return;

				}

				if ( asHost ) {

					settled = true;
					clearTimeout( timer );
					if ( this._connectTimer === timer ) this._connectTimer = null;
					this.status = 'connected';
					this._emitState();
					resolve( { ok: true, roomCode: this.roomCode, addresses: this.addresses } );

				}

			} );

			ws.addEventListener( 'message', ( ev ) => {

				if ( gen !== this._connGen ) return;
				const msg = sanitizeMessage( ev.data );
				if ( ! msg ) return;
				if ( asHost && msg.t === 'hello' ) {

					const peerId = msg.id || msg.from;
					if ( ! peerId || peerId === this.selfId ) return;
					this._upsertPeer( peerId, msg.name, msg.color, true, msg.title );
					this._sendRaw( {
						t: 'welcome',
						from: this.selfId,
						to: peerId,
						room: this.roomCode,
						hostId: this.selfId,
						peers: this._allMemberDescriptors(),
						world: this._captureWorldSnapshot(),
						tournament: this._captureTournamentSnapshot(),
					} );
					return;

				}

				if ( ! asHost && msg.t === 'welcome' && ( ! msg.to || msg.to === this.selfId ) && ! settled ) {

					settled = true;
					clearTimeout( timer );
					if ( this._connectTimer === timer ) this._connectTimer = null;
					this.status = 'connected';
					this._handleIncomingMessage( msg );
					this._emitState();
					resolve( { ok: true, roomCode: this.roomCode } );
					return;

				}

				if ( msg.to && msg.to !== this.selfId ) return;
				this._handleIncomingMessage( msg );

			} );

			ws.addEventListener( 'close', () => {

				if ( gen !== this._connGen ) {

					if ( ! settled ) cancelStale();
					return;

				}

				if ( ! settled ) {

					fail( tr( 'Failed to connect to LAN host' ) );

				} else if ( this.status === 'connected' ) {

					this._emitChat( { kind: 'system', text: tr( 'Disconnected from room' ) } );
					const tgt = this._lastJoinTarget;
					this.disconnect( true ).then( () => this._scheduleReconnect( tgt ) );

				}

			} );

			ws.addEventListener( 'error', () => {

				if ( ! settled ) fail( tr( 'Failed to connect to LAN host' ) );

			} );

		} );

	}

	async disconnect( silent = false ) {

		this._connGen ++;
		if ( this._connectTimer ) {

			clearTimeout( this._connectTimer );
			this._connectTimer = null;

		}

		if ( this._reconnectTimer ) {

			clearTimeout( this._reconnectTimer );
			this._reconnectTimer = null;

		}

		if ( ! silent ) {

			this._lastJoinTarget = null;
			this._reconnectAttempts = 0;

		}

		for ( const conn of this._hostConns.values() ) {

			try { conn.close(); } catch { /* ignore */ }

		}

		this._hostConns.clear();
		if ( this._guestConn ) {

			try { this._guestConn.close(); } catch { /* ignore */ }
			this._guestConn = null;

		}

		if ( this._peerJs ) {

			try { this._peerJs.destroy(); } catch { /* ignore */ }
			this._peerJs = null;

		}

		if ( this._ws ) {

			try { this._ws.close(); } catch { /* ignore */ }
			this._ws = null;

		}

		if ( this.role === 'host' && this.transportMode === 'lan' && this.isDesktopAvailable() ) {

			try { await window.tidewaterDesktop.stopLanHost(); } catch { /* ignore */ }

		}

		this._clearPeers();
		this.status = 'offline';
		this.role = 'none';
		this.roomCode = '';
		this.addresses = [];
		this._hostId = null;
		this.pingMs = null;
		this.tournament = null;
		this.rallyRace = null;
		this._emitTournament();
		this._emitRallyRace();
		if ( ! silent ) {

			this.errorMessage = '';
			this._emitChat( { kind: 'system', text: tr( 'Left multiplayer room' ) } );

		}

		this._emitState();

	}

	_emitTournament() {

		if ( typeof this.onTournamentChange === 'function' ) {

			try { this.onTournamentChange( this.getTournamentSummary() ); } catch { /* ignore */ }

		}

	}

	getTournamentSummary() {

		const t = this.tournament;
		if ( ! t ) return null;
		const rows = [ ...t.scores.values() ].map( ( s ) => ( {
			id: s.id,
			name: s.name,
			color: s.color,
			totalKg: s.totalKg,
			biggestKg: s.biggestKg,
			speciesCount: s.speciesSet.size,
			catchCount: s.catchCount,
		} ) );
		rows.sort( ( a, b ) => {

			if ( t.mode === 'biggestKg' ) return b.biggestKg - a.biggestKg || b.totalKg - a.totalKg;
			if ( t.mode === 'speciesCount' ) return b.speciesCount - a.speciesCount || b.totalKg - a.totalKg;
			return b.totalKg - a.totalKg;

		} );
		return {
			id: t.id,
			mode: t.mode,
			durationSec: t.durationSec,
			remainingSec: Math.max( 0, t.remainingSec ),
			active: t.active,
			rows,
		};

	}

	findNearestBoardablePeer( pos ) {

		if ( ! pos || this.status !== 'connected' ) return null;
		let best = null;
		let bestD = Infinity;
		for ( const p of this.peers.values() ) {

			const st = p.renderState || p.targetState;
			if ( ! st ) continue;
			const isBoat = st.mode === 'boat';
			const isBuggy = st.mode === 'vehicle' && st.vehId === 'buggy';
			if ( ! isBoat && ! isBuggy ) continue;
			const maxD = isBoat ? 7.5 : 5.0;
			const d = Math.hypot( st.x - pos.x, st.z - pos.z );
			if ( d <= maxD && Math.abs( st.y - pos.y ) < 4.5 && d < bestD ) {

				bestD = d;
				best = { peerId: p.id, name: p.name, kind: isBoat ? 'boat' : 'buggy', dist: d };

			}

		}

		return best;

	}

	getPeerRenderState( peerId ) {

		const p = this.peers.get( peerId );
		return p ? ( p.renderState || p.targetState ) : null;

	}

	_allMemberDescriptors() {

		const list = [ { id: this.selfId, name: this.nickname, color: this.selfColor, title: this.app?.prefs?.data?.activeTitle || '' } ];
		for ( const p of this.peers.values() ) list.push( { id: p.id, name: p.name, color: p.color, title: p.title || '' } );
		return list;

	}

	_scheduleReconnect( target ) {

		if ( ! target || this._reconnectAttempts >= 2 ) return;
		this._reconnectAttempts ++;
		const gen = this._connGen;
		const zh = getLang() === 'zh';
		this._emitChat( { kind: 'system', text: zh ? `网络波动，正在尝试第 ${ this._reconnectAttempts } 次自动重连…` : `Reconnecting (${ this._reconnectAttempts }/2)…` } );
		this._reconnectTimer = setTimeout( () => {

			if ( gen !== this._connGen || this.status !== 'offline' ) return;
			if ( target.mode === 'p2p' ) this.joinP2P( target.target );
			else if ( target.mode === 'lan' ) this.joinLAN( target.target );

		}, 2500 );

	}

	_sendRaw( msg ) {

		if ( this.status !== 'connected' && msg.t !== 'hello' && msg.t !== 'welcome' ) return;
		if ( this.transportMode === 'lan' ) {

			if ( this._ws && this._ws.readyState === 1 ) {

				try { this._ws.send( JSON.stringify( msg ) ); } catch { /* ignore */ }

			}

			return;

		}

		if ( this.role === 'host' ) {

			this._broadcastP2P( msg );

		} else if ( this._guestConn && this._guestConn.open ) {

			try { this._guestConn.send( msg ); } catch { /* ignore */ }

		}

	}

	_broadcastP2P( msg, excludePeerId = null ) {

		for ( const [ id, conn ] of this._hostConns.entries() ) {

			if ( excludePeerId && id === excludePeerId ) continue;
			if ( conn && conn.open ) {

				try { conn.send( msg ); } catch { /* ignore */ }

			}

		}

	}

	_upsertPeer( id, name, color, announce = false, title = '' ) {

		if ( ! id || id === this.selfId ) return null;
		let peer = this.peers.get( id );
		const syncTitleEl = ( p ) => {

			if ( ! p.nameplateEl ) return;
			const tEl = p.nameplateEl.querySelector( '.tw-np-title' );
			if ( tEl ) {

				const lbl = getTitleLabel( p.title, getLang() );
				tEl.textContent = lbl;
				tEl.hidden = ! lbl;

			}

		};

		if ( peer ) {

			peer.name = name || peer.name;
			peer.color = color || peer.color;
			if ( title !== undefined && title !== '' ) peer.title = title;
			if ( peer.nameplateEl ) {

				const lbl = peer.nameplateEl.querySelector( '.tw-np-name' );
				if ( lbl ) lbl.textContent = peer.name;
				syncTitleEl( peer );

			}

			return peer;

		}

		const avatar = new RemotePlayerAvatar( { id, name, color } );
		if ( this.app?.scene ) this.app.scene.add( avatar.group );

		let el = null;
		if ( typeof document !== 'undefined' ) {

			el = document.createElement( 'div' );
			el.className = 'tw-nameplate';
			el.hidden = true;
			el.innerHTML = `<span class="tw-np-dot"></span><span class="tw-np-title" hidden></span><span class="tw-np-name"></span><span class="tw-np-dist"></span><span class="tw-np-bubble" hidden></span>`;
			el.querySelector( '.tw-np-dot' ).style.background = color;
			el.querySelector( '.tw-np-name' ).textContent = name;
			const layer = this.app?.ui?.ui?.nameplatesEl;
			if ( layer ) layer.append( el );

		}

		const initial = {
			x: 20, y: 2, z: - 20, yaw: 0, pitch: 0, speed: 0, mode: 'walk', vehId: null,
			paint: 'stock', lightOn: false, lightTint: 'warm', rodOut: false,
			boatPaint: 'classic', boatName: '', castPhase: 'idle', bobX: null, bobY: null, bobZ: null,
			catchSpecies: '', ridingPeerId: '', title: title || '',
		};
		peer = {
			id,
			name,
			color,
			title: title || '',
			avatar,
			nameplateEl: el,
			renderState: { ...initial },
			targetState: { ...initial },
			lastSeen: performance.now(),
			emoteUntil: 0,
			emoteBadge: '',
			chatBubbleUntil: 0,
			chatBubble: '',
		};
		syncTitleEl( peer );
		this.peers.set( id, peer );
		this._emitState();

		if ( announce ) {

			const txt = getLang() === 'zh' ? `${ name } 加入了海岛` : `${ name } joined the island`;
			this._emitChat( { kind: 'system', text: txt } );
			this.app?.ui?.ui?.toast?.( txt, 2400 );

		}

		return peer;

	}

	_removePeer( id ) {

		const p = this.peers.get( id );
		if ( ! p ) return;
		p.avatar?.dispose?.( this.app?.scene );
		p.nameplateEl?.remove();
		this.peers.delete( id );
		const txt = getLang() === 'zh' ? `${ p.name } 离开了房间` : `${ p.name } left the room`;
		this._emitChat( { kind: 'system', text: txt } );
		this._emitState();

	}

	_clearPeers() {

		for ( const p of this.peers.values() ) {

			p.avatar?.dispose?.( this.app?.scene );
			p.nameplateEl?.remove();

		}

		this.peers.clear();

	}

	_handleIncomingMessage( msg ) {

		if ( ! msg ) return;
		const senderId = msg.from || msg.id;
		if ( senderId === this.selfId && msg.t !== 'welcome' ) return;
		const fromHost = this.role === 'guest' && ( ! this._hostId || senderId === this._hostId );

		switch ( msg.t ) {

			case 'welcome':
				if ( this.role === 'host' ) break;
				this._reconnectAttempts = 0;
				this._hostId = msg.hostId || senderId;
				for ( const m of msg.peers || [] ) {

					if ( m.id !== this.selfId ) this._upsertPeer( m.id, m.name, m.color, false, m.title );

				}

				if ( msg.world ) this._applyWorldSnapshot( msg.world );
				if ( msg.tournament ) this._applyTournamentSnapshot( msg.tournament );
				this._emitChat( { kind: 'system', text: `${ tr( 'Connected to room' ) }: ${ msg.room || this.roomCode }` } );
				this._emitState();
				break;

			case 'peer_join':
				if ( msg.id && msg.id !== this.selfId ) {

					this._upsertPeer( msg.id, msg.name, msg.color, true, msg.title );

				}

				break;

			case 'peer_leave':
				if ( msg.id ) this._removePeer( msg.id );
				break;

			case 'state': {

				if ( ! senderId ) break;
				let peer = this.peers.get( senderId );
				if ( ! peer ) peer = this._upsertPeer( senderId, `Angler-${ senderId.slice( - 3 ) }`, pickPlayerColor( senderId ), false, msg.title );
				else if ( msg.title !== undefined && msg.title !== peer.title ) {

					peer.title = msg.title;
					const tEl = peer.nameplateEl?.querySelector?.( '.tw-np-title' );
					if ( tEl ) {

						const lbl = getTitleLabel( peer.title, getLang() );
						tEl.textContent = lbl;
						tEl.hidden = ! lbl;

					}

				}

				peer.targetState = { ...msg };
				peer.lastSeen = performance.now();
				if ( Math.hypot( peer.renderState.x - msg.x, peer.renderState.z - msg.z ) > 60 ) {

					peer.renderState = { ...msg };

				}

				break;

			}

			case 'world':
				if ( fromHost ) this._applyWorldSnapshot( msg );
				break;

			case 'chat':
				this._emitChat( { kind: 'chat', name: msg.name, color: msg.color, text: msg.text } );
				this.app?.audio?.uiChime?.( 'chat' );
				break;

			case 'catch': {

				const spName = trFish( msg.species, FISH[ msg.species ]?.name || msg.species );
				const rec = msg.record ? ( getLang() === 'zh' ? ' ★新纪录' : ' ★Record' ) : '';
				const line = getLang() === 'zh'
					? `${ msg.name } 钓上了 ${ spName }（${ msg.kg.toFixed( 2 ) } kg · ${ Math.round( msg.cm ) } cm）${ rec }`
					: `${ msg.name } caught a ${ spName } (${ msg.kg.toFixed( 2 ) } kg · ${ Math.round( msg.cm ) } cm)${ rec }`;
				this._emitChat( { kind: 'catch', color: msg.color, text: line } );
				this.app?.ui?.ui?.toast?.( line, 3200 );
				this.app?.audio?.uiChime?.( 'emote' );
				break;

			}

			case 'ping_wp': {

				this.app?.game?.minimap?.setWaypoint?.( msg.x, msg.z, `${ msg.name }` );
				const line = getLang() === 'zh'
					? `${ msg.name } 分享了集合标点`
					: `${ msg.name } shared a waypoint`;
				this._emitChat( { kind: 'system', text: line } );
				break;

			}

			case 'emote': {

				const peer = senderId ? this.peers.get( senderId ) : null;
				if ( peer ) {

					peer.avatar?.triggerEmote?.( msg.kind );
					const iconMap = { wave: '👋', horn: '📣', boat_horn: '🚢', cheer: '🎉', gather: '📍' };
					peer.emoteBadge = iconMap[ msg.kind ] || '👋';
					peer.emoteUntil = performance.now() + 3000;

				}

				if ( msg.kind === 'boat_horn' ) this.app?.audio?.boatHorn?.();
				else if ( msg.kind === 'horn' ) this.app?.audio?.vehicleHorn?.( 'buggy' );
				else this.app?.audio?.uiChime?.( 'emote' );

				const zh = getLang() === 'zh';
				const labelMap = zh
					? { wave: '挥手打招呼', horn: '按响了车喇叭', boat_horn: '拉响了渔船汽笛', cheer: '欢呼庆祝', gather: '招呼大家集合' }
					: { wave: 'waved hello', horn: 'honked the horn', boat_horn: 'blew the boat horn', cheer: 'cheered', gather: 'called everyone over' };
				this._emitChat( { kind: 'system', text: `${ msg.name } ${ labelMap[ msg.kind ] || labelMap.wave }` } );
				break;

			}

			case 'tourney_start': {

				if ( ! fromHost ) break;
				this._initTournamentLocal( msg.id, msg.mode, msg.durationSec );
				const zh = getLang() === 'zh';
				const mName = tr( `tourney_${ msg.mode }` );
				this._emitChat( { kind: 'system', text: zh ? `限时钓鱼赛开始！模式：${ mName }（${ Math.round( msg.durationSec / 60 ) } 分钟）` : `Fishing tournament started! Mode: ${ mName }` } );
				this.app?.ui?.ui?.toast?.( tr( 'Fishing tournament started!' ), 3200 );
				this.app?.audio?.uiChime?.( 'tourney' );
				break;

			}

			case 'tourney_score': {

				if ( ! this.tournament || ! this.tournament.active ) break;
				if ( ! msg.tourneyId || msg.tourneyId !== this.tournament.id || ! ( msg.kg > 0 ) ) break;
				this._applyTournamentCatch( senderId || msg.from, msg.name, msg.color, msg.species, msg.kg );
				break;

			}

			case 'tourney_end': {

				if ( ! fromHost || ! this.tournament ) break;
				if ( msg.tourneyId && msg.tourneyId !== this.tournament.id ) break;
				this.tournament.active = false;
				this.tournament.remainingSec = 0;
				this._emitTournament();

				const sum = this.getTournamentSummary();
				const top = sum?.rows?.[ 0 ];
				const winName = msg.winnerName || top?.name || '—';
				const zh = getLang() === 'zh';
				const line = zh ? `钓鱼赛结束！冠军：${ winName }` : `Tournament finished! Winner: ${ winName }`;
				this._emitChat( { kind: 'catch', color: top?.color || '#ffd166', text: line } );
				this.app?.ui?.ui?.toast?.( line, 4500 );
				this.app?.audio?.uiChime?.( 'tourney' );
				break;

			}

			case 'ping': {

				if ( this.role === 'host' && senderId ) {

					this._sendRaw( { t: 'pong', from: this.selfId, to: senderId, seq: msg.seq, ts: msg.ts } );

				}

				break;

			}

			case 'pong': {

				if ( this.role === 'guest' && msg.ts > 0 ) {

					this.pingMs = Math.max( 1, Math.round( performance.now() - msg.ts ) );
					this._emitState();

				}

				break;

			}

			case 'quick_chat': {

				const spec = QUICK_PHRASES[ msg.phraseId ];
				if ( ! spec ) break;
				const zh = getLang() === 'zh';
				const text = zh ? spec.fullZh : spec.fullEn;
				this._emitChat( { kind: 'chat', name: msg.name, color: msg.color, text } );
				this.app?.audio?.uiChime?.( 'chat' );
				const peer = senderId ? this.peers.get( senderId ) : null;
				if ( peer ) {

					peer.chatBubble = zh ? spec.shortZh : spec.shortEn;
					peer.chatBubbleUntil = performance.now() + 5000;

				}

				break;

			}

			case 'rally_start': {

				if ( ! fromHost ) break;
				this._initRallyRaceLocal( msg.id, msg.countdownSec );
				break;

			}

			case 'rally_progress': {

				if ( ! this.rallyRace || ! this.rallyRace.active || msg.raceId !== this.rallyRace.id ) break;
				const rid = senderId || msg.from;
				const row = this.rallyRace.racers.get( rid ) || { id: rid, name: msg.name, color: msg.color, gateIndex: 0, elapsedSec: 0, finishSec: null };
				row.gateIndex = Math.max( row.gateIndex, msg.gateIndex );
				row.elapsedSec = msg.elapsedSec;
				this.rallyRace.racers.set( rid, row );
				this._emitRallyRace();
				break;

			}

			case 'rally_finish': {

				if ( ! this.rallyRace || ! this.rallyRace.active || msg.raceId !== this.rallyRace.id ) break;
				const rid = senderId || msg.from;
				const row = this.rallyRace.racers.get( rid ) || { id: rid, name: msg.name, color: msg.color, gateIndex: 10, elapsedSec: msg.elapsedSec, finishSec: null };
				row.gateIndex = 10;
				row.finishSec = msg.elapsedSec;
				this.rallyRace.racers.set( rid, row );
				const zh = getLang() === 'zh';
				const line = zh ? `🏁 ${ row.name } 完成联机越野赛（${ msg.elapsedSec.toFixed( 2 ) } 秒）！` : `🏁 ${ row.name } finished the MP rally in ${ msg.elapsedSec.toFixed( 2 ) }s!`;
				this._emitChat( { kind: 'catch', color: row.color, text: line } );
				this.app?.ui?.ui?.toast?.( line, 3600 );
				this._emitRallyRace();
				break;

			}

		}

	}

	_captureWorldSnapshot() {

		const app = this.app;
		return {
			timeOfDay: app?.settings?.timeOfDay ?? 16.2,
			timeSpeed: app?.settings?.timeSpeed ?? 0,
			weatherAuto: app?.weather ? app.weather.auto : true,
			weatherPreset: app?.weather ? app.weather.targetId : 'fair',
			windSpeed: G.windSpeed ? G.windSpeed.value : 7,
			windDir: app?.fft?.local?.windDirection ?? 20,
		};

	}

	_applyWorldSnapshot( w ) {

		const app = this.app;
		if ( ! app || ! app.settings || ! w ) return;
		if ( Math.abs( ( app.settings.timeOfDay ?? 0 ) - w.timeOfDay ) > 0.08 ) {

			app.settings.timeOfDay = w.timeOfDay;
			app.updateSun?.();

		}

		app.settings.timeSpeed = w.timeSpeed;
		if ( app.weather ) {

			if ( ! w.weatherAuto && w.weatherPreset && app.weather.targetId !== w.weatherPreset ) {

				app.weather.setPreset( w.weatherPreset );

			}

			if ( app.weather.auto !== w.weatherAuto ) app.weather.setAuto( w.weatherAuto );

		}

	}

	_readLocalState() {

		const app = this.app;
		const p = app?.player;
		if ( ! p ) return null;

		let x = p.position.x, y = p.position.y, z = p.position.z;
		let yaw = p.yaw + Math.PI;
		let speed = Math.hypot( p.velocity.x, p.velocity.z );
		let vehId = null;
		let paint = app?.prefs?.data?.vehPaint || 'stock';
		let lightTint = app?.prefs?.data?.vehLightTint || 'warm';
		let lightOn = false;

		if ( p.mode === 'vehicle' && p.activeVehicle ) {

			const vh = p.activeVehicle;
			x = vh.position.x; y = vh.position.y; z = vh.position.z;
			yaw = vh.getYaw ? vh.getYaw() : ( p.yaw - Math.PI );
			speed = Math.abs( vh.speed || 0 );
			vehId = vh.id;
			paint = vh.paintId || paint;
			lightTint = vh.lightTint || lightTint;
			lightOn = !! vh.headlightActive;

		} else if ( p.mode === 'boat' && app.boatCtl ) {

			const b = app.boatCtl;
			x = b.position.x; y = b.position.y; z = b.position.z;
			yaw = b.getYaw ? b.getYaw() : ( p.yaw - Math.PI );
			speed = Math.hypot( b.velocity?.x || 0, b.velocity?.z || 0 );

		}

		const rod = app?.game?.rod;
		const rodSt = rod?.state;
		const rodOut = !! ( rodSt && rodSt !== 'stowed' );
		const castPhase = ( rodSt === 'windup' || rodSt === 'flying' ) ? 'casting'
			: ( rodSt === 'floating' || rodSt === 'fighting' || rodSt === 'landing' ) ? rodSt : 'idle';
		const lineActive = rodOut && ( castPhase === 'casting' || castPhase === 'floating' || castPhase === 'fighting' ) && rod?.bobber;

		return {
			t: 'state',
			from: this.selfId,
			x: Number( x.toFixed( 3 ) ),
			y: Number( y.toFixed( 3 ) ),
			z: Number( z.toFixed( 3 ) ),
			yaw: Number( yaw.toFixed( 3 ) ),
			pitch: Number( ( p.pitch || 0 ).toFixed( 3 ) ),
			speed: Number( speed.toFixed( 2 ) ),
			mode: app.freeCam ? 'free' : p.mode,
			vehId,
			paint,
			lightOn,
			lightTint,
			rodOut,
			boatPaint: app?.boat?.paintId || app?.prefs?.data?.boatPaint || 'classic',
			boatName: app?.prefs?.data?.boatName || '',
			castPhase,
			bobX: lineActive ? Number( rod.bobber.x.toFixed( 2 ) ) : null,
			bobY: lineActive ? Number( rod.bobber.y.toFixed( 2 ) ) : null,
			bobZ: lineActive ? Number( rod.bobber.z.toFixed( 2 ) ) : null,
			catchSpecies: castPhase === 'landing' ? ( app?.game?.landing?.species || '' ) : '',
			ridingPeerId: p.mode === 'coop' && p.coop ? p.coop.peerId : '',
			title: app?.prefs?.data?.activeTitle || '',
		};

	}

	sendChat( rawText ) {

		if ( this.status !== 'connected' ) return false;
		const cleaned = sanitizeMessage( { t: 'chat', from: this.selfId, name: this.nickname, color: this.selfColor, text: rawText } );
		if ( ! cleaned ) return false;
		this._emitChat( { kind: 'chat', name: this.nickname, color: this.selfColor, text: cleaned.text, self: true } );
		this._sendRaw( cleaned );
		return true;

	}

	broadcastCatch( card ) {

		if ( this.status !== 'connected' || ! card ) return;
		const msg = {
			t: 'catch',
			from: this.selfId,
			name: this.nickname,
			color: this.selfColor,
			species: card.species || 'grunt',
			kg: Number( card.kg || 0 ),
			cm: Number( card.cm || 0 ),
			record: !! card.record,
		};
		this._sendRaw( msg );

	}

	shareWaypoint() {

		if ( this.status !== 'connected' ) return false;
		const wp = this.app?.game?.minimap?.waypoint;
		const pos = wp || this.app?.player?.position;
		if ( ! pos ) return false;
		const msg = {
			t: 'ping_wp',
			from: this.selfId,
			name: this.nickname,
			color: this.selfColor,
			x: Math.round( pos.x ),
			z: Math.round( pos.z ),
		};
		this._sendRaw( msg );
		this.app?.ui?.ui?.toast?.( tr( 'Waypoint shared with room' ), 2000 );
		return true;

	}

	sendEmote( kind = 'wave' ) {

		const zh = getLang() === 'zh';
		const labelMap = zh
			? { wave: '你向周围挥手致意', horn: '按响喇叭！', boat_horn: '拉响汽笛！', cheer: '你欢呼了一声！', gather: '你发出了集合信号！' }
			: { wave: 'You waved hello!', horn: 'Honked horn!', boat_horn: 'Blew boat horn!', cheer: 'You cheered!', gather: 'Called everyone over!' };

		if ( kind === 'boat_horn' ) this.app?.audio?.boatHorn?.();
		else if ( kind === 'gather' ) {

			this.app?.audio?.uiChime?.( 'emote' );
			if ( this.status === 'connected' ) this.shareWaypoint();

		} else if ( kind !== 'horn' ) {

			this.app?.audio?.uiChime?.( 'emote' );

		}

		this.app?.ui?.ui?.toast?.( labelMap[ kind ] || labelMap.wave, 1800 );
		if ( this.status !== 'connected' ) return false;

		this._sendRaw( {
			t: 'emote',
			from: this.selfId,
			name: this.nickname,
			color: this.selfColor,
			kind,
		} );
		return true;

	}

	_initTournamentLocal( id, mode = 'totalKg', durationSec = 300 ) {

		const scores = new Map();
		const seedEntry = ( pid, pname, pcolor ) => scores.set( pid, {
			id: pid,
			name: pname,
			color: pcolor,
			totalKg: 0,
			biggestKg: 0,
			speciesSet: new Set(),
			catchCount: 0,
		} );
		seedEntry( this.selfId, this.nickname, this.selfColor );
		for ( const p of this.peers.values() ) seedEntry( p.id, p.name, p.color );

		this.tournament = { id, mode, durationSec, remainingSec: durationSec, active: true, scores };
		this._emitTournament();

	}

	_captureTournamentSnapshot() {

		const t = this.tournament;
		if ( ! t || ! t.active ) return null;
		return {
			id: t.id,
			mode: t.mode,
			durationSec: t.durationSec,
			remainingSec: Math.max( 0, t.remainingSec ),
			active: true,
			rows: [ ...t.scores.values() ].map( ( r ) => ( {
				id: r.id,
				name: r.name,
				color: r.color,
				totalKg: r.totalKg,
				biggestKg: r.biggestKg,
				catchCount: r.catchCount,
				species: [ ...r.speciesSet ],
			} ) ),
		};

	}

	_applyTournamentSnapshot( snap ) {

		if ( ! snap || ! snap.id || ! snap.active || ! ( snap.remainingSec > 0 ) ) return;
		const scores = new Map();
		for ( const r of snap.rows || [] ) {

			if ( ! r.id ) continue;
			scores.set( r.id, {
				id: r.id,
				name: r.name,
				color: r.color,
				totalKg: Number( r.totalKg ) || 0,
				biggestKg: Number( r.biggestKg ) || 0,
				speciesSet: new Set( r.species || [] ),
				catchCount: Number( r.catchCount ) || 0,
			} );

		}

		if ( ! scores.has( this.selfId ) ) {

			scores.set( this.selfId, {
				id: this.selfId,
				name: this.nickname,
				color: this.selfColor,
				totalKg: 0,
				biggestKg: 0,
				speciesSet: new Set(),
				catchCount: 0,
			} );

		}

		this.tournament = {
			id: snap.id,
			mode: snap.mode,
			durationSec: snap.durationSec,
			remainingSec: snap.remainingSec,
			active: true,
			scores,
		};
		this._emitTournament();

	}

	_applyTournamentCatch( pid, pname, pcolor, species, kg ) {

		if ( ! this.tournament || ! this.tournament.active ) return;
		const s = this.tournament.scores;
		let row = s.get( pid );
		if ( ! row ) {

			row = { id: pid, name: pname, color: pcolor, totalKg: 0, biggestKg: 0, speciesSet: new Set(), catchCount: 0 };
			s.set( pid, row );

		}

		row.totalKg += Number( kg ) || 0;
		if ( ( Number( kg ) || 0 ) > row.biggestKg ) row.biggestKg = Number( kg ) || 0;
		if ( species ) row.speciesSet.add( species );
		row.catchCount ++;
		this._emitTournament();

	}

	startTournament( mode = 'totalKg', durationSec = 300 ) {

		if ( this.status !== 'connected' || this.role !== 'host' ) return false;
		const id = `t_${ Date.now().toString( 36 ) }`;
		this._initTournamentLocal( id, mode, durationSec );
		this._sendRaw( { t: 'tourney_start', from: this.selfId, id, mode, durationSec } );
		this.app?.audio?.uiChime?.( 'tourney' );
		const zh = getLang() === 'zh';
		this._emitChat( { kind: 'system', text: zh ? `你发起了 ${ Math.round( durationSec / 60 ) } 分钟联机钓鱼赛！` : 'You started a fishing tournament!' } );
		return true;

	}

	stopTournament() {

		if ( ! this.tournament || ! this.tournament.active || this.role !== 'host' ) return false;
		this.tournament.active = false;
		this.tournament.remainingSec = 0;
		const sum = this.getTournamentSummary();
		const winName = sum?.rows?.[ 0 ]?.name || this.nickname;
		this._emitTournament();
		this._sendRaw( { t: 'tourney_end', from: this.selfId, tourneyId: this.tournament.id, winnerName: winName } );
		this.app?.audio?.uiChime?.( 'tourney' );
		const zh = getLang() === 'zh';
		this._emitChat( { kind: 'catch', color: sum?.rows?.[ 0 ]?.color || '#ffd166', text: zh ? `钓鱼赛结束！冠军：${ winName }` : `Tournament finished! Winner: ${ winName }` } );
		this.app?.ui?.ui?.toast?.( zh ? `钓鱼赛结束！冠军：${ winName }` : `Tournament finished! Winner: ${ winName }`, 4500 );
		return true;

	}

	recordTournamentCatch( card ) {

		if ( ! this.tournament || ! this.tournament.active || ! card ) return;
		this._applyTournamentCatch( this.selfId, this.nickname, this.selfColor, card.species, card.kg );
		if ( this.status === 'connected' ) {

			this._sendRaw( {
				t: 'tourney_score',
				from: this.selfId,
				tourneyId: this.tournament.id,
				name: this.nickname,
				color: this.selfColor,
				species: card.species,
				kg: Number( card.kg || 0 ),
			} );

		}

	}

	sendQuickChat( phraseId = 'biting' ) {

		const spec = QUICK_PHRASES[ phraseId ];
		if ( ! spec || this.status !== 'connected' ) return false;
		const zh = getLang() === 'zh';
		this._emitChat( { kind: 'chat', name: this.nickname, color: this.selfColor, text: zh ? spec.fullZh : spec.fullEn, self: true } );
		this._sendRaw( {
			t: 'quick_chat',
			from: this.selfId,
			name: this.nickname,
			color: this.selfColor,
			phraseId,
		} );
		return true;

	}

	_emitRallyRace() {

		if ( typeof this.onRallyRaceChange === 'function' ) {

			try { this.onRallyRaceChange( this.getRallyRaceSummary() ); } catch { /* ignore */ }

		}

	}

	getRallyRaceSummary() {

		const r = this.rallyRace;
		if ( ! r || ! r.active ) return null;
		const rows = [ ...r.racers.values() ].sort( ( a, b ) => {

			if ( a.finishSec !== null && b.finishSec !== null ) return a.finishSec - b.finishSec;
			if ( a.finishSec !== null ) return - 1;
			if ( b.finishSec !== null ) return 1;
			return b.gateIndex - a.gateIndex || a.elapsedSec - b.elapsedSec;

		} );
		return {
			id: r.id,
			active: r.active,
			countdownSec: Math.max( 0, r.countdownSec ),
			elapsedSec: r.elapsedSec,
			started: r.started,
			rows,
		};

	}

	_initRallyRaceLocal( id, countdownSec = 3 ) {

		const racers = new Map();
		racers.set( this.selfId, { id: this.selfId, name: this.nickname, color: this.selfColor, gateIndex: 0, elapsedSec: 0, finishSec: null } );
		for ( const p of this.peers.values() ) {

			racers.set( p.id, { id: p.id, name: p.name, color: p.color, gateIndex: 0, elapsedSec: 0, finishSec: null } );

		}

		this.rallyRace = { id, active: true, countdownSec, lastBeep: Math.ceil( countdownSec ), elapsedSec: 0, started: false, racers };
		const zh = getLang() === 'zh';
		this._emitChat( { kind: 'system', text: zh ? '🏁 房主发起了东岬联机越野竞速！倒计时准备…' : '🏁 MP Rally race countdown started!' } );
		this.app?.ui?.ui?.toast?.( zh ? '东岬联机越野赛 3 秒后发车！骑上载具或按 U 开赛' : 'MP Rally starting in 3s! Mount a vehicle!', 3000 );
		this._emitRallyRace();

	}

	startMultiplayerRally( countdownSec = 3 ) {

		if ( this.status !== 'connected' || this.role !== 'host' ) return false;
		const id = `r_${ Date.now().toString( 36 ) }`;
		this._initRallyRaceLocal( id, countdownSec );
		this._sendRaw( { t: 'rally_start', from: this.selfId, id, countdownSec } );
		return true;

	}

	reportRallyProgress( gateIndex, elapsedSec ) {

		if ( ! this.rallyRace || ! this.rallyRace.active ) return;
		const row = this.rallyRace.racers.get( this.selfId );
		if ( row ) {

			row.gateIndex = Math.max( row.gateIndex, gateIndex | 0 );
			row.elapsedSec = elapsedSec;

		}

		if ( this.status === 'connected' ) {

			this._sendRaw( {
				t: 'rally_progress',
				from: this.selfId,
				raceId: this.rallyRace.id,
				name: this.nickname,
				color: this.selfColor,
				gateIndex,
				elapsedSec,
			} );

		}

		this._emitRallyRace();

	}

	reportRallyFinish( elapsedSec, vehicleId = 'motorcycle' ) {

		if ( ! this.rallyRace || ! this.rallyRace.active ) return;
		const row = this.rallyRace.racers.get( this.selfId );
		if ( row ) {

			row.gateIndex = 10;
			row.finishSec = elapsedSec;

		}

		if ( this.status === 'connected' ) {

			this._sendRaw( {
				t: 'rally_finish',
				from: this.selfId,
				raceId: this.rallyRace.id,
				name: this.nickname,
				color: this.selfColor,
				elapsedSec,
				vehicleId,
			} );

		}

		this._emitRallyRace();

	}

	update( dt ) {

		if ( this.status !== 'connected' ) return;

		if ( this.role === 'guest' && this._hostId ) {

			this._pingTimer -= dt;
			if ( this._pingTimer <= 0 ) {

				this._pingTimer = 3.5;
				this._sendRaw( {
					t: 'ping',
					from: this.selfId,
					to: this._hostId,
					seq: ++ this._pingSeq,
					ts: Math.round( performance.now() ),
				} );

			}

		}

		if ( this.rallyRace && this.rallyRace.active ) {

			const r = this.rallyRace;
			if ( ! r.started ) {

				r.countdownSec -= dt;
				const ceil = Math.ceil( r.countdownSec );
				if ( ceil > 0 && ceil < r.lastBeep ) {

					r.lastBeep = ceil;
					this.app?.audio?.uiChime?.( 'countdown' );
					this._emitRallyRace();

				}

				if ( r.countdownSec <= 0 ) {

					r.started = true;
					r.countdownSec = 0;
					this.app?.audio?.uiChime?.( 'go' );
					const p = this.app?.player;
					if ( p?.mode === 'vehicle' && p.activeVehicle ) this.app?.game?.rally?.start?.( p.activeVehicle.id );
					const zh = getLang() === 'zh';
					this.app?.ui?.ui?.toast?.( zh ? 'GO! 冲向灯塔终点！' : 'GO! Head for the lighthouse!', 2400 );
					this._emitRallyRace();

				}

			} else {

				r.elapsedSec += dt;
				this._rallyUiT = ( this._rallyUiT || 0 ) + dt;
				if ( this._rallyUiT >= 0.4 ) {

					this._rallyUiT = 0;
					this._emitRallyRace();

				}

				if ( r.elapsedSec >= 180 ) {

					r.active = false;
					this._emitRallyRace();

				}

			}

		}

		const st = this._readLocalState();
		if ( st ) {

			this._sendTimer -= dt;
			const moving = Math.abs( st.speed ) > 0.08 || st.mode !== this._lastMode || Math.abs( st.yaw - this._lastYaw ) > 0.06;
			const interval = moving ? ( 1 / 15 ) : 0.45;
			if ( this._sendTimer <= 0 ) {

				this._sendTimer = interval;
				this._lastYaw = st.yaw;
				this._lastMode = st.mode;
				this._sendRaw( st );

			}

		}

		if ( this.tournament && this.tournament.active ) {

			this.tournament.remainingSec = Math.max( 0, this.tournament.remainingSec - dt );
			this._tourneyUiT = ( this._tourneyUiT || 0 ) + dt;
			if ( this._tourneyUiT >= 0.5 ) {

				this._tourneyUiT = 0;
				this._emitTournament();

			}

			if ( this.tournament.remainingSec <= 0 && this.role === 'host' ) {

				this.stopTournament();

			}

		}

		if ( this.role === 'host' ) {

			this._worldTimer -= dt;
			const wKey = `${ this.app?.weather?.targetId || '' }|${ this.app?.weather?.auto ? 1 : 0 }|${ Math.round( ( this.app?.settings?.timeSpeed || 0 ) * 100 ) }`;
			if ( this._worldTimer <= 0 || wKey !== this._lastWeatherKey ) {

				this._worldTimer = 2.0;
				this._lastWeatherKey = wKey;
				this._sendRaw( { t: 'world', from: this.selfId, ...this._captureWorldSnapshot() } );

			}

		}

		const ui = this.app?.ui?.ui;
		const cam = this.app?.camera;
		const hidePlates = ! ui || ui._photo || ui._start;
		if ( cam ) cam.getWorldDirection( _camFwd );

		const now = performance.now();
		const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
		const h = typeof window !== 'undefined' ? window.innerHeight : 720;

		for ( const [ id, peer ] of this.peers.entries() ) {

			if ( now - peer.lastSeen > 35000 && this.transportMode === 'lan' ) {

				this._removePeer( id );
				continue;

			}

			peer.renderState = interpolatePeer( peer.renderState, peer.targetState, dt );
			peer.avatar?.update?.( dt, peer.renderState );

			const el = peer.nameplateEl;
			if ( ! el || ! cam || hidePlates ) {

				if ( el ) el.hidden = true;
				continue;

			}

			const anchorY = peer.renderState.y + ( peer.avatar ? peer.avatar.nameplateAnchorY( peer.renderState ) : 2.1 );
			_toPeer.set( peer.renderState.x - cam.position.x, anchorY - cam.position.y, peer.renderState.z - cam.position.z );
			const dist = _toPeer.length();
			if ( dist > 450 || _toPeer.dot( _camFwd ) <= 0.1 ) {

				el.hidden = true;
				continue;

			}

			_proj.set( peer.renderState.x, anchorY, peer.renderState.z ).project( cam );
			if ( _proj.z > 1 || _proj.x < - 1.1 || _proj.x > 1.1 || _proj.y < - 1.1 || _proj.y > 1.1 ) {

				el.hidden = true;
				continue;

			}

			const sx = ( _proj.x * 0.5 + 0.5 ) * w;
			const sy = ( - _proj.y * 0.5 + 0.5 ) * h;
			el.hidden = false;
			el.style.transform = `translate3d(${ sx.toFixed( 1 ) }px, ${ sy.toFixed( 1 ) }px, 0) translate(-50%, -100%)`;
			const distEl = el.querySelector( '.tw-np-dist' );
			if ( distEl ) {

				const emoteTxt = ( peer.emoteUntil > now && peer.emoteBadge ) ? ` ${ peer.emoteBadge }` : '';
				distEl.textContent = ( dist >= 12 ? ` · ${ Math.round( dist ) } m` : '' ) + emoteTxt;

			}

			const bubEl = el.querySelector( '.tw-np-bubble' );
			if ( bubEl ) {

				const showBub = peer.chatBubbleUntil > now && peer.chatBubble;
				bubEl.hidden = ! showBub;
				if ( showBub ) bubEl.textContent = peer.chatBubble;

			}

		}

	}

}
