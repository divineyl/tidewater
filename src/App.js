import { Vector3, Euler, Color, MathUtils, Mesh } from './engine/index.js';
import { GPU } from './engine/gpu/GPU.js';
import { Texture } from './engine/gpu/Texture.js';
import { SunShadows } from './engine/render/Shadows.js';
import { FrameUniforms } from './engine/render/Frame.js';
import { createPrefsStore, sanitizeVehiclePose, buildSaveBundle, parseSaveBundle } from './core/Prefs.js';
import { FISH } from './game/FishTable.js';
import { getLang, tr, trWeather, trFish } from './i18n/i18n.js';

import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { CDLOD } from './core/CDLOD.js';
import { G } from './core/Globals.js';
import { Profiler } from './core/Profiler.js';
import { SceneRenderer, LAYERS } from './core/SceneRenderer.js';
import { DEPTH_FORMAT } from './engine/render/SceneRenderer.js';
import { installDebugViews } from './core/DebugViews.js';

import { Atmosphere, SUN_ILLUMINANCE } from './sky/Atmosphere.js';
import { Sky, sunDirectionFromTime } from './sky/Sky.js';
import { Clouds } from './sky/Clouds.js';
import { SkyProClouds } from './sky/SkyProClouds.js';
import { Environment } from './sky/Environment.js';

import { TerrainData } from './world/TerrainData.js';
import { TerrainGPU } from './world/TerrainGPU.js';
import { Terrain } from './world/Terrain.js';
import { computeShoreField } from './world/ShoreField.js';
import { WORLD } from './world/WorldLayout.js';
import { Colliders } from './world/Colliders.js';
import { Village } from './world/Village.js';
import { Lighthouse } from './world/Lighthouse.js';
import { Reef } from './world/Reef.js';
import { BoatModel } from './world/BoatModel.js';
import { Rocks } from './world/Rocks.js';
import { Debris } from './world/Debris.js';
import { Wildlife } from './world/wildlife/Wildlife.js';
import { Whale } from './world/marine/Whale.js';

import { OceanFFT } from './ocean/OceanFFT.js';
import { WaterSurface } from './ocean/WaterSurface.js';
import { WaterMaterial } from './ocean/WaterMaterial.js';
import { createFoamTexture } from './ocean/FoamTexture.js';
import { ShoreWaves } from './ocean/ShoreWaves.js';
import { ShoreSim } from './ocean/ShoreSim.js';
import { Caustics } from './ocean/Caustics.js';
import { installUnderwaterLighting } from './ocean/UnderwaterLighting.js';
import { RefractionPass } from './ocean/RefractionPass.js';
import { installGroundBounce } from './materials/GroundBounce.js';
import { LocalLights, addVillageLights, addBoatLights, addVehicleLights } from './materials/LocalLights.js';
import { addLighthouseLights } from './world/Lighthouse.js';
import { VehicleManager } from './vehicles/VehicleManager.js';
import { Motorcycle } from './vehicles/Motorcycle.js';
import { MotorcycleModel } from './vehicles/MotorcycleModel.js';
import { CoastalBuggy } from './vehicles/CoastalBuggy.js';
import { BuggyModel } from './vehicles/BuggyModel.js';
import { VehicleFX } from './fx/VehicleFX.js';
import { GroundInteraction } from './fx/GroundInteraction.js';
import { WaypointBeacon } from './fx/WaypointBeacon.js';
import { WaterQuery } from './ocean/WaterQuery.js';
import { Breakers } from './ocean/Breakers.js';
import { SurfFoam } from './ocean/SurfFoam.js';
import { Spray } from './fx/Spray.js';
import { SeaDetail } from './ocean/SeaDetail.js';
import { MarineSnow } from './fx/MarineSnow.js';
import { AirMotes } from './fx/AirMotes.js';

import { Underwater, LENS_REACH } from './post/Underwater.js';
import { PostFX } from './post/PostFX.js';
import { AirHaze } from './post/AirHaze.js';
import { FlyCamera } from './player/FlyCamera.js';
import { Player } from './player/Player.js';
import { Game } from './game/Game.js';
import { STAND } from './game/FishStand.js';
import { CHANDLERY } from './game/Chandlery.js';
import { BoatController } from './player/BoatController.js';
import { BoatSpray } from './player/BoatSpray.js';
import { WakeSim } from './ocean/WakeSim.js';
import { Vegetation } from './world/Vegetation.js';
import { SoundScape } from './audio/SoundScape.js';
import { updateCameraVelocity, useStaticVelocity } from './post/CameraVelocity.js';
import { WeatherSystem } from './weather/WeatherSystem.js';
import { Rain } from './fx/Rain.js';
import { Lightning } from './fx/Lightning.js';
import { MultiplayerManager } from './net/MultiplayerManager.js';

const _up = new Vector3( 0, 1, 0 );

export const QUALITY_PRESETS = {
	potato: { renderScale: 0.85, aa: 8, shadows: true, shadowsFast: true, ssr: true, ssrFast: true, ao: 0, motionBlur: 0, sharpen: 0.25, shaftScale: 0, cloudQuality: 'low', caustics: false },
	eco: { renderScale: 0.88, aa: 8, shadows: true, shadowsFast: true, ssr: true, ssrFast: true, ao: 0, motionBlur: 0, sharpen: 0.30, shaftScale: 0, cloudQuality: 'low', caustics: true },
	balanced: { renderScale: 0.92, aa: 8, shadows: true, shadowsFast: true, ssr: true, ssrFast: false, ao: 0.65, motionBlur: 0, sharpen: 0.38, shaftScale: 0.75, cloudQuality: 'medium', caustics: true },
	high: { renderScale: 1.0, aa: 8, shadows: true, shadowsFast: false, ssr: true, ssrFast: false, ao: 1.0, motionBlur: 0.5, sharpen: 0.45, shaftScale: 1.0, cloudQuality: 'high', caustics: true },
	ultra: { renderScale: 1.0, aa: 16, shadows: true, shadowsFast: false, ssr: true, ssrFast: false, ao: 1.25, motionBlur: 0.5, sharpen: 0.55, shaftScale: 1.3, cloudQuality: 'high', caustics: true },
};

export class App {

	constructor() {

		this.settings = {
			timeOfDay: 16.2,
			sunAzimuth: 0, // degrees: turns the sun's daily path about the vertical
			timeSpeed: 0, // hours per real second
			exposure: 0.55,
			renderScale: 1, // internal resolution (the temporal upscaler reconstructs the output), Performance tab
		};
		this.qs = new URLSearchParams( location.search );
		try {

			this._hasExistingPrefs = typeof localStorage !== 'undefined' && !! localStorage.getItem( 'tidewater.prefs.v1' );

		} catch {

			this._hasExistingPrefs = false;

		}
		this.prefs = createPrefsStore();
		this.qualityPreset = 'high';
		this.qualityShaftScale = 1;
		this.cloudQuality = 'high';
		this.causticsEnabled = true;
		this._savedCausticsStrength = 1;
		this.autoFps = false;
		this._autoScaleTimer = 0;
		this._targetRenderScale = 1;
		this._photoShotRequested = false;
		this._photoShotBusy = false;
		this._photoShotTex = null;
		this._savedFovBeforePhoto = null;
		this.photoPostcard = true;
		this._poseSaveT = 0;

	}

