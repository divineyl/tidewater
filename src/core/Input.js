// Keyboard, mouse, and standard Gamepad input with pointer lock support.

export function shapeAxis( v, deadzone = 0.14, power = 1.35 ) {

	if ( typeof v !== 'number' || ! Number.isFinite( v ) ) return 0;
	const av = Math.abs( v );
	if ( av <= deadzone ) return 0;
	const t = Math.min( 1, ( av - deadzone ) / ( 1 - deadzone ) );
	return Math.sign( v ) * Math.pow( t, power );

}

// Filters Chromium pointer-lock warp spikes and client-delta bursts without slowing smooth sweeps.
export function filterLookDelta( dx, dy, state, nowMs = 0 ) {

	if ( ! Number.isFinite( dx ) || ! Number.isFinite( dy ) ) return { x: 0, y: 0, rejected: true };
	if ( dx === 0 && dy === 0 ) return { x: 0, y: 0, rejected: false };

	if ( state.lastTime > 0 && nowMs - state.lastTime > 120 ) state.emaStep = 10;

	if ( state.skipEvents > 0 ) {

		state.skipEvents --;
		state.lastTime = nowMs;
		return { x: 0, y: 0, rejected: true };

	}

	const mag = Math.hypot( dx, dy );
	if ( nowMs < state.graceUntil && mag > 45 ) return { x: 0, y: 0, rejected: true };
	if ( Math.abs( dx ) > 180 || Math.abs( dy ) > 180 || mag > 220 ) return { x: 0, y: 0, rejected: true };

	const dtMs = state.lastTime > 0 ? Math.max( 0, nowMs - state.lastTime ) : 16;
	if ( dtMs < 55 && mag > Math.max( 95, state.emaStep * 6.0 ) ) return { x: 0, y: 0, rejected: true };

	state.lastTime = nowMs;
	state.emaStep = Math.min( 90, state.emaStep * 0.65 + mag * 0.35 );
	return { x: dx, y: dy, rejected: false };

}

export class Input {

	constructor( dom ) {

		this.dom = dom;
		this.keys = new Set();
		this.pressed = new Set();
		this.look = { x: 0, y: 0 };
		this.wheel = 0;
		this.mouseDown = false;
		this.rightDown = false;
		this.locked = false;
		this.enabled = true;
		this.lookBlocked = false;
		this.sensitivity = 1;
		this.invertY = false;
		this._lookFilter = { emaStep: 12, lastTime: 0, skipEvents: 0, graceUntil: 0 };
		this._lastClientX = null;
		this._lastClientY = null;

		this.onGamepadChange = null;
		this.gp = {
			connected: false,
			id: '',
			moveX: 0,
			moveY: 0,
			lookX: 0,
			lookY: 0,
			lt: 0,
			rt: 0,
			buttons: new Array( 17 ).fill( false ),
			prevButtons: new Array( 17 ).fill( false ),
			pressed: new Set(),
		};

		if ( ! dom || typeof window === 'undefined' ) return;

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target && ( e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' ) ) return;
			if ( ! this.keys.has( e.code ) ) this.pressed.add( e.code );
			this.keys.add( e.code );
			if ( [ 'Space', 'ArrowUp', 'ArrowDown', 'Tab' ].includes( e.code ) ) e.preventDefault();

		} );
		window.addEventListener( 'keyup', ( e ) => this.keys.delete( e.code ) );
		window.addEventListener( 'blur', () => this._clearTransient() );
		document.addEventListener( 'visibilitychange', () => {

			if ( document.hidden ) this._clearTransient();

		} );

