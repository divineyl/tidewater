import assert from 'node:assert/strict';
import { Vector3 } from '../src/engine/index.js';
import { G } from '../src/engine/render/Frame.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Colliders } from '../src/world/Colliders.js';
import { UPGRADES, gearStats } from '../src/game/Gear.js';
import { GameState } from '../src/game/GameState.js';
import { VehicleManager } from '../src/vehicles/VehicleManager.js';
import { Motorcycle } from '../src/vehicles/Motorcycle.js';
import { CoastalBuggy } from '../src/vehicles/CoastalBuggy.js';
import { BuggyModel } from '../src/vehicles/BuggyModel.js';
import { addVehicleLights } from '../src/materials/LocalLights.js';
import { DEFAULT_PREFS, normalizePrefs } from '../src/core/Prefs.js';
import { getLang, setLang, tr, trUpgradeName, trUpgradeLabel } from '../src/i18n/i18n.js';

let passed = 0;
function test( name, fn ) {

	fn();
	passed ++;
	console.log( `  ✓ ${ name }` );

}

function makeMemoryStorage() {

	const m = new Map();
	return {
		getItem: ( k ) => ( m.has( k ) ? m.get( k ) : null ),
		setItem: ( k, v ) => { m.set( k, String( v ) ); },
	};

}

function makeFlatTerrain( { baseY = 2.0, surface = 'sand', groundAtZ = null, pathAt = null } = {} ) {

	return {
		origin: - 100,
		texel: 1,
		res: 1,
		heights: null,
		sand: surface === 'sand' ? new Uint8Array( [ 255 ] ) : new Uint8Array( [ 0 ] ),
		rock: null,
		heightAt( _x, z ) {

			return groundAtZ ? groundAtZ( z ) : baseY;

		},
		normalAt( _x, _z, out = new Vector3() ) {

			return out.set( 0, 1, 0 );

		},
		pathDistance( x, z ) {

			if ( pathAt ) return pathAt( x, z );
			return surface === 'path' ? - 0.5 : 10.0;

		},
	};

}

function stepVehicle( vh, controls, seconds ) {

	const dt = 1 / 60;
	const n = Math.round( seconds / dt );
	for ( let i = 0; i < n; i ++ ) {

		vh.setInput( controls );
		vh.update( dt );

	}

}

console.log( 'Milestone 3 systems tests' );

// 1. Economy x Vehicle Upgrades (Gear.js + GameState save/load)
test( 'UPGRADES defines vehTires, vehEngine, vehSuspension, vehLights and persists through GameState', () => {

	for ( const key of [ 'vehTires', 'vehEngine', 'vehSuspension', 'vehLights' ] ) {

		assert.ok( UPGRADES[ key ], `Missing upgrade track ${ key }` );
		assert.ok( UPGRADES[ key ].levels.length >= 2, `Track ${ key } must have >= 2 levels` );

	}

	const storage = makeMemoryStorage();
	const state = new GameState( storage );
	state.money = 5000;

	// Buy every level of each land vehicle track
	while ( state.buy( 'vehTires' ) ) {}
	while ( state.buy( 'vehEngine' ) ) {}
	while ( state.buy( 'vehSuspension' ) ) {}
	while ( state.buy( 'vehLights' ) ) {}

	assert.equal( state.upgrades.vehTires, 2 );
	assert.equal( state.upgrades.vehEngine, 2 );
	assert.equal( state.upgrades.vehSuspension, 2 );
	assert.equal( state.upgrades.vehLights, 1 );

	const st = state.stats;
	assert.equal( st.vehGripMul, 1.24 );
	assert.equal( st.vehSandDragMul, 0.45 );
	assert.equal( st.vehWetGripBonus, 0.16 );
	assert.equal( st.vehPowerMul, 1.38 );
	assert.equal( st.vehSpeedBonusKmh, 26 );
	assert.equal( st.vehClimbMul, 1.50 );
	assert.equal( st.vehWadeDepthBonus, 0.55 );
	assert.equal( st.vehLightMul, 1.65 );
	assert.equal( st.vehLightRangeMul, 1.55 );

	state.save();
	const reloaded = new GameState( storage );
	assert.ok( reloaded.load(), 'Reloaded GameState succeeds' );
	assert.equal( reloaded.upgrades.vehTires, 2 );
	assert.equal( reloaded.upgrades.vehEngine, 2 );
	assert.equal( reloaded.upgrades.vehSuspension, 2 );
	assert.equal( reloaded.upgrades.vehLights, 1 );
	assert.equal( reloaded.stats.vehSpeedBonusKmh, 26 );

} );

