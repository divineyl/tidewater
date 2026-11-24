// Scenic island postcard viewpoints (grounded in WorldLayout.js & IslandShape.js).

export const LANDMARKS = Object.freeze( [
	{
		id: 'pier_sunset', x: 55, z: 38, radius: 18, reward: 60,
		nameEn: 'Pier Sunset', nameZh: '码头日落',
		hintEn: 'End of the wooden fishing pier.', hintZh: '木栈桥尽头面向海湾的观景点。',
	},
	{
		id: 'boathouse_harbor', x: 88, z: - 62, radius: 18, reward: 60,
		nameEn: 'Boathouse Harbor', nameZh: '船屋渔港',
		hintEn: 'Eastern shore by Marta\'s chandlery.', hintZh: '玛塔船具店旁的东侧港湾。',
	},
	{
		id: 'coral_reef', x: - 78, z: 58, radius: 34, reward: 80,
		nameEn: 'Coral Reef Lagoon', nameZh: '珊瑚礁泻湖',
		hintEn: 'Turquoise shallow reef west of the bay.', hintZh: '海湾西侧碧绿清澈的珊瑚礁海域。',
	},
	{
		id: 'east_overlook', x: 216, z: - 12, radius: 22, reward: 75,
		nameEn: 'East Cliff Road', nameZh: '东岬盘山弯道',
		hintEn: 'High coastal dirt road overlooking the bay.', hintZh: '俯瞰整片海湾的东岬海景砂土盘山路。',
	},
	{
		id: 'lighthouse_point', x: 296, z: 122, radius: 24, reward: 95,
		nameEn: 'East Headland Lighthouse', nameZh: '东岬海边灯塔',
		hintEn: 'Climb or drive to the lighthouse headland.', hintZh: '驱车或步行抵达东岬尽头的宏伟灯塔。',
	},
	{
		id: 'summit_trail', x: 16, z: - 270, radius: 28, reward: 90,
		nameEn: 'Valley Ridge Trail', nameZh: '山谷脊线观景台',
		hintEn: 'Hike north up the central village trail.', hintZh: '沿渔村后山步道向北攀登至山脊。',
	},
	{
		id: 'west_grove', x: - 72, z: - 84, radius: 22, reward: 65,
		nameEn: 'Western Palm Cove', nameZh: '西岸椰林秘湾',
		hintEn: 'Quiet palm beach at the west end of the bay.', hintZh: '海湾西侧宁静的椰林沙滩。',
	},
	{
		id: 'deep_horizon', x: 0, z: 260, radius: 55, reward: 100,
		nameEn: 'Deep Blue Horizon', nameZh: '深海远洋边界',
		hintEn: 'Sail south into the deep offshore tuna waters.', hintZh: '乘船向南驶入蓝鳍金枪鱼与旗鱼出没的深海。',
	},
] );

export function findNearestLandmark( pos ) {

	if ( ! pos ) return null;
	let best = null;
	let bestD = Infinity;
	for ( const lm of LANDMARKS ) {

		const d = Math.hypot( pos.x - lm.x, pos.z - lm.z );
		if ( d < bestD ) {

			bestD = d;
			best = lm;

		}

	}

	return best ? { landmark: best, dist: bestD } : null;

}

export function checkLandmarkDiscovery( pos, discoveredMap = {}, isPhoto = false ) {

	if ( ! pos ) return null;
	const scale = isPhoto ? 1.45 : 1.0;
	for ( const lm of LANDMARKS ) {

		const rec = discoveredMap?.[ lm.id ];
		const visited = !! ( rec && ( rec === true || rec.visited ) );
		const photo = !! ( rec && rec.photo );
		if ( isPhoto && photo ) continue;
		if ( ! isPhoto && visited ) continue;

		const dist = Math.hypot( pos.x - lm.x, pos.z - lm.z );
		if ( dist <= lm.radius * scale ) {

			return {
				landmark: lm,
				isNewVisit: ! visited,
				isNewPhoto: isPhoto && ! photo,
				dist,
			};

		}

	}

	return null;

}
