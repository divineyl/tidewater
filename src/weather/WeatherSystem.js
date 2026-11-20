import { MathUtils } from '../engine/math/index.js';
import { G } from '../core/Globals.js';

export const WEATHER_ORDER = [ 'clear', 'fair', 'partlyCloudy', 'overcast', 'shower', 'storm' ];

export const WEATHER_PRESETS = {
	clear: {
		id: 'clear',
		label: 'Clear',
		icon: 'sun',
		coverage: 0.14,
		cirrus: 0.22,
		cloudAltitude: 3200,
		cloudThickness: 2400,
		cloudDensity: 0.013,
		cloudType: 0.25,
		cloudDarkness: 0.0,
		anvil: 0.0,
		cloudEdgeSoftness: 0.11,
		cloudEvolution: 0.55,
		mieScale: 0.65,
		mieG: 0.76,
		hazeDensity: 0.85,
		sunShafts: 0.75,
		flareScale: 1.1,
		starVisibility: 1.0,
		skyDesat: 0.0,
		windSpeed: 3.5,
		fetch: 45,
		choppiness: 0.72,
		swell: 0.28,
		surfAmplitude: 0.18,
		surfPeriod: 11.5,
		whitecaps: 0.18,
		clarity: 1.25,
		gustAmount: 0.12,
		rainIntensity: 0.0,
		stormIntensity: 0.0,
		lightningRate: 0.0,
		pressure: 1021,
	},
	fair: {
		id: 'fair',
		label: 'Fair',
		icon: 'partly-cloudy',
		coverage: 0.45,
		cirrus: 0.48,
		cloudAltitude: 2600,
		cloudThickness: 3800,
		cloudDensity: 0.018,
		cloudType: 0.50,
		cloudDarkness: 0.04,
		anvil: 0.05,
		cloudEdgeSoftness: 0.095,
		cloudEvolution: 0.70,
		mieScale: 1.0,
		mieG: 0.80,
		hazeDensity: 1.45,
		sunShafts: 1.0,
		flareScale: 1.0,
		starVisibility: 0.95,
		skyDesat: 0.05,
		windSpeed: 7.0,
		fetch: 120,
		choppiness: 0.90,
		swell: 0.48,
		surfAmplitude: 0.34,
		surfPeriod: 9.2,
		whitecaps: 0.48,
		clarity: 1.0,
		gustAmount: 0.18,
		rainIntensity: 0.0,
		stormIntensity: 0.0,
		lightningRate: 0.0,
		pressure: 1015,
	},
	partlyCloudy: {
		id: 'partlyCloudy',
		label: 'Partly Cloudy',
		icon: 'cloud',
		coverage: 0.64,
		cirrus: 0.62,
		cloudAltitude: 2100,
		cloudThickness: 4600,
		cloudDensity: 0.023,
		cloudType: 0.62,
		cloudDarkness: 0.16,
		anvil: 0.16,
		cloudEdgeSoftness: 0.09,
		cloudEvolution: 0.85,
		mieScale: 1.45,
		mieG: 0.82,
		hazeDensity: 1.85,
		sunShafts: 1.35,
		flareScale: 0.75,
		starVisibility: 0.65,
		skyDesat: 0.14,
		windSpeed: 10.5,
		fetch: 260,
		choppiness: 1.02,
		swell: 0.62,
		surfAmplitude: 0.48,
		surfPeriod: 8.8,
		whitecaps: 0.68,
		clarity: 0.9,
		gustAmount: 0.25,
		rainIntensity: 0.0,
		stormIntensity: 0.0,
		lightningRate: 0.0,
		pressure: 1010,
	},
	overcast: {
		id: 'overcast',
		label: 'Overcast',
		icon: 'fog',
		coverage: 0.84,
		cirrus: 0.85,
		cloudAltitude: 1450,
		cloudThickness: 3600,
		cloudDensity: 0.028,
		cloudType: 0.20,
		cloudDarkness: 0.38,
		anvil: 0.20,
		cloudEdgeSoftness: 0.125,
		cloudEvolution: 0.75,
		mieScale: 2.1,
		mieG: 0.84,
		hazeDensity: 2.45,
		sunShafts: 0.55,
		flareScale: 0.25,
		starVisibility: 0.20,
		skyDesat: 0.45,
		windSpeed: 11.5,
		fetch: 360,
		choppiness: 1.05,
		swell: 0.70,
		surfAmplitude: 0.56,
		surfPeriod: 8.5,
		whitecaps: 0.72,
		clarity: 0.8,
		gustAmount: 0.28,
		rainIntensity: 0.05,
		stormIntensity: 0.15,
		lightningRate: 0.02,
		pressure: 1005,
	},
	shower: {
		id: 'shower',
		label: 'Shower',
		icon: 'rain',
		coverage: 0.78,
		cirrus: 0.70,
		cloudAltitude: 1200,
		cloudThickness: 5600,
		cloudDensity: 0.034,
		cloudType: 0.82,
		cloudDarkness: 0.52,
		anvil: 0.45,
		cloudEdgeSoftness: 0.085,
		cloudEvolution: 1.15,
		mieScale: 2.7,
		mieG: 0.85,
		hazeDensity: 3.0,
		sunShafts: 0.70,
		flareScale: 0.15,
		starVisibility: 0.12,
		skyDesat: 0.55,
		windSpeed: 14.5,
		fetch: 520,
		choppiness: 1.14,
		swell: 0.82,
		surfAmplitude: 0.72,
		surfPeriod: 9.8,
		whitecaps: 0.85,
		clarity: 0.72,
		gustAmount: 0.36,
		rainIntensity: 0.55,
		stormIntensity: 0.50,
		lightningRate: 0.20,
		pressure: 1001,
	},
	storm: {
		id: 'storm',
		label: 'Storm',
		icon: 'storm',
		coverage: 0.94,
		cirrus: 0.92,
		cloudAltitude: 950,
		cloudThickness: 7200,
		cloudDensity: 0.044,
		cloudType: 0.96,
		cloudDarkness: 0.74,
		anvil: 0.85,
		cloudEdgeSoftness: 0.08,
		cloudEvolution: 1.50,
		mieScale: 3.6,
		mieG: 0.86,
		hazeDensity: 3.8,
		sunShafts: 0.25,
		flareScale: 0.05,
		starVisibility: 0.03,
		skyDesat: 0.78,
		windSpeed: 21.0,
		fetch: 950,
		choppiness: 1.28,
		swell: 1.08,
		surfAmplitude: 0.94,
		surfPeriod: 12.0,
		whitecaps: 1.0,
		clarity: 0.58,
		gustAmount: 0.50,
		rainIntensity: 1.0,
		stormIntensity: 1.0,
		lightningRate: 1.0,
		pressure: 992,
	},
};

