import { Group, Mesh, CylinderGeometry, SphereGeometry } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { LAYERS } from '../core/SceneRenderer.js';

export const MAX_CRAB_TRAPS = 4;
export const TRAP_SOAK_SEC = 75;

export const CRAB_SPECIES = Object.freeze( {
	blueCrab: { nameEn: 'Blue Crab', nameZh: '海湾蓝蟹', kg: [ 0.3, 0.9 ], value: [ 26, 48 ], habitat: 'shallow' },
	stoneCrab: { nameEn: 'Florida Stone Crab', nameZh: '珊瑚石蟹', kg: [ 0.5, 1.4 ], value: [ 44, 78 ], habitat: 'reef' },
	spinyLobster: { nameEn: 'Caribbean Spiny Lobster', nameZh: '加勒比龙虾', kg: [ 0.9, 2.8 ], value: [ 82, 148 ], habitat: 'reef' },
	reefOctopus: { nameEn: 'Reef Octopus', nameZh: '礁岩章鱼', kg: [ 1.2, 3.6 ], value: [ 98, 175 ], habitat: 'reef' },
	kingCrab: { nameEn: 'Deep-Sea King Crab', nameZh: '深海帝王蟹', kg: [ 2.2, 5.5 ], value: [ 165, 290 ], habitat: 'deep', rare: true },
} );

const pickSpeciesForWater = ( depth, reefDist, rng ) => {

	const r = rng();
	if ( depth >= 18 ) {

		if ( r < 0.30 ) return 'kingCrab';
		if ( r < 0.65 ) return 'spinyLobster';
		return 'reefOctopus';

	}

	if ( reefDist <= 28 ) {

		if ( r < 0.38 ) return 'spinyLobster';
		if ( r < 0.68 ) return 'stoneCrab';
		if ( r < 0.88 ) return 'reefOctopus';
		return 'blueCrab';

	}

	if ( r < 0.55 ) return 'blueCrab';
	if ( r < 0.85 ) return 'stoneCrab';
	return 'spinyLobster';

};

export function rollTrapHaul( depth = 6, reefDist = 40, soakRatio = 1, rng = Math.random ) {

	const ratio = Number.isFinite( soakRatio ) ? Math.max( 0, soakRatio ) : 0;
	if ( ratio < 0.35 ) return { items: [], totalValue: 0, totalKg: 0 };

	const count = ratio >= 1 ? ( rng() < 0.52 ? 2 : 1 ) : 1;
	const items = [];
	let totalValue = 0;
	let totalKg = 0;

	for ( let i = 0; i < count; i ++ ) {

		const id = pickSpeciesForWater( depth, reefDist, rng );
		const sp = CRAB_SPECIES[ id ];
		const t = 0.15 + 0.85 * Math.min( 1.2, ratio ) * rng();
		const kg = Math.round( ( sp.kg[ 0 ] + ( sp.kg[ 1 ] - sp.kg[ 0 ] ) * Math.min( 1, t ) ) * 100 ) / 100;
		const valScale = 0.75 + 0.35 * Math.min( 1, ratio );
		const value = Math.max( 8, Math.round( ( sp.value[ 0 ] + ( sp.value[ 1 ] - sp.value[ 0 ] ) * Math.min( 1, t ) ) * valScale ) );
		items.push( { id, nameEn: sp.nameEn, nameZh: sp.nameZh, kg, value, rare: !! sp.rare } );
		totalValue += value;
		totalKg = Math.round( ( totalKg + kg ) * 100 ) / 100;

	}

	return { items, totalValue, totalKg };

}

