import { Vector3, Quaternion } from '../engine/index.js';
import { G } from '../engine/render/Frame.js';

const _fwd = new Vector3();
const _right = new Vector3();

// Abstract base class for extensible land vehicles (motorcycle, ATV, utility buggy, etc.).
// Convention (matches BoatController / BoatModel): local +Z forward, +Y up, +X port (left).
export class Vehicle {

	constructor( {
		id = 'vehicle',
		name = 'Vehicle',
		kind = 'generic',
		model = null,
		terrain = null,
		colliders = null,
		query = null,
		spawn = null,
	} = {} ) {

		this.id = id;
		this.name = name;
		this.kind = kind;
		this.model = model;
		this.terrain = terrain;
		this.colliders = colliders;
		this.query = query;
		this.group = model ? model.group : null;

		this.position = new Vector3();
		if ( spawn && spawn.position ) this.position.copy( spawn.position );
		this.spawnPosition = this.position.clone();
		this.spawnHeading = spawn ? ( spawn.heading || 0 ) : 0;

		this.quaternion = new Quaternion().setFromAxisAngle( new Vector3( 0, 1, 0 ), this.spawnHeading );
		this.velocity = new Vector3();

		this.speed = 0;
		this.forwardSpeed = 0;
		this.rpm = 0; // normalized 0..1
		this.maxRpm = 7800;
		this.gear = 'N';
		this.throttle = 0;
		this.brake = 0;
		this.steer = 0;
		this.boost = false;
		this.handbrake = false;

		this.occupied = false;
		this.headlightManual = null; // null = auto (dusk/night/storm), true/false = manual override
		this.headlightActive = false;
		this.brakeLight = false;
		this.waterStalled = false;
		this.surface = 'sand';
		this.driftAmount = 0;
		this.airborne = false;

		this.upgrades = {
			gripMul: 1,
			sandDragMul: 1,
			wetGripBonus: 0,
			powerMul: 1,
			speedBonusKmh: 0,
			climbMul: 1,
			wadeDepthBonus: 0,
			lightMul: 1,
			lightRangeMul: 1,
		};

		// Interaction & camera contract
		this.mountRadius = 2.6;
		this.colliderRadius = 0.55;
		this.seatEyeLocal = new Vector3( 0, 1.4, - 0.1 );
		this.camTargetLocal = new Vector3( 0, 1.05, 0.1 );
		this.camDistRange = [ 2.8, 9.5 ];
		this.dismountOffsets = [
			new Vector3( 0.95, 0, - 0.15 ), // left side (kickstand side)
			new Vector3( - 0.95, 0, - 0.15 ), // right side
			new Vector3( 0, 0, - 1.35 ), // astern
		];

		this._input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

	}

	toWorld( local, out ) {

		return out.copy( local ).applyQuaternion( this.quaternion ).add( this.position );

	}

	forward( out ) {

		return out.set( 0, 0, 1 ).applyQuaternion( this.quaternion );

	}

	right( out ) {

		return out.set( - 1, 0, 0 ).applyQuaternion( this.quaternion );

	}

	getYaw() {

		this.forward( _fwd );
		return Math.atan2( _fwd.x, _fwd.z );

	}

	setInput( controls = {} ) {

		this._input.throttle = controls.throttle || 0;
		this._input.brake = controls.brake || 0;
		this._input.steer = controls.steer || 0;
		this._input.handbrake = !! controls.handbrake;
		this._input.boost = !! controls.boost;

	}

	mount() {

		this.occupied = true;

	}

	dismount() {

		this.occupied = false;
		this._input.throttle = 0;
		this._input.brake = 0;
		this._input.steer = 0;
		this._input.handbrake = false;
		this._input.boost = false;
		this.brakeLight = false;

	}

	toggleHeadlight( force ) {

		const next = force === undefined ? ! this.headlightActive : !! force;
		this.headlightManual = next;
		this.headlightActive = next;
		return next;

	}

	setHeadlightAuto() {

		this.headlightManual = null;

	}

	updateHeadlightAuto() {

		if ( this.waterStalled ) {

			this.headlightActive = false;
			return;

		}

		if ( this.headlightManual !== null ) {

			this.headlightActive = !! this.headlightManual;
			return;

		}

		const night = G && G.night ? G.night.value : 0;
		const rain = G && G.weather ? G.weather.value.x : 0;
		const storm = G && G.weather ? G.weather.value.z : 0;
		this.headlightActive = this.occupied && ( night > 0.25 || rain > 0.45 || storm > 0.35 );

	}

	resetUpright() {}

	teleportTo( x, z, yaw = 0 ) {

		this.position.set( x, this.position.y, z );
		this.quaternion.setFromAxisAngle( new Vector3( 0, 1, 0 ), yaw );
		this.velocity.set( 0, 0, 0 );
		this.waterStalled = false;

	}

	update( _dt ) {}

	applyUpgrades( stats ) {

		if ( ! stats ) return;
		this.upgrades = {
			gripMul: Number.isFinite( stats.vehGripMul ) ? stats.vehGripMul : 1,
			sandDragMul: Number.isFinite( stats.vehSandDragMul ) ? stats.vehSandDragMul : 1,
			wetGripBonus: Number.isFinite( stats.vehWetGripBonus ) ? stats.vehWetGripBonus : 0,
			powerMul: Number.isFinite( stats.vehPowerMul ) ? stats.vehPowerMul : 1,
			speedBonusKmh: Number.isFinite( stats.vehSpeedBonusKmh ) ? stats.vehSpeedBonusKmh : 0,
			climbMul: Number.isFinite( stats.vehClimbMul ) ? stats.vehClimbMul : 1,
			wadeDepthBonus: Number.isFinite( stats.vehWadeDepthBonus ) ? stats.vehWadeDepthBonus : 0,
			lightMul: Number.isFinite( stats.vehLightMul ) ? stats.vehLightMul : 1,
			lightRangeMul: Number.isFinite( stats.vehLightRangeMul ) ? stats.vehLightRangeMul : 1,
		};

	}

	getHudState() {

		const f = this.forward( _fwd );
		return {
			kind: this.kind,
			name: this.name,
			speedKmh: this.speed * 3.6,
			rpm: this.rpm,
			maxRpm: this.maxRpm,
			gear: this.gear,
			headlight: this.headlightActive,
			headlightAuto: this.headlightManual === null,
			drift: this.driftAmount,
			surface: this.surface,
			waterStalled: this.waterStalled,
			heading: ( Math.atan2( f.x, - f.z ) * 180 / Math.PI + 360 ) % 360,
		};

	}

	getAudioState( listenerInside = false ) {

		return {
			kind: this.kind,
			active: this.occupied && ! this.waterStalled,
			occupied: this.occupied,
			rpm: this.rpm,
			throttle: this.throttle,
			speed: this.speed,
			surface: this.surface,
			drift: this.driftAmount,
			waterStalled: this.waterStalled,
			airborne: this.airborne,
			position: this.position,
			listenerInside,
		};

	}

}