const NUMERIC_KEYS = [
	'coverage', 'cirrus', 'cloudAltitude', 'cloudThickness', 'cloudDensity',
	'cloudType', 'cloudDarkness', 'anvil', 'cloudEdgeSoftness', 'cloudEvolution',
	'mieScale', 'mieG', 'hazeDensity', 'sunShafts', 'flareScale', 'starVisibility', 'skyDesat',
	'windSpeed', 'fetch', 'choppiness', 'swell', 'surfAmplitude', 'surfPeriod',
	'whitecaps', 'clarity', 'gustAmount', 'rainIntensity', 'stormIntensity', 'lightningRate', 'pressure',
];

function copyState( preset ) {

	const out = {};
	for ( const k of NUMERIC_KEYS ) out[ k ] = preset[ k ];
	return out;

}

export class WeatherSystem {

	constructor( app, initial = 'fair' ) {

		this.app = app;
		const p = WEATHER_PRESETS[ initial ] || WEATHER_PRESETS.fair;

		this.auto = true;
		this.speed = 1.0;
		this.currentId = p.id;
		this.targetId = p.id;
		this.state = copyState( p );
		this.wetness = p.rainIntensity > 0.2 ? 0.5 : 0.0;
		this.windDirBase = app && app.fft ? app.fft.local.windDirection : 25;
		this.windDirOffset = 0;
		this.pressureTrend = 0;
		this.manualLocks = new Set();

		this._elapsed = 0;
		this._holdTimer = 160;
		this._manualTransition = false;
		this._fftTimer = 0;
		this._atmoTimer = 0;
		this._lastFFT = { wind: - 1, dir: - 999, fetch: - 1, swell: - 1 };
		this._lastAtmo = { mieScale: p.mieScale, mieG: p.mieG };
		this._effectiveWind = p.windSpeed;
		this._effectiveDir = this.windDirBase;

		// Apply initial parameters without waiting for timers
		this.applyToSystems( 0, true );

	}

	setPreset( id, { instant = false } = {} ) {

		const p = WEATHER_PRESETS[ id ];
		if ( ! p ) return;
		this.auto = false;
		this.targetId = p.id;
		this.manualLocks.clear();
		this._manualTransition = ! instant;
		if ( instant ) {

			this.currentId = p.id;
			this.state = copyState( p );
			this.wetness = p.rainIntensity > 0.1 ? Math.max( this.wetness, p.rainIntensity * 0.85 ) : 0;
			this.pressureTrend = 0;
			this.applyToSystems( 0, true );

		}

	}

