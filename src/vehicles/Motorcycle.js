import { MathUtils, Quaternion, Vector3 } from '../engine/index.js';
import { G } from '../engine/render/Frame.js';
import { WORLD } from '../world/WorldLayout.js';
import { Vehicle } from './Vehicle.js';

const GRAV = 9.81;
const clamp = MathUtils.clamp;
const lerp = MathUtils.lerp;

const WHEELBASE = 1.42;
const HALF_WB = WHEELBASE * 0.5;
const FRONT_RADIUS = 0.335;
const REAR_RADIUS = 0.325;
const GEAR_THRESHOLDS = [ 5.8, 10.8, 16.0, 21.5, 29.0 ]; // m/s upshift bands for 1..5

const SURFACE_PROPS = {
	path: { grip: 1.0, accel: 1.0, drag: 0.016, brake: 1.0 },
	wood: { grip: 0.92, accel: 0.95, drag: 0.018, brake: 0.94 },
	grass: { grip: 0.85, accel: 0.90, drag: 0.032, brake: 0.88 },
	sand: { grip: 0.68, accel: 0.78, drag: 0.072, brake: 0.72 },
	rock: { grip: 0.88, accel: 0.92, drag: 0.025, brake: 0.90 },
	water: { grip: 0.48, accel: 0.52, drag: 0.32, brake: 0.55 },
};

// Module-level scratch objects (120 Hz step loop: zero per-step allocations)
const _yAxis = new Vector3( 0, 1, 0 );
const _xAxis = new Vector3( 1, 0, 0 );
const _zAxis = new Vector3( 0, 0, 1 );
const _qYaw = new Quaternion();
const _qPitch = new Quaternion();
const _qRoll = new Quaternion();
const _probe = new Vector3();

// Realistic + fun Coastal Scrambler motorcycle physics and state controller.
export class Motorcycle extends Vehicle {

	constructor( {
		id = 'motorcycle',
		name = 'Motorcycle',
		model = null,
		terrain = null,
		colliders = null,
		query = null,
		spawn = WORLD.vehicleSpawns?.motorcycle,
	} = {} ) {

		super( { id, name, kind: 'motorcycle', model, terrain, colliders, query, spawn } );

		this.mountRadius = 2.6;
		this.colliderRadius = 0.52;
		this.seatEyeLocal.set( 0, 1.38, - 0.14 );
		this.camTargetLocal.set( 0, 1.08, 0.12 );
		this.camDistRange = [ 2.8, 9.2 ];
		this.dismountOffsets = [
			new Vector3( 0.95, 0, - 0.12 ),
			new Vector3( - 0.95, 0, - 0.12 ),
			new Vector3( 0, 0, - 1.4 ),
		];

		// Tunable handling settings (bound to UI)
		this.topSpeedKmh = 84;
		this.handlingPreset = 'realistic'; // 'realistic' | 'arcade'
		this.showRider = true;

		// Pose & dynamic state
		this.yaw = this.spawnHeading;
		this.pitch = 0;
		this.roll = - 0.13; // ~7.5 deg lean left onto kickstand when parked
		this.yawRate = 0;
		this.steerAngle = 0;
		this.frontComp = 0;
		this.rearComp = 0;
		this.dynPitch = 0;
		this.frontSpin = 0;
		this.rearSpin = 0;
		this.kickstand = 1; // 1 = down, 0 = tucked
		this.riderTuck = 0;
		this.waterDepth = 0;
		this.surfaceGrip = 1;

		// Tire contact world positions for VehicleFX
		this.frontWheelWorld = new Vector3();
		this.rearWheelWorld = new Vector3();

		// Events wired by App / SoundScape
		this.onLand = null;
		this.onJumpLand = null;
		this.onShiftPop = null;
		this.onSplash = null;

		this._acc = 0;
		this._prevGear = 1;
		this._wasHighThrottle = false;
		this._splashCooldown = 0;
		this._airTime = 0;
		this._airStartX = 0;
		this._airStartZ = 0;

		this._placeOnGround( this.position.x, this.position.z, this.spawnHeading );
		this._syncModel();

	}

