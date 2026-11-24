import { FISH, FISH_IDS } from './FishTable.js';

// Where the bobber is and what lives there.
//   depth     water depth under the bobber (m)
//   reefDist  horizontal distance to the reef edge (m, < 0 inside it)
//   pierDist  horizontal distance to the pier (piles / head) (m)
// Returns weights per water type (they overlap: a spot can be both pier and bay).
export function habitatAt( { depth, reefDist, pierDist } ) {

	const h = { shallows: 0, reef: 0, pier: 0, bay: 0, deep: 0 };
	if ( depth < 0.25 ) return h; // on the sand
	h.shallows = smooth( 3.5, 1.0, depth );
	h.reef = smooth( 12, - 6, reefDist ) * smooth( 0.8, 2.5, depth );
	h.pier = smooth( 9, 2, pierDist ) * smooth( 0.6, 2, depth );
	h.bay = smooth( 1.5, 4, depth ) * ( 1 - smooth( 18, 30, depth ) );
	h.deep = smooth( 16, 28, depth );
	return h;

}

// 1 at the species' favourite time, less at others; hour 0..24
export function activity( pref, hour ) {

	const dawn = Math.exp( - ( ( hour - 6.5 ) ** 2 ) / 2.5 ), dusk = Math.exp( - ( ( hour - 18.5 ) ** 2 ) / 2.5 );
	const night = hour < 5.5 || hour > 19.5 ? 1 : 0;
	const day = hour > 7 && hour < 18 ? 1 : 0.35;
	switch ( pref ) {

		case 'day': return 0.25 + 0.75 * day * ( 1 - night );
		case 'dawnDusk': return 0.3 + 0.7 * Math.max( dawn, dusk ) + 0.1 * day;
		case 'night': return 0.15 + 0.85 * Math.max( night, dusk * 0.8 );
		default: return 0.8 + 0.2 * Math.max( dawn, dusk );

	}

}

function weatherSpeciesMul( id, weather ) {

	if ( ! weather ) return 1;
	const rain = Math.min( 1, Math.max( 0, weather.rainIntensity || 0 ) );
	const storm = Math.min( 1, Math.max( 0, weather.stormIntensity || 0 ) );
	const lowPres = Math.min( 1, Math.max( 0, ( 1015 - ( weather.pressure ?? 1015 ) ) / 20 ) );
	if ( id === 'tuna' || id === 'mahi' || id === 'barracuda' || id === 'tarpon' ) {

		return 1 + 0.25 * rain + 0.45 * storm + 0.22 * lowPres;

	}

	if ( id === 'jack' || id === 'grouper' || id === 'redSnapper' ) {

		return 1 + 0.12 * rain + 0.12 * lowPres;

	}

	if ( id === 'silverside' || id === 'parrot' || id === 'tang' ) {

		return Math.max( 0.45, 1 - 0.28 * storm - 0.15 * rain );

	}

	return 1;

}

function weatherDelayMul( habitat, weather ) {

	if ( ! weather ) return 1;
	const rain = Math.min( 1, Math.max( 0, weather.rainIntensity || 0 ) );
	const storm = Math.min( 1, Math.max( 0, weather.stormIntensity || 0 ) );
	const pres = weather.pressure ?? 1015;
	const lowPres = Math.min( 1, Math.max( - 0.3, ( 1016 - pres ) / 18 ) );
	const feedBoost = 1 - 0.14 * Math.max( 0, lowPres ) - 0.18 * Math.sin( Math.min( 1, rain ) * Math.PI * 0.75 );
	const shallowPenalty = habitat && habitat.shallows > 0.5 ? 0.18 * storm : 0;
	return Math.max( 0.65, feedBoost + shallowPenalty );

}

function lureSpeciesMul( id, lure = 'standard' ) {

	if ( lure === 'reefJig' ) {

		if ( id === 'goldenTrevally' || id === 'yellowtail' || id === 'grouper' || id === 'wrasse' || id === 'parrot' || id === 'angel' ) return 1.45;
		return 1;

	}

	if ( lure === 'liveBait' ) {

		if ( id === 'sailfish' || id === 'blueMarlin' || id === 'tuna' || id === 'mahi' || id === 'barracuda' || id === 'tarpon' || id === 'redSnapper' ) return 1.45;
		return 1;

	}

	if ( lure === 'stormLure' ) {

		if ( id === 'blueMarlin' || id === 'sailfish' || id === 'tuna' || id === 'mahi' || id === 'barracuda' ) return 1.65;
		return 0.85;

	}

	return 1;

}

