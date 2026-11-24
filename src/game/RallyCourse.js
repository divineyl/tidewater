import { Group, Mesh, BoxGeometry, CylinderGeometry, Color } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { LAYERS } from '../core/SceneRenderer.js';

// East Headland coastal dirt road time-trial rally (grounded in IslandShape.js road polyline).
export const RALLY_GATES = Object.freeze( [
	{ x: 96, z: - 66, radius: 8.0 },
	{ x: 126, z: - 77, radius: 7.5 },
	{ x: 158, z: - 80, radius: 7.5 },
	{ x: 192, z: - 70, radius: 7.5 },
	{ x: 208, z: - 42, radius: 7.5 },
	{ x: 216, z: - 12, radius: 7.5 },
	{ x: 228, z: 18, radius: 7.5 },
	{ x: 246, z: 44, radius: 7.5 },
	{ x: 274, z: 80, radius: 7.5 },
	{ x: 296, z: 114, radius: 10.5 },
] );

export const RALLY_MEDALS = Object.freeze( {
	gold: { sec: 42, reward: 250 },
	silver: { sec: 56, reward: 140 },
	bronze: { sec: 75, reward: 70 },
} );

export function evaluateRallyMedal( elapsedSec ) {

	const raw = Number( elapsedSec );
	const t = Number.isFinite( raw ) && raw >= 0 ? raw : 999;
	if ( t <= RALLY_MEDALS.gold.sec ) return { tier: 'gold', reward: RALLY_MEDALS.gold.reward };
	if ( t <= RALLY_MEDALS.silver.sec ) return { tier: 'silver', reward: RALLY_MEDALS.silver.reward };
	if ( t <= RALLY_MEDALS.bronze.sec ) return { tier: 'bronze', reward: RALLY_MEDALS.bronze.reward };
	return { tier: 'finish', reward: 35 };

}

function makeGateArch( width, height, mat ) {

	const g = new Group();
	const postGeo = new CylinderGeometry( 0.14, 0.16, height, 8 );
	const topGeo = new BoxGeometry( width + 0.36, 0.24, 0.24 );

	const left = new Mesh( postGeo, mat );
	left.position.set( - width * 0.5, height * 0.5, 0 );
	left.layers.set( LAYERS.OPAQUE );
	g.add( left );

	const right = new Mesh( postGeo, mat );
	right.position.set( width * 0.5, height * 0.5, 0 );
	right.layers.set( LAYERS.OPAQUE );
	g.add( right );

	const bar = new Mesh( topGeo, mat );
	bar.position.set( 0, height, 0 );
	bar.layers.set( LAYERS.OPAQUE );
	g.add( bar );

	return g;

}

export class RallyCourse {

	constructor( { scene, terrain } = {} ) {

		this.scene = scene || null;
		this.terrain = terrain || null;
		this.active = false;
		this.gateIndex = 0;
		this.elapsed = 0;
		this.vehicleId = 'motorcycle';
		this._idleCooldown = 0;

		this.activeMat = standard( { color: 0xffd166, emissive: 0xffb84d, emissiveIntensity: 2.2, roughness: 0.3 } );
		this.nextMat = standard( { color: 0x5ce0d2, emissive: 0x5ce0d2, emissiveIntensity: 1.1, roughness: 0.35 } );

		this.group = new Group();
		this.group.name = 'RallyGates';
		this.gates = [];
		if ( this.scene ) {

			this._buildVisuals();
			this.scene.add( this.group );

		}

	}

	_buildVisuals() {

		for ( let i = 0; i < RALLY_GATES.length; i ++ ) {

			const cur = RALLY_GATES[ i ];
			const prev = RALLY_GATES[ Math.max( 0, i - 1 ) ];
			const next = RALLY_GATES[ Math.min( RALLY_GATES.length - 1, i + 1 ) ];
			const dx = next.x - prev.x;
			const dz = next.z - prev.z;
			const yaw = Math.atan2( dx, dz );
			const mat = i === 0 ? this.activeMat : this.nextMat;
			const arch = makeGateArch( cur.radius >= 10 ? 8.2 : 6.4, 4.2, mat );
			const y = this.terrain ? this.terrain.heightAt( cur.x, cur.z ) : 2;
			arch.position.set( cur.x, y, cur.z );
			arch.rotation.y = yaw;
			arch.visible = i === 0;
			this.group.add( arch );
			this.gates.push( arch );

		}

	}

	start( vehicleId = 'motorcycle' ) {

		this.active = true;
		this.gateIndex = 1;
		this.elapsed = 0;
		this.vehicleId = vehicleId || 'motorcycle';
		this._syncVisuals();
		return true;

	}

	cancel() {

		this.active = false;
		this.gateIndex = 0;
		this.elapsed = 0;
		this._idleCooldown = 2.0;
		this._syncVisuals();

	}

	_syncVisuals() {

		for ( let i = 0; i < this.gates.length; i ++ ) {

			const g = this.gates[ i ];
			if ( ! this.active ) {

				g.visible = i === 0;
				g.scale.setScalar( 1 );

			} else {

				const isCur = i === this.gateIndex;
				const isNext = i === this.gateIndex + 1;
				g.visible = isCur || isNext;
				const mat = isCur ? this.activeMat : this.nextMat;
				for ( const child of g.children ) child.material = mat;

			}

		}

	}

	getNextGate() {

		if ( ! this.active ) return RALLY_GATES[ 0 ];
		return RALLY_GATES[ Math.min( RALLY_GATES.length - 1, this.gateIndex ) ];

	}

	update( dt, player, vehicle ) {

		const step = Number.isFinite( dt ) && dt > 0 ? Math.min( dt, 0.25 ) : 0;
		if ( this._idleCooldown > 0 ) this._idleCooldown = Math.max( 0, this._idleCooldown - step );

		const riding = player && player.mode === 'vehicle' && vehicle;
		if ( ! this.active ) {

			if ( riding && this._idleCooldown <= 0 && Math.abs( vehicle.speed || 0 ) > 2.0 ) {

				const startGate = RALLY_GATES[ 0 ];
				if ( Math.hypot( vehicle.position.x - startGate.x, vehicle.position.z - startGate.z ) <= startGate.radius ) {

					this.start( vehicle.id );
					return { started: true, gateIndex: this.gateIndex, totalGates: RALLY_GATES.length, vehicleId: this.vehicleId };

				}

			}

			return null;

		}

		if ( ! riding ) {

			// Allow dismount briefly without cancelling? Better: cancel cleanly if player exits vehicle
			this.cancel();
			return { cancelled: true };

		}

		this.elapsed += step;
		const gate = RALLY_GATES[ this.gateIndex ];
		if ( ! gate ) return null;

		const dist = Math.hypot( vehicle.position.x - gate.x, vehicle.position.z - gate.z );
		if ( dist <= gate.radius ) {

			if ( this.gateIndex >= RALLY_GATES.length - 1 ) {

				const elapsed = this.elapsed;
				const medal = evaluateRallyMedal( elapsed );
				const vehicleId = vehicle.id || this.vehicleId;
				this.active = false;
				this.gateIndex = 0;
				this._idleCooldown = 4.0;
				this._syncVisuals();
				return { finished: true, elapsed, medal, vehicleId };

			}

			this.gateIndex ++;
			this._syncVisuals();
			return { gateHit: true, gateIndex: this.gateIndex, totalGates: RALLY_GATES.length };

		}

		// Pulse active gate emissive softly
		const pulse = 1.9 + 0.6 * Math.sin( this.elapsed * 6.0 );
		if ( this.activeMat ) {

			this.activeMat.emissiveIntensity = pulse;

		}

		return null;

	}

}