	setAuto( on ) {

		this.auto = !! on;
		if ( this.auto ) {

			this.manualLocks.clear();
			this._manualTransition = false;
			this._holdTimer = Math.min( this._holdTimer, 60 );

		}

	}

	markManual( key ) {

		if ( key ) this.manualLocks.add( key );

	}

	clearManual( key ) {

		if ( key ) this.manualLocks.delete( key );
		else this.manualLocks.clear();

	}

	getPreset( id = this.currentId ) {

		return WEATHER_PRESETS[ id ] || WEATHER_PRESETS.fair;

	}

	isTransitioning() {

		const t = WEATHER_PRESETS[ this.targetId ] || WEATHER_PRESETS.fair;
		return Math.abs( this.state.coverage - t.coverage ) > 0.03
			|| Math.abs( this.state.pressure - t.pressure ) > 0.6
			|| Math.abs( this.state.rainIntensity - t.rainIntensity ) > 0.03;

	}

	getGameplayState() {

		const cur = this.getPreset( this.currentId );
		return {
			kind: this.currentId,
			targetKind: this.targetId,
			label: cur.label,
			icon: cur.icon,
			rainIntensity: this.state.rainIntensity,
			stormIntensity: this.state.stormIntensity,
			wetness: this.wetness,
			pressure: this.state.pressure,
			pressureTrend: this.pressureTrend,
			windSpeed: this._effectiveWind,
			cloudCover: this.state.coverage,
			auto: this.auto,
			transitioning: this.isTransitioning(),
		};

	}

	_pickNextTarget() {

		const curIdx = WEATHER_ORDER.indexOf( this.targetId );
		const h = ( ( ( this.app?.settings?.timeOfDay ?? 12 ) % 24 ) + 24 ) % 24;

		// Tropical island diurnal tendencies
		const morning = Math.exp( - ( ( h - 7.0 ) ** 2 ) / 7.5 );
		const afternoon = Math.exp( - ( ( h - 14.5 ) ** 2 ) / 6.5 );
		const evening = Math.exp( - ( ( h - 18.0 ) ** 2 ) / 4.0 );
		const night = ( h < 5.2 || h > 20.0 ) ? 1 : 0;

		const weights = WEATHER_ORDER.map( ( id, idx ) => {

			const dist = Math.abs( idx - curIdx );
			// Strongly prefer same or adjacent states along the meteorological progression
			let w = dist === 0 ? 1.4 : dist === 1 ? 1.85 : dist === 2 ? 0.45 : 0.08;

			if ( id === 'clear' ) w *= 0.9 + morning * 1.6 + night * 1.1;
			else if ( id === 'fair' ) w *= 1.5 + morning * 0.9 + evening * 0.8 + night * 0.6;
			else if ( id === 'partlyCloudy' ) w *= 1.1 + afternoon * 1.2 + evening * 0.7;
			else if ( id === 'overcast' ) w *= 0.8 + evening * 0.4 + night * 0.5;
			else if ( id === 'shower' ) w *= 0.45 + afternoon * 1.35 + evening * 0.9 - night * 0.25;
			else if ( id === 'storm' ) w *= 0.22 + afternoon * 0.85 + evening * 0.55 - night * 0.15;

			// Encourage storms to eventually relax back toward overcast/shower/fair
			if ( this.targetId === 'storm' && id === 'storm' ) w *= 0.35;
			if ( this.targetId === 'clear' && id === 'clear' ) w *= 0.6;
			return Math.max( 0.01, w );

		} );

		const sum = weights.reduce( ( a, b ) => a + b, 0 );
		let r = Math.random() * sum;
		for ( let i = 0; i < WEATHER_ORDER.length; i ++ ) {

			r -= weights[ i ];
			if ( r <= 0 ) return WEATHER_ORDER[ i ];

		}

		return 'fair';

	}

