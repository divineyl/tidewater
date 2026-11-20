import { Vector3 } from '../engine/index.js';
import { WORLD } from '../world/WorldLayout.js';

const _probe = new Vector3();

// Registry and coordinator for all land vehicles.
// Keeps Player, App, Audio, Minimap, FX, and HUD decoupled from specific vehicle subclasses.
export class VehicleManager {

	constructor( { terrain = null, colliders = null } = {} ) {

		this.terrain = terrain;
		this.colliders = colliders;
		this.vehicles = [];

	}

	register( vehicle ) {

		if ( vehicle && ! this.vehicles.includes( vehicle ) ) this.vehicles.push( vehicle );
		return vehicle;

	}

	getPrimary() {

		return this.vehicles[ 0 ] || null;

	}

	getById( id ) {

		return this.vehicles.find( ( v ) => v.id === id ) || null;

	}

	getActiveOrNearest( pos ) {

		for ( const v of this.vehicles ) if ( v.occupied ) return v;
		if ( ! pos ) return this.getPrimary();
		let best = null, bestD2 = Infinity;
		for ( const v of this.vehicles ) {

			const d2 = v.position.distanceToSquared( pos );
			if ( d2 < bestD2 ) { bestD2 = d2; best = v; }

		}

		return best || this.getPrimary();

	}

	getNearestMountable( pos ) {

		let best = null;
		let bestDist = Infinity;
		for ( const v of this.vehicles ) {

			if ( v.occupied ) continue;
			const dx = v.position.x - pos.x;
			const dz = v.position.z - pos.z;
			const d = Math.hypot( dx, dz );
			const dy = Math.abs( v.position.y - pos.y );
			if ( d <= v.mountRadius && dy < 2.2 && d < bestDist ) {

				best = v;
				bestDist = d;

			}

		}

		return best;

	}

	update( dt ) {

		for ( const v of this.vehicles ) v.update( dt );
		for ( let i = 0; i < this.vehicles.length; i ++ ) {

			for ( let j = i + 1; j < this.vehicles.length; j ++ ) {

				const a = this.vehicles[ i ], b = this.vehicles[ j ];
				if ( Math.abs( a.position.y - b.position.y ) > 2.2 ) continue;
				const dx = b.position.x - a.position.x;
				const dz = b.position.z - a.position.z;
				const minR = ( a.colliderRadius || 0.6 ) + ( b.colliderRadius || 0.6 ) + 0.15;
				const d2 = dx * dx + dz * dz;
				if ( d2 >= minR * minR ) continue;
				const d = Math.sqrt( Math.max( d2, 1e-8 ) );
				const nx = d > 1e-4 ? dx / d : 1;
				const nz = d > 1e-4 ? dz / d : 0;
				const push = ( minR - d ) * 0.5;
				a.position.x -= nx * push;
				a.position.z -= nz * push;
				b.position.x += nx * push;
				b.position.z += nz * push;
				a._syncModel?.();
				b._syncModel?.();

			}

		}

	}

	// Teleport a vehicle to safe dry ground near the player (or beach/pier spawn if at sea).
	summonNear( player, vehicle = this.getPrimary() ) {

		if ( ! vehicle || ! player ) return { ok: false, atPlayer: false };
		const terrain = this.terrain;
		const colliders = this.colliders;
		const yaw = player.yaw ?? 0;
		const fx = - Math.sin( yaw );
		const fz = - Math.cos( yaw );
		const rx = - fz;
		const rz = fx;

		const isSafeGround = ( x, z ) => {

			if ( ! terrain ) return { ok: true, y: 0 };
			const y = terrain.heightAt( x, z );
			if ( y < 0.38 || y > 180 ) return { ok: false, y };
			// slope check
			const hx = terrain.heightAt( x + 1.1, z ) - terrain.heightAt( x - 1.1, z );
			const hz = terrain.heightAt( x, z + 1.1 ) - terrain.heightAt( x, z - 1.1 );
			const slope = Math.hypot( hx, hz ) * 0.5;
			if ( slope > 0.52 ) return { ok: false, y };
			if ( colliders ) {

				// Do not summon onto boardwalk planks too narrow or inside solid obstacles
				const cTop = colliders.groundHeightAt( x, z, y + 3, 0.25 );
				if ( cTop > y + 0.15 ) return { ok: false, y };
				_probe.set( x, y, z );
				if ( colliders.resolveCapsule( _probe, 0.85, 1.6, 0.35 ) ) {

					if ( Math.hypot( _probe.x - x, _probe.z - z ) > 0.15 ) return { ok: false, y };

				}

			}

			for ( const other of this.vehicles ) {

				if ( other === vehicle ) continue;
				if ( Math.hypot( other.position.x - x, other.position.z - z ) < 2.6 ) return { ok: false, y };

			}

			return { ok: true, y };

		};

		const offsets = [
			[ fx * 3.6, fz * 3.6 ],
			[ fx * 3.2 + rx * 2.4, fz * 3.2 + rz * 2.4 ],
			[ fx * 3.2 - rx * 2.4, fz * 3.2 - rz * 2.4 ],
			[ rx * 3.6, rz * 3.6 ],
			[ - rx * 3.6, - rz * 3.6 ],
			[ - fx * 3.6, - fz * 3.6 ],
			[ fx * 6.0, fz * 6.0 ],
		];

		for ( const [ ox, oz ] of offsets ) {

			const cx = player.position.x + ox;
			const cz = player.position.z + oz;
			const test = isSafeGround( cx, cz );
			if ( test.ok ) {

				const faceYaw = Math.atan2( - rx, - rz );
				vehicle.teleportTo( cx, cz, faceYaw );
				return { ok: true, atPlayer: true, x: cx, z: cz };

			}

		}

		// Player is deep at sea or on rocky cliff: fall back to safe spawn beside the boardwalk
		const sp = vehicle.spawnPosition
			? { position: vehicle.spawnPosition, heading: vehicle.spawnHeading }
			: ( WORLD.vehicleSpawns?.motorcycle || { position: new Vector3( 48.5, 0, - 80.5 ), heading: - Math.PI * 0.82 } );
		vehicle.teleportTo( sp.position.x, sp.position.z, sp.heading );
		return { ok: true, atPlayer: false, x: sp.position.x, z: sp.position.z };

	}

}
