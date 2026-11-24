import * as THREE from '../engine/index.js';
import { UI } from './UI.js';
import { G } from '../core/Globals.js';
import { GroundBounce } from '../materials/GroundBounce.js';
import { WEATHER_PRESETS, WEATHER_ORDER } from '../weather/WeatherSystem.js';
import { UPGRADES, BOAT_PAINTS, BOAT_PAINT_IDS } from '../game/Gear.js';
import { GPU } from '../engine/gpu/GPU.js';
import { getLang, setLang, onLangChange, tr, trWeather, trUpgradeLabel } from '../i18n/i18n.js';

// Binds the Tidewater UI (panel + HUD) to the running app.
const SEA = {
	Calm: { wind: 3.5, fetch: 40, chop: 0.75, swell: 0.28, surf: 0.18, period: 11, whitecaps: 0.2 },
	Breezy: { wind: 7, fetch: 120, chop: 0.9, swell: 0.48, surf: 0.34, period: 9, whitecaps: 0.5 },
	Choppy: { wind: 12, fetch: 300, chop: 1.05, swell: 0.68, surf: 0.56, period: 8.5, whitecaps: 0.75 },
	Storm: { wind: 20, fetch: 900, chop: 1.2, swell: 1.0, surf: 0.9, period: 12, whitecaps: 1 },
};

export class AppUI {

