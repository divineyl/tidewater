import { MathUtils, Quaternion, Vector3 } from '../engine/index.js';
import { G } from '../engine/render/Frame.js';
import { WORLD } from '../world/WorldLayout.js';
import { Vehicle } from './Vehicle.js';

const GRAV = 9.81;
const clamp = MathUtils.clamp;
const lerp = MathUtils.lerp;

const WHEELBASE = 2.38;
const HALF_WB = WHEELBASE * 0.5;
const HALF_TRACK = 0.78;
const WHEEL_RADIUS = 0.42;
const GEAR_THRESHOLDS = [ 5.4, 9.8, 14.5, 19.8, 25.0 ];

const SURFACE_PROPS = {
	path: { grip: 1.02, accel: 1.0, drag: 0.015, brake: 1.0 },
	wood: { grip: 0.94, accel: 0.96, drag: 0.018, brake: 0.94 },
	grass: { grip: 0.94, accel: 0.96, drag: 0.024, brake: 0.92 },
	sand: { grip: 0.84, accel: 0.90, drag: 0.048, brake: 0.84 },
	rock: { grip: 0.92, accel: 0.94, drag: 0.022, brake: 0.92 },
	water: { grip: 0.56, accel: 0.62, drag: 0.24, brake: 0.62 },
};

const _yAxis = new Vector3( 0, 1, 0 );
const _xAxis = new Vector3( 1, 0, 0 );
const _zAxis = new Vector3( 0, 0, 1 );
const _qYaw = new Quaternion();
const _qPitch = new Quaternion();
const _qRoll = new Quaternion();

// 4-wheel off-road Coastal Buggy physics & telemetry controller.
export class CoastalBuggy extends Vehicle {

	constructor( {
		id = 'buggy',
		name = 'Coastal Buggy',
		model = null,
		terrain = null,
		colliders = null,
		query = null,
		spawn = WORLD.vehicleSpawns?.buggy,
	} = {} ) {

		super( { id, name, kind: 'buggy', model, terrain, colliders, query, spawn } );

		this.mountRadius = 3.1;
		this.colliderRadius = 1.05;
		this.maxRpm = 6400;
		this.seatEyeLocal.set( 0.36, 1.36, - 0.02 );
		this.camTargetLocal.set( 0, 1.18, 0.1 );
		this.camDistRange = [ 3.8, 11.5 ];
		this.dismountOffsets = [
			new Vector3( 1.55, 0, - 0.1 ),
			new Vector3( - 1.55, 0, - 0.1 ),
			new Vector3( 0, 0, - 2.35 ),
		];

		this.topSpeedKmh = 76;
		this.handlingPreset = 'realistic';
		this.showRider = true;

		this.yaw = this.spawnHeading;
		this.pitch = 0;
		this.roll = 0;
		this.yawRate = 0;
		this.steerAngle = 0;
		this.dynPitch = 0;
		this.dynRoll = 0;
		this.wheelSpin = 0;
		this.waterDepth = 0;
		this.surfaceGrip = 1;
		this.comp = [ 0, 0, 0, 0 ];

		// 4 wheel contact points: [FL, FR, RL, RR] + VehicleFX contracts
		this.wheelWorlds = [ new Vector3(), new Vector3(), new Vector3(), new Vector3() ];
		this.rearWheelWorlds = [ this.wheelWorlds[ 2 ], this.wheelWorlds[ 3 ] ];
		this.frontWheelWorld = new Vector3();
		this.rearWheelWorld = new Vector3();

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

			const c = this.colliders.groundHeightAt( x, z, maxY, 0.25 );
			if ( c > g ) g = c;

		}

