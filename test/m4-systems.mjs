import assert from 'node:assert/strict';
import path from 'node:path';
import { Vector3 } from '../src/engine/index.js';
import { G } from '../src/engine/render/Frame.js';
import { DEFAULT_PREFS, normalizePrefs, buildSaveBundle, parseSaveBundle } from '../src/core/Prefs.js';
import { Input } from '../src/core/Input.js';
import { GameState } from '../src/game/GameState.js';
import { MotorcycleModel } from '../src/vehicles/MotorcycleModel.js';
import { BuggyModel } from '../src/vehicles/BuggyModel.js';
import { Motorcycle } from '../src/vehicles/Motorcycle.js';
import { CoastalBuggy } from '../src/vehicles/CoastalBuggy.js';
import { addVehicleLights } from '../src/materials/LocalLights.js';
import { assertPngIhDR8BitRgba } from '../scripts/optimize-assets.mjs';
import { getLang, setLang, tr } from '../src/i18n/i18n.js';

let passed = 0;
function test( name, fn ) {

	fn();
	passed ++;
	console.log( `  ✓ ${ name }` );

}

function makeFlatTerrain( groundAt ) {

	return {
		origin: - 100,
		texel: 1,
		res: 1,
		heights: null,
		sand: new Uint8Array( [ 0 ] ),
		rock: null,
		heightAt( x, z ) { return groundAt( x, z ); },
		normalAt( _x, _z, out = new Vector3() ) { return out.set( 0, 1, 0 ); },
		pathDistance() { return - 0.5; },
	};

}

console.log( 'Milestone 4 systems tests' );

// 1. Prefs M4 fields & v2 Save Bundle Export/Import
test( 'Prefs normalizes sensitivity/audio/livery/tint/postcard fields and round-trips v2 save bundles', () => {

	assert.equal( DEFAULT_PREFS.lookSensitivity, 1 );
	assert.equal( DEFAULT_PREFS.invertY, false );
	assert.equal( DEFAULT_PREFS.vehPaint, 'stock' );
	assert.equal( DEFAULT_PREFS.vehLightTint, 'warm' );
	assert.equal( DEFAULT_PREFS.photoPostcard, true );
	assert.equal( DEFAULT_PREFS.cloudQuality, 'high' );
	assert.equal( DEFAULT_PREFS.caustics, true );
	assert.equal( DEFAULT_PREFS.autoFps, false );

	const clamped = normalizePrefs( {
		qualityPreset: 'potato',
		renderScale: 0.4,
		cloudQuality: 'off',
		caustics: false,
		autoFps: true,
		lookSensitivity: 99,
		invertY: true,
		volAmbient: - 1,
		volWeather: 5,
		vehPaint: 'teal',
		vehLightTint: 'led',
		photoPostcard: false,
	} );
	assert.equal( clamped.qualityPreset, 'potato' );
	assert.equal( clamped.renderScale, 0.4 );
	assert.equal( clamped.cloudQuality, 'off' );
	assert.equal( clamped.caustics, false );
	assert.equal( clamped.autoFps, true );
	assert.equal( normalizePrefs( { cloudQuality: 'ultra-fake', renderScale: 0.1 } ).cloudQuality, 'high' );
	assert.equal( normalizePrefs( { renderScale: 0.1 } ).renderScale, 0.4 );
	assert.equal( clamped.lookSensitivity, 2.2 );
	assert.equal( clamped.invertY, true );
	assert.equal( clamped.volAmbient, 0 );
	assert.equal( clamped.volWeather, 1 );
	assert.equal( clamped.vehPaint, 'teal' );
	assert.equal( clamped.vehLightTint, 'led' );
	assert.equal( clamped.photoPostcard, false );
	assert.equal( normalizePrefs( { vehPaint: 'invalid', vehLightTint: 'violet' } ).vehPaint, 'stock' );
	assert.equal( normalizePrefs( { vehLightTint: 'violet' } ).vehLightTint, 'warm' );

	const gs = new GameState( null );
	gs.money = 1234;
	gs.upgrades.vehEngine = 2;
	const bundle = buildSaveBundle( gs.toJSON(), clamped );
	const raw = JSON.stringify( bundle );
	const parsed = parseSaveBundle( raw );
	assert.equal( parsed.ok, true );
	assert.equal( parsed.game.money, 1234 );
	assert.equal( parsed.prefs.vehPaint, 'teal' );
	assert.equal( parsed.prefs.lookSensitivity, 2.2 );

	// Raw v1 GameState fallback works
	const v1Parsed = parseSaveBundle( JSON.stringify( gs.toJSON() ) );
	assert.equal( v1Parsed.ok, true );
	assert.equal( v1Parsed.game.money, 1234 );
	assert.equal( v1Parsed.prefs, null );

	// Corrupt/unrelated JSON fails cleanly
	assert.equal( parseSaveBundle( '{bad json' ).ok, false );
	assert.equal( parseSaveBundle( '{"hello":"world"}' ).ok, false );

} );