function legendaryGateMul( f, hour, weather, lure ) {

	if ( ! f || ! f.condition ) return 1;
	const rain = Math.min( 1, Math.max( 0, weather?.rainIntensity || 0 ) );
	const storm = Math.min( 1, Math.max( 0, weather?.stormIntensity || 0 ) );
	if ( f.condition === 'storm_boss' ) {

		if ( lure !== 'stormLure' ) return 0;
		return 1.35 + storm * 0.9 + rain * 0.35;

	}

	if ( f.condition === 'pelagic_sail' ) {

		if ( lure !== 'liveBait' && lure !== 'stormLure' ) return 0;
		const isGoldenTime = ( hour >= 5 && hour <= 8 ) || ( hour >= 17 && hour <= 20 );
		return 1.15 + ( isGoldenTime ? 0.35 : 0 ) + storm * 0.25;

	}

	if ( f.condition === 'reef_golden' ) {

		if ( lure !== 'reefJig' ) return 0;
		const isGoldenTime = ( hour >= 5.5 && hour <= 8 ) || ( hour >= 16.5 && hour <= 19.5 );
		return 1.2 + ( isGoldenTime ? 0.35 : 0 );

	}

	return 1;

}

// Weighted pick of the species that bites here; null when nothing lives here.
// rng: () => [0, 1)
export function pickSpecies( habitat, hour, rng = Math.random, weather = null, lure = 'standard' ) {

	let total = 0;
	const w = [];
	for ( const id of FISH_IDS ) {

		const f = FISH[ id ];
		let hw = 0;
		for ( const k in f.habitat ) hw += f.habitat[ k ] * habitat[ k ];
		const gate = legendaryGateMul( f, hour, weather, lure );
		const x = gate > 0 ? hw * f.rarity * activity( f.time, hour ) * weatherSpeciesMul( id, weather ) * lureSpeciesMul( id, lure ) * gate : 0;
		w.push( x );
		total += x;

	}

	if ( total < 1e-4 ) return null;
	let r = rng() * total;
	for ( let i = 0; i < w.length; i ++ ) {

		r -= w[ i ];
		if ( r <= 0 ) return FISH_IDS[ i ];

	}

	return FISH_IDS[ FISH_IDS.length - 1 ];

}

// Weight in kg: skewed toward the small end (most fish are small, trophies are rare)
export function rollWeight( id, rng = Math.random, lure = 'standard' ) {

	const [ a, b ] = FISH[ id ].kg;
	const exp = lure === 'liveBait' ? 1.75 : lure === 'stormLure' ? 1.9 : 2.2;
	const t = Math.pow( rng(), exp );
	return a + ( b - a ) * t;

}

// Seconds until the next bite at this spot: richer water bites sooner. Infinity when barren.
export function biteDelay( habitat, hour, rng = Math.random, weather = null, lure = 'standard' ) {

	let rich = 0;
	for ( const k in habitat ) rich += habitat[ k ];
	if ( rich < 0.05 ) return Infinity;
	// open water between the named habitats still has fish: never much slower than a poor spot
	rich = Math.max( rich, 0.35 );
	const light = hour > 6 && hour < 19 ? 1 : 0.8;
	let lureMul = 1;
	if ( lure === 'reefJig' && ( habitat.reef || 0 ) > 0.35 ) lureMul = 0.88;
	else if ( lure === 'stormLure' && weather && ( ( weather.rainIntensity || 0 ) > 0.2 || ( weather.stormIntensity || 0 ) > 0.2 ) ) lureMul = 0.85;
	const mean = ( 8 / ( Math.min( rich, 1.6 ) * light ) ) * weatherDelayMul( habitat, weather ) * lureMul;
	return 2 + - Math.log( 1 - rng() * 0.98 ) * mean * 0.6;

}

function smooth( e0, e1, x ) {

	const t = Math.min( 1, Math.max( 0, ( x - e0 ) / ( e1 - e0 ) ) );
	return t * t * ( 3 - 2 * t );

}
