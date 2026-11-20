import assert from 'node:assert/strict';
import { Vector3, Quaternion } from '../src/engine/index.js';
import { Input, filterLookDelta } from '../src/core/Input.js';
import { Colliders } from '../src/world/Colliders.js';
import { VehicleManager } from '../src/vehicles/VehicleManager.js';
import { Motorcycle } from '../src/vehicles/Motorcycle.js';
import { CoastalBuggy } from '../src/vehicles/CoastalBuggy.js';
import { TerrainGPU } from '../src/world/TerrainGPU.js';
import { Player } from '../src/player/Player.js';

let passed = 0;
function test( name, fn ) {

	fn();
	passed ++;
	console.log( `  ✓ ${ name }` );

}

function makeFlatTerrain( { baseY = 2.0, groundAt = null } = {} ) {

	return {
		origin: - 100,
		texel: 1,
		res: 1,
		heights: null,
		sand: new Uint8Array( [ 0 ] ),
		rock: null,
		heightAt( x, z ) {

			return groundAt ? groundAt( x, z ) : baseY;

		},
		normalAt( _x, _z, out = new Vector3() ) {

			return out.set( 0, 1, 0 );

		},
		pathDistance() {

			return - 0.5;

		},
	};

}

console.log( 'Bugfix & camera stabilization regression tests' );

// 1. Pointer-lock & warp-spike delta filtering
test( 'filterLookDelta rejects warp spikes and post-lock jumps while preserving smooth & ramped pans', () => {

	const st = { emaStep: 12, lastTime: 0, skipEvents: 1, graceUntil: 180 };

	// Initial post-lock event is dropped even if moderate
	const r0 = filterLookDelta( 35, - 12, st, 110 );
	assert.equal( r0.rejected, true );
	assert.equal( r0.x, 0 );

	// Inside grace window (< 180 ms): large jump dropped, small step accepted
	const rGraceBig = filterLookDelta( 60, 0, st, 140 );
	assert.equal( rGraceBig.rejected, true );
	const rGraceSmall = filterLookDelta( 10, - 4, st, 150 );
	assert.equal( rGraceSmall.rejected, false );
	assert.equal( rGraceSmall.x, 10 );

	// Smooth panning frames build normal EMA baseline
	let t = 200;
	for ( let i = 0; i < 6; i ++ ) {

		t += 16;
		const r = filterLookDelta( 11, - 3, st, t );
		assert.equal( r.rejected, false );

	}

	// Hard Chromium warp spikes are rejected
	const hard1 = filterLookDelta( 640, 0, st, t + 16 );
	assert.equal( hard1.rejected, true );
	const hard2 = filterLookDelta( 0, - 960, st, t + 24 );
	assert.equal( hard2.rejected, true );
	const hard3 = filterLookDelta( 170, 170, st, t + 30 );
	assert.equal( hard3.rejected, true );

	// Sudden mid-pan single-frame spike (e.g. 140px after ~11px panning) is rejected without poisoning EMA
	const spike = filterLookDelta( 140, 5, st, t + 36 );
	assert.equal( spike.rejected, true );

	// Subsequent genuine motion continues uninterrupted
	const okAfter = filterLookDelta( 12, 2, st, t + 48 );
	assert.equal( okAfter.rejected, false );
	assert.equal( okAfter.x, 12 );

	// Progressive intentional fast flick scales up smoothly without false rejection
	let mt = t + 200;
	for ( const dx of [ 28, 46, 68, 88, 105 ] ) {

		mt += 16;
		const r = filterLookDelta( dx, 0, st, mt );
		assert.equal( r.rejected, false, `Progressive flick step ${ dx } should not be rejected` );

	}

} );

// 2. Input gating, lookBlocked, clamping & resetLook
test( 'Input clamps consumeLook bursts, clears pending deltas on resetLook, and zeroes when lookBlocked', () => {

	const inp = new Input( null );
	inp.look.x = 420;
	inp.look.y = - 390;
	const c1 = inp.consumeLook();
	assert.equal( c1.x, 140 );
	assert.equal( c1.y, - 140 );
	assert.equal( inp.look.x, 0 );

	inp.look.x = 50;
	inp.wheel = 3;
	inp.setLookBlocked( true );
	assert.deepEqual( inp.consumeLook(), { x: 0, y: 0 } );
	assert.equal( inp.consumeWheel(), 0 );

	inp.setLookBlocked( false );
	inp.look.x = 25;
	inp.resetLook();
	assert.deepEqual( inp.consumeLook(), { x: 0, y: 0 } );

} );