// 2. Input sensitivity scaling & Y-axis inversion
test( 'Input scales look deltas by sensitivity and inverts Y when invertY is enabled', () => {

	const inp = new Input( null );
	inp.sensitivity = 1.5;
	inp.invertY = true;
	inp.look.x = 20;
	inp.look.y = 10;
	const l = inp.consumeLook();
	assert.equal( l.x, 30 );
	assert.equal( l.y, - 15 );

	// Clamp still applies before multiplier
	inp.look.x = 300;
	inp.look.y = - 300;
	const clamped = inp.consumeLook();
	assert.equal( clamped.x, 140 * 1.5 );
	assert.equal( clamped.y, 140 * 1.5 );

} );

// 3. Vehicle liveries, light tints, volumetric beams & LocalLights tint sync
test( 'MotorcycleModel & BuggyModel update paint liveries, light tints, volumetric beam cones, and LocalLights color', () => {

	const motoModel = new MotorcycleModel();
	const buggyModel = new BuggyModel();

	assert.ok( motoModel.beamMesh && motoModel.beamMat, 'MotorcycleModel builds volumetric headlight cone' );
	assert.ok( buggyModel.beamMesh && buggyModel.beamMat, 'BuggyModel builds twin volumetric headlight cones' );
	assert.equal( motoModel.beamMesh.visible, false );
	assert.equal( buggyModel.beamMesh.visible, false );

	motoModel.setPaint( 'coral' );
	assert.equal( motoModel.paintMat.uniforms.paintReplace.value, 1 );
	motoModel.setPaint( 'stock' );
	assert.equal( motoModel.paintMat.uniforms.paintReplace.value, 0 );

	buggyModel.setPaint( 'teal' );
	assert.equal( buggyModel.paintMat.uniforms.paintReplace.value, 1 );

	motoModel.setState( { headlightOn: true, night: 1, ledBoost: true } );
	buggyModel.setState( { headlightOn: true, storm: 1, ledBoost: true } );
	assert.equal( motoModel.beamMesh.visible, true );
	assert.equal( buggyModel.beamMesh.visible, true );
	assert.ok( motoModel.beamMat.uniforms.beamAlpha.value > 1.0 );
	assert.ok( buggyModel.beamMat.uniforms.beamAlpha.value > 1.0 );

	const terrain = makeFlatTerrain( () => 2.0 );
	const buggy = new CoastalBuggy( { model: buggyModel, terrain, spawn: { position: new Vector3( 0, 0, 0 ), heading: 0 } } );
	const sink = { list: [], add( s ) { this.list.push( s ); } };
	addVehicleLights( sink, buggy );
	const head = sink.list.find( ( l ) => l.kind === 'vehicleHeadlight' );

	buggy.setLightTint( 'amber' );
	head.update();
	assert.ok( head.color.r > 0.9 && head.color.b < 0.4, 'Amber fog tint shifts LocalLights spot color warm amber' );

	buggy.setLightTint( 'led' );
	head.update();
	assert.ok( head.color.b > head.color.r, 'Ice white LED tint shifts LocalLights spot color cool blue-white' );

} );