	async init( onProgress = () => {} ) {

		const qs = this.qs;
		// report a stage, then let the page paint it before the (synchronous) stage work starts
		const progress = async ( p, text, until ) => {

			onProgress( p, text, until );
			if ( typeof requestAnimationFrame === 'function' ) await new Promise( ( r ) => requestAnimationFrame( () => setTimeout( r, 0 ) ) );

		};
		await progress( 0.02, 'Starting WebGPU…' );
		const engine = this.engine = new Engine( document.getElementById( 'app' ) );
		await engine.init();
		// systems take `renderer` first as in the three.js version: it is the Engine now (GPU access is global)
		const renderer = engine;
		const { scene, camera } = engine;
		// the near clip plane is the lens: it slices the water surface at the waterline (see Underwater)
		camera.near = 0.1;
		camera.updateProjectionMatrix();
		this.renderer = renderer;
		this.scene = scene;
		this.camera = camera;

		this.input = new Input( engine.domElement );
		this.input.onGamepadChange = ( connected ) => {

			if ( this.ui ) this.ui.ui.toast( tr( connected ? 'Gamepad connected' : 'Gamepad disconnected' ) );

		};
		this.fly = new FlyCamera( camera, engine.domElement, this.input );
		this.fly.setPose( new Vector3( 20, 6, - 20 ), Math.PI * 0.9, - 0.12 );

		// ---------------------------------------------------------------- sky
		await progress( 0.04, 'Building the atmosphere…' );
		this.atmosphere = new Atmosphere( renderer );
		this.sky = new Sky( this.atmosphere );
		if ( ! qs.has( 'noClouds' ) ) {

			// sky-pro-webgpu's clouds ("Partly cloudy"); ?oldClouds: the previous ones
			this.clouds = qs.has( 'oldClouds' ) ? new Clouds( renderer, this.atmosphere ) : new SkyProClouds( renderer, this.atmosphere );
			if ( this.clouds.ready ) await this.clouds.ready;
			this.sky.clouds = this.clouds;

		}

		// 3 cascades: 0-10 m (~1 cm texels, fine contact detail), 10-60 m, 60-400 m (rough far shadows);
		// contact-hardening filter sized by the sun's disc on the near cascade. Each cascade's depth range
		// is its light margin (200 m) + its extent, which keeps the depth bias small in metres.
		// Shadows come from the opaque and the late (transparent-pass) layers.
		this.csm = this.shadows = new SunShadows( { size: 2048, splits: [ 10, 60, 400 ], lightMargin: 200, normalBias: [ 0.015, 0.06, 0.3 ], bias: 0.00002 } );
		this.shadows.layerMask = ( 1 << LAYERS.OPAQUE ) | ( 1 << LAYERS.TRANSPARENT );

		this.environment = new Environment( renderer, scene, this.sky );

		// ---------------------------------------------------------------- island
		await progress( 0.06, 'Shaping the island…' );
		this.terrainData = new TerrainData();
		this.colliders = new Colliders();
		// the village flattens building pads into the heightmap: build it before any terrain
		// data is derived (shore field, GPU textures, meshes)
		await progress( 0.12, 'Building the village…' );
		this.village = new Village( { scene, terrain: this.terrainData, colliders: this.colliders } );
		this.lighthouse = new Lighthouse( { scene, terrain: this.terrainData, colliders: this.colliders, village: this.village } );
		this.groundInteraction = new GroundInteraction();
		if ( ! qs.has( 'noVeg' ) ) {

			await progress( 0.14, 'Planting the island…' );
			this.vegetation = new Vegetation( { scene, terrain: this.terrainData, village: this.village, groundInteraction: this.groundInteraction } );
			useStaticVelocity( this.vegetation.group );

		}

		await progress( 0.19, 'Rolling in the swell…' );
		this.shoreField = computeShoreField( this.terrainData, { res: 512, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } );
		this.terrainGPU = new TerrainGPU( this.terrainData, this.shoreField );
		// terrain and rocks apply the heightfield sun shadow (long hill shadows) in their own lighting
		this.terrain = new Terrain( { scene, terrainData: this.terrainData, terrainGPU: this.terrainGPU, renderer, groundInteraction: this.groundInteraction } );
		this.rocks = new Rocks( { scene, terrain: this.terrain, village: this.village, colliders: this.colliders } );
		// driftwood (CC0 photoscans), wrack, pebbles and village clutter
		this.debris = new Debris( { scene, terrain: this.terrain, village: this.village, vegetation: this.vegetation, rocks: this.rocks, colliders: this.colliders } );
		// these apply the heightfield sun shadow in their own lighting model (see UnderwaterLighting)
		this.terrain.mesh.material.appliesHillShadow = true;
		this.rocks.material.appliesHillShadow = true;

		await progress( 0.23, 'Growing the reef…' );
		this.reef = new Reef( { scene, terrain: this.terrainData, shoreField: this.shoreField } );

		this.boat = new BoatModel();
		scene.add( this.boat.group );
		this.boat.group.position.copy( WORLD.boatDock.position );
		this.boat.group.rotation.y = WORLD.boatDock.heading;

		this.vehicleManager = new VehicleManager( { terrain: this.terrainData, colliders: this.colliders } );
		this.motorcycleModel = new MotorcycleModel();
		scene.add( this.motorcycleModel.group );
		this.motorcycle = new Motorcycle( {
			model: this.motorcycleModel,
			terrain: this.terrainData,
			colliders: this.colliders,
			query: null,
		} );
		this.vehicleManager.register( this.motorcycle );
		this.buggyModel = new BuggyModel();
		scene.add( this.buggyModel.group );
		this.buggy = new CoastalBuggy( {
			model: this.buggyModel,
			terrain: this.terrainData,
			colliders: this.colliders,
			query: null,
		} );
		this.vehicleManager.register( this.buggy );

		// ---------------------------------------------------------------- ocean
		await progress( 0.3, 'Simulating the ocean…' );
		this.fft = new OceanFFT( renderer );
		if ( this.reef.setOcean ) this.reef.setOcean( this.fft ); // coral / sea fan sway follows the simulated swell
		this.foamTexture = createFoamTexture( renderer );
		this.oceanLOD = new CDLOD( { gridSize: Number( qs.get( 'G' ) || 32 ), leafSize: 8, levels: 12, minY: - 25, maxY: 25 } );
		this.surface = new WaterSurface( { fft: this.fft, cdlod: this.oceanLOD, foamTexture: this.foamTexture } );
		this.surface.terrain = this.terrainGPU;
		this.seaDetail = new SeaDetail();
		this.surface.detail = this.seaDetail;
		this.shore = new ShoreWaves( this.terrainGPU );
		this.surface.shore = this.shore;
		this.caustics = qs.has( 'noCaustics' ) ? null : new Caustics( renderer, this.fft );
		if ( this.caustics ) this.caustics.detail = this.seaDetail;

		if ( ! qs.has( 'noSim' ) ) {

			this.shoreSim = new ShoreSim( renderer, { terrainGPU: this.terrainGPU, shore: this.shore } );
			this.surface.shoreSim = this.shoreSim;
			// WGSL: fn terrainWetness( xz: vec2f, h: f32 ) -> vec2f (x = wetness, y = sand foam)
			this.terrain.wetness = {
				modules: [ this.shoreSim.module ],
				code: /* wgsl */`
fn terrainWetness( xz: vec2f, h: f32 ) -> vec2f {
	let s = shoreSimSample( xz );
	let inside = shoreSimInside( shoreSimUvOf( xz ) );
	// outside the simulated region fall back to a static damp band
	let band = smoothstep( 0.45, 0.0, h );
	// foam left on the sand: the lace the water carried, stranded and popping (ShoreSim.sandFoam)
	return vec2f( max( s.y, band * ( 1.0 - inside ) ), shoreSimSandFoam( xz, s, h ) );
}`,
			};
			this.terrain.finalizeMaterial();
			// surf-zone foam look (whitewater, lace) used by the water shader
			this.surfFoam = new SurfFoam( { shoreSim: this.shoreSim } );
			this.surface.foamShading = ( args ) => this.surfFoam.shading( args );

		}

		// how much of the underwater lighting each group needs (sampler budget, see UnderwaterLighting)
		const underwaterMode = ( root, m ) => root && root.traverse( ( o ) => {

			if ( o.material ) for ( const mat of Array.isArray( o.material ) ? o.material : [ o.material ] ) mat.underwaterLighting = m;

		} );
		underwaterMode( this.village.group, 'lite' );
		underwaterMode( this.lighthouse.staticGroup, 'lite' );
		underwaterMode( this.boat.group, 'lite' );
		underwaterMode( this.motorcycleModel.group, 'lite' );
		underwaterMode( this.buggyModel.group, 'lite' );
		if ( this.vegetation ) underwaterMode( this.vegetation.group, 'none' );

		this.underwaterLighting = installUnderwaterLighting( {
			fft: this.fft, caustics: this.caustics, clouds: this.clouds, terrain: this.terrainGPU,
			shore: this.shore, surface: this.surface, shoreSim: this.shoreSim,
		} );

		// sunlight bounced off the ground (one diffuse bounce, re-baked with the terrain sun shadow)
		installGroundBounce( { terrain: this.terrainGPU, clouds: this.clouds } );
		this.sceneRenderer = new SceneRenderer( engine.meshRenderer, scene, camera );
		// the water's refraction source: the scene below the water only, half resolution
		this.refraction = new RefractionPass( { meshRenderer: engine.meshRenderer, scene, camera, sceneRenderer: this.sceneRenderer, scale: 0.5 } );
		this.sceneRenderer.onBeforeWater = () => this.refraction.render( G.seaLevel.value );
		if ( this.sky.background ) this.sceneRenderer.background = this.sky.background;
		// lanterns, lamp posts, path lights, lit windows, the boat's cabin / navigation lights and the
		// flashlight (L): nearest few packed into one small uniform array each frame
		this.localLights = new LocalLights();
		addVillageLights( this.localLights, this.village );
		addBoatLights( this.localLights, this.boat );
		addVehicleLights( this.localLights, this.motorcycle );
		addVehicleLights( this.localLights, this.buggy );
		addLighthouseLights( this.localLights, this.lighthouse );
		useStaticVelocity( this.lighthouse.staticGroup );
		// rough, large or heavily overdrawn surfaces (ground, rocks, debris, foliage) take the local
		// lights as Lambert only; the village, pier and boat get the full BRDF (glints on wet wood, metal)
		for ( const root of [ this.terrain.mesh, this.rocks.group, this.debris && this.debris.group, this.vegetation && this.vegetation.group ] ) if ( root ) root.traverse( ( o ) => {

			if ( o.material ) for ( const m of Array.isArray( o.material ) ? o.material : [ o.material ] ) m.localLightsCheap = true;

		} );
		// the sea is not drawn inside the boat (its hull volume masks the surface)
		this.sceneRenderer.addHullMask( this.boat.createHullVolumeGeometry(), this.boat.group );
		this.waterMaterial = new WaterMaterial( {
			surface: this.surface, sky: this.sky, sceneCopy: this.sceneRenderer.opaqueCopy, sceneDepthHalf: this.sceneRenderer.opaqueDepthHalf.texture, refraction: this.refraction,
			hullMask: this.sceneRenderer.hullMaskRT.texture, hullMaskActive: this.sceneRenderer.hullMaskActive,
		} );
		this.waterMaterial.clouds = this.clouds;
		this.ocean = new Mesh( this.oceanLOD.geometry, this.waterMaterial );
		this.ocean.frustumCulled = false;
		this.ocean.receiveShadow = true;
		this.ocean.layers.set( LAYERS.WATER );
		// Thin alpha-tested meshes (nets, cloth, wire traps) are drawn in the late pass: the screen-space
		// AO and the refraction copy only see the opaque pass, so they neither smear dark AO halos over
		// what is behind them nor receive the noisy AO of their own strands. The boat's window glass is
		// blended: in the late pass it goes over the water seen through it (drawn earlier it would be
		// painted over by the water).
		this.scene.traverse( ( o ) => {

			if ( o.isMesh && ( o.name === 'village_fabric' || o.name === 'village_nets' || o.name === 'boat-trap' || o.name === 'boat-glass' ) ) o.layers.set( LAYERS.TRANSPARENT );

		} );
		// Terrain and water place their vertices in the vertex shader (CDLOD), so three's default motion
		// vectors (previous frame = raw grid position) are garbage there. Both are still in the world or
		// nearly so: camera-only reprojection of the real world position is what the temporal resolve needs.
		// ( the water material writes its own velocity + waterline mask outputs )
		useStaticVelocity( this.terrain.mesh );
		useStaticVelocity( this.rocks.group );
		scene.add( this.ocean );

		this.query = new WaterQuery( renderer, this.surface );

		this.marineSnow = new MarineSnow( { fft: this.fft, query: this.query } );
		scene.add( this.marineSnow.mesh );

		// ---- surf: plunging lips along the beach + spray particles (the breakers emit on the GPU;
		// spray.emit() / emitAlongPoints() for boat bow spray and splashes)
		this.spray = new Spray( renderer, { query: this.query, terrain: this.terrainGPU, sceneCopy: this.sceneRenderer.opaqueCopy, clouds: this.clouds } );
		scene.add( this.spray.mesh );
		if ( this.reef.setSpray ) this.reef.setSpray( this.spray ); // splashes of leaping fish
		this.breakers = new Breakers( renderer, {
			surface: this.surface, shore: this.shore, terrainData: this.terrainData, sky: this.sky,
			spray: this.spray, clouds: this.clouds,
		} );
		scene.add( this.breakers.mesh );
		// dust, pollen, salt aerosol, seed fluff and gnats drifting around the camera
		this.airMotes = new AirMotes( { terrain: this.terrainGPU, clouds: this.clouds, csm: this.csm, reversedDepth: true } );
		scene.add( this.airMotes.mesh );
		this.boatCtl = new BoatController( { model: this.boat, query: this.query, terrain: this.terrainData, colliders: this.colliders } );
		this.boatSpray = new BoatSpray( { boat: this.boatCtl, spray: this.spray } );
		// humpback cruising the deep water around the island (model fetched from public/models/whale)
		this.whale = new Whale( { scene, terrain: this.terrainData, query: this.query, spray: this.spray } );
		try {

			await this.whale.load();
			if ( this.reef && this.reef.setWhale ) this.reef.setWhale( this.whale ); // escort fish, foam and slick

		} catch ( e ) {

			console.warn( 'whale model failed to load', e );
			this.whale = null;

		}

		// interactive wake around the boat (Kelvin pattern, bow/stern waves, prop wash foam)
		this.wake = new WakeSim( renderer, { terrainGPU: this.terrainGPU, boat: this.boatCtl, colliders: this.colliders } );
		this.surface.wake = this.wake;
		this.player = new Player( { camera, input: this.input, terrain: this.terrainData, colliders: this.colliders, query: this.query, boat: this.boatCtl, vehicles: this.vehicleManager, reef: this.reef } );
		// birds, beach crabs, sanderlings (after spray / query / boat, which they use)
		this.wildlife = new Wildlife( {
			scene, renderer, terrain: this.terrainData, terrainGPU: this.terrainGPU, shore: this.shore,
			village: this.village, colliders: this.colliders, vegetation: this.vegetation, boat: this.boatCtl, boatModel: this.boat,
			query: this.query, spray: this.spray, csm: this.csm,
		} );
		this.freeCam = qs.has( 'fly' );

		// ---------------------------------------------------------------- post
		await progress( 0.34, 'Preparing the shaders…' );
		this.underwater = new Underwater( {
			depthTexture: this.sceneRenderer.sceneRT.depthTexture, maskTexture: this.sceneRenderer.waterMaskTexture,
			query: this.query, caustics: this.caustics, fft: this.fft,
		} );
		// the camera's height above the water in the same frame (GPU query): decides the side the surface
		// is seen from where the triangle facing can't be trusted
		this.waterMaterial.cameraWaterHeightNode = this.query.cameraState().x;
		// aerial perspective, marine haze and volumetric sun shafts (post)
		this.haze = qs.has( 'noHaze' ) ? null : new AirHaze( {
			depthTexture: this.sceneRenderer.sceneRT.depthTexture, underwater: this.underwater, atmosphere: this.atmosphere,
			sky: this.sky, clouds: this.clouds, terrain: this.terrainGPU, csm: this.csm,
		} );
		this.post = new PostFX( renderer, { sceneRenderer: this.sceneRenderer, camera, underwater: this.underwater, clouds: this.clouds, sunDir: this.atmosphere.sunDir, haze: this.haze } );
		G.exposure.value = this.settings.exposure;
		if ( qs.has( 'scale' ) ) this.settings.renderScale = Number( qs.get( 'scale' ) ) || 1;
		this.setRenderScale( this.settings.renderScale );

		// ---------------------------------------------------------------- audio
		// recorded field recordings (public/audio, credits in public/audio/CREDITS.md); ?noAudio turns it off
		this.audio = qs.has( 'noAudio' ) ? null : new SoundScape();
		this.player.audio = this.audio;
		this.waypointBeacon = new WaypointBeacon( { scene, terrain: this.terrainData } );
		// the fishing game (rod, bites, catch, cooler, fish stand)
		this.game = new Game( this );
		this.game.applyGear();
		// the lanterns at Joe's fish stand and Marta's chandlery (lit from dusk like the village lamps);
		// positions are in each stall's frame (x right, z toward the customer), turned by its yaw
		for ( const [ s, lx, ly, lz ] of [ [ STAND, - 0.9, 1.85, 0.1 ], [ CHANDLERY, - 0.75, 1.58, - 1.45 ] ] ) {

			const c = Math.cos( s.yaw ), sn = Math.sin( s.yaw );
			const x = s.x + lx * c + lz * sn, z = s.z - lx * sn + lz * c;
			this.localLights.add( { position: new Vector3( x, this.terrainData.heightAt( s.x, s.z ) + ly, z ), color: new Color( 1.0, 0.72, 0.42 ), intensity: 5 * 1.5, range: 11, kind: 'lantern', flicker: 0.08 } );

		}

		this.boatCtl.onSlam = ( s ) => this.audio && this.audio.hullSlap( s );
		this.motorcycle.onLand = ( impact ) => this.audio && this.audio.vehicleLand( impact );
		this.motorcycle.onShiftPop = ( lvl ) => this.audio && this.audio.vehicleShiftPop( lvl );
		this.motorcycle.onSplash = ( str, pos ) => this.audio && this.audio.splash( str, pos );
		this.buggy.onLand = ( impact ) => this.audio && this.audio.vehicleLand( impact );
		this.buggy.onShiftPop = ( lvl ) => this.audio && this.audio.vehicleShiftPop( lvl );
		this.buggy.onSplash = ( str, pos ) => this.audio && this.audio.splash( str, pos );
		const onStuntLand = ( { airTime, distance, impact } ) => {

			if ( this.player ) this.player.addCameraShake( Math.min( 0.36, 0.14 + impact * 0.22 ) );
			if ( this.ui ) {

				const d = Math.round( distance );
				const t = airTime.toFixed( 1 );
				this.ui.ui.toast( getLang() === 'zh' ? `沙丘飞跃 · 滞空 ${ t } 秒 · ${ d } 米` : `Big air! ${ t }s · ${ d } m`, 2200 );

			}

		};
		this.motorcycle.onJumpLand = onStuntLand;
		this.buggy.onJumpLand = onStuntLand;
		this.vehicleFX = new VehicleFX( { spray: this.spray, vehicles: this.vehicleManager, terrain: this.terrainData } );
		scene.add( this.vehicleFX.mesh );
		engine.domElement.addEventListener( 'click', () => {

			if ( ( window.__ui && window.__ui.isPointerOverUI ) || this.isModalOpen() ) return;
			this.input.requestLock();
			if ( this.audio ) this.audio.resume();

		} );

		this.profiler = new Profiler( renderer );
		this.profiler.track( 'fft rows', this.fft.rowKernel );
		this.profiler.track( 'fft columns', this.fft.columnKernel );
		this.profiler.track( 'sky view', this.atmosphere.skyViewKernel );

		this.updateSun();
		this.rain = new Rain( { terrain: this.terrainGPU, clouds: this.clouds } );
		scene.add( this.rain.mesh );
		this.lightning = new Lightning( {
			clouds: this.clouds,
			onThunder: ( pos, dist, str ) => this.audio && this.audio.thunder( pos.x, pos.y, pos.z, dist, str ),
		} );
		scene.add( this.lightning.mesh );
		this.weather = new WeatherSystem( this );
		this.applySavedPrefs( { scaleOverride: qs.has( 'scale' ) } );
		this.mp = new MultiplayerManager( this );
		if ( this.player ) this.player.mp = this.mp;
		if ( typeof window !== 'undefined' ) {

			window.addEventListener( 'beforeunload', () => this.saveRuntimeState( true ) );

		}

		installDebugViews( this );
		window.__app = this;
		this.gpu = GPU; // console / test access

		// ---- compile pipelines asynchronously (keeps the page responsive), then prime a few
		// frames behind the loading screen so any remaining first-use stalls happen there
		// stage weights: in the browser the pipeline compile below takes far longer than everything before it
		await progress( 0.36, 'Compiling shaders…', 0.95 );
		await this.precompile();
		await progress( 0.96, 'Warming up…' );
		for ( let i = 0; i < 2; i ++ ) {

			this.frame( 1 / 60 );
			await GPU.queue.onSubmittedWorkDone();

		}

	}