function buildTrapBuoyMesh() {

	const g = new Group();
	const bodyGeo = new CylinderGeometry( 0.11, 0.08, 0.36, 10 );
	const topGeo = new CylinderGeometry( 0.09, 0.11, 0.18, 10 );
	const stickGeo = new CylinderGeometry( 0.015, 0.015, 0.92, 6 );
	const beaconGeo = new SphereGeometry( 0.075, 10, 8 );

	const bodyMat = standard( { color: 0xf4f1ea, roughness: 0.5 } );
	const topMat = standard( { color: 0xff6a13, roughness: 0.45 } );
	const stickMat = standard( { color: 0x9c7a4c, roughness: 0.75 } );
	const beaconMat = standard( { color: 0x5ce0d2, emissive: 0x5ce0d2, emissiveIntensity: 0.45, roughness: 0.3 } );

	const body = new Mesh( bodyGeo, bodyMat );
	body.position.y = 0.02;
	body.layers.set( LAYERS.OPAQUE );
	g.add( body );

	const top = new Mesh( topGeo, topMat );
	top.position.y = 0.28;
	top.layers.set( LAYERS.OPAQUE );
	g.add( top );

	const stick = new Mesh( stickGeo, stickMat );
	stick.position.y = 0.38;
	stick.layers.set( LAYERS.OPAQUE );
	g.add( stick );

	const beacon = new Mesh( beaconGeo, beaconMat );
	beacon.position.y = 0.88;
	beacon.layers.set( LAYERS.OPAQUE );
	g.add( beacon );

	return { group: g, beaconMat };

}

function disposeBuoyMesh( meshInfo, parent ) {

	if ( ! meshInfo ) return;
	const geos = new Set();
	const mats = new Set();
	meshInfo.group.traverse( ( obj ) => {

		if ( obj.geometry ) geos.add( obj.geometry );
		if ( obj.material ) {

			if ( Array.isArray( obj.material ) ) {

				for ( const m of obj.material ) if ( m ) mats.add( m );

			} else {

				mats.add( obj.material );

			}

		}

	} );
	for ( const g of geos ) g.dispose?.();
	for ( const m of mats ) m.dispose?.();
	meshInfo.group.clear?.();
	if ( parent && meshInfo.group.parent === parent ) parent.remove( meshInfo.group );
	else if ( meshInfo.group.parent ) meshInfo.group.parent.remove?.( meshInfo.group );

}

export class CrabTrapManager {

	constructor( { scene = null, terrain = null } = {} ) {

		this.scene = scene;
		this.terrain = terrain;
		this.traps = [];
		this._nextId = 1;
		this._time = 0;
		this.group = new Group();
		this.group.name = 'CrabTrapBuoys';
		if ( this.scene ) this.scene.add( this.group );

	}

	loadFromState( savedList ) {

		for ( const t of this.traps ) disposeBuoyMesh( t._mesh, this.group );
		this.traps = [];
		this._nextId = 1;
		if ( ! Array.isArray( savedList ) ) return;

		for ( const raw of savedList.slice( 0, MAX_CRAB_TRAPS ) ) {

			if ( ! raw || ! Number.isFinite( raw.x ) || ! Number.isFinite( raw.z ) ) continue;
			const depth = Number.isFinite( raw.depth ) && raw.depth >= 2 ? raw.depth : 6;
			const reefDist = Number.isFinite( raw.reefDist ) ? raw.reefDist : 40;
			const soakSec = Number.isFinite( raw.soakSec ) && raw.soakSec >= 0 ? raw.soakSec : 0;
			const id = Number.isInteger( raw.id ) && raw.id >= 1 ? raw.id : this._nextId;
			this._nextId = Math.max( this._nextId, id + 1 );
			const ready = soakSec >= TRAP_SOAK_SEC;
			const _mesh = this.scene ? buildTrapBuoyMesh() : null;
			if ( _mesh ) {

				_mesh.group.position.set( raw.x, 0, raw.z );
				this.group.add( _mesh.group );

			}

			this.traps.push( { id, x: raw.x, z: raw.z, depth, reefDist, soakSec, ready, _notifiedReady: ready, _mesh } );

		}

	}

	serialize() {

		return this.traps.map( ( t ) => ( {
			id: t.id,
			x: Math.round( t.x * 100 ) / 100,
			z: Math.round( t.z * 100 ) / 100,
			depth: Math.round( t.depth * 10 ) / 10,
			reefDist: Math.round( t.reefDist * 10 ) / 10,
			soakSec: Math.round( t.soakSec * 10 ) / 10,
			ready: !! t.ready,
		} ) );

	}