	update( dt ) {

		dt = Math.min( 0.25, Math.max( 0, dt ) );
		this._elapsed += dt;

		if ( this.auto ) {

			this._holdTimer -= dt * Math.max( 0.1, this.speed );
			if ( this._holdTimer <= 0 ) {

				const next = this._pickNextTarget();
				this.targetId = next;
				this._manualTransition = false;
				// Hold each regime for ~2.5–5.5 minutes at 1x speed
				this._holdTimer = 150 + Math.random() * 180;

			}

		}

		const target = WEATHER_PRESETS[ this.targetId ] || WEATHER_PRESETS.fair;
		const prevPressure = this.state.pressure;

		// Subtle diurnal convection boost around warm afternoon hours
		const hour = ( ( ( this.app?.settings?.timeOfDay ?? 12 ) % 24 ) + 24 ) % 24;
		const thermal = this.auto ? Math.exp( - ( ( hour - 14.5 ) ** 2 ) / 6.0 ) : 0;

		const rate = this._manualTransition ? 0.45 : 0.016 * Math.max( 0.2, this.speed );
		const k = 1 - Math.exp( - dt * rate );

		for ( const key of NUMERIC_KEYS ) {

			let goal = target[ key ];
			if ( key === 'coverage' ) goal = MathUtils.clamp( goal + thermal * 0.05, 0, 1 );
			else if ( key === 'cloudThickness' ) goal = goal * ( 1 + thermal * 0.12 );
			this.state[ key ] += ( goal - this.state[ key ] ) * k;

		}

		if ( Math.abs( this.state.coverage - target.coverage ) < 0.025 && Math.abs( this.state.pressure - target.pressure ) < 0.5 ) {

			this.currentId = this.targetId;
			this._manualTransition = false;

		} else {

			// Update currentId to whichever preset matches current pressure & coverage most closely
			let bestId = this.currentId;
			let bestScore = Infinity;
			for ( const id of WEATHER_ORDER ) {

				const p = WEATHER_PRESETS[ id ];
				const d = Math.abs( p.coverage - this.state.coverage ) * 1.4
					+ Math.abs( p.rainIntensity - this.state.rainIntensity ) * 1.6
					+ Math.abs( p.pressure - this.state.pressure ) / 25;
				if ( d < bestScore ) {

					bestScore = d;
					bestId = id;

				}

			}

			this.currentId = bestId;

		}

		if ( dt > 1e-4 ) {

			const dp = ( this.state.pressure - prevPressure ) / dt;
			const targetTrend = MathUtils.clamp( ( target.pressure - this.state.pressure ) * 0.25 + dp * 0.6, - 1, 1 );
			this.pressureTrend += ( targetTrend - this.pressureTrend ) * ( 1 - Math.exp( - dt * 2.0 ) );

		}

		// Natural gust modulation & slow synoptic wind-direction swing
		const t = this._elapsed;
		const gustWave = Math.sin( t * 0.23 ) * 0.45 + Math.sin( t * 0.61 + 1.3 ) * 0.35 + Math.sin( t * 1.37 + 2.7 ) * 0.20;
		const gustScale = 1 + gustWave * this.state.gustAmount;
		this._effectiveWind = Math.max( 0.5, this.state.windSpeed * gustScale );

		const dirSwing = ( Math.sin( t * 0.031 ) * 0.65 + Math.sin( t * 0.073 + 0.9 ) * 0.35 ) * ( 8 + this.state.stormIntensity * 14 );
		this.windDirOffset = dirSwing;
		this._effectiveDir = ( ( this.windDirBase + dirSwing ) % 360 + 360 ) % 360;

		// Surface wetness accumulation & drying (evaporates faster with daylight and wind)
		const rain = this.state.rainIntensity;
		if ( rain > 0.04 ) {

			this.wetness = Math.min( 1, this.wetness + ( 0.06 + rain * 0.14 ) * dt );

		} else {

			const daylight = 1 - ( G.night ? G.night.value : 0 );
			const dryRate = 0.014 + 0.022 * daylight + 0.0018 * this._effectiveWind;
			this.wetness = Math.max( 0, this.wetness - dryRate * dt );

		}

		this.applyToSystems( dt, false );

	}