	// Build every pipeline up front, then wait for the GPU (keeps first-use compiles behind the loading
	// screen). The precompile frame visits every mesh of every pass, hidden or out of view, and the
	// pipelines compile in parallel in the background (GPU.renderPipeline); the refraction pass and
	// the hull mask are forced on so their variants are built too.
	async precompile() {

		const mr = this.engine.meshRenderer;
		const refr = this.refraction.enabled;
		// compute / post pipelines were requested while the systems were built: let them finish first
		// (the frame below would otherwise compile each one again, synchronously); the post chain
		// builds its passes on first use, so build it now
		if ( ! this.post._built ) {

			this.post._build();
			this.post._outW = 0; // as PostFX.beginFrame: size the new targets

		}

		await GPU.pipelinesReady();
		mr.precompiling = true;
		this.refraction.enabled = true;
		const sr = this.sceneRenderer, hm = sr.hullMaskRT;
		if ( sr.hullMasks.length ) mr.render( sr.hullMaskScene, {
			label: 'hull mask', kind: 'color', camera: this.camera, colorViews: [ hm.texture.view() ], colorFormats: hm.formats,
			clearColors: [ [ 0, 0, 0, 0 ] ], depthView: hm.depthTexture.view(), depthFormat: DEPTH_FORMAT, clearDepth: 0, cull: false,
		} );
		try {

			// both water variants: with the hull-mask discard (a hull on screen) and without
			for ( const hull of [ 0, 1 ] ) {

				this.waterMaterial.hullOverride = hull;
				this.frame( 1 / 60 );

			}

		} catch ( e ) {

			console.warn( 'precompile failed', e );

		}

		this.waterMaterial.hullOverride = null;
		mr.precompiling = false;
		this.refraction.enabled = refr;
		await GPU.pipelinesReady();
		await GPU.queue.onSubmittedWorkDone();

	}