// 4. Jump stunt landing detection on Motorcycle & CoastalBuggy
test( 'Motorcycle and CoastalBuggy trigger onJumpLand callback after big dune drops', () => {

	G.weather.value.set( 0, 0, 0, 0 );
	G.seaLevel.value = 0;

	// Cliff drop terrain: y = 8 for z < 0, drops to y = 2 for z >= 0 -> ~1.1s fall + horizontal travel
	const dropTerrain = makeFlatTerrain( ( _x, z ) => ( z < 0 ? 8.0 : 2.0 ) );

	for ( const Cls of [ Motorcycle, CoastalBuggy ] ) {

		const vh = new Cls( { terrain: dropTerrain, spawn: { position: new Vector3( 0, 0, - 18 ), heading: 0 } } );
		let stunt = null;
		vh.onJumpLand = ( ev ) => { stunt = ev; };
		vh.mount();

		const dt = 1 / 60;
		for ( let i = 0; i < 240; i ++ ) {

			vh.setInput( { throttle: 1, brake: 0, steer: 0 } );
			vh.update( dt );
			if ( stunt ) break;

		}

		assert.ok( stunt, `Expected ${ Cls.name } to fire onJumpLand over cliff drop` );
		assert.ok( stunt.airTime >= 0.60, `Expected airtime >= 0.60s (got ${ stunt.airTime.toFixed( 2 ) })` );
		assert.ok( stunt.distance >= 3.0, `Expected distance >= 3.0m (got ${ stunt.distance.toFixed( 1 ) })` );

	}

} );

// 5. Public asset optimization PNG IHDR & compressed size verification
test( 'Public whale textures remain 2048x1024 8-bit non-interlaced RGBA PNGs and stay compact (< 5 MB)', () => {

	for ( const fn of [ 'humpback_height.png', 'humpback_albedo.png' ] ) {

		const fp = path.resolve( 'public', 'models', 'whale', fn );
		const info = assertPngIhDR8BitRgba( fp );
		assert.ok( info.width <= 2048 && info.height <= 1024, `${ fn } dimensions stay within 2048x1024` );
		assert.ok( info.bytes < 5 * 1024 * 1024, `${ fn } stays compressed under 5 MB (got ${ ( info.bytes / 1024 / 1024 ).toFixed( 2 ) } MB)` );

	}

} );

// 6. i18n coverage for M4 UI labels
test( 'i18n translates all Milestone 4 controls, liveries, tints, postcard & save actions', () => {

	const prev = getLang();
	try {

		setLang( 'zh' );
		for ( const key of [
			'Postcard: On', 'Postcard: Off', 'Mouse sensitivity', 'Invert Y axis',
			'Paint livery', 'Headlight tint', 'Stock coastal', 'Coral red', 'Coastal teal',
			'Dune gold', 'Obsidian black', 'Sea pearl', 'Warm halogen', 'Ice white LED',
			'Amber fog', 'Ambient & sea', 'Vehicles & boat', 'Fishing & UI', 'Rain & thunder',
			'Export save', 'Import save', 'Save exported', 'Save imported', 'Invalid save file',
			'Smooth (Low-end)', 'Smooth', 'Graphics quality', 'Graphics',
			'Volumetric clouds', 'Water caustics', 'Low', 'Medium', 'Auto FPS boost',
		] ) {

			assert.notEqual( tr( key ), key, `Expected Simplified Chinese translation for "${ key }"` );

		}

	} finally {

		setLang( prev );

	}

} );

console.log( `\nAll ${ passed } Milestone 4 tests passed.` );
