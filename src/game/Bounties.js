// Daily island fishing bounties & delivery contracts (pure JS, Node-testable).

const DEEP_SPECIES = new Set( [ 'redSnapper', 'tuna', 'mahi', 'barracuda', 'sailfish', 'blueMarlin', 'grouper' ] );
const REEF_SPECIES = new Set( [ 'yellowtail', 'redSnapper', 'grouper', 'wrasse', 'parrot', 'angel', 'goldenTrevally' ] );
const LEGEND_SPECIES = new Set( [ 'goldenTrevally', 'sailfish', 'blueMarlin' ] );

const TEMPLATES = [
	{
		kind: 'reef_snapper',
		titleEn: 'Reef Catch Order (2)',
		titleZh: '珊瑚礁渔获订单（2 条）',
		target: 2,
		reward: 110,
	},
	{
		kind: 'heavy_5kg',
		titleEn: 'Heavyweight Catch (≥ 5 kg)',
		titleZh: '大鱼悬赏（单条 ≥ 5 kg）',
		target: 1,
		reward: 130,
	},
	{
		kind: 'deep_haul',
		titleEn: 'Deep-Sea Haul (2)',
		titleZh: '深海远洋急单（2 条）',
		target: 2,
		reward: 180,
	},
	{
		kind: 'any_three',
		titleEn: 'Fresh Daily Catch (3)',
		titleZh: '海湾新鲜供应（任意 3 条）',
		target: 3,
		reward: 85,
	},
	{
		kind: 'trophy_10kg',
		titleEn: 'Trophy Monster (≥ 10 kg)',
		titleZh: '巨物猎人（单条 ≥ 10 kg）',
		target: 1,
		reward: 220,
	},
	{
		kind: 'storm_night',
		titleEn: 'Storm / Night / Legend Catch',
		titleZh: '夜钓 / 风雨 / 鱼王挑战（1 条）',
		target: 1,
		reward: 240,
	},
];

function seededRng( seed ) {

	let s = ( Number( seed ) || 101 ) >>> 0;
	if ( s === 0 ) s = 101;
	return () => {

		s = ( s * 1664525 + 1013904223 ) >>> 0;
		return s / 4294967296;

	};

}

export function generateBounties( seed = Date.now(), count = 3 ) {

	const rng = seededRng( seed );
	const pool = TEMPLATES.map( ( t ) => ( { ...t } ) );
	for ( let i = pool.length - 1; i > 0; i -- ) {

		const j = Math.floor( rng() * ( i + 1 ) );
		const tmp = pool[ i ];
		pool[ i ] = pool[ j ];
		pool[ j ] = tmp;

	}

	const n = Math.max( 1, Math.min( pool.length, count | 0 ) );
	return pool.slice( 0, n ).map( ( tpl, idx ) => ( {
		id: `b_${ tpl.kind }_${ Math.abs( Number( seed ) | 0 ) }_${ idx }`,
		kind: tpl.kind,
		titleEn: tpl.titleEn,
		titleZh: tpl.titleZh,
		target: tpl.target,
		progress: 0,
		reward: tpl.reward,
		completed: false,
	} ) );

}

export function sanitizeBounties( list ) {

	if ( ! Array.isArray( list ) || ! list.length ) return generateBounties( 101 );
	const out = [];
	const byKind = new Map( TEMPLATES.map( ( t ) => [ t.kind, t ] ) );
	for ( const item of list.slice( 0, 6 ) ) {

		if ( ! item || ! byKind.has( item.kind ) ) continue;
		const tpl = byKind.get( item.kind );
		const target = Math.max( 1, Math.min( 20, Number( item.target ) || tpl.target ) );
		const progress = Math.max( 0, Math.min( target, Number( item.progress ) || 0 ) );
		out.push( {
			id: String( item.id || `b_${ tpl.kind }` ),
			kind: tpl.kind,
			titleEn: tpl.titleEn,
			titleZh: tpl.titleZh,
			target,
			progress,
			reward: Math.max( 10, Number( item.reward ) || tpl.reward ),
			completed: !! item.completed || progress >= target,
		} );

	}

	return out.length ? out : generateBounties( 101 );

}

function bountyMatches( b, catchInfo, ctx ) {

	const species = catchInfo?.species || '';
	const kg = Number( catchInfo?.kg ) || 0;
	const hour = Number.isFinite( ctx?.hour ) ? ctx.hour : 12;
	const rain = Number( ctx?.rainIntensity ) || 0;
	const storm = Number( ctx?.stormIntensity ) || 0;
	const hab = ctx?.habitat || {};

	switch ( b.kind ) {

		case 'reef_snapper':
			return REEF_SPECIES.has( species ) || ( hab.reef || 0 ) >= 0.45;
		case 'heavy_5kg':
			return kg >= 5;
		case 'deep_haul':
			return DEEP_SPECIES.has( species ) || ( hab.deep || 0 ) >= 0.5;
		case 'any_three':
			return true;
		case 'trophy_10kg':
			return kg >= 10;
		case 'storm_night':
			return LEGEND_SPECIES.has( species ) || rain >= 0.2 || storm >= 0.2 || hour < 6 || hour >= 19.5;
		default:
			return false;

	}

}

export function applyCatchToBounties( bounties, catchInfo, context = {} ) {

	if ( ! Array.isArray( bounties ) || ! catchInfo ) return { completed: [], totalReward: 0 };
	const completed = [];
	let totalReward = 0;

	for ( const b of bounties ) {

		if ( ! b || b.completed ) continue;
		if ( ! bountyMatches( b, catchInfo, context ) ) continue;
		b.progress = Math.min( b.target, ( b.progress || 0 ) + 1 );
		if ( b.progress >= b.target ) {

			b.completed = true;
			completed.push( b );
			totalReward += b.reward || 0;

		}

	}

	return { completed, totalReward };

}