	// ---------------------------------------------------------------- sun / sky

	updateSun() {

		const s = this.settings;
		const dir = sunDirectionFromTime( s.timeOfDay ).applyAxisAngle( _up, MathUtils.degToRad( s.sunAzimuth || 0 ) );
		// the sky is always scattered sunlight, even with the sun below the horizon (twilight)
		this.atmosphere.sunDir.value.copy( dir );
		// below the horizon the moon takes over as the key light
		const night = MathUtils.smoothstep( - dir.y, 0.02, 0.18 );
		G.night.value = night;
		const starVis = this.weather ? this.weather.state.starVisibility : 1;
		this.sky.starIntensity.value = night * starVis;
		const moon = new Vector3( - dir.x, Math.abs( dir.y ) * 0.8 + 0.25, - dir.z ).normalize();
		this.sky.moonDir.value.copy( moon );

		// key light: the sun until it is well below the horizon (it gives no direct light in
		// twilight anyway), then the moon
		const light = dir.y > - 0.07 ? dir : moon;
		G.sunDir.value.copy( light );

	}

	applyAtmosphereReadback() {

		const a = this.atmosphere;
		if ( ! a.sunTransmittance ) return;
		const sunTrue = a.sunDir.value;
		const sunUp = sunTrue.y > - 0.07; // same switch as updateSun()
		const T = a.sunTransmittance;
		const horizonFade = MathUtils.smoothstep( sunTrue.y, - 0.03, 0.02 );
		let c;
		if ( sunUp ) c = new Color( T[ 0 ], T[ 1 ], T[ 2 ] ).multiplyScalar( SUN_ILLUMINANCE * horizonFade );
		else c = new Color( 0.6, 0.7, 1.0 ).multiplyScalar( 0.12 * G.night.value );
		G.sunColor.value.copy( c );
		const irr = a.skyIrradiance;
		const nightAmb = 0.012 * G.night.value;
		G.skyIrradiance.value.setRGB( irr[ 0 ] + nightAmb * 0.6, irr[ 1 ] + nightAmb * 0.7, irr[ 2 ] + nightAmb );
		const flash = this.lightning ? this.lightning.flash : 0;
		if ( flash > 0.002 ) {

			G.sunColor.value.r += flash * 1.1;
			G.sunColor.value.g += flash * 1.25;
			G.sunColor.value.b += flash * 1.55;
			G.skyIrradiance.value.r += flash * 0.28;
			G.skyIrradiance.value.g += flash * 0.34;
			G.skyIrradiance.value.b += flash * 0.45;

		}

		G.horizonColor.value.setRGB( a.horizon[ 0 ], a.horizon[ 1 ], a.horizon[ 2 ] );

	}

	// T: let the day run (about 8 minutes per day) or stop it
	toggleTime() {

		const s = this.settings;
		if ( s.timeSpeed !== 0 ) {

			this._timeSpeed = s.timeSpeed;
			s.timeSpeed = 0;

		} else {

			s.timeSpeed = this._timeSpeed || 0.05;

		}

		if ( this.ui ) {

			this.ui.s.advance = s.timeSpeed !== 0;
			this.ui.ui.refresh();
			this.ui.ui.toast( tr( s.timeSpeed !== 0 ? 'Time running' : 'Time paused' ) );

		}

	}

	isModalOpen() {

		const u = this.ui?.ui;
		if ( u && ( u._start || u._help ) ) return true;
		const g = this.game;
		if ( g?.hud && ( g.hud.invOpen || g.hud.standOpen || g.hud.journalOpen ) ) return true;
		if ( g?.minimap && g.minimap.fullOpen ) return true;
		if ( g?.guide && g.guide.open ) return true;
		return false;

	}