		return g;

	}

	_detectSurface( x, z, groundY, waterY ) {

		const waterDepth = waterY - groundY;
		if ( waterDepth > 0.04 ) return { surface: 'water', waterDepth };

		if ( this.colliders && this.terrain ) {

			const c = this.colliders.groundHeightAt( x, z, groundY + 0.25, 0.25 );
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

	_probeCorners( x, z, yaw, maxProbe ) {

		const fx = Math.sin( yaw ), fz = Math.cos( yaw );
		const lx = fz, lz = - fx;
		const corners = [
			[ x + fx * HALF_WB + lx * HALF_TRACK, z + fz * HALF_WB + lz * HALF_TRACK ],
			[ x + fx * HALF_WB - lx * HALF_TRACK, z + fz * HALF_WB - lz * HALF_TRACK ],
			[ x - fx * HALF_WB + lx * HALF_TRACK, z - fz * HALF_WB + lz * HALF_TRACK ],
			[ x - fx * HALF_WB - lx * HALF_TRACK, z - fz * HALF_WB - lz * HALF_TRACK ],
		];
		const h = corners.map( ( [ px, pz ] ) => this._groundAt( px, pz, maxProbe ) );
		for ( let i = 0; i < 4; i ++ ) this.wheelWorlds[ i ].set( corners[ i ][ 0 ], h[ i ] + 0.03, corners[ i ][ 1 ] );
		return h;

	}

	_placeOnGround( x, z, yaw ) {

		this.yaw = yaw;
		const h = this._probeCorners( x, z, yaw, 60 );
		const avgH = ( h[ 0 ] + h[ 1 ] + h[ 2 ] + h[ 3 ] ) * 0.25;
		const fAvg = ( h[ 0 ] + h[ 1 ] ) * 0.5, rAvg = ( h[ 2 ] + h[ 3 ] ) * 0.5;
		const lAvg = ( h[ 0 ] + h[ 2 ] ) * 0.5, rightAvg = ( h[ 1 ] + h[ 3 ] ) * 0.5;
		this.position.set( x, avgH, z );
		this.pitch = clamp( - Math.atan2( fAvg - rAvg, WHEELBASE ), - 0.55, 0.55 );
		this.roll = clamp( Math.atan2( lAvg - rightAvg, HALF_TRACK * 2 ), - 0.55, 0.55 );
		this.dynPitch = 0;
		this.dynRoll = 0;
		this.airborne = false;
		this._airTime = 0;
		this.velocity.set( 0, 0, 0 );
		this.speed = 0;
		this.forwardSpeed = 0;
		this._composePose();
		this.frontWheelWorld.copy( this.wheelWorlds[ 0 ] ).lerp( this.wheelWorlds[ 1 ], 0.5 );
		this.rearWheelWorld.copy( this.wheelWorlds[ 2 ] ).lerp( this.wheelWorlds[ 3 ], 0.5 );

	}

	_composePose() {

		_qYaw.setFromAxisAngle( _yAxis, this.yaw );
		_qPitch.setFromAxisAngle( _xAxis, this.pitch );
		_qRoll.setFromAxisAngle( _zAxis, this.roll );
		this.quaternion.copy( _qYaw ).multiply( _qPitch ).multiply( _qRoll );

	}

	dismount() {

		super.dismount();
		this.handbrake = false;

	}

	resetUpright() {

		if ( this.waterStalled ) {

			let sx = this.spawnPosition.x, sz = this.spawnPosition.z, syaw = this.spawnHeading;
			if ( this.terrain ) {

				let bestD = Infinity;
				const probe = new Vector3();
				for ( let i = 0; i < 8; i ++ ) {

					const ang = ( i / 8 ) * Math.PI * 2;
					for ( const rad of [ 6, 12, 20, 32 ] ) {

						const tx = this.position.x + Math.cos( ang ) * rad;
						const tz = this.position.z + Math.sin( ang ) * rad;
						const ty = this.terrain.heightAt( tx, tz );
						if ( ty > 0.6 && ty < 120 ) {

							if ( this.colliders ) {

								probe.set( tx, ty, tz );
								if ( this.colliders.resolveCapsule( probe, this.colliderRadius, 1.7, 0.45 ) && Math.hypot( probe.x - tx, probe.z - tz ) > 0.25 ) continue;

							}

							const d = Math.hypot( tx - this.position.x, tz - this.position.z );
							if ( d < bestD ) { bestD = d; sx = tx; sz = tz; syaw = Math.atan2( sx - this.position.x, sz - this.position.z ); }

						}

					}

				}

			}

			this.teleportTo( sx, sz, syaw );
			return;

		}

		this.teleportTo( this.position.x, this.position.z, this.yaw );

	}

	teleportTo( x, z, yaw = this.yaw ) {

		this.velocity.set( 0, 0, 0 );
		this.yawRate = 0;
		this.steerAngle = 0;
		this.dynPitch = 0;
		this.dynRoll = 0;
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

		const kIn = 1 - Math.exp( - clampedDt * 12 );
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

		this._syncModel();

	}

	_step( dt ) {

		const seaLevel = G && G.seaLevel ? G.seaLevel.value : 0;
		const wetness = G && G.weather ? G.weather.value.y : 0;
		const arcade = this.handlingPreset === 'arcade';

		const fx = Math.sin( this.yaw ), fz = Math.cos( this.yaw );
		const lx = fz, lz = - fx;

		let vFwd = this.velocity.x * fx + this.velocity.z * fz;
		let vSide = this.velocity.x * lx + this.velocity.z * lz;

		const ch = this._probeCorners( this.position.x, this.position.z, this.yaw, this.position.y + 1.5 );
		const fAvg = ( ch[ 0 ] + ch[ 1 ] ) * 0.5, rAvg = ( ch[ 2 ] + ch[ 3 ] ) * 0.5;
		const lAvg = ( ch[ 0 ] + ch[ 2 ] ) * 0.5, rightAvg = ( ch[ 1 ] + ch[ 3 ] ) * 0.5;
		const groundY = ( ch[ 0 ] + ch[ 1 ] + ch[ 2 ] + ch[ 3 ] ) * 0.25;
		const prevAirborne = this.airborne;

		if ( prevAirborne || this.position.y > groundY + 0.08 || this.velocity.y > 0.25 ) {

			if ( ! prevAirborne ) {

				this._airTime = 0;
				this._airStartX = this.position.x;
				this._airStartZ = this.position.z;

			}

			this._airTime += dt;
			this.airborne = true;
			this.velocity.y -= GRAV * dt;
			this.position.y += this.velocity.y * dt;
			if ( this.position.y <= groundY + 0.02 ) {

				this.position.y = groundY;
				const impact = clamp( - this.velocity.y / 9, 0.2, 1 );
				if ( prevAirborne && this.velocity.y < - 1.2 && this.onLand ) this.onLand( impact );
				if ( prevAirborne && this._airTime >= 0.60 ) {

					const dist = Math.hypot( this.position.x - this._airStartX, this.position.z - this._airStartZ );
					if ( dist >= 3.0 && this.onJumpLand ) this.onJumpLand( { airTime: this._airTime, distance: dist, impact } );

				}

				this._airTime = 0;
				this.velocity.y = 0;
				this.airborne = false;

			}

		} else {

			this._airTime = 0;
			this.airborne = false;
			this.position.y += ( groundY - this.position.y ) * ( 1 - Math.exp( - dt * 22 ) );
			this.velocity.y = 0;

		}

		const surfInfo = this._detectSurface( this.position.x, this.position.z, groundY, seaLevel );
		this.surface = surfInfo.surface;
		this.waterDepth = surfInfo.waterDepth;
		const sp = SURFACE_PROPS[ this.surface ] || SURFACE_PROPS.grass;

		const u = this.upgrades || {};
		const stallDepth = 0.85 + ( u.wadeDepthBonus || 0 );
		if ( this.waterDepth > stallDepth ) this.waterStalled = true;

		if ( this.waterDepth > 0.1 && Math.abs( vFwd ) > 4.0 && this._splashCooldown <= 0 ) {

			this._splashCooldown = 0.25;
			if ( this.onSplash ) this.onSplash( clamp( Math.abs( vFwd ) / 14, 0.2, 0.85 ), this.position );

		}

		const wetBonus = u.wetGripBonus || 0;
		const wetGripScale = arcade
			? ( 1 - Math.max( 0.02, 0.09 - wetBonus ) * wetness )
			: ( 1 - Math.max( 0.04, 0.22 - wetBonus ) * wetness );
		const grip = clamp( sp.grip * ( u.gripMul || 1 ) * wetGripScale, 0.36, 1.38 );
		this.surfaceGrip = grip;

		const maxMs = clamp( this.topSpeedKmh + ( u.speedBonusKmh || 0 ), 46, 145 ) / 3.6 * ( this.boost ? 1.15 : 1.0 );
		const absFwd = Math.abs( vFwd );

		let driveAcc = 0;
		let reverseMode = false;

		if ( ! this.occupied || this.waterStalled ) {

			this.gear = 'N';
			this.rpm += ( 0 - this.rpm ) * ( 1 - Math.exp( - dt * 4 ) );
			if ( ! this.airborne ) {

				const rollBrake = 3.8;
				const dec = Math.min( absFwd, ( rollBrake + sp.drag * absFwd ) * dt );
				vFwd -= Math.sign( vFwd ) * dec;

			}

		} else {

			const gearScale = maxMs / GEAR_THRESHOLDS[ 4 ];
			let targetGear = 1;
			for ( let i = 0; i < 4; i ++ ) if ( vFwd > GEAR_THRESHOLDS[ i ] * gearScale ) targetGear = i + 2;

			if ( vFwd <= 0.45 && this.brake > 0.15 && this.throttle < 0.1 ) {

				reverseMode = true;
				this.gear = 'R';
				driveAcc = - 5.2 * this.brake * sp.accel;
				if ( vFwd < - 5.2 ) driveAcc = 0;

			} else if ( this.speed < 0.25 && this.throttle < 0.06 ) {

				this.gear = 'N';

			} else {

				this.gear = String( targetGear );

			}

			if ( ! reverseMode ) {

				const gNum = this.gear === 'N' ? 1 : Number( this.gear );
				if ( gNum > this._prevGear && this.rpm > 0.65 && this.onShiftPop ) this.onShiftPop( 0.65 );
				else if ( this._wasHighThrottle && this.throttle < 0.12 && this.rpm > 0.68 && this.onShiftPop ) this.onShiftPop( 0.9 );
				this._prevGear = gNum;
				this._wasHighThrottle = this.throttle > 0.65;

			}

			const gearMin = targetGear === 1 ? 0 : GEAR_THRESHOLDS[ targetGear - 2 ] * gearScale * 0.78;
			const gearMax = GEAR_THRESHOLDS[ targetGear - 1 ] * gearScale;
			const band = clamp( ( Math.max( 0, vFwd ) - gearMin ) / Math.max( 1.0, gearMax - gearMin ), 0, 1 );
			const idleRpm = 0.16 + 0.06 * this.throttle;
			const wheelRpm = reverseMode ? clamp( absFwd / 5.2, 0.22, 0.75 ) : lerp( 0.26, 0.95, band ) + this.driftAmount * 0.12;
			const wantRpm = clamp( Math.max( idleRpm, wheelRpm + this.throttle * 0.11 ), 0.15, 1 );
			const rpmTau = wantRpm > this.rpm ? 0.24 : 0.50;
			this.rpm += ( wantRpm - this.rpm ) * ( 1 - Math.exp( - dt / rpmTau ) );

			if ( ! this.airborne && ! reverseMode ) {

				if ( this.throttle > 0.02 ) {

					const topFade = clamp( 1 - Math.pow( clamp( vFwd / maxMs, 0, 1.15 ), 2.5 ), 0, 1 );
					const torqueMul = ( arcade ? 1.22 : 1.0 ) * ( this.boost ? 1.16 : 1.0 ) * ( u.powerMul || 1 ) * lerp( 1.28, 0.64, ( targetGear - 1 ) / 4 );
					driveAcc += this.throttle * 8.6 * torqueMul * sp.accel * topFade;

				}

				if ( this.brake > 0.02 ) {

					const brkDecel = 13.5 * sp.brake * lerp( 0.78, 1.0, grip );
					if ( vFwd > 0.15 ) driveAcc -= this.brake * brkDecel;
					else if ( vFwd < - 0.1 ) driveAcc += this.brake * brkDecel;

				}

				if ( this.handbrake && absFwd > 0.2 ) driveAcc -= Math.sign( vFwd ) * 7.2 * sp.brake;

				const engineDrag = this.throttle < 0.05 ? 1.15 : 0.18;
				const surfDrag = this.surface === 'sand' ? sp.drag * ( u.sandDragMul || 1 ) : sp.drag;
				driveAcc -= Math.sign( vFwd ) * ( engineDrag * ( absFwd > 0.2 ? 1 : 0 ) + surfDrag * absFwd + 0.0095 * absFwd * absFwd );

				const slopeSin = clamp( ( fAvg - rAvg ) / WHEELBASE, - 0.65, 0.65 );
				const slopeFactor = ( arcade ? 0.42 : 0.78 ) / ( u.climbMul || 1 );
				driveAcc -= GRAV * slopeSin * slopeFactor;

			}

			vFwd += driveAcc * dt;
			if ( ! this.airborne && this.throttle < 0.02 && ! reverseMode && absFwd < 0.15 ) vFwd = 0;
			if ( reverseMode && vFwd < - 5.2 ) vFwd = - 5.2;
			if ( vFwd > maxMs * 1.05 ) vFwd = maxMs * 1.05;

		}

		// Steering & yaw dynamics (Ackermann 4-wheel)
		const maxSteerAtSpeed = clamp( 0.56 / ( 1 + absFwd * 0.10 ), 0.14, 0.54 );
		const wantSteer = this.steer * maxSteerAtSpeed;
		this.steerAngle += ( wantSteer - this.steerAngle ) * ( 1 - Math.exp( - dt * 10 ) );

		if ( ! this.airborne ) {

			const driftActive = this.occupied && this.handbrake && absFwd > 3.2;
			const turnBoost = driftActive ? 1.35 : 1.0;
			const targetYawRate = ( vFwd / WHEELBASE ) * Math.tan( this.steerAngle ) * turnBoost * ( arcade ? 1.12 : 1.0 ) * lerp( 0.7, 1.0, grip );
			this.yawRate += ( targetYawRate - this.yawRate ) * ( 1 - Math.exp( - dt * ( driftActive ? 6.0 : 10.0 ) ) );
			this.yaw += this.yawRate * dt;

			const latDampBase = driftActive ? 2.6 : ( 10.5 * grip );
			const slipFactor = driftActive ? 0.90 : ( 1.0 - grip ) * 0.42 + 0.05;
			vSide -= vFwd * this.yawRate * slipFactor * dt;
			vSide *= Math.exp( - latDampBase * dt );

			this.driftAmount = clamp( ( Math.abs( vSide ) / Math.max( 3.0, absFwd ) ) * 1.7 + ( driftActive ? 0.35 : 0 ), 0, 1 );

		} else {

			this.yaw += this.steer * 0.25 * dt;
			this.driftAmount *= Math.exp( - dt * 6 );

		}

		const nfx = Math.sin( this.yaw ), nfz = Math.cos( this.yaw );
		const nlx = nfz, nlz = - nfx;
		this.velocity.x = nfx * vFwd + nlx * vSide;
		this.velocity.z = nfz * vFwd + nlz * vSide;

		if ( this.waterDepth > 0.25 ) {

			const wd = Math.exp( - dt * this.waterDepth * 2.8 );
			this.velocity.x *= wd;
			this.velocity.z *= wd;

		}

		const preX = this.position.x, preZ = this.position.z;
		this.position.x = clamp( this.position.x + this.velocity.x * dt, - 920, 920 );
		this.position.z = clamp( this.position.z + this.velocity.z * dt, - 920, 920 );

		if ( this.colliders ) {

			const cx = this.position.x, cz = this.position.z;
			if ( this.colliders.resolveCapsule( this.position, this.colliderRadius, 1.7, 0.45 ) ) {

				const dx = this.position.x - cx, dz = this.position.z - cz;
				const len = Math.hypot( dx, dz );
				if ( len > 1e-6 ) {

					const nx = dx / len, nz = dz / len;
					const vn = this.velocity.x * nx + this.velocity.z * nz;
					if ( vn < 0 ) {

						this.velocity.x = ( this.velocity.x - 1.06 * vn * nx ) * 0.86;
						this.velocity.z = ( this.velocity.z - 1.06 * vn * nz ) * 0.86;

					}

				}

			}

		}

		const dxStep = this.position.x - preX, dzStep = this.position.z - preZ;
		this.speed = Math.hypot( this.velocity.x, this.velocity.z );
		this.forwardSpeed = this.velocity.x * nfx + this.velocity.z * nfz;

		// Terrain slope pitch & cross camber + outward centrifugal body roll (+Z roll > 0 lifts left side)
		const targetPitch = this.airborne ? clamp( - this.velocity.y * 0.04, - 0.3, 0.35 ) : clamp( - Math.atan2( fAvg - rAvg, WHEELBASE ), - 0.55, 0.55 );
		const targetRoll = this.airborne ? 0 : clamp( Math.atan2( lAvg - rightAvg, HALF_TRACK * 2 ), - 0.55, 0.55 );
		this.pitch += ( targetPitch - this.pitch ) * ( 1 - Math.exp( - dt * 15 ) );
		this.roll += ( targetRoll - this.roll ) * ( 1 - Math.exp( - dt * 15 ) );

		const latAccel = this.airborne ? 0 : clamp( vFwd * this.yawRate, - 11.5, 11.5 );
		const wantDynRoll = clamp( latAccel * 0.011, - 0.09, 0.09 ); // outward roll on turns
		const wantDynPitch = this.airborne ? 0 : clamp( - driveAcc * 0.0065, - 0.06, 0.06 );
		this.dynRoll += ( wantDynRoll - this.dynRoll ) * ( 1 - Math.exp( - dt * 10 ) );
		this.dynPitch += ( wantDynPitch - this.dynPitch ) * ( 1 - Math.exp( - dt * 10 ) );

		for ( let i = 0; i < 4; i ++ ) {

			const rel = clamp( ch[ i ] - groundY, - 0.14, 0.14 );
			this.comp[ i ] += ( rel - this.comp[ i ] ) * ( 1 - Math.exp( - dt * 18 ) );

		}

		const wheelAdvance = ( dxStep * nfx + dzStep * nfz ) || ( this.forwardSpeed * dt );
		this.wheelSpin += wheelAdvance / WHEEL_RADIUS;

		this._composePose();
		this.frontWheelWorld.copy( this.wheelWorlds[ 0 ] ).lerp( this.wheelWorlds[ 1 ], 0.5 );
		this.rearWheelWorld.copy( this.wheelWorlds[ 2 ] ).lerp( this.wheelWorlds[ 3 ], 0.5 );

	}

	_syncModel() {

		if ( ! this.model ) return;
		this.model.group.position.copy( this.position );
		this.model.group.quaternion.copy( this.quaternion );
		this.model.setState( {
			steerAngle: this.steerAngle,
			wheelSpin: this.wheelSpin,
			compFL: this.comp[ 0 ],
			compFR: this.comp[ 1 ],
			compRL: this.comp[ 2 ],
			compRR: this.comp[ 3 ],
			dynPitch: this.dynPitch,
			dynRoll: this.dynRoll,
			headlightOn: this.headlightActive,
			ledBoost: ( this.upgrades?.lightMul || 1 ) > 1.2,
			brakeLight: this.brakeLight,
			runningLight: this.occupied && ! this.waterStalled,
			night: G && G.night ? G.night.value : 0,
			rain: G && G.weather ? G.weather.value.x : 0,
			storm: G && G.weather ? G.weather.value.z : 0,
		} );

	}

}