	_groundAt( x, z, maxY ) {

		let g = this.terrain ? this.terrain.heightAt( x, z ) : 0;
		if ( this.colliders ) {

			const c = this.colliders.groundHeightAt( x, z, maxY, 0.22 );
			if ( c > g ) g = c;

		}

		return g;

	}

	_detectSurface( x, z, groundY, waterY ) {

		const waterDepth = waterY - groundY;
		if ( waterDepth > 0.04 ) return { surface: 'water', waterDepth };

		if ( this.colliders && this.terrain ) {

			const c = this.colliders.groundHeightAt( x, z, groundY + 0.25, 0.22 );
			if ( c > this.terrain.heightAt( x, z ) + 0.05 ) return { surface: 'wood', waterDepth: 0 };

		}

		const t = this.terrain;
		if ( t ) {

			if ( typeof t.pathDistance === 'function' && t.pathDistance( x, z ) < 0.4 ) {

				return { surface: 'path', waterDepth: 0 };

			}

			if ( t.heights && t.res && t.texel ) {

				const fx = clamp( ( x - t.origin ) / t.texel - 0.5, 0, t.res - 1 );
				const fz = clamp( ( z - t.origin ) / t.texel - 0.5, 0, t.res - 1 );
				const idx = Math.round( fz ) * t.res + Math.round( fx );
				if ( t.rock && t.rock[ idx ] > 0.46 ) return { surface: 'rock', waterDepth: 0 };
				if ( t.sand && t.sand[ idx ] > 120 ) return { surface: 'sand', waterDepth: 0 };

			}

			if ( groundY < 1.8 ) return { surface: 'sand', waterDepth: 0 };

		}

		return { surface: 'grass', waterDepth: 0 };

	}

	_placeOnGround( x, z, yaw ) {

		this.yaw = yaw;
		const fx = Math.sin( yaw );
		const fz = Math.cos( yaw );
		const maxProbe = 60;
		const gMid = this._groundAt( x, z, maxProbe );
		const gFront = this._groundAt( x + fx * HALF_WB, z + fz * HALF_WB, maxProbe );
		const gRear = this._groundAt( x - fx * HALF_WB, z - fz * HALF_WB, maxProbe );
		this.position.set( x, Math.max( gMid, ( gFront + gRear ) * 0.5 ), z );
		this.pitch = clamp( - Math.atan2( gFront - gRear, WHEELBASE ), - 0.6, 0.6 );
		this.roll = this.occupied ? 0 : - 0.13;
		this.airborne = false;
		this._airTime = 0;
		this.velocity.set( 0, 0, 0 );
		this._composePose();
		this.frontWheelWorld.set( x + fx * HALF_WB, gFront + 0.03, z + fz * HALF_WB );
		this.rearWheelWorld.set( x - fx * HALF_WB, gRear + 0.03, z - fz * HALF_WB );

	}

	_composePose() {

		_qYaw.setFromAxisAngle( _yAxis, this.yaw );
		_qPitch.setFromAxisAngle( _xAxis, this.pitch + this.dynPitch );
		_qRoll.setFromAxisAngle( _zAxis, this.roll );
		this.quaternion.copy( _qYaw ).multiply( _qPitch ).multiply( _qRoll );

	}

	mount() {

		super.mount();
		this.airborne = false;

	}

	dismount() {

		super.dismount();
		this.brakeLight = false;
		if ( ! this.occupied && this.speed < 0.8 ) this.rpm = 0;

	}