	applyToSystems( dt, force = false ) {

		const app = this.app;
		if ( ! app ) return;
		const s = this.state;

		// 1. Global weather uniform (flash w updated by Lightning in App._frame, keep current flash)
		const curFlash = G.weather ? G.weather.value.w : 0;
		if ( G.weather ) G.weather.value.set( s.rainIntensity, this.wetness, s.stormIntensity, curFlash );

		// 2. Wind & Ocean (respect manual sea lock)
		if ( ! this.manualLocks.has( 'sea' ) ) {

			const rad = MathUtils.degToRad( this._effectiveDir );
			G.windDir.value.set( Math.cos( rad ), Math.sin( rad ) );
			G.windSpeed.value = this._effectiveWind;

			if ( app.fft ) {

				const fft = app.fft;
				fft.local.windSpeed = this._effectiveWind;
				fft.local.windDirection = this._effectiveDir;
				fft.local.fetch = s.fetch;
				fft.swell.scale = s.swell;
				fft.choppiness.value = s.choppiness;
				fft.foamBias.value = 0.5 + 0.16 * s.whitecaps + 0.01 * MathUtils.clamp( this._effectiveWind - 7, - 5, 12 );
				fft.foamDecay.value = 0.6 - 0.35 * s.whitecaps;

				this._fftTimer -= dt;
				const lf = this._lastFFT;
				const needSpec = force || ( this._fftTimer <= 0 && (
					Math.abs( this._effectiveWind - lf.wind ) > 0.25
					|| Math.abs( this._effectiveDir - lf.dir ) > 1.2
					|| Math.abs( s.fetch - lf.fetch ) > Math.max( 4, lf.fetch * 0.03 )
					|| Math.abs( s.swell - lf.swell ) > 0.015
				) );
				if ( needSpec ) {

					this._fftTimer = 0.25;
					lf.wind = this._effectiveWind;
					lf.dir = this._effectiveDir;
					lf.fetch = s.fetch;
					lf.swell = s.swell;
					fft.updateSpectrumUniforms();

				}

			}

			if ( app.shore ) {

				app.shore.amplitude.value = s.surfAmplitude;
				app.shore.period.value = s.surfPeriod;

			}

			// Water clarity modulation
			const k = 1 / Math.max( 0.2, s.clarity );
			G.waterAbsorption.value.set( 0.42, 0.075, 0.035 ).multiplyScalar( 0.6 + 0.4 * k );
			G.waterScattering.value.set( 0.012, 0.018, 0.024 ).multiplyScalar( k * k );

		}

		// 3. Atmosphere (throttled LUT rebuild)
		if ( app.atmosphere ) {

			app.atmosphere.mieScale.value = s.mieScale;
			app.atmosphere.mieG.value = s.mieG;
			this._atmoTimer -= dt;
			const la = this._lastAtmo;
			if ( ! force && this._atmoTimer <= 0 && (
				Math.abs( s.mieScale - la.mieScale ) > 0.06
				|| Math.abs( s.mieG - la.mieG ) > 0.012
			) ) {

				this._atmoTimer = 0.6;
				la.mieScale = s.mieScale;
				la.mieG = s.mieG;
				app.atmosphere.needsStatic = true;

			} else if ( force ) {

				la.mieScale = s.mieScale;
				la.mieG = s.mieG;
				app.atmosphere.needsStatic = true;

			}

		}

		// 4. Air haze, shafts, flare, air motes, environment refresh rate
		if ( app.haze ) {

			if ( ! this.manualLocks.has( 'haze' ) ) app.haze.density.value = s.hazeDensity;
			if ( ! this.manualLocks.has( 'shafts' ) ) app.haze.shafts.value = s.sunShafts * ( app.qualityShaftScale ?? 1 );

		}

		if ( app.post && app.post.flare && ! this.manualLocks.has( 'flare' ) ) {

			app.post.flare.strength.value = s.flareScale;

		}

		if ( app.airMotes ) {

			app.airMotes.intensity.value = Math.max( 0.05, 1 - s.rainIntensity * 0.85 );

		}

		if ( app.environment ) {

			app.environment.interval = this.isTransitioning() ? 1.2 : 3.0;

		}

		// 5. Volumetric clouds
		if ( app.clouds ) {

			if ( app.clouds.applyWeather ) {

				const cov = this.manualLocks.has( 'clouds' ) ? app.clouds.coverage.value : s.coverage;
				const cir = this.manualLocks.has( 'cirrus' ) && app.clouds.cirrus ? app.clouds.cirrus.value : s.cirrus;
				app.clouds.applyWeather( {
					coverage: cov,
					cirrus: cir,
					altitude: s.cloudAltitude,
					thickness: s.cloudThickness,
					density: s.cloudDensity,
					cloudType: s.cloudType,
					darkness: s.cloudDarkness,
					anvil: s.anvil,
					edgeSoftness: s.cloudEdgeSoftness,
					evolution: s.cloudEvolution,
					stormIntensity: s.stormIntensity,
					hazeDensity: s.hazeDensity,
					rainIntensity: s.rainIntensity,
				}, dt, app.lightning ? app.lightning.cloudLight : null );

			} else {

				if ( ! this.manualLocks.has( 'clouds' ) ) app.clouds.coverage.value = s.coverage;
				if ( ! this.manualLocks.has( 'cirrus' ) && app.clouds.cirrus ) app.clouds.cirrus.value = s.cirrus;

			}

		}

	}

}
