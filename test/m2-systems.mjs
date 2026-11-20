import assert from 'node:assert/strict';
import { Vector3 } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { PATHS } from '../src/world/terrain/IslandShape.js';
import { Colliders } from '../src/world/Colliders.js';
import { Lighthouse } from '../src/world/Lighthouse.js';
import { GroundInteraction } from '../src/fx/GroundInteraction.js';
import {
	waypointDistance, waypointBearingDeg, compassCardinal,
	hasArrivedAtWaypoint, mapPixelToWorld, worldToMapFraction,
} from '../src/game/WaypointMath.js';

let passed = 0;
function test( name, fn ) {

	fn();
	passed ++;
	console.log( `  ✓ ${ name }` );

}

console.log( 'Milestone 2 systems tests' );

// 1. East Headland scenic road grading & Lighthouse plateau + colliders
const terrain = new TerrainData();
test( 'East Headland scenic road stays dry, graded (<=22%), and painted onto path map', () => {

	const road = PATHS.find( ( p ) => p.road );
	assert.ok( road && road.pts.length >= 10 );
	let minH = Infinity, maxStepGrade = 0;
	for ( let i = 0; i < road.pts.length - 1; i ++ ) {

		const [ ax, az ] = road.pts[ i ], [ bx, bz ] = road.pts[ i + 1 ];
		const segLen = Math.hypot( bx - ax, bz - az );
		const steps = Math.ceil( segLen / 4 );
		let prevH = terrain.heightAt( ax, az );
		for ( let s = 1; s <= steps; s ++ ) {

			const f = s / steps;
			const x = ax + ( bx - ax ) * f, z = az + ( bz - az ) * f;
			const h = terrain.heightAt( x, z );
			const g = Math.abs( h - prevH ) / ( segLen / steps );
			if ( g > maxStepGrade ) maxStepGrade = g;
			if ( h < minH ) minH = h;
			prevH = h;

		}

	}

	assert.ok( minH >= 1.0, `Expected dry road >= 1.0 m, got ${ minH }` );
	assert.ok( maxStepGrade <= 0.22, `Expected max grade <= 22%, got ${ ( maxStepGrade * 100 ).toFixed( 1 ) }%` );
	assert.ok( terrain.pathDistance( 228, 18 ) < 0.5, 'Road midpoint must fall inside pathDistance' );

} );

test( 'Lighthouse plateaus East Headland, registers exclusion footprint, and builds colliders', () => {

	const colliders = new Colliders();
	const village = { footprints: [] };
	const lh = new Lighthouse( { scene: null, terrain, colliders, village } );
	const lx = WORLD.lighthouse.position.x, lz = WORLD.lighthouse.position.z;
	assert.ok( lh.baseY > 18, `Expected headland altitude > 18 m, got ${ lh.baseY }` );

	const n = new Vector3();
	terrain.normalAt( lx, lz, n );
	assert.ok( n.y > 0.995, `Expected flattened plateau normal ny > 0.995, got ${ n.y }` );
	assert.ok( terrain.pads.some( ( p ) => Math.hypot( p.x - lx, p.z - lz ) < 1 ), 'Lighthouse pad registered' );
	assert.ok( village.footprints.some( ( f ) => Math.hypot( f.x - lx, f.z - lz ) < 1 ), 'Village footprint exclusion added' );
	assert.ok( colliders.boxes.some( ( b ) => b.tag === 'lighthouse-plinth' && b.walkable ), 'Walkable plinth collider present' );
	assert.ok( colliders.cylinders.some( ( c ) => c.tag === 'lighthouse-tower' ), 'Solid tower cylinder collider present' );

	const prevAngle = lh.angle;
	lh.update( 0.5 );
	assert.ok( lh.angle > prevAngle, 'Lighthouse optic rotates over time' );
	assert.ok( Math.abs( lh.beamDir.length() - 1 ) < 1e-5, 'Lighthouse beamDir stays unit length' );

} );

// 2. GroundInteraction sliding window, stamping, recenter preservation & decay
test( 'GroundInteraction stamps footsteps, tire tracks, and directional grass push', () => {

	const gi = new GroundInteraction();
	gi.update( 0.016, 40, - 80, 0 );
	gi.stampFoot( 40, - 80, 3.0, 0.0, 3.0 );
	const foot = gi.sampleAt( 40, - 80 );
	assert.ok( foot.grass > 0.7, `Expected grass trampling > 0.7, got ${ foot.grass }` );
	assert.equal( foot.track, 0, 'Footsteps alone should not carve deep tire tracks' );
	assert.ok( foot.dirX > 0.7, `Expected eastward push dirX > 0.7, got ${ foot.dirX }` );

	gi.stampWheel( 44, - 84, 0, 5.0, { radius: 0.65, grass: 1.0, track: 0.9 } );
	const wheel = gi.sampleAt( 44, - 84 );
	assert.ok( wheel.grass > 0.85, `Expected wheel grass flattening > 0.85, got ${ wheel.grass }` );
	assert.ok( wheel.track > 0.75, `Expected wheel tire track > 0.75, got ${ wheel.track }` );
	assert.ok( wheel.dirZ > 0.7, `Expected southward push dirZ > 0.7, got ${ wheel.dirZ }` );

} );

