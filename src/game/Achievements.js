const LEGENDARY_IDS = [ 'goldenTrevally', 'sailfish', 'blueMarlin' ];

function countCatches( log ) {

	let total = 0;
	let species = 0;
	if ( ! log || typeof log !== 'object' ) return { total, species };
	for ( const k of Object.keys( log ) ) {

		const entry = log[ k ];
		if ( entry && ( entry.count | 0 ) > 0 ) {

			species ++;
			total += entry.count | 0;

		}

	}

	return { total, species };

}

function countTrueKeys( map ) {

	if ( ! map || typeof map !== 'object' ) return 0;
	let n = 0;
	for ( const k of Object.keys( map ) ) {

		const v = map[ k ];
		if ( v === true || ( v && typeof v === 'object' && v.visited ) ) n ++;

	}

	return n;

}

export const ACHIEVEMENTS = Object.freeze( [
	{
		id: 'first_catch',
		nameEn: 'First Cast Landed', nameZh: '初尝海获',
		descEn: 'Catch your very first fish in Tidewater.', descZh: '在潮汐湾成功钓起第一条鱼。',
		titleId: 'bay_angler', titleEn: 'Bay Angler', titleZh: '海湾渔夫',
		check: ( s ) => countCatches( s?.log ).total >= 1,
	},
	{
		id: 'species_10',
		nameEn: 'Reef Naturalist', nameZh: '海洋博物志',
		descEn: 'Log 10 different marine species.', descZh: '图鉴累计解锁 10 种不同鱼类。',
		titleId: 'reef_naturalist', titleEn: 'Naturalist', titleZh: '博物渔夫',
		check: ( s ) => countCatches( s?.log ).species >= 10,
	},
	{
		id: 'legend_hunter',
		nameEn: 'Tamer of Legends', nameZh: '传奇初遇',
		descEn: 'Land any legendary boss fish.', descZh: '成功钓获任意一条传奇鱼王。',
		titleId: 'legend_hunter', titleEn: 'Legend Hunter', titleZh: '传奇猎手',
		check: ( s ) => LEGENDARY_IDS.some( ( id ) => ( s?.log?.[ id ]?.count | 0 ) > 0 ),
	},
	{
		id: 'all_legends',
		nameEn: 'Crown of the Three Seas', nameZh: '三冠鱼王制霸',
		descEn: 'Catch all 3 legendary boss species.', descZh: '集齐黄金鲹、大西洋旗鱼与蓝枪鱼三大鱼王。',
		titleId: 'apex_captain', titleEn: 'Apex Captain', titleZh: '深海至尊',
		check: ( s ) => LEGENDARY_IDS.every( ( id ) => ( s?.log?.[ id ]?.count | 0 ) > 0 ),
	},
	{
		id: 'crab_baron',
		nameEn: 'Lobster Skipper', nameZh: '捕蟹行家',
		descEn: 'Haul 3 crab/lobster traps from the bay.', descZh: '累计从海里收回 3 只捕蟹笼。',
		titleId: 'lobster_skipper', titleEn: 'Trap Skipper', titleZh: '龙虾船长',
		check: ( s ) => ( s?.trapsHauled | 0 ) >= 3,
	},
	{
		id: 'deep_diver',
		nameEn: 'Reef Treasure Seeker', nameZh: '深蓝潜行者',
		descEn: 'Recover 3 underwater dive treasures.', descZh: '潜水寻获 3 处海底秘宝。',
		titleId: 'reef_diver', titleEn: 'Reef Diver', titleZh: '珊瑚潜客',
		check: ( s ) => countTrueKeys( s?.treasures ) >= 3,
	},
	{
		id: 'treasure_all',
		nameEn: 'Master of the Sunken Fleet', nameZh: '沉船寻宝王',
		descEn: 'Recover all 8 underwater dive treasures.', descZh: '集齐海域全部 8 处海底潜宝。',
		titleId: 'abyssal_seeker', titleEn: 'Abyss Seeker', titleZh: '沉船寻宝王',
		check: ( s ) => countTrueKeys( s?.treasures ) >= 8,
	},
	{
		id: 'postcard_all',
		nameEn: 'Tidewater Sightseer', nameZh: '海岛全景旅拍',
		descEn: 'Visit all 8 island postcard landmarks.', descZh: '探索全部 8 处海岛明信片打卡点。',
		titleId: 'island_explorer', titleEn: 'Sightseer', titleZh: '海岛旅拍家',
		check: ( s ) => countTrueKeys( s?.landmarks ) >= 8,
	},
	{
		id: 'rally_gold',
		nameEn: 'Headland Rally Ace', nameZh: '东岬金杯车神',
		descEn: 'Earn Gold (≤ 42s) in the East Headland Rally.', descZh: '在东岬盘山越野计时赛跑进 42 秒拿下金牌。',
		titleId: 'headland_ace', titleEn: 'Rally Ace', titleZh: '东岬车神',
		check: ( s ) => {

			const mb = s?.rallyBest?.motorcycle;
			const bb = s?.rallyBest?.buggy;
			return ( Number.isFinite( mb ) && mb > 0 && mb <= 42 ) || ( Number.isFinite( bb ) && bb > 0 && bb <= 42 );

		},
	},
	{
		id: 'bounty_pro',
		nameEn: 'Reliable Supplier', nameZh: '港口金牌供货商',
		descEn: 'Complete 5 island fishing bounties.', descZh: '累计完成 5 笔乔的悬赏订单。',
		titleId: 'harbor_pro', titleEn: 'Harbor Pro', titleZh: '金牌渔商',
		check: ( s ) => ( s?.bountiesDone | 0 ) >= 5,
	},
] );

const TITLE_MAP = new Map( ACHIEVEMENTS.map( ( a ) => [ a.titleId, a ] ) );

export function evaluateAchievements( state ) {

	const list = [];
	const unlockedIds = [];
	const unlockedTitles = [];

	for ( const ach of ACHIEVEMENTS ) {

		const done = !! ach.check( state );
		list.push( { ...ach, done } );
		if ( done ) {

			unlockedIds.push( ach.id );
			unlockedTitles.push( { id: ach.titleId, en: ach.titleEn, zh: ach.titleZh } );

		}

	}

	return {
		list,
		unlockedIds,
		unlockedTitles,
		doneCount: unlockedIds.length,
		totalCount: ACHIEVEMENTS.length,
	};

}

export function getTitleLabel( titleId, lang = 'zh' ) {

	if ( typeof titleId !== 'string' || ! TITLE_MAP.has( titleId ) ) return '';
	const ach = TITLE_MAP.get( titleId );
	return lang === 'zh' ? ach.titleZh : ach.titleEn;

}