	resetUpright() {

		// If stalled or stuck in deep water, find nearest dry spot moving shoreward/inland or fall back to spawn
		if ( this.waterStalled || this.waterDepth > 0.55 ) {

			let found = false;
			if ( this.terrain ) {

				for ( let rad = 2; rad <= 40 && ! found; rad += 2.5 ) {

					for ( let a = 0; a < 12; a ++ ) {

						const ang = ( a / 12 ) * Math.PI * 2;
						const tx = this.position.x + Math.cos( ang ) * rad;
						const tz = this.position.z + Math.sin( ang ) * rad;
						const h = this.terrain.heightAt( tx, tz );
						if ( h > 0.45 && h < 120 ) {

							this.teleportTo( tx, tz, this.yaw );
							found = true;
							break;

						}

					}

				}

			}

			if ( ! found ) {

				this.teleportTo( this.spawnPosition.x, this.spawnPosition.z, this.spawnHeading );

			}

			return true;

		}

		const g = this._groundAt( this.position.x, this.position.z, this.position.y + 4 );
		this.position.y = Math.max( this.position.y, g ) + 0.12;
		this.velocity.set( 0, 0, 0 );
		this.yawRate = 0;
		this.steerAngle = 0;
		this.roll = this.occupied ? 0 : - 0.13;
		this.dynPitch = 0;
		this.waterStalled = false;
		this._composePose();
		this._syncModel();
		return true;

	}

	teleportTo( x, z, yaw = this.yaw ) {

		this.velocity.set( 0, 0, 0 );
		this.yawRate = 0;
		this.steerAngle = 0;
		this.frontComp = 0;
		this.rearComp = 0;
		this.dynPitch = 0;
		this.driftAmount = 0;
		this.waterStalled = false;
		this.waterDepth = 0;
		this._placeOnGround( x, z, yaw );
		this._syncModel();

	}

	update( dt ) {

		const clampedDt = Math.min( Math.max( dt, 0 ), 0.1 );
		if ( this._splashCooldown > 0 ) this._splashCooldown -= clampedDt;
		this.updateHeadlightAuto();

		// Smooth input shaping
		const kIn = 1 - Math.exp( - clampedDt * 14 );
		const targetThr = this.occupied && ! this.waterStalled ? clamp( this._input.throttle, 0, 1 ) : 0;
		const targetBrk = this.occupied ? clamp( this._input.brake, 0, 1 ) : 0;
		const targetStr = this.occupied ? clamp( this._input.steer, - 1, 1 ) : 0;
		this.throttle = lerp( this.throttle, targetThr, kIn );
		this.brake = lerp( this.brake, targetBrk, kIn );
		this.steer = lerp( this.steer, targetStr, kIn );
		this.handbrake = this.occupied && !! this._input.handbrake;
		this.boost = this.occupied && !! this._input.boost && this.throttle > 0.25 && ! this.waterStalled;
		this.brakeLight = this.occupied && ( this.brake > 0.12 || this.handbrake ) && ! this.waterStalled;

		const h = 1 / 120;
		this._acc += clampedDt;
		let steps = 0;
		while ( this._acc >= h && steps < 10 ) {

			this._step( h );
			this._acc -= h;
			steps ++;

		}

		// Kickstand folds cleanly when occupied or rolling
		const wantStand = this.occupied || this.speed > 0.6 ? 0 : 1;
		this.kickstand += ( wantStand - this.kickstand ) * ( 1 - Math.exp( - clampedDt * 12 ) );
		this.riderTuck += ( ( this.boost ? 1 : 0 ) - this.riderTuck ) * ( 1 - Math.exp( - clampedDt * 8 ) );

		this._syncModel();

	}

