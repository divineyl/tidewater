import * as THREE from '../engine/index.js';
import { WORLD } from '../world/WorldLayout.js';
import { HOUSE } from '../world/boat/Wheelhouse.js';

const HOUSE_HELM = { x: HOUSE.helmX, z: HOUSE.seatZ };

const EYE = 1.62;
const SWIM_EYE = EYE * 0.1; // eyes above the body's float point while swimming
const RADIUS = 0.3;
const HEIGHT = 1.75;
// water depth (mean level over the feet) where you start swimming / find your feet again
const SWIM_DEPTH = 1.35;
const STAND_DEPTH = 1.1;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler( 0, 0, 0, 'YXZ' );
const _yAxis = new THREE.Vector3( 0, 1, 0 );
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
const _wish = new THREE.Vector3();
// walking on the boat
const DECK_RADIUS = 0.24;
const DECK_STEP = 0.36; // highest ledge you step up onto
const HELM_REACH = 0.75; // m from the helm seat to take the wheel

// First-person walker / swimmer / boat captain.
//   walk : capsule on terrain + walkable colliders, wading slows you down
//   swim : floats with the head at the surface; look down + W (or C) to dive, Space to rise
//   deck : aboard, walking in the boat's frame (it moves and rocks under you); E at the helm
//          takes the wheel, E near a pier / the beach steps ashore
//   boat : at the helm, driving; V toggles helm (1st person) / chase (3rd person) camera, E stands up
export class Player {

	constructor( { camera, input, terrain, colliders, query, boat, vehicles = null, reef = null, audio = null } ) {

		this.camera = camera;
		this.input = input;
		this.terrain = terrain;
		this.colliders = colliders;
		this.query = query;
		this.boat = boat;
		this.vehicles = vehicles;
		this.reef = reef;
		this.audio = audio;

		this.mode = 'walk';
		this.camMode = 'third';
		const start = WORLD.start || WORLD.spawn;
		this.position = new THREE.Vector3().copy( start.position );
		// standing on whatever is there (the boardwalk planks), not in it
		this.position.y = Math.max( terrain.heightAt( this.position.x, this.position.z ), colliders ? colliders.groundHeightAt( this.position.x, this.position.z, 50 ) : - Infinity );
		this.velocity = new THREE.Vector3();
		this.yaw = start.yaw;
		this.pitch = - 0.05;
		this.grounded = false;
		this.bob = 0;
		this.stepDist = 0;
		this.waterH = 0;
		this.waterMean = null; // water level low-passed over the passing waves (mode decisions)
		this.wade = 0;
		// eye height easing between modes (critically damped offset from the mode's eye height)
		this.camOff = 0;
		this.camOffV = 0;
		this._camY = null;
		this.floating = true; // swimming at the surface (riding the waves) vs. free under water
		this.slot = query.allocate( 'player', 1 );
		this.prompt = null;
		this.surface = 'sand';

		// vehicle cameras
		this.activeVehicle = null;
		this.vehOrbitYaw = 0;
		this.vehOrbitPitch = 0.22;
		this.vehOrbitDist = 4.6;
		this.vehHeadYaw = 0;
		this.vehHeadPitch = - 0.05;
		this.vehCamPos = new THREE.Vector3();
		this.vehCamInit = false;
		this.vehFovDelta = 0;
		this._vehLookHoldT = 0;
		this._camShake = 0;

		// boat cameras
		this.orbitYaw = 0;
		this.orbitPitch = 0.22;
		this.orbitDist = 13;
		this.helmYaw = 0;
		this.helmPitch = - 0.05;
		this.camPos = new THREE.Vector3();
		this.camInit = false;
		this._boatLookHoldT = 0;
		this.wasUnder = false;

		// on deck: position and heading in the boat frame (+Z forward, yaw 0 looks forward)
		this.deckPos = new THREE.Vector3();
		this.deckVel = new THREE.Vector3();
		this.deckYaw = 0;
		this.deckGrounded = true;
		this._ashore = null; // cached step-ashore target
		this._ashoreT = 0;
		// set by the fishing game: while a line is out the helm / step ashore prompts give way
		this.busy = false;
		// co-op passenger / deck guest on a friend's boat or buggy
		this.mp = null;
		this.coop = null;

	}

	// view direction in world space (for casting); works in every mode
	getViewDir( out ) {

		return out.set( 0, 0, - 1 ).applyQuaternion( this.camera.quaternion );

	}

	// ------------------------------------------------------------------ helpers

	waterHeight() {

		const q = this.query;
		if ( ! q.cpuValid ) return 0;
		const h = q.cpu[ this.slot * 4 ];
		return Number.isFinite( h ) ? h : this.waterH || 0;

	}

	groundAt( x, z, maxY ) {

		let g = this.terrain.heightAt( x, z );
		const c = this.colliders.groundHeightAt( x, z, maxY );
		if ( c > g ) g = c;
		if ( this.reef && this.reef.floorHeightAt ) g = Math.max( g, this.reef.floorHeightAt( x, z ) );
		return g;

	}

	nearBoat() {

		if ( ! this.boat ) return false;
		const bp = this.boat.toWorld( this.boat.model.boardPoint, _v );
		const d = Math.hypot( bp.x - this.position.x, bp.z - this.position.z );
		const dy = Math.abs( bp.y - this.position.y );
		return d < 4.2 && dy < 3.2;

	}

	// ------------------------------------------------------------------ update

