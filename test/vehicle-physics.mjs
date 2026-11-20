// Plain-node physics and manager tests for land vehicles (no GPU / WebGPU context required).
import { VehicleManager } from '../src/vehicles/VehicleManager.js';
import { Motorcycle } from '../src/vehicles/Motorcycle.js';
import { Colliders } from '../src/world/Colliders.js';
import { Vector3 } from '../src/engine/index.js';
import { G } from '../src/engine/render/Frame.js';

let fails = 0;
const ok = ( cond, msg ) => {

	if ( ! cond ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else {

		console.log( 'ok  ', msg );

	}

};

// Mock terrain: flat path/sand platform around origin dropping into deep sea beyond z > 60
function makeTerrain( baseY = 2.0 ) {

	return {
		origin: - 100,
		texel: 1,
		res: 200,
		heights: null,
		sand: null,
		rock: null,
		heightAt( _x, z ) {

			if ( z > 60 ) return - 1.5; // deep water
			if ( z > 45 ) return - 0.2; // shallows
			return baseY;

		},
		pathDistance( x, _z ) {

			return Math.abs( x ) < 2 ? - 0.5 : 5.0; // worn dirt trail near x = 0

		},
	};

}

function stepBike( bike, controls, seconds ) {

	const dt = 1 / 60;
	const n = Math.round( seconds / dt );
	for ( let i = 0; i < n; i ++ ) {

		bike.setInput( controls, dt );
		bike.update( dt );

	}

}

// 1. Spawn settled on kickstand
{

	G.weather.value.set( 0, 0, 0, 0 );
	const terrain = makeTerrain( 2.5 );
	const colliders = new Colliders();
	const bike = new Motorcycle( { terrain, colliders, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	ok( Math.abs( bike.position.y - 2.5 ) < 0.05, 'motorcycle settles cleanly on terrain height' );
	ok( bike.roll < - 0.1 && bike.kickstand === 1, 'parked motorcycle leans onto left kickstand' );

}

// 2. Forward acceleration, 5-speed upshift, and slow reverse
{

	G.weather.value.set( 0, 0, 0, 0 );
	const terrain = makeTerrain( 2.0 );
	const colliders = new Colliders();
	const bike = new Motorcycle( { terrain, colliders, spawn: { position: new Vector3( 0, 0, - 20 ), heading: 0 } } );
	bike.mount();
	stepBike( bike, { throttle: 1, brake: 0, steer: 0 }, 3.5 );
	ok( bike.speed > 12 && bike.forwardSpeed > 12, `accelerates briskly on dirt path (${ bike.speed.toFixed( 1 ) } m/s)` );
	ok( Number( bike.gear ) >= 3, `shifts up through gears (gear=${ bike.gear })` );

	// Brake to stop then reverse slowly
	stepBike( bike, { throttle: 0, brake: 1, steer: 0 }, 3.0 );
	ok( bike.gear === 'R' && bike.forwardSpeed < - 0.2 && bike.forwardSpeed >= - 1.5,
		`reverses slowly when holding brake from rest (v=${ bike.forwardSpeed.toFixed( 2 ) } m/s)` );

}

// 3. Steering & inward lean direction (+steer = left turn => negative Z roll)
{

	G.weather.value.set( 0, 0, 0, 0 );
	const terrain = makeTerrain( 2.0 );
	const bike = new Motorcycle( { terrain, colliders: new Colliders(), spawn: { position: new Vector3( 0, 0, - 10 ), heading: 0 } } );
	bike.mount();
	stepBike( bike, { throttle: 0.7, steer: 0.8 }, 1.6 );
	ok( bike.yaw > 0.3, `left steering increases heading yaw (${ bike.yaw.toFixed( 2 ) } rad)` );
	ok( bike.roll < - 0.08, `left turn leans bike inward to left (roll=${ bike.roll.toFixed( 3 ) })` );
	ok( Number.isFinite( bike.velocity.x ) && Number.isFinite( bike.velocity.z ), 'cornering physics stays finite' );

	const bikeR = new Motorcycle( { terrain, colliders: new Colliders(), spawn: { position: new Vector3( 0, 0, - 10 ), heading: 0 } } );
	bikeR.mount();
	stepBike( bikeR, { throttle: 0.7, steer: - 0.8 }, 1.6 );
	ok( bikeR.yaw < - 0.3 && bikeR.roll > 0.08, `right turn leans inward to right (roll=${ bikeR.roll.toFixed( 3 ) })` );

}

// 4. Weather wetness cuts surface grip
{

	const terrain = makeTerrain( 2.0 );
	const bike = new Motorcycle( { terrain, colliders: new Colliders(), spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	bike.mount();
	G.weather.value.y = 0.0;
	stepBike( bike, { throttle: 0.5, steer: 0 }, 0.4 );
	const dryGrip = bike.surfaceGrip;

	G.weather.value.y = 1.0;
	stepBike( bike, { throttle: 0.5, steer: 0 }, 0.4 );
	const wetGrip = bike.surfaceGrip;
	ok( wetGrip < dryGrip * 0.8, `rain wetness reduces tire traction (${ dryGrip.toFixed( 2 ) } -> ${ wetGrip.toFixed( 2 ) })` );
	G.weather.value.y = 0.0;

}

// 5. Water stall & dry-land reset/summon recovery
{

	const terrain = makeTerrain( 2.0 );
	const colliders = new Colliders();
	const bike = new Motorcycle( { terrain, colliders, spawn: { position: new Vector3( 0, 0, 62 ), heading: 0 } } );
	bike.mount();
	stepBike( bike, { throttle: 1, steer: 0 }, 0.5 );
	ok( bike.waterStalled === true, 'motorcycle stalls in deep water' );

	bike.resetUpright();
	ok( bike.waterStalled === false && bike.position.y > 0.3, 'resetUpright recovers stalled bike onto dry land' );

	const vm = new VehicleManager( { terrain, colliders } );
	vm.register( bike );
	const playerOnDry = { position: new Vector3( 10, 2.0, 5 ), yaw: 0 };
	const resDry = vm.summonNear( playerOnDry, bike );
	ok( resDry.ok && resDry.atPlayer && Math.hypot( bike.position.x - 10, bike.position.z - 5 ) < 6, 'summonNear delivers bike near player on land' );

	const playerAtSea = { position: new Vector3( 0, 0, 75 ), yaw: 0 };
	const resSea = vm.summonNear( playerAtSea, bike );
	ok( resSea.ok && ! resSea.atPlayer, 'summonNear falls back safely when player is offshore' );

}

// 6. Solid obstacle collision
{

	const terrain = makeTerrain( 2.0 );
	const colliders = new Colliders();
	colliders.addBox( new Vector3( 0, 3.0, 10 ), new Vector3( 3, 2, 1 ), 0, { solid: true, tag: 'wall' } );
	const bike = new Motorcycle( { terrain, colliders, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	bike.mount();
	stepBike( bike, { throttle: 1, steer: 0 }, 2.2 );
	ok( bike.position.z < 9.0, `solid obstacle blocks motorcycle advance (z=${ bike.position.z.toFixed( 2 ) })` );

}

if ( fails > 0 ) {

	console.log( `${ fails } failed` );
	process.exit( 1 );

} else {

	console.log( 'all passed' );

}