// 2. Upgraded tires & engine noticeably boost sand speed; upgraded suspension raises wading tolerance
test( 'Upgrades improve sand top speed and deep wading survival on Motorcycle & CoastalBuggy', () => {

	G.weather.value.set( 0, 0, 0, 0 );
	G.seaLevel.value = 0;

	const maxStats = gearStats( { vehTires: 2, vehEngine: 2, vehSuspension: 2, vehLights: 1 } );
	const sandTerrain = makeFlatTerrain( { baseY: 1.2, surface: 'sand' } );

	// Buggy sand acceleration & top speed comparison
	const stockBuggy = new CoastalBuggy( { terrain: sandTerrain, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	const upBuggy = new CoastalBuggy( { terrain: sandTerrain, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	upBuggy.applyUpgrades( maxStats );
	stockBuggy.mount();
	upBuggy.mount();
	stepVehicle( stockBuggy, { throttle: 1, brake: 0, steer: 0 }, 5.5 );
	stepVehicle( upBuggy, { throttle: 1, brake: 0, steer: 0 }, 5.5 );
	assert.ok( upBuggy.speed > stockBuggy.speed + 4.5,
		`Expected upgraded buggy (${ upBuggy.speed.toFixed( 1 ) } m/s) to significantly beat stock (${ stockBuggy.speed.toFixed( 1 ) } m/s)` );

	// Motorcycle sand acceleration & top speed comparison
	const stockMoto = new Motorcycle( { terrain: sandTerrain, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	const upMoto = new Motorcycle( { terrain: sandTerrain, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	upMoto.applyUpgrades( maxStats );
	stockMoto.mount();
	upMoto.mount();
	stepVehicle( stockMoto, { throttle: 1, brake: 0, steer: 0 }, 5.5 );
	stepVehicle( upMoto, { throttle: 1, brake: 0, steer: 0 }, 5.5 );
	assert.ok( upMoto.speed > stockMoto.speed + 4.5,
		`Expected upgraded motorcycle (${ upMoto.speed.toFixed( 1 ) } m/s) to significantly beat stock (${ stockMoto.speed.toFixed( 1 ) } m/s)` );

	// Wading tolerance: 1.10 m water stalls stock Buggy (> 0.85 m), but upgraded (+0.55 m => 1.40 m) survives
	const buggyDeep = makeFlatTerrain( { baseY: - 1.10, surface: 'sand' } );
	const bStockW = new CoastalBuggy( { terrain: buggyDeep, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	const bUpW = new CoastalBuggy( { terrain: buggyDeep, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	bUpW.applyUpgrades( maxStats );
	bStockW.mount();
	bUpW.mount();
	stepVehicle( bStockW, { throttle: 0.5, brake: 0, steer: 0 }, 0.35 );
	stepVehicle( bUpW, { throttle: 0.5, brake: 0, steer: 0 }, 0.35 );
	assert.equal( bStockW.waterStalled, true, 'Stock buggy stalls at 1.10 m water depth' );
	assert.equal( bUpW.waterStalled, false, 'Snorkel-upgraded buggy survives 1.10 m water depth' );

	// Wading tolerance on Motorcycle: 0.78 m water stalls stock moto (~0.55 m), upgraded (+0.55 m) survives
	const motoDeep = makeFlatTerrain( { baseY: - 0.78, surface: 'sand' } );
	const mStockW = new Motorcycle( { terrain: motoDeep, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	const mUpW = new Motorcycle( { terrain: motoDeep, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	mUpW.applyUpgrades( maxStats );
	mStockW.mount();
	mUpW.mount();
	stepVehicle( mStockW, { throttle: 0.5, brake: 0, steer: 0 }, 0.35 );
	stepVehicle( mUpW, { throttle: 0.5, brake: 0, steer: 0 }, 0.35 );
	assert.equal( mStockW.waterStalled, true, 'Stock motorcycle stalls at 0.78 m water depth' );
	assert.equal( mUpW.waterStalled, false, 'Snorkel-upgraded motorcycle survives 0.78 m water depth' );

} );

// 3. BuggyModel & LocalLights dynamic LED boost + range scaling
test( 'BuggyModel builds cleanly and LocalLights scales headlight intensity/range with vehLights', () => {

	const model = new BuggyModel();
	assert.ok( model.group && model.wheels && model.wheels.fl && model.wheels.rr, 'BuggyModel exposes group and 4 wheels' );
	assert.equal( model.driverGroup.visible, false );
	model.setRiderVisible( true );
	assert.equal( model.driverGroup.visible, true );

	const terrain = makeFlatTerrain( { baseY: 2.0, surface: 'path' } );
	const buggy = new CoastalBuggy( { model, terrain, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	buggy.toggleHeadlight( true );

	const lightSink = { list: [], add( s ) { this.list.push( s ); } };
	addVehicleLights( lightSink, buggy );
	const head = lightSink.list.find( ( l ) => l.kind === 'vehicleHeadlight' );
	assert.ok( head, 'Registered vehicleHeadlight source for buggy' );
	head.update();
	const stockIntensity = head.intensity;
	const stockRange = head.range;

	const upStats = gearStats( { vehLights: 1 } );
	buggy.applyUpgrades( upStats );
	buggy.update( 0.016 );
	head.update();

	assert.ok( Math.abs( head.intensity / stockIntensity - 1.65 ) < 1e-4, 'Headlight intensity scales by 1.65x with LED upgrade' );
	assert.ok( Math.abs( head.range / stockRange - 1.55 ) < 1e-4, 'Headlight range scales by 1.55x with LED upgrade' );
	assert.ok( model.ledBarMat.emissiveIntensity > 5.0, 'Roof LED bar emissive intensity boosts when upgraded & lit' );

} );

// 4. CoastalBuggy real-terrain spawn, 4-corner terrain probing, acceleration, reverse, outward roll, collision & stall recovery
test( 'CoastalBuggy spawns level on beach road, probes 4 corners, steers with outward roll, reverses, collides, and recovers', () => {

	G.weather.value.set( 0, 0, 0, 0 );
	G.seaLevel.value = 0;

	const realTerrain = new TerrainData();
	const sp = WORLD.vehicleSpawns.buggy;
	assert.ok( sp && sp.position, 'WORLD.vehicleSpawns.buggy defined' );
	const realBuggy = new CoastalBuggy( { terrain: realTerrain, spawn: sp } );
	assert.ok( realBuggy.position.y > 1.5, `Buggy spawns on dry coastal terrain (y=${ realBuggy.position.y.toFixed( 2 ) })` );
	assert.ok( Math.abs( realBuggy.pitch ) < 0.12 && Math.abs( realBuggy.roll ) < 0.12, 'Spawn attitude is nearly level' );
	assert.equal( realBuggy.wheelWorlds.length, 4 );
	assert.equal( realBuggy.rearWheelWorlds.length, 2 );

	// 4-corner slope test: uphill toward +Z should tilt pitch negative (nose up in +Z heading)
	const rampTerrain = makeFlatTerrain( {
		surface: 'path',
		groundAtZ: ( z ) => 2.0 + Math.max( 0, z ) * 0.2,
	} );
	const rampBuggy = new CoastalBuggy( { terrain: rampTerrain, spawn: { position: new Vector3( 0, 0, 5 ), heading: 0 } } );
	assert.ok( rampBuggy.pitch < - 0.12, `Nose climbs uphill slope (pitch=${ rampBuggy.pitch.toFixed( 3 ) })` );

	// Driving: forward gears, left turn outward body roll, and reverse gear
	const roadTerrain = makeFlatTerrain( { baseY: 2.0, surface: 'path' } );
	const colliders = new Colliders();
	colliders.addCylinder( 0, 22, 1.8, 0, 8, 'test-rock' );
	const drv = new CoastalBuggy( { terrain: roadTerrain, colliders, spawn: { position: new Vector3( 0, 0, - 30 ), heading: 0 } } );
	drv.mount();

	// Accelerate straight
	stepVehicle( drv, { throttle: 1, brake: 0, steer: 0 }, 2.2 );
	assert.ok( drv.speed > 10 && Number( drv.gear ) >= 2, `Accelerates & shifts forward gears (v=${ drv.speed.toFixed( 1 ) }, gear=${ drv.gear })` );

	// Left steer (+1) -> positive yawRate -> positive dynRoll (chassis leans outward to the right / +Z lifts left side)
	stepVehicle( drv, { throttle: 0.9, brake: 0, steer: 1 }, 0.6 );
	assert.ok( drv.steerAngle > 0.05 && drv.yawRate > 0.2, 'Steers left cleanly' );
	assert.ok( drv.dynRoll > 0.01, `Exhibits outward centrifugal body roll on turn (dynRoll=${ drv.dynRoll.toFixed( 4 ) })` );

	// Come to rest and hold brake to engage reverse gear
	drv.teleportTo( 0, - 10, 0 );
	stepVehicle( drv, { throttle: 0, brake: 1, steer: 0 }, 1.6 );
	assert.equal( drv.gear, 'R', 'Engages reverse gear when braking from rest' );
	assert.ok( drv.forwardSpeed < - 2.0 && drv.forwardSpeed >= - 5.25, `Reverses smoothly (v=${ drv.forwardSpeed.toFixed( 2 ) } m/s)` );

	// Solid cylinder collision stops penetration past z ~ 20.2 - radius
	drv.teleportTo( 0, 14, 0 );
	stepVehicle( drv, { throttle: 1, brake: 0, steer: 0 }, 1.2 );
	assert.ok( Math.hypot( drv.position.x - 0, drv.position.z - 22 ) >= 1.8 + drv.colliderRadius - 0.1, 'Buggy collider resolves against solid obstacle' );

	// Deep water stall + resetUpright dry shoreline recovery
	const coastalSlope = makeFlatTerrain( {
		surface: 'sand',
		groundAtZ: ( z ) => ( z > 30 ? - 1.5 : 2.2 ),
	} );
	const waterBuggy = new CoastalBuggy( { terrain: coastalSlope, colliders: new Colliders(), spawn: { position: new Vector3( 0, 0, 15 ), heading: 0 } } );
	waterBuggy.mount();
	waterBuggy.teleportTo( 0, 35, 0 );
	waterBuggy.update( 0.05 );
	assert.equal( waterBuggy.waterStalled, true );
	waterBuggy.resetUpright();
	assert.equal( waterBuggy.waterStalled, false );
	assert.ok( coastalSlope.heightAt( waterBuggy.position.x, waterBuggy.position.z ) > 0.5, 'resetUpright recovers stalled buggy onto dry ground' );

} );

// 5. VehicleManager multi-vehicle selection + summoning + Prefs round-trip
test( 'VehicleManager selects nearest mountable/active vehicle, summons independently, and Prefs persists buggyPose', () => {

	const terrain = makeFlatTerrain( {
		baseY: 2.2,
		surface: 'path',
		groundAtZ: ( z ) => ( z > 20 ? - 2.0 : 2.2 ),
	} );
	const mgr = new VehicleManager( { terrain } );
	const moto = new Motorcycle( { terrain, spawn: { position: new Vector3( - 10, 0, 0 ), heading: 0 } } );
	const buggy = new CoastalBuggy( { terrain, spawn: { position: new Vector3( 10, 0, 0 ), heading: 1.2 } } );
	mgr.register( moto );
	mgr.register( buggy );

	assert.equal( mgr.getNearestMountable( new Vector3( 9.5, 2.2, 0 ) ), buggy );
	assert.equal( mgr.getNearestMountable( new Vector3( - 9.2, 2.2, 0 ) ), moto );
	assert.equal( mgr.getNearestMountable( new Vector3( 0, 2.2, 0 ) ), null );

	assert.equal( mgr.getActiveOrNearest( new Vector3( 11, 2.2, 0 ) ), buggy );
	moto.mount();
	assert.equal( mgr.getActiveOrNearest( new Vector3( 11, 2.2, 0 ) ), moto, 'Active occupied vehicle wins getActiveOrNearest' );
	moto.dismount();

	// Onshore summon brings target vehicle near player; offshore summon returns target to its own spawnPosition
	const resOn = mgr.summonNear( { position: new Vector3( 0, 2.2, 5 ), yaw: 0 }, buggy );
	assert.equal( resOn.atPlayer, true );
	assert.ok( buggy.position.distanceTo( new Vector3( 0, 2.2, 5 ) ) < 8 );

	const resOff = mgr.summonNear( { position: new Vector3( 0, 0, 40 ), yaw: 0 }, buggy );
	assert.equal( resOff.atPlayer, false );
	assert.ok( Math.hypot( buggy.position.x - 10, buggy.position.z - 0 ) < 0.2, 'Offshore summon returns buggy to buggy spawnPosition' );

	// Prefs normalization
	assert.equal( DEFAULT_PREFS.buggyPose, null );
	const norm = normalizePrefs( {
		motorcyclePose: { x: 1, z: 2, yaw: 0.5 },
		buggyPose: { x: 64.5, z: - 84, yaw: 0.95 },
	} );
	assert.deepEqual( norm.buggyPose, { x: 64.5, z: - 84, yaw: 0.95 } );
	assert.equal( normalizePrefs( { buggyPose: { x: 99999, z: NaN, yaw: 0 } } ).buggyPose, null );

} );

// 6. Localization (i18n.js) covers M3 garage upgrades and Coastal Buggy labels
test( 'i18n translates all Milestone 3 upgrades and Coastal Buggy strings in zh and en', () => {

	const prev = getLang();
	try {

		setLang( 'zh' );
		for ( const key of [ 'vehTires', 'vehEngine', 'vehSuspension', 'vehLights' ] ) {

			const zhName = trUpgradeName( key, UPGRADES[ key ].name );
			assert.notEqual( zhName, UPGRADES[ key ].name, `Expected Chinese name for ${ key }` );
			const zhLvl = trUpgradeLabel( key, 1, UPGRADES[ key ].levels[ 1 ].label );
			assert.notEqual( zhLvl, UPGRADES[ key ].levels[ 1 ].label, `Expected Chinese level label for ${ key }` );

		}

		assert.equal( tr( 'Coastal Buggy' ), '海岸越野车' );
		assert.equal( tr( 'Summon Coastal Buggy' ), '召唤海岸越野车' );
		assert.equal( tr( 'Garage upgrades' ), '载具改装状态' );
		assert.equal( tr( 'Off-road tires' ), '全地形轮胎' );

		setLang( 'en' );
		assert.equal( tr( 'Coastal Buggy' ), 'Coastal Buggy' );
		assert.equal( trUpgradeName( 'vehEngine', UPGRADES.vehEngine.name ), 'Land powertrain' );

	} finally {

		setLang( prev );

	}

} );

console.log( `\nAll ${ passed } Milestone 3 tests passed.` );