	constructor( app, ui = new UI() ) {

		this.app = app;
		this.ui = ui;
		const fft = app.fft;
		const shore = app.shore;

		// ---- plain values the controls bind to; onChange pushes them into the simulation
		const s = this.s = {
			wind: fft.local.windSpeed,
			windDir: fft.local.windDirection,
			fetch: fft.local.fetch,
			chop: fft.choppiness.value,
			swell: fft.swell.scale,
			whitecaps: 0.5,
			clarity: 1,
			surf: shore.amplitude.value,
			period: shore.period.value,
			gamma: shore.gamma.value,
			curl: shore.curl.value,
			caustics: app.caustics ? app.caustics.strength.value : 1,
			time: app.settings.timeOfDay,
			advance: app.settings.timeSpeed !== 0,
			timeSpeed: app.settings.timeSpeed || 0.05,
			weatherAuto: app.weather ? app.weather.auto : true,
			weatherSpeed: app.weather ? app.weather.speed : 1.0,
			clouds: app.clouds ? app.clouds.coverage.value : 0.45,
			cirrus: app.clouds && app.clouds.cirrus ? app.clouds.cirrus.value : 0.5,
			exposure: 0,
			fov: app.camera.fov,
			camMode: app.player ? app.player.camMode : 'third',
			ao: app.post.params.aoStrength.value,
			bloom: app.post.params.bloom.value,
			flare: app.post.flare ? app.post.flare.strength.value : 1,
			vignette: app.post.params.vignette.value,
			saturation: app.post.params.saturation.value,
			contrast: app.post.params.contrast.value,
			grain: app.post.params.grain.value,
			renderScale: app.settings.renderScale,
			shadows: app.shadows ? app.shadows.enabled : true,
			ssr: app.waterMaterial ? app.waterMaterial.params.ssr.value > 0.5 : true,
			qualityPreset: app.qualityPreset || 'high',
			cloudQuality: app.cloudQuality || 'high',
			causticsOn: app.causticsEnabled !== false,
			autoFps: !! app.autoFps,
			audioVolume: app.audio ? app.audio.volume : ( app.prefs?.data.audioVolume ?? 1 ),
			audioMuted: app.audio ? app.audio.muted : ( app.prefs?.data.audioMuted ?? false ),
			volAmbient: app.prefs?.data.volAmbient ?? 1,
			volVehicle: app.prefs?.data.volVehicle ?? 1,
			volFishing: app.prefs?.data.volFishing ?? 1,
			volWeather: app.prefs?.data.volWeather ?? 1,
			lang: getLang(),
			lookSensitivity: app.input ? app.input.sensitivity : ( app.prefs?.data.lookSensitivity ?? 1 ),
			invertY: app.input ? app.input.invertY : ( app.prefs?.data.invertY ?? false ),
			vehHeadlight: app.motorcycle ? app.motorcycle.headlightActive : false,
			vehPreset: app.motorcycle ? app.motorcycle.handlingPreset : 'realistic',
			vehTopSpeed: app.motorcycle ? app.motorcycle.topSpeedKmh : 84,
			vehRider: app.motorcycle ? app.motorcycle.showRider : true,
			vehPaint: app.motorcycle ? app.motorcycle.paintId : ( app.prefs?.data.vehPaint ?? 'stock' ),
			vehLightTint: app.motorcycle ? app.motorcycle.lightTint : ( app.prefs?.data.vehLightTint ?? 'warm' ),
			boatPaint: app.boat ? app.boat.paintId : ( app.prefs?.data.boatPaint ?? 'classic' ),
			boatName: app.prefs?.data.boatName ?? '',
			islandRadio: app.prefs?.data.islandRadio ?? false,
		};

		ui.onPhotoMode = ( on ) => app.onPhotoModeChange( on );
		ui.onPhotoCapture = () => app.requestPhotoCapture();
		ui.onPhotoZoom = ( d ) => app.adjustPhotoFov( d );
		ui.onPhotoPostcardToggle = ( on ) => {

			app.photoPostcard = on;
			if ( app.prefs ) app.prefs.save( { photoPostcard: on } );

		};
		ui.setPhotoFov( app.camera.fov );
		ui.setPhotoPostcard( app.photoPostcard );
		ui.setQualityPreset( app.qualityPreset );

		const spectrum = () => {

			fft.local.windSpeed = s.wind;
			fft.local.windDirection = s.windDir;
			fft.local.fetch = s.fetch;
			fft.swell.scale = s.swell;
			fft.updateSpectrumUniforms();
			const a = THREE.MathUtils.degToRad( s.windDir );
			G.windDir.value.set( Math.cos( a ), Math.sin( a ) );
			G.windSpeed.value = s.wind;

		};

		const whitecaps = () => {

			// more whitecaps: foam starts at less compression (and more of it in fresh wind), lasts longer.
			// Only crests near breaking (strong compression) foam: a laxer threshold paints every crest line
			// with a white streak, which real open water at these wind speeds doesn't have.
			fft.foamBias.value = 0.5 + 0.16 * s.whitecaps + 0.01 * THREE.MathUtils.clamp( s.wind - 7, - 5, 12 );
			fft.foamDecay.value = 0.6 - 0.35 * s.whitecaps;

		};

		const clarity = () => {

			// scale absorption/scattering around the tropical defaults
			const k = 1 / Math.max( 0.2, s.clarity );
			G.waterAbsorption.value.set( 0.42, 0.075, 0.035 ).multiplyScalar( 0.6 + 0.4 * k );
			G.waterScattering.value.set( 0.012, 0.018, 0.024 ).multiplyScalar( k * k );

		};

		// ---------------------------------------------------------------- Ocean
		const ocean = ui.addTab( 'ocean', 'Ocean', 'ocean' );
		const sea = ocean.addFolder( 'Sea state', { icon: 'wind' } );
		sea.addPresets( {
			label: 'Conditions', active: 'Breezy',
			presets: Object.keys( SEA ).map( ( k ) => ( {
				label: k, icon: k.toLowerCase(),
				apply: () => {

					if ( app.weather ) app.weather.markManual( 'sea' );
					const p = SEA[ k ];
					Object.assign( s, p );
					spectrum();
					whitecaps();
					fft.choppiness.value = s.chop;
					shore.amplitude.value = s.surf;
					shore.period.value = s.period;

				},
			} ) ),
		} );
		sea.addSlider( { label: 'Wind speed', object: s, key: 'wind', min: 0.5, max: 30, step: 0.1, unit: 'm/s', tooltip: 'Wind 10 m above the sea. Drives the local wind waves, whitecaps and spray.', onChange: () => {

			if ( app.weather ) app.weather.markManual( 'sea' );
			spectrum();
			whitecaps();

		} } );
		sea.addSlider( { label: 'Wind direction', object: s, key: 'windDir', min: 0, max: 360, step: 1, unit: '°', onChange: () => {

			if ( app.weather ) {

				app.weather.windDirBase = s.windDir;
				app.weather.markManual( 'sea' );

			}

			spectrum();

		} } );
		sea.addSlider( { label: 'Fetch', object: s, key: 'fetch', min: 5, max: 2000, log: true, unit: 'km', tooltip: 'Distance the wind has blown over open water: longer fetch, longer and higher waves.', onChange: () => {

			if ( app.weather ) app.weather.markManual( 'sea' );
			spectrum();

		} } );
		sea.addSlider( { label: 'Choppiness', object: s, key: 'chop', min: 0, max: 1.6, step: 0.01, tooltip: 'Horizontal displacement: sharp crests, wide troughs.', onChange: ( v ) => { if ( app.weather ) app.weather.markManual( 'sea' ); fft.choppiness.value = v; } } );
		sea.addSlider( { label: 'Ocean swell', object: s, key: 'swell', min: 0, max: 2, step: 0.01, onChange: () => { if ( app.weather ) app.weather.markManual( 'sea' ); spectrum(); } } );
		sea.addSlider( { label: 'Whitecaps', object: s, key: 'whitecaps', min: 0, max: 1, step: 0.01, onChange: () => { if ( app.weather ) app.weather.markManual( 'sea' ); whitecaps(); } } );
		const water = ocean.addFolder( 'Water', { icon: 'droplet' } );
		water.addSlider( { label: 'Clarity', object: s, key: 'clarity', min: 0.3, max: 2, step: 0.01, tooltip: 'Lower = more suspended sediment and plankton (greener, murkier).', onChange: () => { if ( app.weather ) app.weather.markManual( 'sea' ); clarity(); } } );

		// ---------------------------------------------------------------- Shore
		const shoreTab = ui.addTab( 'shore', 'Shore', 'shore' );
		const surf = shoreTab.addFolder( 'Surf', { icon: 'wave' } );
		surf.addSlider( { label: 'Wave height', object: s, key: 'surf', min: 0, max: 1.4, step: 0.01, unit: 'm', format: ( v ) => `${ ( v * 2 ).toFixed( 2 ) } m`, onChange: ( v ) => { if ( app.weather ) app.weather.markManual( 'sea' ); shore.amplitude.value = v; } } );
		surf.addSlider( { label: 'Wave period', object: s, key: 'period', min: 5, max: 16, step: 0.1, unit: 's', onChange: ( v ) => { if ( app.weather ) app.weather.markManual( 'sea' ); shore.period.value = v; } } );
		surf.addSlider( { label: 'Breaking depth ratio', object: s, key: 'gamma', min: 0.5, max: 1.1, step: 0.01, tooltip: 'Waves break when height exceeds this fraction of the depth.', onChange: ( v ) => { shore.gamma.value = v; } } );
		surf.addSlider( { label: 'Curl', object: s, key: 'curl', min: 0, max: 1.5, step: 0.01, onChange: ( v ) => { shore.curl.value = v; } } );
		if ( app.breakers ) {

			s.spray = app.breakers.params.spray.value;
			s.lip = app.breakers.params.sheet.value;
			surf.addSlider( { label: 'Spray', object: s, key: 'spray', min: 0, max: 2, step: 0.01, tooltip: 'Droplets and mist thrown off breaking crests.', onChange: ( v ) => { app.breakers.params.spray.value = v; } } );
			surf.addSlider( { label: 'Lip sheet', object: s, key: 'lip', min: 0, max: 1.5, step: 0.01, tooltip: 'The thin sheet of water thrown forward by plunging breakers.', onChange: ( v ) => { app.breakers.params.sheet.value = v; } } );

		}

		if ( app.wake ) {

			const boat = shoreTab.addFolder( 'Boat wake', { icon: 'wave', open: false } );
			s.wakeHeight = app.wake.amplitude.value;
			s.wakeFoam = app.wake.foamGain.value;
			boat.addSlider( { label: 'Wake height', object: s, key: 'wakeHeight', min: 0, max: 2, step: 0.01, onChange: ( v ) => { app.wake.amplitude.value = v; } } );
			boat.addSlider( { label: 'Wake foam', object: s, key: 'wakeFoam', min: 0, max: 1.5, step: 0.01, onChange: ( v ) => { app.wake.foamGain.value = v; } } );

		}
		if ( app.caustics ) {

			const light = shoreTab.addFolder( 'Caustics', { icon: 'sun', open: false } );
			light.addSlider( { label: 'Intensity', object: s, key: 'caustics', min: 0, max: 2, step: 0.01, onChange: ( v ) => { app.caustics.strength.value = v; } } );

		}

		// ---------------------------------------------------------------- Sky
		const sky = ui.addTab( 'sky', 'Sky', 'sky' );
		const sun = sky.addFolder( 'Sun', { icon: 'clock' } );
		sun.addTimeOfDay( { object: app.settings, key: 'timeOfDay' } );
		sun.addSlider( { label: 'Sun azimuth', object: app.settings, key: 'sunAzimuth', min: - 180, max: 180, step: 1, format: ( v ) => `${ Math.round( v ) }°`, tooltip: 'Turns the sun\'s path around the island (0 = the real path: rises in the east, sets in the west).' } );
		let speed = null;
		sun.addToggle( { label: 'Advance time', object: s, key: 'advance', onChange: ( v ) => {

			app.settings.timeSpeed = v ? s.timeSpeed : 0;
			speed.setVisible( v );

		} } );
		speed = sun.addSlider( { label: 'Time speed', object: s, key: 'timeSpeed', min: 0.002, max: 1, log: true, unit: 'h/s', onChange: ( v ) => { if ( s.advance ) app.settings.timeSpeed = v; } } ).setVisible( s.advance );

		if ( app.weather ) {

			const weatherFolder = sky.addFolder( 'Weather', { icon: 'weather' } );
			let evoSpeed = null;
			weatherFolder.addToggle( {
				label: 'Auto weather', object: s, key: 'weatherAuto',
				tooltip: 'Automatically evolves tropical weather across day/night cycles.',
				onChange: ( v ) => {

					app.weather.setAuto( v );
					if ( app.prefs ) app.prefs.save( { weatherAuto: v, weatherPreset: app.weather.targetId } );
					if ( evoSpeed ) evoSpeed.setVisible( v );
					if ( this._weatherPresets ) this._weatherPresets.setActive( v ? app.weather.currentId : app.weather.targetId );

				},
			} );
			this._weatherPresets = weatherFolder.addPresets( {
				label: 'Conditions',
				columns: 3,
				active: app.weather.targetId,
				presets: WEATHER_ORDER.map( ( id ) => {

					const p = WEATHER_PRESETS[ id ];
					return {
						id,
						label: p.label,
						icon: p.icon,
						apply: () => {

							app.weather.setPreset( id );
							s.weatherAuto = false;
							if ( app.prefs ) app.prefs.save( { weatherAuto: false, weatherPreset: id } );
							if ( evoSpeed ) evoSpeed.setVisible( false );

						},
					};

				} ),
			} );
			evoSpeed = weatherFolder.addSlider( {
				label: 'Evolution speed', object: s, key: 'weatherSpeed', min: 0.1, max: 10, log: true, unit: '×',
				onChange: ( v ) => {

					app.weather.speed = v;
					if ( app.prefs ) app.prefs.save( { weatherSpeed: v } );

				},
			} ).setVisible( s.weatherAuto );
			weatherFolder.addButton( {
				label: 'Trigger lightning', icon: 'bolt',
				onClick: () => {

					if ( app.lightning ) {

						app.lightning.triggerNow( app.camera, app.weather.state.cloudAltitude );
						ui.toast( tr( 'Lightning strike triggered' ), 1600 );

					}

				},
			} );
			weatherFolder.addInfo( {
				label: 'Status',
				get: () => {

					const w = app.weather.getGameplayState();
					const cur = trWeather( w.kind, WEATHER_PRESETS[ w.kind ]?.label || w.label );
					const tgt = w.targetKind ? trWeather( w.targetKind, WEATHER_PRESETS[ w.targetKind ]?.label ) : '';
					const base = w.transitioning && tgt && tgt !== cur ? `${ cur } → ${ tgt }` : cur;
					return w.auto ? `${ base } (${ tr( 'Auto' ) })` : base;

				},
			} );
			weatherFolder.addInfo( {
				label: 'Barometer',
				get: () => {

					const w = app.weather.getGameplayState();
					const arrow = w.pressureTrend > 0.15 ? ' ↑' : w.pressureTrend < - 0.15 ? ' ↓' : '';
					return `${ Math.round( w.pressure ) } hPa${ arrow }`;

				},
			} );
			weatherFolder.addInfo( {
				label: 'Rain',
				get: () => `${ Math.round( app.weather.state.rainIntensity * 100 ) }%`,
			} );

		}

		const atmo = sky.addFolder( 'Atmosphere', { icon: 'cloud' } );
		if ( app.clouds ) atmo.addSlider( { label: 'Cloud cover', object: s, key: 'clouds', min: 0, max: 1, step: 0.01, format: ( v ) => `${ Math.round( v * 100 ) }%`, onChange: ( v ) => { if ( app.weather ) app.weather.markManual( 'clouds' ); app.clouds.coverage.value = v; } } );
		if ( app.clouds && app.clouds.cirrus ) atmo.addSlider( { label: 'Cirrus', object: s, key: 'cirrus', min: 0, max: 1, step: 0.01, format: ( v ) => `${ Math.round( v * 100 ) }%`, onChange: ( v ) => { if ( app.weather ) app.weather.markManual( 'cirrus' ); app.clouds.cirrus.value = v; } } );
		if ( app.haze ) {

			s.haze = app.haze.density.value;
			s.shafts = app.haze.shafts.value;
			atmo.addSlider( { label: 'Haze', object: s, key: 'haze', min: 0, max: 4, step: 0.05, tooltip: 'Aerial perspective and marine haze density (1 = about 20 km visibility at sea level, 0 = clear air).', onChange: ( v ) => { if ( app.weather ) app.weather.markManual( 'haze' ); app.haze.density.value = v; } } );
			atmo.addSlider( { label: 'Sun shafts', object: s, key: 'shafts', min: 0, max: 3, step: 0.05, tooltip: 'Volumetric light shafts and crepuscular rays in the haze (shadows of palms, the pier, hills and clouds). 0 turns them off.', onChange: ( v ) => { if ( app.weather ) app.weather.markManual( 'shafts' ); app.haze.shafts.value = v; } } );

		}
		if ( app.airMotes ) {

			s.air = app.airMotes.intensity.value;
			atmo.addSlider( { label: 'Air particles', object: s, key: 'air', min: 0, max: 2, step: 0.01, tooltip: 'Dust, pollen, salt haze, seed fluff and the odd gnat drifting in the air: they catch the light when backlit by the sun. 0 turns them off.', onChange: ( v ) => { app.airMotes.intensity.value = v; } } );

		}

		atmo.addSlider( { label: 'Exposure', object: s, key: 'exposure', min: - 3, max: 3, step: 0.1, unit: 'EV', onChange: ( v ) => { app.settings.exposure = 0.55 * Math.pow( 2, v ); } } );

		// ---------------------------------------------------------------- Camera
		const cam = ui.addTab( 'camera', 'Camera', 'camera' );
		const view = cam.addFolder( 'View', { icon: 'camera' } );
		view.addSelect( { label: 'Boat camera', object: s, key: 'camMode', options: [ { label: '1st person', value: 'first' }, { label: '3rd person', value: 'third' } ], onChange: ( v ) => {

			app.player.camMode = v;
			app.player.camInit = false;
			app.player.vehCamInit = false;
			if ( app.prefs ) app.prefs.save( { camMode: v } );

		} } );
		view.addSlider( { label: 'Field of view', object: s, key: 'fov', min: 35, max: 100, step: 1, unit: '°', onChange: ( v ) => {

			app.camera.fov = v;
			app.camera.updateProjectionMatrix();
			if ( app.player ) app.player.vehFovDelta = 0;
			if ( app.prefs ) app.prefs.save( { fov: v } );
			ui.setPhotoFov( v );

		} } );
		view.addSlider( { label: 'Mouse sensitivity', object: s, key: 'lookSensitivity', min: 0.4, max: 2.2, step: 0.05, format: ( v ) => `${ v.toFixed( 2 ) }×`, onChange: ( v ) => {

			if ( app.input ) app.input.sensitivity = v;
			if ( app.prefs ) app.prefs.save( { lookSensitivity: v } );

		} } );
		view.addToggle( { label: 'Invert Y axis', object: s, key: 'invertY', onChange: ( v ) => {

			if ( app.input ) app.input.invertY = v;
			if ( app.prefs ) app.prefs.save( { invertY: v } );

		} } );
		view.addButton( { label: 'Free camera (F)', icon: 'camera', onClick: () => app.setFreeCam( ! app.freeCam ) } );

		// ---------------------------------------------------------------- Vehicles
		if ( app.vehicleManager && ( app.motorcycle || app.buggy ) ) {

			const vehs = app.vehicleManager.vehicles;
			const refVeh = app.motorcycle || app.buggy || vehs[ 0 ];
			const activeOrRef = () => app.player?.activeVehicle || app.vehicleManager.getActiveOrNearest( app.player?.position ) || refVeh;
			const vehTab = ui.addTab( 'vehicles', 'Vehicles', 'bike' );
			const actions = vehTab.addFolder( 'Actions', { icon: 'bike' } );
			if ( app.motorcycle ) actions.addButton( { label: 'Summon Motorcycle', icon: 'compass', variant: 'primary', onClick: () => {

				const res = app.vehicleManager.summonNear( app.player, app.motorcycle );
				app.saveRuntimeState( true );
				ui.toast( tr( res.atPlayer ? 'Motorcycle brought nearby' : 'Motorcycle returned to beach road' ) );

			} } );
			if ( app.buggy ) actions.addButton( { label: 'Summon Coastal Buggy', icon: 'compass', variant: 'primary', onClick: () => {

				const res = app.vehicleManager.summonNear( app.player, app.buggy );
				app.saveRuntimeState( true );
				ui.toast( tr( res.atPlayer ? 'Coastal Buggy brought nearby' : 'Coastal Buggy returned to beach road' ) );

			} } );
			actions.addButton( { label: 'Reset active vehicle (R)', icon: 'reset', onClick: () => {

				const target = activeOrRef();
				if ( target ) target.resetUpright();
				app.saveRuntimeState( true );
				ui.toast( tr( 'Vehicle reset' ) );

			} } );
			actions.addToggle( { label: 'Headlight (L)', object: s, key: 'vehHeadlight', onChange: ( v ) => {

				for ( const vh of vehs ) vh.toggleHeadlight( v );
				if ( app.prefs ) app.prefs.save( { vehHeadlight: v } );

			} } );

			const handling = vehTab.addFolder( 'Handling', { icon: 'sliders' } );
			handling.addSelect( { label: 'Handling preset', object: s, key: 'vehPreset', options: [
				{ label: 'Coastal Realistic', value: 'realistic' },
				{ label: 'Arcade Drift', value: 'arcade' },
			], onChange: ( v ) => {

				for ( const vh of vehs ) vh.handlingPreset = v;
				if ( app.prefs ) app.prefs.save( { vehPreset: v } );

			} } );
			handling.addSlider( { label: 'Top speed', object: s, key: 'vehTopSpeed', min: 50, max: 120, step: 2, unit: 'km/h', onChange: ( v ) => {

				for ( const vh of vehs ) vh.topSpeedKmh = vh.id === 'buggy' ? Math.round( v * ( 76 / 84 ) ) : v;
				if ( app.prefs ) app.prefs.save( { vehTopSpeed: v } );

			} } );
			handling.addToggle( { label: 'Show rider (3rd person)', object: s, key: 'vehRider', onChange: ( v ) => {

				for ( const vh of vehs ) vh.showRider = v;
				if ( app.prefs ) app.prefs.save( { vehRider: v } );

			} } );
			handling.addSelect( { label: 'Paint livery', object: s, key: 'vehPaint', options: [
				{ label: 'Stock coastal', value: 'stock' },
				{ label: 'Coral red', value: 'coral' },
				{ label: 'Coastal teal', value: 'teal' },
				{ label: 'Dune gold', value: 'sand' },
				{ label: 'Obsidian black', value: 'obsidian' },
				{ label: 'Sea pearl', value: 'pearl' },
			], onChange: ( v ) => {

				for ( const vh of vehs ) vh.setPaint?.( v );
				if ( app.prefs ) app.prefs.save( { vehPaint: v } );

			} } );
			handling.addSelect( { label: 'Headlight tint', object: s, key: 'vehLightTint', options: [
				{ label: 'Warm halogen', value: 'warm' },
				{ label: 'Ice white LED', value: 'led' },
				{ label: 'Amber fog', value: 'amber' },
			], onChange: ( v ) => {

				for ( const vh of vehs ) vh.setLightTint?.( v );
				if ( app.prefs ) app.prefs.save( { vehLightTint: v } );

			} } );

			const garage = vehTab.addFolder( 'Garage upgrades', { icon: 'sliders' } );
			for ( const key of [ 'vehTires', 'vehEngine', 'vehSuspension', 'vehLights' ] ) {

				const spec = UPGRADES[ key ];
				if ( ! spec ) continue;
				garage.addInfo( {
					label: spec.name,
					get: () => {

						const lv = app.game?.state?.upgrades?.[ key ] ?? 0;
						const entry = spec.levels[ lv ] || spec.levels[ 0 ];
						return `${ trUpgradeLabel( key, lv, entry.label ) } (${ lv + 1 }/${ spec.levels.length })`;

					},
				} );

			}

			if ( app.boat ) {

				const boatFolder = vehTab.addFolder( 'Boat appearance', { icon: 'boat' } );
				boatFolder.addSelect( {
					label: 'Boat hull paint', object: s, key: 'boatPaint',
					options: BOAT_PAINT_IDS.map( ( pid ) => ( { label: BOAT_PAINTS[ pid ].label, value: pid } ) ),
					onChange: ( v ) => {

						app.boat.setPaint?.( v );
						if ( app.prefs ) app.prefs.save( { boatPaint: v } );

					},
				} );
				boatFolder.addInfo( {
					label: 'Boat name',
					get: () => s.boatName || tr( 'Unnamed Vessel' ),
				} );
				boatFolder.addButton( {
					label: 'Rename boat', icon: 'palette', variant: 'ghost',
					onClick: () => {

						if ( typeof window === 'undefined' || typeof window.prompt !== 'function' ) return;
						const raw = window.prompt( tr( 'Enter custom boat name (max 18 chars)' ), s.boatName || '' );
						if ( raw === null ) return;
						const clean = raw.trim().slice( 0, 18 );
						s.boatName = clean;
						if ( app.prefs ) app.prefs.save( { boatName: clean } );
						ui.refresh();
						ui.toast( clean ? `${ tr( 'Boat renamed' ) }: ${ clean }` : tr( 'Boat name cleared' ) );

					},
				} );

			}

		}

		// ---------------------------------------------------------------- Effects
		const fx = ui.addTab( 'effects', 'Effects', 'effects' );
		const post = fx.addFolder( 'Post-processing', { icon: 'sparkles' } );
		const P = app.post.params;
		post.addSlider( { label: 'Ambient occlusion', object: s, key: 'ao', min: 0, max: 1.5, step: 0.01, onChange: ( v ) => { P.aoStrength.value = v; } } );
		s.bounce = GroundBounce.strength.value;
		post.addSlider( { label: 'Bounce light', object: s, key: 'bounce', min: 0, max: 2, step: 0.01, tooltip: 'Sunlight reflected off the ground (bright sand) onto undersides and shaded faces: pier, eaves, hulls, trunks. 0 = off.', onChange: ( v ) => { GroundBounce.strength.value = v; } } );
		s.sharpen = P.sharpen.value;
		post.addSlider( { label: 'Sharpen', object: s, key: 'sharpen', min: 0, max: 1, step: 0.01, tooltip: 'Contrast-adaptive sharpening after the temporal anti-aliasing.', onChange: ( v ) => { P.sharpen.value = v; } } );
		if ( app.post.motionBlur ) {

			const mb = app.post.motionBlur.shutter;
			s.motionBlur = mb.value;
			post.addSlider( { label: 'Motion blur', object: s, key: 'motionBlur', min: 0, max: 1, step: 0.05, format: ( v ) => v > 0 ? `${ Math.round( v * 360 ) }°` : 'Off', tooltip: 'Camera and object motion blur, as a shutter angle (180° = film look). 0 turns it off.', onChange: ( v ) => { mb.value = v; } } );

		}

		post.addSlider( { label: 'Bloom', object: s, key: 'bloom', min: 0, max: 0.3, step: 0.005, onChange: ( v ) => { P.bloom.value = v; } } );
		if ( app.post.flare ) post.addSlider( { label: 'Lens flare', object: s, key: 'flare', min: 0, max: 2, step: 0.05, onChange: ( v ) => { if ( app.weather ) app.weather.markManual( 'flare' ); app.post.flare.strength.value = v; } } );
		post.addSlider( { label: 'Saturation', object: s, key: 'saturation', min: 0.5, max: 1.5, step: 0.01, onChange: ( v ) => { P.saturation.value = v; } } );
		post.addSlider( { label: 'Contrast', object: s, key: 'contrast', min: 0.8, max: 1.3, step: 0.01, onChange: ( v ) => { P.contrast.value = v; } } );
		post.addSlider( { label: 'Vignette', object: s, key: 'vignette', min: 0, max: 1, step: 0.01, onChange: ( v ) => { P.vignette.value = v; } } );
		post.addSlider( { label: 'Film grain', object: s, key: 'grain', min: 0, max: 0.06, step: 0.001, onChange: ( v ) => { P.grain.value = v; } } );

		// ---------------------------------------------------------------- Performance
		const perf = ui.addTab( 'performance', 'Performance', 'performance' );
		const live = perf.addFolder( 'Live', { icon: 'gauge' } );
		live.addInfo( { label: 'Frame rate', get: () => `${ ( app.fps || 0 ).toFixed( 0 ) } fps` } );
		live.addInfo( { label: 'CPU per frame', get: () => `${ ( app.cpuMs || 0 ).toFixed( 2 ) } ms` } );
		live.addInfo( { label: 'Render size', get: () => `${ app.sceneRenderer.width } × ${ app.sceneRenderer.height }` } );
		live.addInfo( {
			label: 'GPU',
			get: () => {

				const info = GPU.adapterInfo;
				if ( ! info ) return 'WebGPU';
				return `${ info.name } (${ tr( `gpu_tier_${ info.tier }` ) })`;

			},
		} );
		const quality = perf.addFolder( 'Quality', { icon: 'layers' } );
		const syncQualityControls = () => {

			s.qualityPreset = app.qualityPreset;
			s.renderScale = app.settings.renderScale;
			s.aa = app.post.aaMode === 'none' ? 0 : app.post.taau.jitterPhaseOverride;
			s.shadows = app.shadows.enabled;
			s.ssr = app.waterMaterial.params.ssr.value > 0.5;
			s.ao = app.post.params.aoStrength.value;
			if ( app.post.motionBlur ) s.motionBlur = app.post.motionBlur.shutter.value;
			s.sharpen = app.post.params.sharpen.value;
			s.cloudQuality = app.cloudQuality;
			s.causticsOn = app.causticsEnabled;
			s.autoFps = !! app.autoFps;
			if ( app.caustics ) s.caustics = app.caustics.strength.value;
			ui.setQualityPreset( app.qualityPreset );
			ui.refresh();

		};

		ui.onQualityPreset = ( id ) => {

			app.applyQualityPreset( id );
			syncQualityControls();

		};

		quality.addSelect( {
			label: 'Quality preset', object: s, key: 'qualityPreset',
			options: [
				{ label: 'Smooth (Low-end)', value: 'potato' },
				{ label: 'Eco', value: 'eco' },
				{ label: 'Balanced', value: 'balanced' },
				{ label: 'High', value: 'high' },
				{ label: 'Ultra', value: 'ultra' },
			],
			onChange: ( v ) => {

				app.applyQualityPreset( v );
				syncQualityControls();

			},
		} );
		quality.addSlider( { label: 'Render scale', object: s, key: 'renderScale', min: 0.4, max: 1, step: 0.05, format: ( v ) => `${ Math.round( v * 100 ) }%`, tooltip: 'Internal resolution; the temporal upscaler reconstructs the full output resolution.', onChange: ( v ) => {

			app.setRenderScale( v );
			app.qualityPreset = 'custom';
			s.qualityPreset = 'custom';
			ui.setQualityPreset( 'custom' );
			if ( app.prefs ) app.prefs.save( { qualityPreset: 'custom', renderScale: app.settings.renderScale } );

		} } );
		quality.addToggle( {
			label: 'Auto FPS boost', object: s, key: 'autoFps',
			tooltip: 'Automatically nudges internal resolution between 75% and your target scale during heavy storm scenes to keep frame rate smooth without pixelation.',
			onChange: ( v ) => {

				app.autoFps = !! v;
				if ( ! app.autoFps ) app.setRenderScale( app._targetRenderScale );
				if ( app.prefs ) app.prefs.save( { autoFps: app.autoFps } );

			},
		} );
		// anti-aliasing: the TAA with 2..16 jitter positions averaged per pixel, or none
		s.aa = app.post.aaMode === 'none' ? 0 : app.post.taau.jitterPhaseOverride;
		quality.addSelect( { label: 'Anti-aliasing', object: s, key: 'aa', tooltip: 'Temporal anti-aliasing: each pixel averages this many sub-pixel sample positions over successive frames (it also smooths dithered fades and shadow noise). More samples cost nothing per frame but take a few more frames to settle.', options: [ { label: 'Off', value: 0 }, { label: '2x', value: 2 }, { label: '4x', value: 4 }, { label: '8x', value: 8 }, { label: '16x', value: 16 } ], onChange: ( v ) => {

			const n = Number( v );
			app.post.aaMode = n > 0 ? 'taa' : 'none';
			if ( n > 0 ) app.post.taau.jitterPhaseOverride = n;
			app.qualityPreset = 'custom';
			s.qualityPreset = 'custom';
			ui.setQualityPreset( 'custom' );
			if ( app.prefs ) app.prefs.save( { qualityPreset: 'custom', aa: n } );

		} } );
		quality.addToggle( { label: 'Shadows', object: s, key: 'shadows', onChange: ( v ) => {

			app.shadows.enabled = v;
			app.qualityPreset = 'custom';
			s.qualityPreset = 'custom';
			ui.setQualityPreset( 'custom' );
			if ( app.prefs ) app.prefs.save( { qualityPreset: 'custom', shadows: v } );

		} } );
		s.ssr = app.waterMaterial.params.ssr.value > 0.5;
		quality.addToggle( { label: 'Water reflections', object: s, key: 'ssr', tooltip: 'Screen-space reflections of the pier, boats and hills on the water.', onChange: ( v ) => {

			app.waterMaterial.params.ssr.value = v ? 1 : 0;
			app.qualityPreset = 'custom';
			s.qualityPreset = 'custom';
			ui.setQualityPreset( 'custom' );
			if ( app.prefs ) app.prefs.save( { qualityPreset: 'custom', ssr: v } );

		} } );
		quality.addSelect( {
			label: 'Volumetric clouds', object: s, key: 'cloudQuality',
			options: [
				{ label: 'Off', value: 'off' },
				{ label: 'Low', value: 'low' },
				{ label: 'Medium', value: 'medium' },
				{ label: 'High', value: 'high' },
			],
			onChange: ( v ) => {

				app.setCloudQuality( v );
				app.qualityPreset = 'custom';
				s.qualityPreset = 'custom';
				ui.setQualityPreset( 'custom' );
				if ( app.prefs ) app.prefs.save( { qualityPreset: 'custom', cloudQuality: v } );

			},
		} );
		quality.addToggle( {
			label: 'Water caustics', object: s, key: 'causticsOn',
			onChange: ( v ) => {

				app.setCausticsEnabled( v );
				if ( app.caustics ) s.caustics = app.caustics.strength.value;
				app.qualityPreset = 'custom';
				s.qualityPreset = 'custom';
				ui.setQualityPreset( 'custom' );
				if ( app.prefs ) app.prefs.save( { qualityPreset: 'custom', caustics: !! v } );

			},
		} );

		const audioFolder = perf.addFolder( 'Audio', { icon: 'volume' } );
		audioFolder.addSlider( { label: 'Master volume', object: s, key: 'audioVolume', min: 0, max: 1, step: 0.02, format: ( v ) => `${ Math.round( v * 100 ) }%`, onChange: ( v ) => {

			if ( app.audio ) app.audio.setMasterVolume( v );
			if ( app.prefs ) app.prefs.save( { audioVolume: v } );

		} } );
		for ( const [ cat, key, label ] of [
			[ 'ambient', 'volAmbient', 'Ambient & sea' ],
			[ 'vehicle', 'volVehicle', 'Vehicles & boat' ],
			[ 'fishing', 'volFishing', 'Fishing & UI' ],
			[ 'weather', 'volWeather', 'Rain & thunder' ],
		] ) {

			audioFolder.addSlider( { label, object: s, key, min: 0, max: 1, step: 0.02, format: ( v ) => `${ Math.round( v * 100 ) }%`, onChange: ( v ) => {

				if ( app.audio ) app.audio.setCategoryVolume?.( cat, v );
				if ( app.prefs ) app.prefs.save( { [ key ]: v } );

			} } );

		}

		audioFolder.addToggle( { label: 'Mute (M)', object: s, key: 'audioMuted', onChange: ( v ) => {

			if ( app.audio ) app.audio.setMuted( v );
			if ( app.prefs ) app.prefs.save( { audioMuted: v } );

		} } );
		audioFolder.addToggle( {
			label: 'Island ambient radio', object: s, key: 'islandRadio',
			tooltip: 'Soft tropical chill chords over the coastal ambiance while above water.',
			onChange: ( v ) => {

				if ( app.audio ) app.audio.setRadioEnabled?.( !! v );
				if ( app.prefs ) app.prefs.save( { islandRadio: !! v } );

			},
		} );

		const syncStateFields = () => {

			s.audioVolume = app.audio ? app.audio.volume : ( app.prefs?.data.audioVolume ?? 1 );
			s.audioMuted = app.audio ? app.audio.muted : ( app.prefs?.data.audioMuted ?? false );
			s.volAmbient = app.prefs?.data.volAmbient ?? 1;
			s.volVehicle = app.prefs?.data.volVehicle ?? 1;
			s.volFishing = app.prefs?.data.volFishing ?? 1;
			s.volWeather = app.prefs?.data.volWeather ?? 1;
			s.camMode = app.player ? app.player.camMode : 'third';
			s.fov = app.camera.fov;
			s.lookSensitivity = app.input ? app.input.sensitivity : 1;
			s.invertY = app.input ? app.input.invertY : false;
			if ( app.motorcycle ) {

				s.vehPreset = app.motorcycle.handlingPreset;
				s.vehTopSpeed = app.motorcycle.topSpeedKmh;
				s.vehRider = app.motorcycle.showRider;
				s.vehHeadlight = app.motorcycle.headlightActive;
				s.vehPaint = app.motorcycle.paintId;
				s.vehLightTint = app.motorcycle.lightTint;

			}

			if ( app.boat ) s.boatPaint = app.boat.paintId;
			s.boatName = app.prefs?.data.boatName ?? '';
			s.islandRadio = app.prefs?.data.islandRadio ?? false;

			if ( app.weather ) {

				s.weatherAuto = app.weather.auto;
				s.weatherSpeed = app.weather.speed;

			}

			ui.setPhotoFov( app.camera.fov );
			ui.setPhotoPostcard( app.photoPostcard );
			syncQualityControls();

		};
		this._syncFromApp = syncStateFields;

		const general = perf.addFolder( 'General', { icon: 'sliders' } );
		general.addSelect( {
			label: 'Language', object: s, key: 'lang',
			tooltip: 'Switch UI language between Simplified Chinese and English.',
			options: [ { label: 'Simplified Chinese', value: 'zh' }, { label: 'English', value: 'en' } ],
			onChange: ( v ) => setLang( v ),
		} );
		onLangChange( ( l ) => { s.lang = l; ui.refresh(); } );
		general.addButton( { label: 'Export save', icon: 'download', onClick: () => {

			const json = app.exportSaveJSON();
			const blob = new Blob( [ json ], { type: 'application/json' } );
			const d = new Date();
			const pad = ( n ) => String( n ).padStart( 2, '0' );
			const fname = `tidewater-save-${ d.getFullYear() }${ pad( d.getMonth() + 1 ) }${ pad( d.getDate() ) }.json`;
			const url = URL.createObjectURL( blob );
			const a = document.createElement( 'a' );
			a.href = url;
			a.download = fname;
			document.body.append( a );
			a.click();
			a.remove();
			setTimeout( () => URL.revokeObjectURL( url ), 1000 );
			ui.toast( tr( 'Save exported' ) );

		} } );
		general.addButton( { label: 'Import save', icon: 'upload', onClick: () => {

			const inp = document.createElement( 'input' );
			inp.type = 'file';
			inp.accept = '.json,application/json';
			inp.onchange = () => {

				const f = inp.files && inp.files[ 0 ];
				if ( ! f ) return;
				f.text().then( ( txt ) => {

					const res = app.importSaveJSON( txt );
					ui.toast( tr( res.ok ? 'Save imported' : 'Invalid save file' ) );

				} ).catch( () => ui.toast( tr( 'Invalid save file' ) ) );

			};
			inp.click();

		} } );
		if ( typeof window !== 'undefined' && window.tidewaterDesktop?.createDesktopShortcut ) {

			general.addButton( {
				label: 'Create desktop shortcut', icon: 'monitor', variant: 'ghost',
				onClick: async () => {

					const res = await window.tidewaterDesktop.createDesktopShortcut();
					if ( res?.ok ) ui.toast( tr( 'Desktop shortcut created' ) );
					else ui.toast( tr( 'Failed to create shortcut' ) );

				},
			} );

		}

		general.addButton( { label: 'Reset defaults', icon: 'reset', variant: 'ghost', onClick: () => {

			if ( app.prefs ) app.prefs.reset();
			app.applySavedPrefs();
			syncStateFields();
			ui.toast( tr( 'Settings reset to defaults' ) );

		} } );

		// ---------------------------------------------------------------- Multiplayer
		const mpTab = ui.addTab( 'multiplayer', 'Multiplayer', 'users' );
		if ( app.mp ) {

			const mp = app.mp;
			let selectedMode = mp.transportMode || 'p2p';
			let draftJoinCode = '';
			let draftJoinIp = '';

			const box = document.createElement( 'div' );
			box.className = 'tw-mp-box';
			mpTab.page.append( box );

			const copyText = ( text ) => {

				if ( ! text ) return;
				if ( navigator.clipboard && navigator.clipboard.writeText ) {

					navigator.clipboard.writeText( text ).then( () => ui.toast( tr( 'Copied' ) ) ).catch( () => {} );

				}

			};

			const esc = ( v ) => String( v ?? '' ).replace( /[&<>"']/g, ( ch ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ ch ] ) );
			const renderMp = ( sum = mp.getSummary() ) => {

				ui.setMultiplayerStatus( sum );
				const zh = getLang() === 'zh';
				const desktopOk = mp.isDesktopAvailable();
				const connected = sum.status === 'connected';
				const connecting = sum.status === 'connecting';

				box.innerHTML = '';

				// 1. Nickname card
				const cardNick = document.createElement( 'div' );
				cardNick.className = 'tw-mp-card';
				cardNick.innerHTML = `
					<div class="tw-mp-lbl">${ tr( 'Your nickname' ) }</div>
					<div class="tw-mp-row">
						<input type="text" class="tw-mp-input" maxlength="16" data-mp-nick />
					</div>`;
				const nickInp = cardNick.querySelector( '[data-mp-nick]' );
				nickInp.value = sum.nickname;
				nickInp.addEventListener( 'keydown', ( e ) => e.stopPropagation() );
				nickInp.addEventListener( 'change', () => mp.setNickname( nickInp.value ) );
				box.append( cardNick );

				// 2. Mode & connect / room status
				if ( ! connected ) {

					const cardMode = document.createElement( 'div' );
					cardMode.className = 'tw-mp-card';
					cardMode.innerHTML = `
						<div class="tw-mp-lbl">${ tr( 'Connection mode' ) }</div>
						<div class="tw-mp-seg">
							<button type="button" class="tw-mp-seg-btn ${ selectedMode === 'p2p' ? 'is-active' : '' }" data-mode="p2p">${ tr( 'P2P Room Code' ) }</button>
							<button type="button" class="tw-mp-seg-btn ${ selectedMode === 'lan' ? 'is-active' : '' }" data-mode="lan">${ tr( 'LAN / Virtual LAN' ) }</button>
						</div>`;
					cardMode.querySelectorAll( '[data-mode]' ).forEach( ( b ) => {

						b.addEventListener( 'click', () => {

							selectedMode = b.dataset.mode;
							renderMp();

						} );

					} );
					box.append( cardMode );

					const cardAct = document.createElement( 'div' );
					cardAct.className = 'tw-mp-card';
					if ( selectedMode === 'p2p' ) {

						cardAct.innerHTML = `
							<button type="button" class="tw-mp-btn" data-host-p2p ${ connecting ? 'disabled' : '' }>${ tr( 'Create P2P Room' ) }</button>
							<div class="tw-mp-row">
								<input type="text" class="tw-mp-input" maxlength="12" data-join-code placeholder="${ tr( 'Enter room code (e.g. TW-4829)' ) }" />
								<button type="button" class="tw-mp-btn is-ghost" data-join-p2p ${ connecting ? 'disabled' : '' }>${ tr( 'Join Room' ) }</button>
							</div>`;
						const codeInp = cardAct.querySelector( '[data-join-code]' );
						codeInp.value = draftJoinCode;
						codeInp.addEventListener( 'keydown', ( e ) => e.stopPropagation() );
						codeInp.addEventListener( 'input', () => { draftJoinCode = codeInp.value; } );
						cardAct.querySelector( '[data-host-p2p]' ).addEventListener( 'click', () => mp.hostP2P( nickInp.value ) );
						cardAct.querySelector( '[data-join-p2p]' ).addEventListener( 'click', () => mp.joinP2P( codeInp.value, nickInp.value ) );

					} else {

						cardAct.innerHTML = `
							<button type="button" class="tw-mp-btn" data-host-lan ${ ( connecting || ! desktopOk ) ? 'disabled' : '' }>${ tr( 'Start LAN Host' ) }</button>
							${ desktopOk ? '' : `<div class="tw-mp-status">${ tr( 'LAN hosting requires Desktop Edition' ) }</div>` }
							<div class="tw-mp-row">
								<input type="text" class="tw-mp-input" maxlength="64" data-join-ip placeholder="${ tr( 'Enter host IP:port (e.g. 192.168.1.50:5195)' ) }" />
								<button type="button" class="tw-mp-btn is-ghost" data-join-lan ${ connecting ? 'disabled' : '' }>${ tr( 'Connect LAN Host' ) }</button>
							</div>`;
						const ipInp = cardAct.querySelector( '[data-join-ip]' );
						ipInp.value = draftJoinIp;
						ipInp.addEventListener( 'keydown', ( e ) => e.stopPropagation() );
						ipInp.addEventListener( 'input', () => { draftJoinIp = ipInp.value; } );
						cardAct.querySelector( '[data-host-lan]' ).addEventListener( 'click', () => mp.hostLAN( nickInp.value ) );
						cardAct.querySelector( '[data-join-lan]' ).addEventListener( 'click', () => mp.joinLAN( ipInp.value, nickInp.value ) );

					}

					if ( connecting ) {

						const st = document.createElement( 'div' );
						st.className = 'tw-mp-status';
						st.textContent = zh ? '正在建立联机通道…' : 'Connecting…';
						cardAct.append( st );

					} else if ( sum.status === 'error' && sum.errorMessage ) {

						const st = document.createElement( 'div' );
						st.className = 'tw-mp-status is-err';
						st.textContent = sum.errorMessage;
						cardAct.append( st );

					}

					box.append( cardAct );

				} else {

					const cardRoom = document.createElement( 'div' );
					cardRoom.className = 'tw-mp-card';
					const roleLbl = sum.role === 'host' ? ( zh ? '房主' : 'Host' ) : ( zh ? '访客' : 'Guest' );
					const addrs = ( sum.addresses && sum.addresses.length ) ? sum.addresses : [ sum.roomCode ];
					cardRoom.innerHTML = `
						<div class="tw-mp-lbl">${ roleLbl } · ${ zh ? `共 ${ sum.peerCount + 1 } 人在岛上` : `${ sum.peerCount + 1 } in room` }</div>
						<div class="tw-mp-code">
							<span>${ esc( sum.roomCode ) }</span>
							<button type="button" class="tw-mp-btn is-ghost" data-copy>${ tr( 'Copy' ) }</button>
						</div>
						${ addrs.length > 1 ? `<div class="tw-mp-status">${ zh ? '可用局域网 / 虚拟局域网地址：' : 'Available addresses: ' }${ esc( addrs.join( ' · ' ) ) }</div>` : '' }
						<div class="tw-mp-peers">
							<span class="tw-mp-peer"><i style="background:${ esc( mp.selfColor ) }"></i>${ esc( sum.nickname ) } (${ zh ? '你' : 'You' })</span>
							${ sum.peers.map( ( p ) => `<span class="tw-mp-peer"><i style="background:${ esc( p.color ) }"></i>${ esc( p.name ) }</span>` ).join( '' ) }
						</div>
						<div class="tw-mp-row">
							<button type="button" class="tw-mp-btn" data-share-wp>${ tr( 'Share waypoint' ) }</button>
							<button type="button" class="tw-mp-btn is-danger" data-leave>${ tr( 'Disconnect' ) }</button>
						</div>`;
					cardRoom.querySelector( '[data-copy]' ).addEventListener( 'click', () => copyText( sum.roomCode ) );
					cardRoom.querySelector( '[data-share-wp]' ).addEventListener( 'click', () => mp.shareWaypoint() );
					cardRoom.querySelector( '[data-leave]' ).addEventListener( 'click', () => mp.disconnect() );
					box.append( cardRoom );

					const tSum = mp.getTournamentSummary?.();
					const cardTourney = document.createElement( 'div' );
					cardTourney.className = 'tw-mp-card';
					if ( tSum && tSum.active ) {

						const mins = Math.floor( tSum.remainingSec / 60 );
						const secs = Math.floor( tSum.remainingSec % 60 );
						const clock = `${ String( mins ).padStart( 2, '0' ) }:${ String( secs ).padStart( 2, '0' ) }`;
						const listHtml = tSum.rows.map( ( r, i ) => {

							const metric = tSum.mode === 'biggestKg' ? `${ r.biggestKg.toFixed( 2 ) } kg`
								: tSum.mode === 'speciesCount' ? `${ r.speciesCount } ${ zh ? '种' : 'sp' }`
									: `${ r.totalKg.toFixed( 2 ) } kg`;
							return `<div class="tw-mp-status">${ i + 1 }. ${ esc( r.name ) } — <b>${ metric }</b></div>`;

						} ).join( '' );
						cardTourney.innerHTML = `
							<div class="tw-mp-lbl">🏆 ${ esc( tr( `tourney_${ tSum.mode }` ) ) } · ${ clock }</div>
							${ listHtml }
							${ sum.role === 'host' ? `<button type="button" class="tw-mp-btn is-danger" data-stop-tourney>${ tr( 'End tournament' ) }</button>` : '' }`;
						const stopBtn = cardTourney.querySelector( '[data-stop-tourney]' );
						if ( stopBtn ) stopBtn.addEventListener( 'click', () => mp.stopTournament() );

					} else if ( sum.role === 'host' ) {

						cardTourney.innerHTML = `
							<div class="tw-mp-lbl">${ tr( 'Fishing tournament' ) }</div>
							<div class="tw-mp-row">
								<select class="tw-mp-input" data-t-mode>
									<option value="totalKg">${ tr( 'tourney_totalKg' ) }</option>
									<option value="biggestKg">${ tr( 'tourney_biggestKg' ) }</option>
									<option value="speciesCount">${ tr( 'tourney_speciesCount' ) }</option>
								</select>
								<select class="tw-mp-input" data-t-dur style="max-width:96px">
									<option value="180">3 ${ zh ? '分钟' : 'min' }</option>
									<option value="300" selected>5 ${ zh ? '分钟' : 'min' }</option>
									<option value="600">10 ${ zh ? '分钟' : 'min' }</option>
								</select>
							</div>
							<button type="button" class="tw-mp-btn" data-start-tourney>${ tr( 'Start tournament' ) }</button>`;
						cardTourney.querySelector( '[data-start-tourney]' ).addEventListener( 'click', () => {

							const mode = cardTourney.querySelector( '[data-t-mode]' ).value;
							const dur = Number( cardTourney.querySelector( '[data-t-dur]' ).value ) || 300;
							mp.startTournament( mode, dur );

						} );

					} else {

						cardTourney.innerHTML = `<div class="tw-mp-status">${ tr( 'Waiting for host to start a fishing tournament.' ) }</div>`;

					}

					box.append( cardTourney );

				}

				// 3. Concise tip card
				const cardTip = document.createElement( 'div' );
				cardTip.className = 'tw-mp-card';
				cardTip.innerHTML = `<div class="tw-mp-status">${ tr( 'P2P uses a 4-char room code without buying servers (works on Web & Desktop). If strict NAT blocks connection, switch to LAN mode with same Wi-Fi or Tailscale/ZeroTier.' ) }</div>`;
				box.append( cardTip );

			};

			mp.onStateChange = ( summary ) => renderMp( summary );
			mp.onTournamentChange = ( sum ) => {

				ui.setTournamentState( sum );
				if ( ui._panelOpen && ui.activeTab?.id === 'multiplayer' ) renderMp();

			};
			mp.onChat = ( entry ) => ui.pushChatMessage( entry );
			ui.onChatSend = ( text ) => mp.sendChat( text );
			ui.onEmoteSend = ( kind ) => mp.sendEmote( kind );
			onLangChange( () => {

				ui.setTournamentState( mp.getTournamentSummary?.() );
				renderMp();

			} );
			renderMp();

		}

		this._t = 0;

	}

	syncFromApp() {

		if ( this._syncFromApp ) this._syncFromApp();

	}

	// per-frame HUD
	update( dt ) {

		const app = this.app;
		const ui = this.ui;
		ui.setStats( { fps: app.fps, frameMs: dt * 1000 } );
		this.s.renderScale = app.post.scale;

		if ( app.weather ) {

			const w = app.weather.getGameplayState();
			ui.setWeather( { ...w, label: trWeather( w.kind, w.label ) } );
			this._t += dt;
			if ( this._t >= 0.25 ) {

				this._t = 0;
				const s = this.s;
				s.lang = getLang();
				if ( app.audio ) s.audioMuted = app.audio.muted;
				const locks = app.weather.manualLocks;
				if ( this._weatherPresets ) this._weatherPresets.setActive( app.weather.auto ? app.weather.currentId : app.weather.targetId );
				s.weatherAuto = app.weather.auto;
				const activeVh = app.player?.activeVehicle || app.motorcycle || app.buggy;
				if ( activeVh ) s.vehHeadlight = activeVh.headlightActive;
				if ( app.clouds && ! locks.has( 'clouds' ) ) s.clouds = app.clouds.coverage.value;
				if ( app.clouds && app.clouds.cirrus && ! locks.has( 'cirrus' ) ) s.cirrus = app.clouds.cirrus.value;
				if ( app.haze && ! locks.has( 'haze' ) ) s.haze = app.haze.density.value;
				if ( app.haze && ! locks.has( 'shafts' ) ) s.shafts = app.haze.shafts.value;
				if ( app.post.flare && ! locks.has( 'flare' ) ) s.flare = app.post.flare.strength.value;
				if ( ! locks.has( 'sea' ) ) {

					s.wind = app.fft.local.windSpeed;
					s.windDir = app.fft.local.windDirection;
					s.fetch = app.fft.local.fetch;
					s.chop = app.fft.choppiness.value;
					s.swell = app.fft.swell.scale;
					s.surf = app.shore.amplitude.value;
					s.period = app.shore.period.value;
					s.whitecaps = app.weather.state.whitecaps;
					s.clarity = app.weather.state.clarity;

				}

			}

		}

		const p = app.player;
		if ( app.freeCam ) {

			ui.setMode( tr( 'Free camera' ) );
			ui.setPrompt( 'F', tr( 'Walk' ) );
			ui.setBoatGauges( { visible: false } );
			ui.setVehicleGauges( { visible: false } );
			ui.setDepth( { visible: false } );
			return;

		}

		const camTag = getLang() === 'zh'
			? `${ tr( p.camMode === 'first' ? '1st person' : '3rd person' ) }`
			: `${ p.camMode === 'first' ? '1st' : '3rd' } person`;
		const mode = p.mode === 'boat' ? `${ tr( 'Boat' ) } · ${ camTag }`
			: p.mode === 'vehicle' ? `${ tr( p.activeVehicle ? p.activeVehicle.name : 'Motorcycle' ) } · ${ camTag }`
			: p.mode === 'coop' ? tr( p.coop?.kind === 'buggy' ? 'Passenger seat' : 'Friend\'s boat' )
			: p.mode === 'deck' ? tr( 'On deck' )
			: p.mode === 'swim' ? tr( app.camera.position.y < ( app.cameraWaterHeight ?? 0 ) - 0.3 ? 'Diving' : 'Swimming' ) : tr( 'Walking' );
		ui.setMode( mode );
		if ( p.prompt ) ui.setPrompt( p.prompt.key, tr( p.prompt.text ) );
		else ui.setPrompt( null );

		const b = app.boatCtl;
		if ( p.mode === 'boat' ) {

			const f = b.forward( new THREE.Vector3() );
			ui.setBoatGauges( {
				visible: true,
				throttle: b.throttle,
				rpm: b.rpm,
				speedKnots: b.speed * 1.94384,
				heading: ( THREE.MathUtils.radToDeg( Math.atan2( f.x, - f.z ) ) + 360 ) % 360,
			} );

		} else ui.setBoatGauges( { visible: false } );

		if ( p.mode === 'vehicle' && p.activeVehicle ) {

			ui.setVehicleGauges( { visible: true, ...p.activeVehicle.getHudState() } );

		} else ui.setVehicleGauges( { visible: false } );

		const depth = ( app.cameraWaterHeight ?? 0 ) - app.camera.position.y;
		ui.setDepth( { visible: p.mode === 'swim' && depth > 0.3, meters: depth } );

	}

}