	// Free (debug) camera on F; the walker / boat resumes where it was left.
	setFreeCam( on ) {

		if ( on === this.freeCam ) return;
		this.freeCam = on;
		this.input.resetLook();
		if ( on ) {

			if ( this.player.mode === 'vehicle' ) {

				this.player.clearVehicleFov();
				if ( this.motorcycleModel ) this.motorcycleModel.setRiderVisible( this.motorcycle.showRider );
				if ( this.buggyModel ) this.buggyModel.setRiderVisible( this.buggy.showRider );

			}

			const e = new Euler().setFromQuaternion( this.camera.quaternion, 'YXZ' );
			this.fly.setPose( this.camera.position.clone(), e.y, e.x );
			this.fly.velocity.set( 0, 0, 0 );

		} else {

			if ( this.player ) {

				this.player.camInit = false;
				this.player.vehCamInit = false;

			}

			if ( this.player.mode !== 'boat' && this.player.mode !== 'deck' && this.player.mode !== 'vehicle' && this.player.mode !== 'coop' ) {

				this.dropPlayerAtCamera();

			}

		}

	}

	// Leaving the free camera: the player continues from where the camera is, facing the same way,
	// and falls from there (swimming at once if the camera is under water).
	dropPlayerAtCamera() {

		const p = this.player, c = this.camera.position;
		const e = new Euler().setFromQuaternion( this.camera.quaternion, 'YXZ' );
		p.yaw = e.y;
		p.pitch = MathUtils.clamp( e.x, - 1.5, 1.5 );
		p.velocity.set( 0, 0, 0 );
		const ground = Math.max( this.terrainData.heightAt( c.x, c.z ), this.colliders.groundHeightAt( c.x, c.z, c.y ) );
		const water = this.cameraWaterHeight ?? 0;
		if ( c.y < water ) {

			p.mode = 'swim';
			p.position.set( c.x, Math.max( c.y - 0.16, ground + 0.3 ), c.z );

		} else {

			// drop from where the camera is: gravity brings you down onto the ground or a deck, or into
			// the sea (the walker starts swimming once it is out of its depth)
			p.mode = 'walk';
			p.position.set( c.x, Math.max( c.y - 1.62, ground ), c.z );
			p.grounded = false;

		}

		p.waterH = water;
		p.waterMean = water;

	}

	// ---------------------------------------------------------------- loop

	start() {

		this.engine.start( ( dt, t ) => this.frame( dt, t ) );

	}

	updateFPS( dt ) {

		const f = this._fps || ( this._fps = { el: document.getElementById( 'fps' ), acc: 0, n: 0, worst: 0 } );
		f.acc += dt;
		f.n ++;
		f.worst = Math.max( f.worst, dt );
		if ( f.acc >= 0.5 ) {

			const fps = f.n / f.acc;
			let text = `${ fps.toFixed( 0 ) } fps · ${ ( 1000 * f.acc / f.n ).toFixed( 1 ) } ms · max ${ ( f.worst * 1000 ).toFixed( 1 ) } ms`;
			if ( this.profiler && this.profiler.enabled ) {

				const p = this.profiler.result;
				text += ` · GPU c ${ p.compute.toFixed( 2 ) } r ${ p.render.toFixed( 2 ) }`;

			}

			if ( f.el ) f.el.textContent = text;
			this.fps = fps;
			f.acc = 0;
			f.n = 0;
			f.worst = 0;

		}

	}

	frame( dt ) {

		const t0 = performance.now();
		this._frame( dt );
		const ms = performance.now() - t0;
		this.cpuMs = this.cpuMs === undefined ? ms : this.cpuMs * 0.95 + ms * 0.05;

	}