	canDeploy( x, z, depth ) {

		if ( this.traps.length >= MAX_CRAB_TRAPS ) return { ok: false, reason: 'max_traps' };
		if ( ! Number.isFinite( x ) || ! Number.isFinite( z ) || ! Number.isFinite( depth ) || depth < 2.2 ) {

			return { ok: false, reason: 'too_shallow' };

		}

		for ( const t of this.traps ) {

			if ( Math.hypot( t.x - x, t.z - z ) < 10 ) return { ok: false, reason: 'too_close' };

		}

		return { ok: true, reason: '' };

	}

	deploy( x, z, depth, reefDist = 40 ) {

		const chk = this.canDeploy( x, z, depth );
		if ( ! chk.ok ) return null;
		const id = this._nextId ++;
		const _mesh = this.scene ? buildTrapBuoyMesh() : null;
		if ( _mesh ) {

			_mesh.group.position.set( x, 0, z );
			this.group.add( _mesh.group );

		}

		const trap = {
			id,
			x,
			z,
			depth,
			reefDist: Number.isFinite( reefDist ) ? reefDist : 40,
			soakSec: 0,
			ready: false,
			_notifiedReady: false,
			_mesh,
		};
		this.traps.push( trap );
		return trap;

	}

	findNearest( pos, maxDist = 14 ) {

		if ( ! pos || ! Number.isFinite( pos.x ) || ! Number.isFinite( pos.z ) ) return null;
		let best = null;
		let bestScore = Infinity;
		for ( const t of this.traps ) {

			const d = Math.hypot( t.x - pos.x, t.z - pos.z );
			if ( d > maxDist ) continue;
			const score = t.ready ? d * 0.75 : d;
			if ( score < bestScore ) {

				bestScore = score;
				best = { trap: t, dist: d };

			}

		}

		return best;

	}

	haul( trapId, rng = Math.random ) {

		const idx = this.traps.findIndex( ( t ) => t.id === trapId );
		if ( idx < 0 ) return null;
		const [ trap ] = this.traps.splice( idx, 1 );
		disposeBuoyMesh( trap._mesh, this.group );
		trap._mesh = null;
		const haul = rollTrapHaul( trap.depth, trap.reefDist, trap.soakSec / TRAP_SOAK_SEC, rng );
		return { trap, haul };

	}

	update( dt, waterY = 0 ) {

		const step = Number.isFinite( dt ) && dt > 0 ? Math.min( dt, 0.25 ) : 0;
		this._time += step;
		const newlyReady = [];
		const wy = Number.isFinite( waterY ) ? waterY : 0;

		for ( const t of this.traps ) {

			t.soakSec += step;
			t.ready = t.soakSec >= TRAP_SOAK_SEC;
			if ( t.ready && ! t._notifiedReady ) {

				t._notifiedReady = true;
				newlyReady.push( t );

			}

			if ( t._mesh ) {

				const ph = this._time * 2.2 + t.id * 1.7;
				t._mesh.group.position.set( t.x, wy + Math.sin( ph ) * 0.08, t.z );
				t._mesh.group.rotation.z = Math.sin( ph * 0.7 ) * 0.12;
				t._mesh.group.rotation.x = Math.cos( ph * 0.55 ) * 0.10;
				const mat = t._mesh.beaconMat;
				if ( t.ready ) {

					mat.uniforms.color.value.set( 0xffd166 );
					mat.uniforms.emissive.value.set( 0xffb84d );
					mat.emissiveIntensity = 1.6 + 1.1 * Math.sin( this._time * 5.0 );

				} else {

					mat.uniforms.color.value.set( 0x5ce0d2 );
					mat.uniforms.emissive.value.set( 0x5ce0d2 );
					mat.emissiveIntensity = 0.5;

				}

			}

		}

		return newlyReady;

	}

	dispose() {

		for ( const t of this.traps ) disposeBuoyMesh( t._mesh, this.group );
		this.traps = [];
		if ( this.scene && this.group.parent === this.scene ) this.scene.remove( this.group );

	}

}