	_step( dt ) {

		const seaLevel = G && G.seaLevel ? G.seaLevel.value : 0;
		const wetness = G && G.weather ? G.weather.value.y : 0;
		const arcade = this.handlingPreset === 'arcade';

		const fx = Math.sin( this.yaw );
		const fz = Math.cos( this.yaw );
		// Local +X is left/port
		const lx = fz;
		const lz = - fx;

		// Horizontal velocities in bike frame
		let vFwd = this.velocity.x * fx + this.velocity.z * fz;
		let vSide = this.velocity.x * lx + this.velocity.z * lz;

		// Ground probes for front/rear wheels and mid frame
		const maxProbe = this.position.y + 1.4;
		const fwx = this.position.x + fx * HALF_WB;
		const fwz = this.position.z + fz * HALF_WB;
		const rwx = this.position.x - fx * HALF_WB;
		const rwz = this.position.z - fz * HALF_WB;

		const gMid = this._groundAt( this.position.x, this.position.z, maxProbe );
		const gFront = this._groundAt( fwx, fwz, maxProbe );
		const gRear = this._groundAt( rwx, rwz, maxProbe );
		const groundY = Math.max( gMid - 0.05, ( gFront + gRear ) * 0.5 );
		const prevAirborne = this.airborne;

		// Vertical kinematics & airborne gravity
		if ( this.position.y > groundY + 0.08 ) {

			if ( ! prevAirborne ) {

				this._airTime = 0;
				this._airStartX = this.position.x;
				this._airStartZ = this.position.z;

			}

			this._airTime += dt;
			this.airborne = true;
			this.velocity.y -= GRAV * dt;
			this.position.y += this.velocity.y * dt;

		}

		const nextGroundMid = Math.max( gMid, groundY );
		if ( this.position.y <= groundY + 0.08 ) {

			const impact = clamp( - this.velocity.y / 9, 0.2, 1 );
			if ( prevAirborne && this.velocity.y < - 1.2 ) {

				this.frontComp = Math.min( 0.16, this.frontComp + impact * 0.14 );
				this.rearComp = Math.min( 0.16, this.rearComp + impact * 0.14 );
				if ( this.onLand ) this.onLand( impact );

			}

			if ( prevAirborne && this._airTime >= 0.60 ) {

				const dist = Math.hypot( this.position.x - this._airStartX, this.position.z - this._airStartZ );
				if ( dist >= 3.0 && this.onJumpLand ) this.onJumpLand( { airTime: this._airTime, distance: dist, impact } );

			}

			this._airTime = 0;
			this.airborne = false;
			if ( this.velocity.y < 0 ) this.velocity.y = 0;
			const snapK = 1 - Math.exp( - dt * 26 );
			this.position.y += ( groundY - this.position.y ) * snapK;

		} else if ( this.position.y < nextGroundMid - 0.3 ) {

			this.position.y = nextGroundMid;
			this.velocity.y = 0;
			this.airborne = false;

		}

		// Surface + water check
		const surfInfo = this._detectSurface( this.position.x, this.position.z, groundY, seaLevel );
		this.surface = surfInfo.surface;
		this.waterDepth = surfInfo.waterDepth;
		const sp = SURFACE_PROPS[ this.surface ] || SURFACE_PROPS.grass;

		const u = this.upgrades || {};
		const stallDepth = 0.65 + ( u.wadeDepthBonus || 0 );
		if ( this.waterDepth > stallDepth ) {

			this.waterStalled = true;

		}

		if ( this.waterDepth > 0.08 && Math.abs( vFwd ) > 4.2 && this._splashCooldown <= 0 ) {

			this._splashCooldown = 0.25;
			if ( this.onSplash ) this.onSplash( clamp( Math.abs( vFwd ) / 15, 0.2, 0.8 ), this.position );

		}

		const wetBonus = u.wetGripBonus || 0;
		const wetGripScale = arcade
			? ( 1 - Math.max( 0.02, 0.12 - wetBonus ) * wetness )
			: ( 1 - Math.max( 0.06, 0.30 - wetBonus ) * wetness );
		const grip = clamp( sp.grip * ( u.gripMul || 1 ) * wetGripScale, 0.32, 1.35 );
		this.surfaceGrip = grip;

		// Max speed & transmission
		const maxMs = clamp( this.topSpeedKmh + ( u.speedBonusKmh || 0 ), 50, 150 ) / 3.6 * ( this.boost ? 1.16 : 1.0 );
		const absFwd = Math.abs( vFwd );

		let driveAcc = 0;
		let reverseMode = false;

		if ( ! this.occupied || this.waterStalled ) {

			this.gear = this.speed > 0.4 ? 'N' : 'N';
			this.rpm += ( 0 - this.rpm ) * ( 1 - Math.exp( - dt * 4 ) );
			if ( ! this.airborne ) {

				const rollBrake = this.occupied ? 1.8 : 4.2;
				const dec = Math.min( Math.abs( vFwd ), ( rollBrake + sp.drag * absFwd ) * dt );
				vFwd -= Math.sign( vFwd ) * dec;

			}

		} else {

			// Determine gear and longitudinal acceleration
			const gearScale = maxMs / GEAR_THRESHOLDS[ 4 ];
			let targetGear = 1;
			for ( let i = 0; i < 4; i ++ ) {

				if ( vFwd > GEAR_THRESHOLDS[ i ] * gearScale ) targetGear = i + 2;

			}

			if ( vFwd <= 0.45 && this.brake > 0.15 && this.throttle < 0.1 ) {

				// Slow walk-back / paddle reverse
				reverseMode = true;
				this.gear = 'R';
				driveAcc = - 2.4 * this.brake;
				if ( vFwd < - 1.4 ) driveAcc = 0;

			} else if ( this.speed < 0.25 && this.throttle < 0.06 ) {

				this.gear = 'N';

			} else {

				this.gear = String( targetGear );

			}

			// Fire shift/decel pop audio callback cleanly
			if ( ! reverseMode ) {

				const gNum = this.gear === 'N' ? 1 : Number( this.gear );
				if ( gNum > this._prevGear && this.rpm > 0.65 && this.onShiftPop ) {

					this.onShiftPop( 0.7 );

				} else if ( this._wasHighThrottle && this.throttle < 0.12 && this.rpm > 0.68 && this.onShiftPop ) {

					this.onShiftPop( 1.0 );

				}

				this._prevGear = gNum;
				this._wasHighThrottle = this.throttle > 0.65;

			}

			// Engine RPM response
			const gearMin = targetGear === 1 ? 0 : GEAR_THRESHOLDS[ targetGear - 2 ] * gearScale * 0.78;
			const gearMax = GEAR_THRESHOLDS[ targetGear - 1 ] * gearScale;
			const band = clamp( ( Math.max( 0, vFwd ) - gearMin ) / Math.max( 1.0, gearMax - gearMin ), 0, 1 );
			const idleRpm = 0.18 + 0.06 * this.throttle;
			const wheelRpm = reverseMode ? 0.26 : lerp( 0.28, 0.96, band ) + this.driftAmount * 0.14;
			const wantRpm = clamp( Math.max( idleRpm, wheelRpm + this.throttle * 0.12 ), 0.16, 1 );
			const rpmTau = wantRpm > this.rpm ? 0.22 : 0.48;
			this.rpm += ( wantRpm - this.rpm ) * ( 1 - Math.exp( - dt / rpmTau ) );

			if ( ! this.airborne && ! reverseMode ) {

				if ( this.throttle > 0.02 ) {

					const topFade = clamp( 1 - Math.pow( clamp( vFwd / maxMs, 0, 1.15 ), 2.6 ), 0, 1 );
					const torqueMul = ( arcade ? 1.25 : 1.0 ) * ( this.boost ? 1.18 : 1.0 ) * ( u.powerMul || 1 ) * lerp( 1.25, 0.62, ( targetGear - 1 ) / 4 );
					driveAcc += this.throttle * 9.8 * torqueMul * sp.accel * topFade;

				}

				if ( this.brake > 0.02 ) {

					const brkDecel = 14.5 * sp.brake * lerp( 0.76, 1.0, grip ) * ( arcade ? 1.15 : 1.0 );
					if ( vFwd > 0.15 ) driveAcc -= this.brake * brkDecel;
					else if ( vFwd < - 0.1 ) driveAcc += this.brake * brkDecel;

				}

				if ( this.handbrake && absFwd > 0.2 ) {

					driveAcc -= Math.sign( vFwd ) * 7.8 * sp.brake;

				}

				// Engine braking + surface rolling drag + aerodynamic drag
				const engineDrag = this.throttle < 0.05 ? 1.2 : 0.2;
				const surfDrag = this.surface === 'sand' ? sp.drag * ( u.sandDragMul || 1 ) : sp.drag;
				driveAcc -= Math.sign( vFwd ) * ( engineDrag * ( absFwd > 0.2 ? 1 : 0 ) + surfDrag * absFwd + 0.0085 * absFwd * absFwd );

				// Slope gravity component (mitigated by upgraded suspension & low-range gearing)
				const slopeSin = clamp( ( gFront - gRear ) / WHEELBASE, - 0.65, 0.65 );
				const slopeFactor = ( arcade ? 0.45 : 0.82 ) / ( u.climbMul || 1 );
				driveAcc -= GRAV * slopeSin * slopeFactor;

			}

			vFwd += driveAcc * dt;
			if ( ! this.airborne && this.throttle < 0.02 && ! reverseMode && absFwd < 0.15 ) vFwd = 0;
			if ( reverseMode && vFwd < - 1.45 ) vFwd = - 1.45;
			if ( vFwd > maxMs * 1.05 ) vFwd = maxMs * 1.05;

		}

		// Steering & yaw dynamics (active even while coasting after dismount? decay steer cleanly)
		const maxSteerAtSpeed = clamp( 0.58 / ( 1 + absFwd * 0.13 ), 0.11, 0.56 );
		const wantSteer = this.steer * maxSteerAtSpeed;
		this.steerAngle += ( wantSteer - this.steerAngle ) * ( 1 - Math.exp( - dt * 11 ) );

		if ( ! this.airborne ) {

			// Handbrake / sand lowers lateral stability for flat-track powerslides
			const driftActive = this.occupied && this.handbrake && absFwd > 3.2;
			const turnBoost = driftActive ? 1.42 : 1.0;
			const steerGain = arcade ? 1.15 : 1.0;
			const targetYawRate = ( vFwd / WHEELBASE ) * Math.tan( this.steerAngle ) * turnBoost * steerGain * lerp( 0.65, 1.0, grip );
			const yawResp = driftActive ? 6.5 : 10.5;
			this.yawRate += ( targetYawRate - this.yawRate ) * ( 1 - Math.exp( - dt * yawResp ) );
			this.yaw += this.yawRate * dt;

			// Lateral traction opposes sideslip velocity; centrifugal outward slip pushes opposite to turn (+yawRate -> -X)
			const latDampBase = driftActive ? 2.4 : ( 9.5 * grip );
			const slipFactor = driftActive ? 0.92 : ( 1.0 - grip ) * 0.45 + 0.05;
			vSide -= vFwd * this.yawRate * slipFactor * dt;
			vSide *= Math.exp( - latDampBase * dt );

			this.driftAmount = clamp( ( Math.abs( vSide ) / Math.max( 3.0, absFwd ) ) * 1.8 + ( driftActive ? 0.35 : 0 ), 0, 1 );

		} else {

			// Slight mid-air gyro control
			this.yaw += this.steer * 0.5 * dt;
			this.driftAmount *= Math.exp( - dt * 6 );

		}

		// Reconstruct world XZ velocity from updated heading & bike-frame components
		const nfx = Math.sin( this.yaw );
		const nfz = Math.cos( this.yaw );
		const nlx = nfz;
		const nlz = - nfx;
		this.velocity.x = nfx * vFwd + nlx * vSide;
		this.velocity.z = nfz * vFwd + nlz * vSide;

		// Water deep drag
		if ( this.waterDepth > 0.25 ) {

			const wd = Math.exp( - dt * this.waterDepth * 3.2 );
			this.velocity.x *= wd;
			this.velocity.z *= wd;

		}

		// Integrate horizontal position & resolve solid obstacles
		const preX = this.position.x;
		const preZ = this.position.z;
		this.position.x += this.velocity.x * dt;
		this.position.z += this.velocity.z * dt;

		// Keep safely inside world bounds
		this.position.x = clamp( this.position.x, - 920, 920 );
		this.position.z = clamp( this.position.z, - 920, 920 );

		if ( this.colliders ) {

			const cx = this.position.x;
			const cz = this.position.z;
			if ( this.colliders.resolveCapsule( this.position, this.colliderRadius, 1.45, 0.45 ) ) {

				const dx = this.position.x - cx;
				const dz = this.position.z - cz;
				const len = Math.hypot( dx, dz );
				if ( len > 1e-6 ) {

					const nx = dx / len;
					const nz = dz / len;
					const vn = this.velocity.x * nx + this.velocity.z * nz;
					if ( vn < 0 ) {

						this.velocity.x -= 1.08 * vn * nx;
						this.velocity.z -= 1.08 * vn * nz;
						this.velocity.x *= 0.88;
						this.velocity.z *= 0.88;

					}

				}

			}

		}

		// Update speed telemetry from actual XZ motion
		const dxStep = this.position.x - preX;
		const dzStep = this.position.z - preZ;
		this.speed = Math.hypot( this.velocity.x, this.velocity.z );
		this.forwardSpeed = this.velocity.x * nfx + this.velocity.z * nfz;

		// Lean/roll angle (recall: +Z roll < 0 leans LEFT toward +X)
		let targetRoll;
		if ( ! this.occupied && this.speed < 0.8 ) {

			targetRoll = - 0.13; // leaned onto left kickstand

		} else {

			// Centripetal balance: lean inward into yawRate (left turn +yawRate => negative Z roll)
			const latAccel = clamp( vFwd * this.yawRate, - 11.5, 11.5 );
			targetRoll = - clamp( Math.atan( latAccel / GRAV ) * 0.95, - 0.58, 0.58 );

		}

		this.roll += ( targetRoll - this.roll ) * ( 1 - Math.exp( - dt * 8.5 ) );

		// Terrain slope pitch & dynamic dive/squat + suspension settle
		const targetPitch = this.airborne
			? clamp( - this.velocity.y * 0.055, - 0.35, 0.45 )
			: clamp( - Math.atan2( gFront - gRear, WHEELBASE ), - 0.58, 0.58 );
		this.pitch += ( targetPitch - this.pitch ) * ( 1 - Math.exp( - dt * 16 ) );

		const diveTarget = this.airborne ? 0 : clamp( ( - driveAcc * 0.0085 ), - 0.055, 0.075 );
		this.dynPitch += ( diveTarget - this.dynPitch ) * ( 1 - Math.exp( - dt * 11 ) );

		const fCompTarget = this.airborne ? - 0.04 : clamp( Math.max( 0, - driveAcc ) * 0.009, 0, 0.14 );
		const rCompTarget = this.airborne ? - 0.04 : clamp( Math.max( 0, driveAcc ) * 0.009, 0, 0.14 );
		this.frontComp += ( fCompTarget - this.frontComp ) * ( 1 - Math.exp( - dt * 14 ) );
		this.rearComp += ( rCompTarget - this.rearComp ) * ( 1 - Math.exp( - dt * 14 ) );

		// Wheel spin
		const wheelAdvance = ( dxStep * nfx + dzStep * nfz ) || ( this.forwardSpeed * dt );
		this.frontSpin += wheelAdvance / FRONT_RADIUS;
		const rearSlipSpin = this.occupied && this.throttle > 0.3 && ( this.surface === 'sand' || this.handbrake ) ? this.throttle * 6.5 * dt : 0;
		this.rearSpin += wheelAdvance / REAR_RADIUS + rearSlipSpin;

		this._composePose();

		// Update world contact patches for VehicleFX
		this.frontWheelWorld.set( fwx, gFront + 0.03, fwz );
		this.rearWheelWorld.set( rwx, gRear + 0.03, rwz );

	}

	_syncModel() {

		if ( ! this.model ) return;
		this.model.group.position.copy( this.position );
		this.model.group.quaternion.copy( this.quaternion );
		this.model.setState( {
			steerAngle: this.steerAngle,
			frontSpin: this.frontSpin,
			rearSpin: this.rearSpin,
			frontComp: this.frontComp,
			rearComp: this.rearComp,
			kickstand: this.kickstand,
			occupied: this.occupied,
			showRider: this.showRider,
			riderTuck: this.riderTuck,
			leanRoll: this.roll,
			headlightOn: this.headlightActive,
			ledBoost: ( this.upgrades?.lightMul || 1 ) > 1.2,
			brakeLight: this.brakeLight,
			runningLight: this.occupied && ! this.waterStalled,
			speedKmh: this.speed * 3.6,
			rpm: this.rpm,
			night: G && G.night ? G.night.value : 0,
			rain: G && G.weather ? G.weather.value.x : 0,
			storm: G && G.weather ? G.weather.value.z : 0,
		} );

	}

}