	_frame( dt ) {

		GPU.beginFrame();
		FrameUniforms.fields.frameIndex.value = GPU.frame;
		const s = this.settings;
		this.updateFPS( dt );
		G.dt.value = dt;
		G.time.value += dt;
		if ( s.timeSpeed !== 0 ) s.timeOfDay = ( s.timeOfDay + dt * s.timeSpeed + 24 ) % 24;

		this.input.pollGamepad( dt );
		const modalOpen = this.isModalOpen();
		this.input.setLookBlocked( modalOpen );
		if ( modalOpen !== !! this._wasModalOpen ) {

			this.input.resetLook();
			this._wasModalOpen = modalOpen;

		}

		// ---- player / boat (boat physics first so the cameras follow this frame's pose)
		if ( ! modalOpen ) {

			if ( this.input.hit( 'KeyF' ) ) this.setFreeCam( ! this.freeCam );
			if ( this.input.hit( 'KeyT' ) ) this.toggleTime();
			if ( this.input.hit( 'KeyL' ) ) {

				if ( ! this.freeCam && this.player.mode === 'vehicle' && this.player.activeVehicle ) {

					const on = this.player.activeVehicle.toggleHeadlight();
					if ( this.prefs ) this.prefs.save( { vehHeadlight: on } );
					if ( this.ui ) this.ui.ui.toast( tr( on ? 'Headlight on' : 'Headlight off' ) );

				} else {

					const on = this.localLights.toggleFlashlight();
					if ( this.ui ) this.ui.ui.toast( tr( on ? 'Flashlight on' : 'Flashlight off' ) );

				}

			}

			if ( this.input.hit( 'KeyM' ) && this.audio ) {

				this.audio.setMuted( ! this.audio.muted );
				if ( this.prefs ) this.prefs.save( { audioMuted: this.audio.muted } );
				if ( this.ui ) this.ui.ui.toast( tr( this.audio.muted ? 'Sound off' : 'Sound on' ) );

			}

			if ( this.input.hit( 'KeyG' ) && ! this.freeCam ) {

				if ( this.player.mode === 'boat' ) this.mp?.sendEmote?.( 'boat_horn' );
				else if ( this.player.mode === 'vehicle' ) this.mp?.sendEmote?.( 'horn' );
				else this.mp?.sendEmote?.( 'wave' );

			}

		}

		const idleMoto = this.motorcycle && ! this.motorcycle.occupied && ! this.motorcycle.waterStalled && this.motorcycle.speed < 0.5;
		const idleBuggy = this.buggy && ! this.buggy.occupied && ! this.buggy.waterStalled && this.buggy.speed < 0.5;
		if ( idleMoto || idleBuggy ) {

			this._poseSaveT += dt;
			if ( this._poseSaveT >= 4 ) {

				this._poseSaveT = 0;
				this.saveRuntimeState( false );

			}

		}
		this.boatCtl.update( dt );
		if ( this.vehicleManager ) this.vehicleManager.update( dt );
		this.boatSpray.update( dt );
		this.wake.update( dt );
		const prevEnabled = this.input.enabled;
		if ( modalOpen ) this.input.enabled = false;
		if ( this.freeCam ) this.fly.update( dt );
		else this.player.update( dt );
		this.input.enabled = prevEnabled;
		this.game.update( dt );
		this.updateSun();
		if ( this.weather ) this.weather.update( dt );
		if ( this.lightning ) {

			this.lightning.update( dt, this.camera, this.weather ? this.weather.state.lightningRate : 0, this.weather ? this.weather.state.cloudAltitude : 1100 );
			G.weather.value.w = this.lightning.flash;
			if ( this.clouds && this.clouds.setLightning ) this.clouds.setLightning( this.lightning.cloudLight );

		}

		this.atmosphere.update( dt, this.camera.position.y );
		this.applyAtmosphereReadback();

		// ---- water simulation
		this.fft.update( dt );
		this.seaDetail.update( dt );
		this.query.setCamera( this.camera.position.x, this.camera.position.z );
		this.boatCtl.queueQueries();
		this.query.update();
		if ( this.query.cpuValid ) {

			const h0 = this.query.cpu[ 0 ];
			const h = Number.isFinite( h0 ) ? h0 : ( this.cameraWaterHeight ?? 0 );
			G.cameraUnderwater.value = this.camera.position.y < h - LENS_REACH ? 1 : 0;
			G.cameraWaterHeight.value = h;
			this.cameraWaterHeight = h;

		}

		const causticsHalf = this.qualityPreset === 'eco' || this.qualityPreset === 'balanced';
		if ( this.caustics && this.causticsEnabled && this.caustics.strength.value > 0.001 && ( ! causticsHalf || ( this.engine.frame & 1 ) === 0 ) ) this.caustics.update();
		// drawn while any part of the view can be under water (the specks above the surface are dropped)
		this.marineSnow.update( this.camera, this.camera.position.y < ( this.cameraWaterHeight ?? 0 ) + LENS_REACH );
		this.airMotes.update( dt, this.camera, this.cameraWaterHeight ?? 0 );
		if ( this.rain ) this.rain.update( dt, this.camera, this.cameraWaterHeight ?? 0 );
		const lowSpec = this.qualityPreset === 'potato' || this.qualityPreset === 'eco';
		const staggered = lowSpec || this.qualityPreset === 'balanced';
		if ( this.shoreSim ) this.shoreSim.update( { camera: this.camera, lowSpec } );
		this.underwaterLighting.update( this.camera, staggered );
		if ( this.autoFps && dt > 0 && dt < 0.25 ) {

			this._autoScaleTimer += dt;
			if ( this._autoScaleTimer >= 1.8 ) {

				this._autoScaleTimer = 0;
				const fps = this.fps || 60;
				if ( fps < 42 && this.settings.renderScale > 0.75 ) {

					this.setRenderScale( Math.max( 0.75, this.settings.renderScale - 0.05 ), false );

				} else if ( fps > 55 && this.settings.renderScale < this._targetRenderScale ) {

					this.setRenderScale( Math.min( this._targetRenderScale, this.settings.renderScale + 0.05 ), false );

				}

			}

		}
		this.breakers.update( this.camera );
		if ( this.vehicleFX ) this.vehicleFX.update( dt );
		this.spray.update();
		if ( this.clouds ) this.clouds.update( dt, this.camera );
		this.environment.update( dt );

		// ---- ground interaction & waypoint beacon
		if ( this.groundInteraction ) {

			const gi = this.groundInteraction;
			const focus = ( this.player.mode === 'vehicle' && this.player.activeVehicle )
				? this.player.activeVehicle.position
				: ( this.freeCam ? this.camera.position : this.player.position );
			if ( ! this.freeCam && this.player.mode === 'walk' && this.player.grounded && this.player.surface !== 'wood' && this.player.surface !== 'water' ) {

				const pvx = this.player.velocity.x, pvz = this.player.velocity.z;
				const pspd = Math.hypot( pvx, pvz );
				if ( pspd > 0.12 ) gi.stampFoot( this.player.position.x, this.player.position.z, pvx, pvz, pspd );

			}

			this._parkStampT = ( this._parkStampT || 0 ) + dt;
			const parkPulse = this._parkStampT >= 0.5;
			if ( parkPulse ) this._parkStampT = 0;
			const vehList = this.vehicleManager ? this.vehicleManager.vehicles : ( this.motorcycle ? [ this.motorcycle ] : [] );
			for ( const m of vehList ) {

				if ( ! m || m.airborne ) continue;
				const mspd = Math.abs( m.speed );
				const moving = mspd > 0.15;
				if ( moving || parkPulse ) {

					const trackable = m.surface === 'sand' || m.surface === 'path' || m.surface === 'grass';
					const rainBoost = 1 + G.weather.value.y * 0.35;
					const driftBoost = ( m.driftAmount > 0.25 || m.handbrake ) ? 1.35 : 1.0;
					const baseTrack = m.surface === 'sand' ? 0.92 : m.surface === 'path' ? 0.78 : 0.60;
					const trackStr = ( moving && trackable ) ? Math.min( 1, baseTrack * rainBoost * driftBoost ) : 0;
					const vx = m.velocity.x, vz = m.velocity.z;
					if ( m.wheelWorlds && m.wheelWorlds.length ) {

						for ( let wi = 0; wi < m.wheelWorlds.length; wi ++ ) {

							const w = m.wheelWorlds[ wi ];
							const isRear = wi >= 2;
							gi.stampWheel( w.x, w.z, vx, vz, { radius: isRear ? 0.68 : 0.58, grass: 1.0, track: trackStr * ( isRear ? 1.0 : 0.82 ) } );

						}

					} else {

						gi.stampWheel( m.frontWheelWorld.x, m.frontWheelWorld.z, vx, vz, { radius: 0.56, grass: 0.95, track: trackStr * 0.78 } );
						gi.stampWheel( m.rearWheelWorld.x, m.rearWheelWorld.z, vx, vz, { radius: 0.68, grass: 1.0, track: trackStr } );

					}

				}

			}

			gi.update( dt, focus.x, focus.z, this.weather ? this.weather.state.rainIntensity : 0 );

		}

		if ( this.waypointBeacon ) this.waypointBeacon.update( dt, this.camera.position );

		// ---- world
		this.oceanLOD.update( this.camera );
		this.terrain.update( this.camera );
		this.rocks.update( this.camera );
		this.debris.update( this.camera );
		this.reef.update( dt, this.camera.position );
		this.village.update( dt );
		if ( this.lighthouse ) this.lighthouse.update( dt );
		if ( this.vegetation ) this.vegetation.update( dt, this.camera );
		if ( this.whale ) this.whale.update( dt, this.camera );
		this.boat.update( dt );
		this.wildlife.update( dt, this.camera, this.freeCam ? null : this.player );
		this.localLights.update( this.camera, dt );
		if ( this.mp ) this.mp.update( dt );

		// ---- render
		G.exposure.value = s.exposure;
		updateCameraVelocity( this.camera );
		const camFwd = this._camFwd || ( this._camFwd = new Vector3() );
		this.camera.getWorldDirection( camFwd );
		const lookPitch = Math.asin( MathUtils.clamp( camFwd.y, - 1, 1 ) );
		this.post.lens.update(
			dt,
			this.camera.position.y < ( this.cameraWaterHeight ?? 0 ),
			this.weather ? this.weather.state.rainIntensity : 0,
			this.player.mode === 'boat' && this.player.camMode === 'first',
			lookPitch
		);
		if ( this.post.flare ) {

			this.post.flare.setDepthHeight( this.sceneRenderer.sceneRT.height );
			this.post.flare.update( this.camera, dt, { aboveWater: this.camera.position.y > ( this.cameraWaterHeight ?? 0 ) - 0.02 } );

		}

		// the post chain sets the TAAU jitter + internal size and writes the camera into the frame
		// uniforms (setFrameCamera); shadows then render with this frame's sun and camera
		this.post.beginFrame();
		this.underwater.updateCamera( this.camera );
		this.shadows.render( this.scene, this.engine.meshRenderer, this.shadows.update( this.camera, G.sunDir.value ) );
		this.sceneRenderer.render();
		if ( this.post.flare ) this.post.flare.kernel.dispatch( 1 );

		const capturing = this._photoShotRequested && ! this._photoShotBusy;
		let capTex = null, capCur = null, capBuf = null, capW = 0, capH = 0, capPadded = 0;
		if ( capturing ) {

			this._photoShotRequested = false;
			this._photoShotBusy = true;
			capCur = this.engine.currentTexture();
			capW = capCur.width;
			capH = capCur.height;
			if ( ! this._photoShotTex || this._photoShotTex.width !== capW || this._photoShotTex.height !== capH || this._photoShotTex.format !== GPU.format ) {

				if ( this._photoShotTex ) this._photoShotTex.destroy();
				this._photoShotTex = new Texture( { width: capW, height: capH, format: GPU.format, usage: [ 'render', 'copySrc', 'sample' ], label: 'photo capture' } );

			}

			capTex = this._photoShotTex;
			this.post.outputTexture = capTex;

		}

		this.post.render();
		this.post.endFrame();

		if ( capturing && capTex && capCur ) {

			this.post.outputTexture = null;
			const enc = GPU.getEncoder();
			const gpuTex = capTex.getGPU();
			enc.copyTextureToTexture( { texture: gpuTex }, { texture: capCur }, { width: capW, height: capH, depthOrArrayLayers: 1 } );
			capPadded = Math.ceil( capW * 4 / 256 ) * 256;
			capBuf = GPU.device.createBuffer( { label: 'photo staging', size: capPadded * capH, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST } );
			enc.copyTextureToBuffer( { texture: gpuTex }, { buffer: capBuf, bytesPerRow: capPadded, rowsPerImage: capH }, { width: capW, height: capH, depthOrArrayLayers: 1 } );
			GPU.onSubmit( null, () => this._finishPhotoCapture( capBuf, capW, capH, capPadded, GPU.format ) );

		}

		GPU.submit();
		this.profiler.update( dt );

		this.updateAudio( dt );
		if ( this.ui ) this.ui.update( dt );
		this.input.endFrame();

	}

	// Internal render resolution relative to the output (0.5..1), set by hand: changing it re-creates
	// the scene / post / cloud targets, so nothing adjusts it automatically.
	setRenderScale( v, updateTarget = true ) {

		const scale = MathUtils.clamp( Math.round( v * 20 ) / 20, 0.4, 1 );
		this.settings.renderScale = scale;
		if ( updateTarget ) this._targetRenderScale = scale;
		this.post.setScale( scale );
		if ( this.clouds ) this.clouds.resolutionScale = scale;

	}

	setCloudQuality( mode ) {

		const m = ( mode === 'off' || mode === 'low' || mode === 'medium' || mode === 'high' ) ? mode : 'high';
		this.cloudQuality = m;
		if ( this.clouds && this.clouds.setQuality ) this.clouds.setQuality( m );

	}

	setCausticsEnabled( on ) {

		this.causticsEnabled = !! on;
		if ( this.caustics ) {

			if ( ! this.causticsEnabled && this.caustics.strength.value > 0.001 ) {

				this._savedCausticsStrength = this.caustics.strength.value;

			}

			this.caustics.strength.value = this.causticsEnabled ? ( this._savedCausticsStrength || 1 ) : 0;

		}

	}