test( 'GroundInteraction recenter shifts sliding window without drifting stamped world positions', () => {

	const gi = new GroundInteraction();
	gi.update( 0.016, 50, - 80, 0 );
	gi.stampWheel( 52, - 78, 4, 0, { radius: 0.7, grass: 1.0, track: 0.9 } );
	const before = gi.sampleAt( 52, - 78 );

	// Move player +10 m east and -8 m north (forces texel-snapped sliding window shift)
	const oldOriginX = gi.originX, oldOriginZ = gi.originZ;
	gi.update( 0.016, 60, - 88, 0 );
	assert.ok( gi.originX > oldOriginX && gi.originZ < oldOriginZ, 'Sliding window origin shifted' );

	const after = gi.sampleAt( 52, - 78 );
	assert.ok( Math.abs( after.grass - before.grass ) < 0.02, `Grass shifted across recenter: ${ before.grass } -> ${ after.grass }` );
	assert.ok( Math.abs( after.track - before.track ) < 0.02, `Track shifted across recenter: ${ before.track } -> ${ after.track }` );

} );

test( 'GroundInteraction decays monotonically and heavy rain washes tire tracks faster', () => {

	const giDry = new GroundInteraction();
	const giRain = new GroundInteraction();
	giDry.update( 0.016, 0, 0, 0 );
	giRain.update( 0.016, 0, 0, 0 );
	giDry.stampWheel( 0, 0, 1, 0, { radius: 0.65, grass: 1.0, track: 0.9 } );
	giRain.stampWheel( 0, 0, 1, 0, { radius: 0.65, grass: 1.0, track: 0.9 } );

	for ( let s = 0; s < 10; s ++ ) {

		giDry.update( 1.0, 0, 0, 0.0 );
		giRain.update( 1.0, 0, 0, 1.0 );

	}

	const d = giDry.sampleAt( 0, 0 );
	const r = giRain.sampleAt( 0, 0 );
	assert.ok( d.grass < 0.6 && d.grass > 0.35, `Expected dry grass spring-back ~0.5 after 10s, got ${ d.grass }` );
	assert.ok( d.track > 0.55, `Expected dry tracks to linger after 10s, got ${ d.track }` );
	assert.ok( r.track < d.track * 0.7, `Expected heavy rain to wash away tracks faster (rain=${ r.track }, dry=${ d.track })` );

} );

// 3. WaypointMath coordinates, bearings, cardinals & arrival
test( 'WaypointMath computes accurate bearings, EN/ZH cardinals, arrival, and map round-trip', () => {

	assert.equal( Math.round( waypointDistance( 0, 0, 30, 40 ) ), 50 );
	assert.equal( Math.round( waypointBearingDeg( 0, 0, 0, - 50 ) ), 0 ); // North (-Z)
	assert.equal( Math.round( waypointBearingDeg( 0, 0, 50, 0 ) ), 90 ); // East (+X)
	assert.equal( Math.round( waypointBearingDeg( 0, 0, 0, 50 ) ), 180 ); // South (+Z)
	assert.equal( Math.round( waypointBearingDeg( 0, 0, - 50, 0 ) ), 270 ); // West (-X)

	assert.equal( compassCardinal( 135, 'en' ), 'SE' );
	assert.equal( compassCardinal( 135, 'zh' ), '东南' );
	assert.equal( compassCardinal( 359, 'zh' ), '北' );

	assert.equal( hasArrivedAtWaypoint( 290, 118, 296, 122, 12 ), true );
	assert.equal( hasArrivedAtWaypoint( 260, 118, 296, 122, 12 ), false );

	const size = 500, x0 = - 640, z0 = - 820, ext = 1280;
	const frac = worldToMapFraction( 296, 122, x0, z0, ext );
	const back = mapPixelToWorld( frac.u * size, frac.v * size, size, x0, z0, ext );
	assert.ok( Math.abs( back.x - 296 ) < 1e-6 && Math.abs( back.z - 122 ) < 1e-6 );

} );

console.log( `All ${ passed } Milestone 2 tests passed.` );