// 3. VehicleManager separation on summonNear & frame update
test( 'VehicleManager prevents vehicle stacking on summonNear and physically separates overlapping vehicles', () => {

	const terrain = makeFlatTerrain( { baseY: 2.0 } );
	const mgr = new VehicleManager( { terrain } );
	const moto = new Motorcycle( { terrain, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	const buggy = new CoastalBuggy( { terrain, spawn: { position: new Vector3( 10, 0, 0 ), heading: 0 } } );
	mgr.register( moto );
	mgr.register( buggy );

	// Verify Motorcycle initial front/rear wheel world positions populated on spawn
	const distFrontRear = moto.frontWheelWorld.distanceTo( moto.rearWheelWorld );
	assert.ok( distFrontRear > 1.2, 'Motorcycle _placeOnGround sets front/rear wheel world coordinates' );

	const fakePlayer = { position: new Vector3( 0, 2.0, - 3.6 ), yaw: 0 };
	mgr.summonNear( fakePlayer, moto );
	mgr.summonNear( fakePlayer, buggy );
	const dSummoned = Math.hypot( moto.position.x - buggy.position.x, moto.position.z - buggy.position.z );
	assert.ok( dSummoned >= 2.55, `Summoned vehicles keep safe spacing (got ${ dSummoned.toFixed( 2 ) } m)` );

	// Force overlap and run mgr.update()
	moto.position.set( 5, 2.0, 5 );
	buggy.position.set( 5.2, 2.0, 5 );
	mgr.update( 1 / 60 );
	const dSep = Math.hypot( moto.position.x - buggy.position.x, moto.position.z - buggy.position.z );
	assert.ok( dSep > 1.5, `VehicleManager resolves inter-vehicle overlap (d=${ dSep.toFixed( 2 ) } m)` );

} );

// 4. CoastalBuggy resetUpright without colliders + Player camera chase hold & boat/vehicle priority
test( 'CoastalBuggy recovers from water without colliders, and Player pauses chase auto-align after mouse look', () => {

	const island = makeFlatTerrain( {
		groundAt: ( x, z ) => ( Math.hypot( x, z ) < 25 ? 2.5 : - 1.5 ),
	} );
	const buggy = new CoastalBuggy( { terrain: island, colliders: null, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	buggy.mount();
	buggy.teleportTo( 35, 0, 0 );
	buggy.update( 0.05 );
	assert.equal( buggy.waterStalled, true );
	buggy.resetUpright();
	assert.equal( buggy.waterStalled, false );
	assert.ok( island.heightAt( buggy.position.x, buggy.position.z ) > 0.6, 'CoastalBuggy recovers onto dry land even with colliders=null' );

	// Player chase camera hold & KeyV mode switch
	const fakeCamera = {
		position: new Vector3(),
		quaternion: new Quaternion(),
		fov: 62,
		updateProjectionMatrix() {},
		lookAt() {},
	};
	const inp = new Input( null );
	const mgr = new VehicleManager( { terrain: island } );
	mgr.register( buggy );

	const fakeBoat = {
		position: new Vector3( 100, 0, 100 ),
		quaternion: new Quaternion(),
		speed: 0,
		model: { boardPoint: new Vector3(), helmEye: new Vector3( 0, 1.5, 0 ), exitPoints: [] },
		toWorld( l, out ) { return out.copy( l ).add( this.position ); },
		getYaw() { return 0; },
	};
	const player = new Player( {
		camera: fakeCamera,
		input: inp,
		terrain: island,
		colliders: new Colliders(),
		query: { allocate: () => 0, setPoint() {}, cpuValid: false, cpu: [] },
		boat: fakeBoat,
		vehicles: mgr,
	} );

	buggy.teleportTo( 0, 0, 0 );
	player.mountVehicle( buggy );
	buggy.speed = 12;
	inp.look.x = 60;
	player.updateVehicle( 1 / 60 );
	assert.ok( player._vehLookHoldT > 1.5, 'Mouse look arms _vehLookHoldT hold timer' );
	const yawAfterLook = player.vehOrbitYaw;

	// Subsequent frame while holding speed should NOT swing camera back against user look
	player.updateVehicle( 1 / 60 );
	assert.equal( player.vehOrbitYaw, yawAfterLook, 'Chase auto-align pauses while _vehLookHoldT is active' );

	// KeyV resets camInit & look deltas
	inp.look.x = 40;
	inp.pressed.add( 'KeyV' );
	player.updateVehicle( 1 / 60 );
	assert.equal( player.camMode, 'first' );
	assert.equal( player.vehCamInit, false );
	assert.equal( inp.look.x, 0 );

} );

// 5. TerrainGPU.setShoreField persists shoreField reference for ShoreWaves.buildDirTexture
test( 'TerrainGPU.setShoreField assigns this.shoreField so ShoreWaves can build dirTexture', () => {

	const fake = {
		shoreRes: 0,
		shoreField: null,
		uniforms: { fields: { shoreRes: { value: 0 } } },
		shoreTexture: {
			width: 8,
			upload() {},
			destroy() {},
		},
	};
	const field = { res: 8, data: new Float32Array( 8 * 8 * 4 ) };
	TerrainGPU.prototype.setShoreField.call( fake, field );
	assert.equal( fake.shoreField, field );
	assert.equal( fake.shoreRes, 8 );
	assert.equal( fake.uniforms.fields.shoreRes.value, 8 );

} );

console.log( `\nAll ${ passed } bugfix regression tests passed.` );