	applyQualityPreset( id, save = true ) {

		const p = QUALITY_PRESETS[ id ];
		if ( ! p ) return;
		this.qualityPreset = id;
		this.setRenderScale( p.renderScale );
		this.post.aaMode = p.aa > 0 ? 'taa' : 'none';
		if ( p.aa > 0 ) this.post.taau.jitterPhaseOverride = p.aa;
		this.shadows.enabled = p.shadows;
		this.shadows.setFastMode?.( !! p.shadowsFast );
		if ( this.vegetation ) this.vegetation.setFastMode?.( !! p.shadowsFast );
		if ( this.waterMaterial ) this.waterMaterial.params.ssr.value = p.ssr ? ( p.ssrFast ? 0.5 : 1 ) : 0;
		this.post.params.aoStrength.value = p.ao;
		if ( this.post.motionBlur ) this.post.motionBlur.shutter.value = p.motionBlur;
		this.post.params.sharpen.value = p.sharpen;
		this.qualityShaftScale = p.shaftScale;
		this.setCloudQuality( p.cloudQuality );
		this.setCausticsEnabled( p.caustics );
		if ( this.weather ) this.weather.applyToSystems( 0, true );
		if ( this.ui ) this.ui.ui.setQualityPreset( id );
		if ( save && this.prefs ) {

			this.prefs.save( {
				qualityPreset: id, renderScale: p.renderScale, aa: p.aa, shadows: p.shadows, ssr: p.ssr,
				cloudQuality: p.cloudQuality, caustics: p.caustics,
			} );

		}

	}

	applySavedPrefs( { scaleOverride = false } = {} ) {

		if ( ! this.prefs ) return;
		const p = this.prefs.data;
		const autoRec = ! this._hasExistingPrefs ? GPU.adapterInfo?.recommendedPreset : null;
		if ( autoRec && autoRec !== 'high' && QUALITY_PRESETS[ autoRec ] ) {

			const urlScale = scaleOverride ? this.settings.renderScale : null;
			this.applyQualityPreset( autoRec, false );
			if ( urlScale !== null ) this.setRenderScale( urlScale );

		} else if ( p.qualityPreset && p.qualityPreset !== 'custom' && QUALITY_PRESETS[ p.qualityPreset ] ) {

			const urlScale = scaleOverride ? this.settings.renderScale : null;
			this.applyQualityPreset( p.qualityPreset, false );
			if ( urlScale !== null ) this.setRenderScale( urlScale );

		} else {

			this.qualityPreset = 'custom';
			if ( ! scaleOverride ) this.setRenderScale( p.renderScale );
			const aa = Number( p.aa );
			this.post.aaMode = aa > 0 ? 'taa' : 'none';
			if ( aa > 0 ) this.post.taau.jitterPhaseOverride = aa;
			this.shadows.enabled = !! p.shadows;
			if ( this.waterMaterial ) this.waterMaterial.params.ssr.value = p.ssr ? 1 : 0;
			this.setCloudQuality( p.cloudQuality );
			this.setCausticsEnabled( p.caustics );

		}

		if ( this.vegetation ) this.vegetation.setFastMode?.( this.qualityPreset === 'potato' || this.qualityPreset === 'eco' || this.qualityPreset === 'balanced' );
		this.autoFps = !! p.autoFps;
		if ( this.ui ) this.ui.ui.setQualityPreset( this.qualityPreset );
		if ( this.boat ) this.boat.setPaint?.( p.boatPaint );
		if ( this.audio ) this.audio.setRadioEnabled?.( !! p.islandRadio );

		if ( this.audio ) {

			this.audio.setMasterVolume( p.audioVolume );
			this.audio.setMuted( p.audioMuted );
			this.audio.setCategoryVolume?.( 'ambient', p.volAmbient );
			this.audio.setCategoryVolume?.( 'vehicle', p.volVehicle );
			this.audio.setCategoryVolume?.( 'fishing', p.volFishing );
			this.audio.setCategoryVolume?.( 'weather', p.volWeather );

		}

		if ( this.input ) {

			this.input.sensitivity = p.lookSensitivity;
			this.input.invertY = p.invertY;

		}

		this.photoPostcard = p.photoPostcard;
		if ( this.ui ) this.ui.ui.setPhotoPostcard( p.photoPostcard );

		if ( this.player ) this.player.camMode = p.camMode;
		this.camera.fov = p.fov;
		this.camera.updateProjectionMatrix();

		const vehs = this.vehicleManager ? this.vehicleManager.vehicles : ( this.motorcycle ? [ this.motorcycle ] : [] );
		for ( const vh of vehs ) {

			vh.handlingPreset = p.vehPreset;
			vh.topSpeedKmh = vh.id === 'buggy' ? Math.round( p.vehTopSpeed * ( 76 / 84 ) ) : p.vehTopSpeed;

			vh.showRider = p.vehRider;
			vh.setPaint?.( p.vehPaint );
			vh.setLightTint?.( p.vehLightTint );
			if ( p.vehHeadlight ) vh.toggleHeadlight( true );
			else vh.setHeadlightAuto();
			const rawPose = vh.id === 'buggy' ? p.buggyPose : p.motorcyclePose;
			const safePose = sanitizeVehiclePose( rawPose, this.terrainData );
			if ( safePose ) {

				vh._placeOnGround( safePose.x, safePose.z, safePose.yaw );
				vh._syncModel();

			}

		}

		if ( this.weather ) {

			if ( ! p.weatherAuto && p.weatherPreset ) this.weather.setPreset( p.weatherPreset, { instant: true } );
			this.weather.setAuto( p.weatherAuto );
			this.weather.speed = p.weatherSpeed;

		}

	}

	saveRuntimeState( immediate = false ) {

		if ( ! this.prefs ) return;
		const patch = {};
		if ( this.motorcycle && ! this.motorcycle.waterStalled ) {

			const pose = sanitizeVehiclePose( { x: this.motorcycle.position.x, z: this.motorcycle.position.z, yaw: this.motorcycle.yaw }, this.terrainData );
			if ( pose ) patch.motorcyclePose = pose;

		}

		if ( this.buggy && ! this.buggy.waterStalled ) {

			const pose = sanitizeVehiclePose( { x: this.buggy.position.x, z: this.buggy.position.z, yaw: this.buggy.yaw }, this.terrainData );
			if ( pose ) patch.buggyPose = pose;

		}

		if ( Object.keys( patch ).length ) this.prefs.save( patch, immediate );
		else if ( immediate ) this.prefs.flush();

	}

	exportSaveJSON() {

		if ( this.prefs ) this.prefs.flush();
		const bundle = buildSaveBundle( this.game?.state?.toJSON() || null, this.prefs?.data || {} );
		return JSON.stringify( bundle, null, 2 );

	}

	importSaveJSON( rawText ) {

		const parsed = parseSaveBundle( rawText );
		if ( ! parsed.ok ) return parsed;
		if ( parsed.game && this.game?.state ) {

			if ( ! this.game.state.fromJSON( parsed.game ) ) return { ok: false, error: 'Failed to apply game state' };
			this.game.state.save();
			this.game.state.emit();

		}

		if ( parsed.prefs && this.prefs ) {

			this.prefs.save( parsed.prefs, true );
			this.applySavedPrefs();

		}

		if ( this.ui ) this.ui.syncFromApp?.();
		return { ok: true, hasGame: !! parsed.game, hasPrefs: !! parsed.prefs };

	}

	onPhotoModeChange( on ) {

		if ( on ) {

			this._savedFovBeforePhoto = this.camera.fov - ( this.player?.vehFovDelta || 0 );
			if ( this.ui ) this.ui.ui.setPhotoFov( this.camera.fov );

		} else if ( this._savedFovBeforePhoto != null ) {

			this.camera.fov = this._savedFovBeforePhoto + ( this.player?.vehFovDelta || 0 );
			this.camera.updateProjectionMatrix();
			if ( this.ui ) this.ui.s.fov = this._savedFovBeforePhoto;
			this._savedFovBeforePhoto = null;

		}

	}

	adjustPhotoFov( deltaOrReset ) {

		const next = deltaOrReset === 0
			? ( this._savedFovBeforePhoto ?? 62 )
			: MathUtils.clamp( this.camera.fov + Number( deltaOrReset ), 22, 95 );
		this.camera.fov = next;
		this.camera.updateProjectionMatrix();
		if ( this.ui ) this.ui.ui.setPhotoFov( next );

	}

	requestPhotoCapture() {

		if ( this._photoShotBusy ) return;
		this._photoShotRequested = true;

	}