	update( dt ) {

		const inp = this.input;
		this.query.setPoint( this.slot, this.position.x, this.position.z );
		this.waterH = this.waterHeight();
		this.waterMean = this.waterMean === null ? this.waterH : this.waterMean + ( this.waterH - this.waterMean ) * ( 1 - Math.exp( - dt / 4 ) );
		this.prompt = null;

		if ( this.mode === 'boat' ) {

			this.updateBoat( dt );
			return;

		}

		if ( this.mode === 'deck' ) {

			this.updateDeck( dt );
			return;

		}

		if ( this.mode === 'vehicle' ) {

			this.updateVehicle( dt );
			return;

		}

		if ( this.mode === 'coop' ) {

			this.updateCoop( dt );
			return;

		}

		const look = inp.consumeLook();
		this.yaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.5, 1.5 );

		// (not with a line out or a fish in hand: E belongs to the fishing then)
		if ( ! this.busy ) {

			const hasBoat = this.nearBoat();
			const boatD = hasBoat ? Math.hypot( _v.x - this.position.x, _v.z - this.position.z ) : Infinity;
			const nv = this.vehicles ? this.vehicles.getNearestMountable( this.position ) : null;
			const vehD = nv ? Math.hypot( nv.position.x - this.position.x, nv.position.z - this.position.z ) : Infinity;

			if ( hasBoat && ( ! nv || boatD <= vehD ) ) {

				this.prompt = { key: 'E', text: 'Board boat' };
				if ( inp.hit( 'KeyE' ) ) {

					this.boardBoat();
					return;

				}

			} else if ( nv ) {

				this.prompt = { key: 'E', text: `Ride ${ nv.name.toLowerCase() }` };
				if ( inp.hit( 'KeyE' ) ) {

					this.mountVehicle( nv );
					return;

				}

			} else if ( this.mp && typeof this.mp.findNearestBoardablePeer === 'function' ) {

				const peerCraft = this.mp.findNearestBoardablePeer( this.position );
				if ( peerCraft ) {

					this.prompt = {
						key: 'X',
						text: peerCraft.kind === 'boat' ? 'Board friend\'s boat' : 'Ride in friend\'s buggy',
					};
					if ( inp.hit( 'KeyX' ) ) {

						this.boardRemotePeer( peerCraft );
						return;

					}

				}

			}

		}

		const prevMode = this.mode;
		if ( this.mode === 'walk' ) this.updateWalk( dt );
		else this.updateSwim( dt );

		// camera. Wading out of your depth, finding your feet again or climbing out on a ladder
		// changes the eye height: ease the view there (critically damped) instead of jumping
		const eye = this.position.clone();
		if ( this.mode === 'walk' ) eye.y += EYE + Math.sin( this.bob ) * 0.035 * ( 1 - 0.6 * this.wade );
		else eye.y += SWIM_EYE;
		if ( this._camY === null || this.camera.position.y !== this._camY ) {

			// something else drove the camera since our last frame (free camera, boat): start fresh
			this.camOff = 0;
			this.camOffV = 0;

		} else if ( this.mode !== prevMode ) {

			this.camOff = this._camY - eye.y;

		}