		dom.addEventListener( 'mousedown', ( e ) => {

			if ( ! this.enabled || this.lookBlocked || ( typeof window !== 'undefined' && window.__ui && window.__ui.isPointerOverUI ) ) return;
			if ( e.button === 0 ) this.mouseDown = true;
			if ( e.button === 2 ) this.rightDown = true;
			this._lastClientX = e.clientX;
			this._lastClientY = e.clientY;

		} );
		window.addEventListener( 'mouseup', ( e ) => {

			if ( e.button === 0 ) this.mouseDown = false;
			if ( e.button === 2 ) this.rightDown = false;
			if ( ! this.mouseDown && ! this.rightDown ) {

				this._lastClientX = null;
				this._lastClientY = null;

			}

		} );
		dom.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );
		window.addEventListener( 'mousemove', ( e ) => {

			if ( ! this.enabled || this.lookBlocked ) return;
			if ( this.locked ) {

				const res = filterLookDelta( e.movementX, e.movementY, this._lookFilter, performance.now() );
				this.look.x += res.x;
				this.look.y += res.y;

			} else if ( this.mouseDown || this.rightDown ) {

				if ( this._lastClientX === null || this._lastClientY === null ) {

					this._lastClientX = e.clientX;
					this._lastClientY = e.clientY;
					return;

				}

				const dx = e.clientX - this._lastClientX;
				const dy = e.clientY - this._lastClientY;
				this._lastClientX = e.clientX;
				this._lastClientY = e.clientY;
				if ( Number.isFinite( dx ) && Number.isFinite( dy ) && Math.abs( dx ) <= 180 && Math.abs( dy ) <= 180 ) {

					this.look.x += dx;
					this.look.y += dy;

				}

			}

		} );
		dom.addEventListener( 'wheel', ( e ) => {

			if ( ! this.enabled || this.lookBlocked ) return;
			this.wheel += Math.sign( e.deltaY );
			e.preventDefault();

		}, { passive: false } );

		document.addEventListener( 'pointerlockchange', () => {

			this.locked = document.pointerLockElement === dom;
			this.mouseDown = false;
			this.rightDown = false;
			this.resetLook();
			this._lookFilter.skipEvents = 1;
			this._lookFilter.graceUntil = performance.now() + 80;

		} );

		window.addEventListener( 'gamepadconnected', ( e ) => {

			this.gp.connected = true;
			this.gp.id = e.gamepad ? e.gamepad.id : '';
			if ( typeof this.onGamepadChange === 'function' ) this.onGamepadChange( true, this.gp.id );

		} );
		window.addEventListener( 'gamepaddisconnected', ( e ) => {

			this._resetGamepadState();
			if ( typeof this.onGamepadChange === 'function' ) this.onGamepadChange( false, e.gamepad ? e.gamepad.id : '' );

		} );

	}

	_resetGamepadState() {

		const g = this.gp;
		g.connected = false;
		g.moveX = 0;
		g.moveY = 0;
		g.lookX = 0;
		g.lookY = 0;
		g.lt = 0;
		g.rt = 0;
		g.buttons.fill( false );
		g.prevButtons.fill( false );
		g.pressed.clear();

	}

	pollGamepad( dt ) {

		if ( typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function' ) return;
		const pads = navigator.getGamepads();
		let pad = null;
		if ( pads ) {

			for ( let i = 0; i < pads.length; i ++ ) {

				if ( pads[ i ] && pads[ i ].connected ) {

					pad = pads[ i ];
					break;

				}

			}

		}

		const g = this.gp;
		if ( ! pad ) {

			if ( g.connected ) {

				this._resetGamepadState();
				if ( typeof this.onGamepadChange === 'function' ) this.onGamepadChange( false, g.id );

			}

			return;

		}

		if ( ! g.connected ) {

			g.connected = true;
			g.id = pad.id || 'Gamepad';
			if ( typeof this.onGamepadChange === 'function' ) this.onGamepadChange( true, g.id );

		}

		g.moveX = shapeAxis( pad.axes[ 0 ] || 0, 0.14, 1.35 );
		g.moveY = shapeAxis( pad.axes[ 1 ] || 0, 0.14, 1.35 );
		g.lookX = shapeAxis( pad.axes[ 2 ] || 0, 0.15, 1.45 );
		g.lookY = shapeAxis( pad.axes[ 3 ] || 0, 0.15, 1.45 );
		g.lt = pad.buttons[ 6 ] ? pad.buttons[ 6 ].value : 0;
		g.rt = pad.buttons[ 7 ] ? pad.buttons[ 7 ].value : 0;

		if ( this.enabled && ( g.lookX !== 0 || g.lookY !== 0 ) ) {

			const speed = 900 * Math.min( 0.05, dt || 1 / 60 );
			this.look.x += g.lookX * speed;
			this.look.y += g.lookY * speed;

		}

		g.pressed.clear();
		for ( let i = 0; i < 17; i ++ ) {

			const cur = !! ( pad.buttons[ i ] && pad.buttons[ i ].pressed );
			if ( cur && ! g.prevButtons[ i ] ) g.pressed.add( i );
			g.buttons[ i ] = cur;
			g.prevButtons[ i ] = cur;

		}

	}

	gpDown( idx ) {

		return this.enabled && this.gp.connected && !! this.gp.buttons[ idx ];

	}

	gpHit( idx ) {

		return this.enabled && this.gp.connected && this.gp.pressed.has( idx );

	}

	// Unified directional axes: x (+1 right / -1 left), y (+1 forward / -1 back)
	getMoveAxes() {

		if ( ! this.enabled ) return { x: 0, y: 0 };
		const kx = ( this.keys.has( 'KeyD' ) ? 1 : 0 ) - ( this.keys.has( 'KeyA' ) ? 1 : 0 );
		const ky = ( this.keys.has( 'KeyW' ) ? 1 : 0 ) - ( this.keys.has( 'KeyS' ) ? 1 : 0 );
		const x = Math.max( - 1, Math.min( 1, kx + this.gp.moveX ) );
		const y = Math.max( - 1, Math.min( 1, ky - this.gp.moveY ) );
		return { x, y };

	}

	getBoatControls() {

		if ( ! this.enabled ) return { throttle: 0, steer: 0 };
		let throttle = 0;
		if ( this.keys.has( 'KeyW' ) ) throttle = this.keys.has( 'ShiftLeft' ) || this.keys.has( 'ShiftRight' ) ? 1 : 0.7;
		if ( this.keys.has( 'KeyS' ) ) throttle = - 0.6;
		if ( this.gp.rt > 0.05 ) throttle = Math.max( throttle, this.gp.rt );
		else if ( this.gp.lt > 0.05 && throttle >= 0 ) throttle = - this.gp.lt * 0.7;
		const kSteer = ( this.keys.has( 'KeyA' ) ? 1 : 0 ) - ( this.keys.has( 'KeyD' ) ? 1 : 0 );
		const steer = Math.max( - 1, Math.min( 1, kSteer - this.gp.moveX ) );
		return { throttle, steer };

	}

	getVehicleControls() {

		if ( ! this.enabled ) return { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
		const throttle = Math.max( this.keys.has( 'KeyW' ) ? 1 : 0, this.gp.rt );
		const brake = Math.max( this.keys.has( 'KeyS' ) ? 1 : 0, this.gp.lt );
		const kSteer = ( this.keys.has( 'KeyA' ) ? 1 : 0 ) - ( this.keys.has( 'KeyD' ) ? 1 : 0 );
		const steer = Math.max( - 1, Math.min( 1, kSteer - this.gp.moveX ) );
		const handbrake = this.keys.has( 'Space' ) || this.gpDown( 0 );
		const boost = this.keys.has( 'ShiftLeft' ) || this.keys.has( 'ShiftRight' ) || this.gpDown( 5 );
		return { throttle, brake, steer, handbrake, boost };

	}

	resetLook() {

		this.look.x = 0;
		this.look.y = 0;
		this._lastClientX = null;
		this._lastClientY = null;
		this._lookFilter.emaStep = 10;
		this._lookFilter.lastTime = 0;

	}

	setLookBlocked( blocked ) {

		const next = !! blocked;
		if ( next === this.lookBlocked ) return;
		this.lookBlocked = next;
		if ( next ) this.resetLook();

	}

	_clearTransient() {

		this.keys.clear();
		this.pressed.clear();
		this.mouseDown = false;
		this.rightDown = false;
		this.wheel = 0;
		this.resetLook();

	}

	requestLock() {

		if ( this.locked || ! this.dom || ! this.dom.requestPointerLock ) return;
		try {

			const res = this.dom.requestPointerLock( { unadjustedMovement: true } );
			if ( res && typeof res.catch === 'function' ) {

				res.catch( () => {

					try {

						const fb = this.dom.requestPointerLock();
						if ( fb && typeof fb.catch === 'function' ) fb.catch( () => {} );

					} catch {}

				} );

			}

		} catch {

			try {

				const fb = this.dom.requestPointerLock();
				if ( fb && typeof fb.catch === 'function' ) fb.catch( () => {} );

			} catch {}

		}

	}

	down( code ) {

		if ( ! this.enabled ) return false;
		if ( this.keys.has( code ) ) return true;
		if ( ! this.gp.connected ) return false;
		if ( code === 'ShiftLeft' ) return !! this.gp.buttons[ 5 ];
		if ( code === 'Space' ) return !! this.gp.buttons[ 0 ];
		if ( code === 'KeyC' ) return !! this.gp.buttons[ 1 ];
		return false;

	}

	// true once per physical key press (or mapped gamepad button)
	hit( code ) {

		if ( ! this.enabled ) return false;
		if ( this.pressed.has( code ) ) return true;
		if ( ! this.gp.connected ) return false;
		const p = this.gp.pressed;
		switch ( code ) {

			case 'KeyE': return p.has( 2 ); // X / Square
			case 'KeyV': return p.has( 3 ); // Y / Triangle
			case 'KeyR': return p.has( 4 ); // LB / L1
			case 'Space': return p.has( 0 ); // A / Cross
			case 'KeyG': return p.has( 10 ); // L3
			case 'KeyL': return p.has( 12 ); // D-Pad Up
			case 'KeyI': return p.has( 13 ); // D-Pad Down
			default: return false;

		}

	}

	consumeLook() {

		if ( ! this.enabled || this.lookBlocked ) {

			this.look.x = 0;
			this.look.y = 0;
			return { x: 0, y: 0 };

		}

		const sens = Number.isFinite( this.sensitivity ) ? Math.max( 0.2, Math.min( 4, this.sensitivity ) ) : 1;
		const ySign = this.invertY ? - 1 : 1;
		const l = {
			x: Math.max( - 140, Math.min( 140, this.look.x ) ) * sens,
			y: Math.max( - 140, Math.min( 140, this.look.y ) ) * sens * ySign,
		};
		this.look.x = 0;
		this.look.y = 0;
		return l;

	}

	consumeWheel() {

		if ( ! this.enabled || this.lookBlocked ) {

			this.wheel = 0;
			return 0;

		}

		const w = this.wheel;
		this.wheel = 0;
		return w;

	}

	endFrame() {

		this.pressed.clear();
		this.gp.pressed.clear();

	}

}