	async _finishPhotoCapture( buf, width, height, paddedBytesPerRow, format ) {

		try {

			await buf.mapAsync( GPUMapMode.READ );
			const mapped = new Uint8Array( buf.getMappedRange() );
			const rgba = new Uint8ClampedArray( width * height * 4 );
			const isBgra = String( format ).startsWith( 'bgra' );
			for ( let y = 0; y < height; y ++ ) {

				const srcOff = y * paddedBytesPerRow;
				const dstOff = y * width * 4;
				for ( let x = 0; x < width; x ++ ) {

					const si = srcOff + x * 4;
					const di = dstOff + x * 4;
					if ( isBgra ) {

						rgba[ di ] = mapped[ si + 2 ];
						rgba[ di + 1 ] = mapped[ si + 1 ];
						rgba[ di + 2 ] = mapped[ si ];

					} else {

						rgba[ di ] = mapped[ si ];
						rgba[ di + 1 ] = mapped[ si + 1 ];
						rgba[ di + 2 ] = mapped[ si + 2 ];

					}

					rgba[ di + 3 ] = 255;

				}

			}

			buf.unmap();
			buf.destroy();

			const canvas = document.createElement( 'canvas' );
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext( '2d' );
			ctx.putImageData( new ImageData( rgba, width, height ), 0, 0 );
			if ( this.photoPostcard ) this._drawPhotoPostcard( ctx, width, height );
			const blob = await new Promise( ( r ) => canvas.toBlob( r, 'image/png' ) );
			if ( blob ) {

				const d = new Date();
				const pad = ( n ) => String( n ).padStart( 2, '0' );
				const fname = `tidewater-${ d.getFullYear() }${ pad( d.getMonth() + 1 ) }${ pad( d.getDate() ) }-${ pad( d.getHours() ) }${ pad( d.getMinutes() ) }${ pad( d.getSeconds() ) }.png`;
				const url = URL.createObjectURL( blob );
				const a = document.createElement( 'a' );
				a.href = url;
				a.download = fname;
				document.body.append( a );
				a.click();
				a.remove();
				setTimeout( () => URL.revokeObjectURL( url ), 1000 );
				if ( this.ui ) {

					this.ui.ui.flashShutter();
					this.ui.ui.toast( tr( 'Screenshot saved' ), 2200 );

				}

				this.game?.onPhotoTaken?.();

			}

		} catch ( e ) {

			console.error( 'Photo capture failed', e );
			if ( this.ui ) this.ui.ui.toast( tr( 'Screenshot failed' ), 2400 );
			try { buf.unmap(); } catch {}
			try { buf.destroy(); } catch {}

		} finally {

			this._photoShotBusy = false;

		}

	}

	_drawPhotoPostcard( ctx, w, h ) {

		const sc = Math.max( 0.85, Math.min( 2.2, w / 1280 ) );
		const barH = Math.round( 96 * sc );
		const padX = Math.round( 28 * sc );
		const padY = Math.round( 20 * sc );

		const grad = ctx.createLinearGradient( 0, h - barH * 1.4, 0, h );
		grad.addColorStop( 0, 'rgba(5, 13, 18, 0)' );
		grad.addColorStop( 1, 'rgba(5, 13, 18, 0.72)' );
		ctx.fillStyle = grad;
		ctx.fillRect( 0, h - barH * 1.4, w, barH * 1.4 );

		ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
		ctx.lineWidth = Math.max( 1, Math.round( sc ) );
		const inset = Math.round( 12 * sc );
		ctx.strokeRect( inset, inset, w - inset * 2, h - inset * 2 );

		const hrs = ( ( this.settings.timeOfDay % 24 ) + 24 ) % 24;
		const hh = String( Math.floor( hrs ) ).padStart( 2, '0' );
		const mm = String( Math.floor( ( hrs - Math.floor( hrs ) ) * 60 ) ).padStart( 2, '0' );
		const ws = this.weather ? this.weather.getGameplayState() : null;
		const wLabel = ws ? trWeather( ws.kind, ws.label ) : '';
		const zh = getLang() === 'zh';

		ctx.save();
		ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
		ctx.shadowBlur = Math.round( 6 * sc );
		ctx.fillStyle = '#f2efe6';
		ctx.font = `600 ${ Math.round( 22 * sc ) }px system-ui, "Segoe UI", sans-serif`;
		ctx.fillText( zh ? 'TIDEWATER · 潮汐湾' : 'TIDEWATER', padX, h - padY - Math.round( 24 * sc ) );

		const metaParts = [ `${ hh }:${ mm }`, wLabel ];
		if ( this.player?.mode === 'vehicle' && this.player.activeVehicle ) metaParts.push( tr( this.player.activeVehicle.name ) );
		else if ( this.player?.mode === 'boat' || this.player?.mode === 'deck' ) {

			const bName = this.prefs?.data?.boatName;
			metaParts.push( bName ? bName : tr( 'Boat' ) );

		}
		ctx.fillStyle = 'rgba(242, 239, 230, 0.82)';
		ctx.font = `500 ${ Math.round( 13 * sc ) }px system-ui, "Segoe UI", sans-serif`;
		ctx.fillText( metaParts.filter( Boolean ).join( '  ·  ' ), padX, h - padY );

		const lc = this.game?.state?.lastCatch;
		if ( lc && FISH[ lc.species ] ) {

			const fName = trFish( lc.species, FISH[ lc.species ].name );
			const catchLine = zh
				? `最近渔获：${ fName } · ${ lc.kg.toFixed( 2 ) } kg · ${ lc.cm } cm`
				: `Latest catch: ${ fName } · ${ lc.kg.toFixed( 2 ) } kg · ${ lc.cm } cm`;
			ctx.textAlign = 'right';
			ctx.fillStyle = '#84eee2';
			ctx.font = `600 ${ Math.round( 14 * sc ) }px system-ui, "Segoe UI", sans-serif`;
			ctx.fillText( catchLine, w - padX, h - padY );

		}

		ctx.restore();

	}

	showGpuAdvisoryToast() {

		const info = GPU.adapterInfo;
		if ( ! info || ! this.ui ) return;
		if ( info.isIntegrated || info.isSoftware ) {

			const zh = getLang() === 'zh';
			const msg = zh
				? `检测到当前使用「${ info.name }」（${ info.isSoftware ? '软渲染' : '集成显卡' }），已优先适配流畅画质。若有独立显卡，请在 Windows「图形设置」为本程序指定高性能显卡。`
				: `Running on ${ info.name } (${ info.isSoftware ? 'software' : 'integrated GPU' }). Assign your discrete GPU in Windows Graphics Settings for higher FPS.`;
			this.ui.ui.toast( msg, 9000 );

		}

	}

	updateAudio( dt ) {

		if ( ! this.audio || ! this.audio.enabled ) return;
		const cam = this.camera;
		const p = cam.position;
		const f = this._af || ( this._af = { fwd: new Vector3(), up: new Vector3() } );
		cam.getWorldDirection( f.fwd );
		f.up.set( 0, 1, 0 ).applyQuaternion( cam.quaternion );
		const h = this.cameraWaterHeight ?? 0;
		const coast = this.terrainData.coastDistance( p.x, p.z ).d;
		this.audio.update( dt, {
			listener: { position: p, forward: f.fwd, up: f.up },
			underwater: p.y < h ? 1 : 0,
			depthBelowSurface: Math.max( 0, h - p.y ),
			surfIntensity: Math.min( 1, this.shore.amplitude.value / 0.6 ),
			distanceToShore: Math.abs( coast ),
			coastDistance: coast,
			waveHeight: this.shore.amplitude.value * 2,
			windSpeed: G.windSpeed.value,
			windDir: G.windDir.value,
			daylight: 1 - G.night.value,
			timeOfDay: this.settings.timeOfDay,
			rainIntensity: this.weather ? this.weather.state.rainIntensity : 0,
			stormIntensity: this.weather ? this.weather.state.stormIntensity : 0,
			sheltered: this.player.mode === 'boat' && this.player.camMode === 'first',
			nearPier: Math.abs( p.x - WORLD.pier.x ) < 12 && p.z > WORLD.pier.zStart - 5 && p.z < WORLD.pier.zEnd + 8,
			boat: {
				active: this.boatCtl.driven, rpm: this.boatCtl.rpm, throttle: this.boatCtl.throttle, speed: this.boatCtl.velocity.length(),
				position: this.boat.group.position, listenerInside: this.player.mode === 'boat' && this.player.camMode === 'first',
			},
			vehicle: ( () => {

				const vh = this.player.activeVehicle || ( this.vehicleManager && this.vehicleManager.getActiveOrNearest( this.player.position ) ) || this.motorcycle;
				return vh ? vh.getAudioState( this.player.mode === 'vehicle' && this.player.camMode === 'first' ) : undefined;

			} )(),
		} );

	}

}