		const w = 6, e = Math.exp( - w * dt ), j = ( this.camOffV + w * this.camOff ) * dt;
		this.camOff = ( this.camOff + j ) * e;
		this.camOffV = ( this.camOffV - w * j ) * e;
		eye.y += this.camOff;
		this.camera.position.copy( eye );
		this._camY = this.camera.position.y;
		this.camera.quaternion.setFromEuler( _e.set( this.pitch, this.yaw, 0 ) );

	}

	updateWalk( dt ) {

		const inp = this.input;
		_fwd.set( - Math.sin( this.yaw ), 0, - Math.cos( this.yaw ) );
		_right.set( - _fwd.z, 0, _fwd.x );
		const wish = new THREE.Vector3();
		const move = inp.getMoveAxes();
		wish.addScaledVector( _fwd, move.y );
		wish.addScaledVector( _right, move.x );
		const mag = wish.length();
		if ( mag > 1 ) wish.multiplyScalar( 1 / mag );

		const depth = this.waterH - this.position.y; // water depth at the feet
		const wade = THREE.MathUtils.clamp( depth / 1.2, 0, 1 );
		this.wade = wade;
		const sprint = inp.down( 'ShiftLeft' ) || inp.down( 'ShiftRight' );
		const speed = ( sprint ? 6.2 : 3.0 ) * THREE.MathUtils.lerp( 1, 0.42, wade );
		const accel = this.grounded ? 14 : 2.5;
		const k = 1 - Math.exp( - accel * dt );
		this.velocity.x += ( wish.x * speed - this.velocity.x ) * k;
		this.velocity.z += ( wish.z * speed - this.velocity.z ) * k;

		if ( this.grounded && inp.hit( 'Space' ) && depth < 0.9 ) {

			this.velocity.y = 4.6;
			this.grounded = false;

		}

		this.velocity.y -= 9.81 * dt;
		// water drag while wading
		if ( depth > 0 ) this.velocity.multiplyScalar( Math.exp( - dt * depth * 0.8 ) );

		const p = this.position;
		const old = p.clone();
		p.addScaledVector( this.velocity, dt );
		this.colliders.resolveCapsule( p, RADIUS, HEIGHT, 0.4 );
		if ( this.vehicles ) {

			for ( const vh of this.vehicles.vehicles ) {

				if ( vh.occupied || Math.abs( p.y - vh.position.y ) > 1.5 ) continue;
				const dx = p.x - vh.position.x;
				const dz = p.z - vh.position.z;
				const minR = RADIUS + ( vh.colliderRadius || 0.52 );
				const d2 = dx * dx + dz * dz;
				if ( d2 < minR * minR && d2 > 1e-6 ) {

					const d = Math.sqrt( d2 );
					p.x = vh.position.x + ( dx / d ) * minR;
					p.z = vh.position.z + ( dz / d ) * minR;

				}

			}

		}
		const g = this.groundAt( p.x, p.z, p.y + 0.45 );
		if ( p.y <= g ) {

			p.y = g;
			if ( this.velocity.y < 0 ) this.velocity.y = 0;
			this.grounded = true;

		} else {

			this.grounded = p.y - g < 0.06;

		}

		// head bob + footsteps
		const moved = Math.hypot( p.x - old.x, p.z - old.z );
		if ( this.grounded ) {

			this.bob += moved * 2.4;
			this.stepDist += moved;
			const stride = sprint ? 0.9 : 0.62;
			if ( this.stepDist > stride ) {

				this.stepDist = 0;
				this.surface = this.surfaceType( depth );
				if ( this.audio ) this.audio.footstep( this.surface );

			}

		}

		// out of your depth -> swim. Wading in, the body lifts into the floating position at the
		// surface and the view eases down to it (update()); falling in off the pier plunges under
		// and floats back up.
		if ( this.waterMean - p.y > SWIM_DEPTH ) {

			const wadedIn = this.grounded;
			this.mode = 'swim';
			if ( wadedIn ) p.y = Math.max( p.y, this.waterH - SWIM_EYE + 0.1 );
			this.velocity.y = wadedIn ? 0 : Math.max( this.velocity.y * 0.3, - 2.5 );
			if ( this.audio ) this.audio.splash( wadedIn ? 0.2 : 0.5, p );

		}

	}

	surfaceType( depth ) {

		const p = this.position;
		if ( depth > 0.12 ) return 'water';
		const onWood = this.colliders.groundHeightAt( p.x, p.z, p.y + 0.1 ) > this.terrain.heightAt( p.x, p.z ) + 0.05;
		if ( onWood ) return 'wood';
		const h = this.terrain.heightAt( p.x, p.z );
		if ( h < 0.6 ) return 'wetsand';
		if ( h > 3.6 ) return 'grass';
		return 'sand';

	}

	updateSwim( dt ) {

		const inp = this.input;
		const p = this.position;
		const surfaceY = this.waterH;
		// look-relative movement (diving follows the view)
		_fwd.set( 0, 0, - 1 ).applyEuler( _e.set( this.pitch, this.yaw, 0 ) );
		_right.set( - Math.cos( this.yaw ), 0, Math.sin( this.yaw ) ).negate();
		const wish = new THREE.Vector3();
		const move = inp.getMoveAxes();
		wish.addScaledVector( _fwd, move.y );
		wish.addScaledVector( _right, move.x );
		if ( inp.down( 'Space' ) ) wish.y += 1;
		if ( inp.down( 'KeyC' ) || inp.down( 'ControlLeft' ) ) wish.y -= 1;
		const mag = wish.length();
		if ( mag > 1 ) wish.multiplyScalar( 1 / mag );

		const atSurface = this.floating && p.y > surfaceY - 0.45;
		// at the surface W along a level view keeps you on top; looking down dives
		if ( atSurface && wish.y > - 0.25 && ! inp.down( 'KeyC' ) ) wish.y = Math.max( wish.y, 0 );

		const sprint = inp.down( 'ShiftLeft' ) || inp.down( 'ShiftRight' );
		const speed = sprint ? 2.5 : 1.5;
		const k = 1 - Math.exp( - dt * 3.0 );
		this.velocity.lerp( wish.multiplyScalar( speed ), k );

		// A swimmer at the surface floats with the head riding the waves; one who dives stays where
		// they swim to (neutral buoyancy, nothing pulls them back up) until they swim up to the
		// surface again.
		const eyeTarget = surfaceY - SWIM_EYE + 0.1; // eyes ~10 cm above the water; waves still wash over
		const diving = inp.down( 'KeyC' ) || ( inp.down( 'KeyW' ) && this.pitch < - 0.35 ) || wish.y < - 0.1;
		if ( diving ) this.floating = false;
		else if ( p.y > eyeTarget - 0.15 ) this.floating = true;
		if ( this.floating ) {

			p.y += ( eyeTarget - p.y ) * ( 1 - Math.exp( - dt * 5 ) );
			if ( this.velocity.y > 0 ) this.velocity.y *= 0.5;

		}

		p.addScaledVector( this.velocity, dt );
		p.y = Math.min( p.y, surfaceY + 0.05 );
		this.colliders.resolveCapsule( p, RADIUS, 1.0, 0 );
		const g = this.groundAt( p.x, p.z, p.y + 0.3 );
		if ( p.y < g + 0.25 ) p.y = g + 0.25;

		// strokes / bubbles
		this.stepDist += this.velocity.length() * dt;
		if ( this.stepDist > 1.3 ) {

			this.stepDist = 0;
			if ( this.audio ) this.audio.swimStroke();

		}

		const under = this.camera.position.y < surfaceY - 0.05;
		if ( under !== this.wasUnder && this.audio ) {

			if ( under ) this.audio.submerge();
			else this.audio.emerge();

		}

		this.wasUnder = under;

		// shallow enough to stand -> walk (update() eases the view up to standing height). The mean
		// level decides, so a passing wave doesn't flip you between swimming and standing.
		if ( this.waterMean - g < STAND_DEPTH ) {

			this.mode = 'walk';
			p.y = g;
			this.velocity.set( this.velocity.x, 0, this.velocity.z );

		}

		// ladders on the pier: climb out when swimming into them
		if ( this.colliders.boxes ) {

			for ( const b of this.colliders.boxes ) {

				if ( b.tag !== 'ladder' ) continue;
				if ( Math.hypot( b.center.x - p.x, b.center.z - p.z ) < 1.1 ) {

					this.prompt = { key: 'Space', text: 'Climb ladder' };
					if ( inp.down( 'Space' ) || inp.down( 'KeyW' ) ) {

						const top = this.colliders.groundHeightAt( b.center.x, b.center.z, 10 );
						if ( top > p.y ) {

							p.y += dt * 1.6;
							if ( p.y > top - 1.0 ) {

								// step onto the deck
								const deck = WORLD.pier.deckHeight;
								p.set( b.center.x - Math.sign( b.center.x - WORLD.pier.x ) * 1.2, deck, b.center.z );
								this.mode = 'walk';
								this.velocity.set( 0, 0, 0 );

							}

						}

					}

					break;

				}

			}

		}

	}

	// ------------------------------------------------------------------ boat

	// step aboard from the pier / beach / water: onto the cockpit sole at the boarding point
	boardBoat() {

		const b = this.boat;
		this.mode = 'deck';
		this.deckPos.copy( b.model.boardPoint );
		this.deckVel.set( 0, 0, 0 );
		// keep looking where you looked (relative to the boat)
		this.deckYaw = this.yaw - ( b.getYaw() + Math.PI );
		this.deckGrounded = true;
		this._ashore = null;
		this._ashoreT = 0;
		this.velocity.set( 0, 0, 0 );
		this._camY = null;
		this.deckToWorld();

	}

	// sit down at the helm and drive (the old "enter boat")
	takeHelm() {

		this.mode = 'boat';
		this.boat.driven = true;
		this.boat.moored = false;
		this.helmYaw = 0;
		this.helmPitch = - 0.05;
		this.orbitYaw = this.boat.getYaw() + Math.PI;
		this.camInit = false;
		if ( this.audio ) this.audio.engineStart();

	}

	// get up from the helm: stand beside the seat, looking forward
	leaveHelm() {

		const b = this.boat;
		b.driven = false;
		b.throttle = 0;
		this.mode = 'deck';
		this.deckPos.set( HOUSE_HELM.x + 0.45, b.model.lines.deckY, HOUSE_HELM.z - 0.1 );
		this.deckVel.set( 0, 0, 0 );
		this.deckYaw = this.helmYaw;
		this.pitch = this.helmPitch;
		this.deckGrounded = true;
		this._camY = null;
		if ( this.audio ) this.audio.engineStop();
		this.deckToWorld();

	}

	// enterBoat() kept for callers: straight to the helm
	enterBoat() {

		this.boardBoat();
		this.takeHelm();

	}

	// target: an ashoreTarget() spot; side: +1 / -1 jumps overboard on the starboard / port side
	exitBoat( target = null, side = 0 ) {

		const b = this.boat;
		const wasDriving = b.driven;
		b.driven = false;
		b.throttle = 0;
		// the exit point closest to something walkable (pier deck / sand)
		let best = side ? null : this.ashoreTarget();

		const dock = WORLD.boatDock.position;
		if ( b.position.distanceTo( dock ) < 14 && b.speed < 1.5 ) {

			b.moored = true;
			b.mooring.anchor.set( b.position.x, 0, b.position.z );
			b.mooring.heading = b.getYaw();

		}

		if ( target ) best = target;
		if ( best ) {

			this.position.set( best.out.x, best.g, best.out.z );
			this.mode = 'walk';

		} else {

			const w = b.toWorld( new THREE.Vector3( 2.2 * ( side || 1 ), 0, 0 ), new THREE.Vector3() );
			// (the boat floats at the water line: the walker's water height is stale while aboard)
			this.waterH = this.waterMean = b.position.y;
			this.position.set( w.x, b.position.y - 0.2, w.z );
			this.mode = 'swim';
			if ( this.audio ) this.audio.splash( 0.8, this.position );

		}

		this.velocity.set( 0, 0, 0 );
		this.yaw = b.getYaw() + Math.PI;
		this._camY = null;
		if ( this.audio && wasDriving ) this.audio.engineStop();

	}

	// best walkable spot next to the boat (pier deck / sand / shallows), or null. Looks straight out
	// from the rail at each exit point (square to the hull, a few reaches: the boat swings on its
	// mooring) for ground from a little below the rail up to a pier deck a climb above it.
	ashoreTarget() {

		const b = this.boat;
		const water = this.query.cpuValid ? this.query.cpu[ 0 ] : 0;
		// the boat's starboard (local +x) direction in the world, level
		const sx = _v2.set( 1, 0, 0 ).applyQuaternion( b.quaternion ).setY( 0 ).normalize();
		const rx = sx.x, rz = sx.z;
		let best = null, bestScore = Infinity;
		for ( const ep of b.model.exitPoints ) {

			const w = b.toWorld( ep, new THREE.Vector3() );
			const sgn = Math.sign( ep.x ) || 1;
			for ( const reach of [ 0.9, 1.4, 2.0 ] ) {

				const out = new THREE.Vector3( w.x + rx * sgn * reach, w.y, w.z + rz * sgn * reach );
				const g = this.groundAt( out.x, out.z, w.y + 2.5 );
				const up = g - w.y;
				if ( up > 1.7 || up < - 1.2 || g < water - 0.3 ) continue;
				const score = Math.abs( up ) + reach * 0.2;
				if ( score < bestScore ) { bestScore = score; best = { out, g, ep }; }

			}

		}

		return best;

	}

	// ------------------------------------------------------------------ deck

	// camera base orientation on the boat: its heading, with roll and pitch half stabilised
	deckBase( out ) {

		const b = this.boat;
		_qa.setFromAxisAngle( _yAxis, b.getYaw() + Math.PI );
		_qb.copy( b.quaternion ).multiply( _qc.setFromAxisAngle( _yAxis, Math.PI ) );
		return out.slerpQuaternions( _qb, _qa, 0.55 );

	}

	// world position / heading of the player from the deck state (feet)
	deckToWorld() {

		const b = this.boat;
		b.toWorld( this.deckPos, this.position );
		this.yaw = b.getYaw() + Math.PI + this.deckYaw;

	}

	// highest walkable box top under the point (boat frame), not above maxY; the sole otherwise
	deckGroundAt( x, z, maxY ) {

		const L = this.boat.model.lines;
		let g = L.deckY;
		for ( const c of this.boat.model.colliders ) {

			if ( ! c.walkable ) continue;
			if ( Math.abs( x - c.center.x ) > c.half.x || Math.abs( z - c.center.z ) > c.half.z ) continue;
			const top = c.center.y + c.half.y;
			if ( top <= maxY && top > g ) g = top;

		}

		return g;

	}

	updateDeck( dt ) {

		const inp = this.input;
		const b = this.boat;
		const L = b.model.lines;
		const look = inp.consumeLook();
		this.deckYaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.5, 1.5 );

		// movement in the boat frame (camera base looks along +Z at deckYaw 0)
		const sy = Math.sin( this.deckYaw ), cy = Math.cos( this.deckYaw );
		_fwd.set( sy, 0, cy );
		_right.set( - cy, 0, sy );
		_wish.set( 0, 0, 0 );
		const move = inp.getMoveAxes();
		_wish.addScaledVector( _fwd, move.y );
		_wish.addScaledVector( _right, move.x );
		const wMag = _wish.length();
		if ( wMag > 1 ) _wish.multiplyScalar( 1 / wMag );
		const speed = ( inp.down( 'ShiftLeft' ) ? 2.6 : 1.6 );
		const k = 1 - Math.exp( - 12 * dt );
		const v = this.deckVel;
		v.x += ( _wish.x * speed - v.x ) * k;
		v.z += ( _wish.z * speed - v.z ) * k;
		if ( this.deckGrounded && inp.hit( 'Space' ) ) {

			v.y = 3.2;
			this.deckGrounded = false;

		}

		v.y -= 9.81 * dt;
		const p = this.deckPos;
		const oldX = p.x, oldZ = p.z;
		p.addScaledVector( v, dt );

		// walls: push out of the solid boxes you can't step onto (boat frame, axis aligned)
		for ( let iter = 0; iter < 2; iter ++ ) for ( const c of b.model.colliders ) {

			if ( ! c.solid ) continue;
			const top = c.center.y + c.half.y, bot = c.center.y - c.half.y;
			if ( top <= p.y + DECK_STEP || bot >= p.y + HEIGHT ) continue;
			const ex = c.half.x + DECK_RADIUS, ez = c.half.z + DECK_RADIUS;
			const dx = p.x - c.center.x, dz = p.z - c.center.z;
			if ( Math.abs( dx ) >= ex || Math.abs( dz ) >= ez ) continue;
			const px = ex - Math.abs( dx ), pz = ez - Math.abs( dz );
			if ( px < pz ) { p.x += Math.sign( dx || ( oldX - c.center.x ) || 1 ) * px; v.x = 0; }
			else { p.z += Math.sign( dz || ( oldZ - c.center.z ) || 1 ) * pz; v.z = 0; }

		}

		// stay inside the hull (the bulwarks, plus a margin fore and aft)
		p.z = THREE.MathUtils.clamp( p.z, L.zAft + L.shell + DECK_RADIUS, 4.0 );
		const halfIn = Math.max( 0.15, L.halfBreadth( L.tAtSheerZ( p.z ), Math.max( p.y, L.deckY ) ) - L.shell - DECK_RADIUS );
		p.x = THREE.MathUtils.clamp( p.x, - halfIn, halfIn );

		const g = this.deckGroundAt( p.x, p.z, p.y + DECK_STEP );
		if ( p.y <= g ) {

			p.y = g;
			if ( v.y < 0 ) v.y = 0;
			this.deckGrounded = true;

		} else this.deckGrounded = p.y - g < 0.04;

		// footsteps on the deck
		const moved = Math.hypot( p.x - oldX, p.z - oldZ );
		if ( this.deckGrounded ) {

			this.bob += moved * 2.4;
			this.stepDist += moved;
			if ( this.stepDist > 0.6 ) {

				this.stepDist = 0;
				if ( this.audio ) this.audio.footstep( 'wood' );

			}

		}

		this.deckToWorld();

		// prompts: take the helm, or step ashore
		const hx = HOUSE_HELM.x, hz = HOUSE_HELM.z;
		const nearHelm = Math.hypot( p.x - hx, p.z - hz ) < HELM_REACH && ! this.busy;
		this._ashoreT -= dt;
		if ( this._ashoreT <= 0 ) {

			this._ashoreT = 0.25;
			this._ashore = b.speed < 2.5 ? this.ashoreTarget() : null;

		}

		if ( nearHelm ) {

			this.prompt = { key: 'E', text: 'Take the helm' };
			if ( inp.hit( 'KeyE' ) ) {

				this.takeHelm();
				return;

			}

		} else if ( ! this.busy ) {

			// at the rail: step ashore where there is ground on that side, else jump into the sea
			const ep = this._ashore && this._ashore.ep;
			const atRail = b.model.exitPoints.some( ( e ) => Math.hypot( p.x - e.x, p.z - e.z ) < 1.3 );
			if ( ep && Math.hypot( p.x - ep.x, p.z - ep.z ) < 1.3 ) {

				this.prompt = { key: 'E', text: 'Step ashore' };
				if ( inp.hit( 'KeyE' ) ) {

					this.exitBoat( this._ashore );
					return;

				}

			} else if ( atRail ) {

				this.prompt = { key: 'E', text: 'Jump overboard' };
				if ( inp.hit( 'KeyE' ) ) {

					this.exitBoat( null, Math.sign( p.x ) || 1 );
					return;

				}

			}

		}

		// camera: eye above the feet, following the boat's motion
		const eyeL = _v.set( p.x, p.y + EYE + Math.sin( this.bob ) * 0.02, p.z );
		b.toWorld( eyeL, this.camera.position );
		this._camY = this.camera.position.y;
		this.deckBase( _q );
		this.camera.quaternion.copy( _q ).multiply( _qa.setFromEuler( _e.set( this.pitch, this.deckYaw, 0 ) ) );

	}

	updateBoat( dt ) {

		const inp = this.input;
		const b = this.boat;
		const look = inp.consumeLook();
		const wheel = inp.consumeWheel();
		if ( Math.abs( look.x ) > 0.5 || Math.abs( look.y ) > 0.5 ) this._boatLookHoldT = 1.8;
		else this._boatLookHoldT = Math.max( 0, this._boatLookHoldT - dt );

		if ( inp.hit( 'KeyV' ) ) {

			this.camMode = this.camMode === 'first' ? 'third' : 'first';
			this.camInit = false;
			if ( this.camMode === 'third' ) this.orbitYaw = b.getYaw() + Math.PI;
			inp.resetLook?.();

		}
		if ( inp.hit( 'KeyE' ) ) {

			this.leaveHelm();
			return;

		}

		const { throttle, steer } = inp.getBoatControls();
		b.setInput( throttle, steer, dt );
		this.prompt = { key: 'E', text: 'Leave helm   ·   V  camera' };

		// keep the player attached (for audio / queries)
		b.toWorld( b.model.helmEye, this.position );
		this.position.y -= EYE;

		if ( this.camMode === 'first' ) {

			this.helmYaw = THREE.MathUtils.clamp( this.helmYaw - look.x * 0.0022, - 2.2, 2.2 );
			this.helmPitch = THREE.MathUtils.clamp( this.helmPitch - look.y * 0.0022, - 1.2, 1.0 );
			const eye = b.toWorld( b.model.helmEye, new THREE.Vector3() );
			this.camera.position.copy( eye );
			// head partially stabilises against roll and pitch (feels natural, less nausea)
			const boatQ = b.quaternion;
			const yawOnly = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), b.getYaw() + Math.PI );
			const base = new THREE.Quaternion().slerpQuaternions( boatQ.clone().multiply( new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), Math.PI ) ), yawOnly, 0.55 );
			const local = new THREE.Quaternion().setFromEuler( _e.set( this.helmPitch, this.helmYaw, 0 ) );
			this.camera.quaternion.copy( base ).multiply( local );

		} else {

			this.orbitYaw -= look.x * 0.003;
			this.orbitPitch = THREE.MathUtils.clamp( this.orbitPitch + look.y * 0.003, - 0.05, 1.2 );
			this.orbitDist = THREE.MathUtils.clamp( this.orbitDist * ( 1 + wheel * 0.08 ), 6, 40 );
			// gently swing behind the boat when moving
			if ( b.speed > 2 && this._boatLookHoldT <= 0 ) {

				const behind = b.getYaw() + Math.PI;
				let d = behind - this.orbitYaw;
				d = Math.atan2( Math.sin( d ), Math.cos( d ) );
				this.orbitYaw += d * ( 1 - Math.exp( - dt * 0.8 ) );

			}

			const target = b.toWorld( new THREE.Vector3( 0, 1.4, 0 ), new THREE.Vector3() );
			const off = new THREE.Vector3(
				Math.sin( this.orbitYaw ) * Math.cos( this.orbitPitch ),
				Math.sin( this.orbitPitch ),
				Math.cos( this.orbitYaw ) * Math.cos( this.orbitPitch )
			).multiplyScalar( this.orbitDist );
			const want = target.clone().add( off );
			want.y = Math.max( want.y, this.waterH + 0.7 );
			if ( ! this.camInit ) {

				this.camPos.copy( want );
				this.camInit = true;

			}

			this.camPos.lerp( want, 1 - Math.exp( - dt * 6 ) );
			this.camera.position.copy( this.camPos );
			this.camera.lookAt( target );

		}

	}

	// ------------------------------------------------------------------ co-op riding on a friend's craft

	boardRemotePeer( { peerId, kind } ) {

		this.coop = {
			peerId,
			kind: kind === 'buggy' ? 'buggy' : 'boat',
			localPos: kind === 'buggy' ? new THREE.Vector3( - 0.34, 0.92, - 0.14 ) : new THREE.Vector3( 0, 0.68, - 1.6 ),
			localYaw: 0,
		};
		this.mode = 'coop';
		this.velocity.set( 0, 0, 0 );
		this.pitch = - 0.05;
		this._camY = null;

	}

	leaveRemotePeer() {

		const st = this.coop && this.mp ? this.mp.getPeerRenderState( this.coop.peerId ) : null;
		const wasBoat = this.coop?.kind === 'boat';
		if ( st ) {

			const yaw = st.yaw || 0;
			const ox = Math.cos( yaw ) * ( wasBoat ? 2.1 : 1.65 );
			const oz = - Math.sin( yaw ) * ( wasBoat ? 2.1 : 1.65 );
			const tx = st.x + ox;
			const tz = st.z + oz;
			const g = this.groundAt( tx, tz, st.y + 3 );
			this.position.set( tx, Math.max( g, this.waterMean - SWIM_EYE + 0.15 ), tz );

		}

		this.coop = null;
		this.velocity.set( 0, 0, 0 );
		this._camY = null;
		const depth = ( this.waterMean ?? 0 ) - this.groundAt( this.position.x, this.position.z, this.position.y + 3 );
		this.mode = depth > SWIM_DEPTH ? 'swim' : 'walk';

	}

	updateCoop( dt ) {

		const c = this.coop;
		const st = c && this.mp ? this.mp.getPeerRenderState( c.peerId ) : null;
		const validTarget = st && ( ( c.kind === 'boat' && st.mode === 'boat' ) || ( c.kind === 'buggy' && st.mode === 'vehicle' && st.vehId === 'buggy' ) );
		if ( ! validTarget ) {

			this.leaveRemotePeer();
			return;

		}

		const inp = this.input;
		const look = inp.consumeLook();
		c.localYaw -= look.x * 0.0022;
		this.pitch = THREE.MathUtils.clamp( this.pitch - look.y * 0.0022, - 1.45, 1.45 );

		if ( c.kind === 'boat' ) {

			const sy = Math.sin( c.localYaw ), cy = Math.cos( c.localYaw );
			_fwd.set( sy, 0, cy );
			_right.set( - cy, 0, sy );
			_wish.set( 0, 0, 0 );
			const move = inp.getMoveAxes();
			_wish.addScaledVector( _fwd, move.y );
			_wish.addScaledVector( _right, move.x );
			if ( _wish.lengthSq() > 1e-4 ) {

				_wish.normalize().multiplyScalar( ( inp.down( 'ShiftLeft' ) ? 2.4 : 1.5 ) * dt );
				c.localPos.x = THREE.MathUtils.clamp( c.localPos.x + _wish.x, - 0.88, 0.88 );
				c.localPos.z = THREE.MathUtils.clamp( c.localPos.z + _wish.z, - 2.75, 0.12 );

			}

		}

		const pyaw = st.yaw || 0;
		const cy = Math.cos( pyaw ), sy = Math.sin( pyaw );
		const wx = st.x + c.localPos.x * cy + c.localPos.z * sy;
		const wy = st.y + c.localPos.y;
		const wz = st.z - c.localPos.x * sy + c.localPos.z * cy;
		this.position.set( wx, wy, wz );
		this.yaw = pyaw + Math.PI + c.localYaw;

		const eyeY = wy + ( c.kind === 'buggy' ? 0.54 : EYE );
		this.camera.position.set( wx, eyeY, wz );
		this._camY = eyeY;
		this.camera.quaternion.setFromEuler( _e.set( this.pitch, this.yaw, 0 ) );

		if ( ! this.busy ) {

			this.prompt = { key: 'X', text: c.kind === 'boat' ? 'Leave friend\'s boat' : 'Leave friend\'s buggy' };
			if ( inp.hit( 'KeyX' ) || inp.hit( 'KeyE' ) ) {

				this.leaveRemotePeer();
				return;

			}

		}

	}

	// ------------------------------------------------------------------ land vehicles

	addCameraShake( amount = 0.2 ) {

		this._camShake = Math.min( 0.5, Math.max( this._camShake, Number( amount ) || 0 ) );

	}

	clearVehicleFov() {

		if ( this.vehFovDelta !== 0 ) {

			this.camera.fov -= this.vehFovDelta;
			this.vehFovDelta = 0;
			this.camera.updateProjectionMatrix();

		}

	}

	mountVehicle( vh ) {

		if ( ! vh ) return;
		this.activeVehicle = vh;
		vh.mount();
		this.mode = 'vehicle';
		this.velocity.set( 0, 0, 0 );
		this.vehHeadYaw = 0;
		this.vehHeadPitch = - 0.05;
		this.vehOrbitYaw = vh.getYaw() + Math.PI;
		this.vehOrbitPitch = 0.22;
		this.vehOrbitDist = vh.kind === 'buggy' ? 6.0 : 4.6;
		this.vehCamInit = false;
		this._camY = null;
		if ( vh.model && vh.model.setRiderVisible ) vh.model.setRiderVisible( vh.showRider && this.camMode !== 'first' );

	}

	dismountVehicle() {

		const vh = this.activeVehicle;
		if ( ! vh ) {

			this.mode = 'walk';
			this.clearVehicleFov();
			return;

		}

		let chosen = null;
		for ( const off of vh.dismountOffsets || [] ) {

			vh.toWorld( off, _v );
			const g = this.groundAt( _v.x, _v.z, vh.position.y + 2.0 );
			_v2.set( _v.x, g, _v.z );
			const blocked = this.colliders && this.colliders.resolveCapsule( _v2, RADIUS, HEIGHT, 0.35 )
				&& Math.hypot( _v2.x - _v.x, _v2.z - _v.z ) > 0.35;
			if ( ! blocked && Math.abs( g - vh.position.y ) < 1.8 ) {

				chosen = { x: _v2.x, y: g, z: _v2.z };
				break;

			}

		}

		if ( ! chosen ) {

			const g = this.groundAt( vh.position.x + 0.9, vh.position.z, vh.position.y + 2.0 );
			chosen = { x: vh.position.x + 0.9, y: g, z: vh.position.z };

		}

		this.position.set( chosen.x, chosen.y, chosen.z );
		this.velocity.set( 0, 0, 0 );
		this.yaw = vh.getYaw() + Math.PI;
		this.pitch = - 0.05;
		this._camY = null;

		const depth = this.waterMean - chosen.y;
		if ( depth > SWIM_DEPTH ) {

			this.mode = 'swim';
			this.position.y = Math.max( chosen.y, this.waterH - SWIM_EYE + 0.1 );

		} else {

			this.mode = 'walk';

		}

		vh.dismount();
		if ( vh.model && vh.model.setRiderVisible ) vh.model.setRiderVisible( false );
		this.activeVehicle = null;
		this.clearVehicleFov();

	}

	updateVehicle( dt ) {

		const inp = this.input;
		const vh = this.activeVehicle;
		if ( ! vh ) {

			this.dismountVehicle();
			return;

		}

		const look = inp.consumeLook();
		const wheel = inp.consumeWheel();
		if ( Math.abs( look.x ) > 0.5 || Math.abs( look.y ) > 0.5 ) this._vehLookHoldT = 1.8;
		else this._vehLookHoldT = Math.max( 0, this._vehLookHoldT - dt );

		if ( inp.hit( 'KeyV' ) ) {

			this.camMode = this.camMode === 'first' ? 'third' : 'first';
			this.vehCamInit = false;
			if ( this.camMode === 'third' ) this.vehOrbitYaw = vh.getYaw() + Math.PI;
			inp.resetLook?.();

		}
		if ( inp.hit( 'KeyE' ) ) {

			this.dismountVehicle();
			return;

		}

		if ( inp.hit( 'KeyR' ) ) vh.resetUpright();
		if ( inp.hit( 'KeyG' ) && this.audio && this.audio.vehicleHorn ) this.audio.vehicleHorn( vh.kind );

		vh.setInput( inp.getVehicleControls(), dt );

		if ( vh.model && vh.model.setRiderVisible ) vh.model.setRiderVisible( vh.showRider && this.camMode !== 'first' );
		this.position.copy( vh.position );

		this.prompt = vh.waterStalled
			? { key: 'R', text: vh.kind === 'motorcycle' ? 'Recover bike   ·   E  dismount' : 'Recover vehicle   ·   E  dismount' }
			: { key: 'E', text: 'Dismount   ·   V  camera   ·   L  light' };

		// Subtle speed FOV boost cleanly applied as delta so UI FOV slider remains intact
		const wantBoost = THREE.MathUtils.clamp( vh.speed / 24, 0, 1 ) * 7.0;
		const nextDelta = this.vehFovDelta + ( wantBoost - this.vehFovDelta ) * ( 1 - Math.exp( - dt * 6 ) );
		if ( Math.abs( nextDelta - this.vehFovDelta ) > 0.01 ) {

			this.camera.fov += nextDelta - this.vehFovDelta;
			this.vehFovDelta = nextDelta;
			this.camera.updateProjectionMatrix();

		}

		const shakeY = this._camShake > 0 ? Math.sin( this._camShake * 38 ) * this._camShake * 0.28 : 0;
		if ( this._camShake > 0 ) this._camShake = Math.max( 0, this._camShake - dt * 1.4 );

		if ( this.camMode === 'first' ) {

			this.vehHeadYaw = THREE.MathUtils.clamp( this.vehHeadYaw - look.x * 0.0022, - 2.1, 2.1 );
			this.vehHeadPitch = THREE.MathUtils.clamp( this.vehHeadPitch - look.y * 0.0022, - 1.0, 0.95 );
			if ( vh.speed > 4 && this._vehLookHoldT <= 0 ) this.vehHeadYaw *= Math.exp( - dt * 1.4 );

			vh.toWorld( vh.seatEyeLocal, _v );
			this.camera.position.copy( _v );
			this.camera.position.y += shakeY;

			_qa.setFromAxisAngle( _yAxis, vh.getYaw() + Math.PI );
			_qb.copy( vh.quaternion ).multiply( _qc.setFromAxisAngle( _yAxis, Math.PI ) );
			const base = _q.slerpQuaternions( _qb, _qa, 0.55 );
			const localLook = _qc.setFromEuler( _e.set( this.vehHeadPitch, this.vehHeadYaw, 0 ) );
			this.camera.quaternion.copy( base ).multiply( localLook );

		} else {

			this.vehOrbitYaw -= look.x * 0.003;
			this.vehOrbitPitch = THREE.MathUtils.clamp( this.vehOrbitPitch + look.y * 0.003, - 0.04, 1.15 );
			const [ dMin, dMax ] = vh.camDistRange || [ 2.8, 9.2 ];
			this.vehOrbitDist = THREE.MathUtils.clamp( this.vehOrbitDist * ( 1 + wheel * 0.08 ), dMin, dMax );

			if ( vh.speed > 2.2 && this._vehLookHoldT <= 0 ) {

				const behind = vh.getYaw() + Math.PI;
				let d = behind - this.vehOrbitYaw;
				d = Math.atan2( Math.sin( d ), Math.cos( d ) );
				this.vehOrbitYaw += d * ( 1 - Math.exp( - dt * 2.2 ) );

			}

			const target = vh.toWorld( vh.camTargetLocal, _v );
			const off = _v2.set(
				Math.sin( this.vehOrbitYaw ) * Math.cos( this.vehOrbitPitch ),
				Math.sin( this.vehOrbitPitch ),
				Math.cos( this.vehOrbitYaw ) * Math.cos( this.vehOrbitPitch )
			);

			let dist = this.vehOrbitDist;
			if ( this.colliders ) {

				const hitD = this.colliders.raycast( target, off, dist + 0.35 );
				if ( hitD < dist ) dist = Math.max( 1.2, hitD - 0.35 );

			}

			const want = target.clone().addScaledVector( off, dist );
			const groundCap = Math.max( this.groundAt( want.x, want.z, want.y + 4 ), this.waterH ) + 0.55;
			if ( want.y < groundCap ) want.y = groundCap;

			if ( ! this.vehCamInit ) {

				this.vehCamPos.copy( want );
				this.vehCamInit = true;

			}

			this.vehCamPos.lerp( want, 1 - Math.exp( - dt * 11 ) );
			this.camera.position.copy( this.vehCamPos );
			this.camera.position.y += shakeY;
			this.camera.lookAt( target );

		}

	}

}
