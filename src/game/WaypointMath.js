// Pure coordinate, bearing, and arrival helpers for full-island map & waypoint navigation.
// Safe in headless Node tests (zero DOM / GPU dependencies).

const EN_CARDINALS = [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ];
const ZH_CARDINALS = [ '北', '东北', '东', '东南', '南', '西南', '西', '西北' ];

export function waypointDistance( ax, az, bx, bz ) {

	return Math.hypot( bx - ax, bz - az );

}

// Compass bearing in degrees [0, 360): 0 = N (-Z), 90 = E (+X), 180 = S (+Z), 270 = W (-X).
export function waypointBearingDeg( ax, az, bx, bz ) {

	const deg = Math.atan2( bx - ax, - ( bz - az ) ) * 180 / Math.PI;
	return ( ( deg % 360 ) + 360 ) % 360;

}

export function compassCardinal( deg, lang = 'en' ) {

	const norm = ( ( ( Number( deg ) || 0 ) % 360 ) + 360 ) % 360;
	const idx = Math.round( norm / 45 ) % 8;
	return lang === 'zh' ? ZH_CARDINALS[ idx ] : EN_CARDINALS[ idx ];

}

export function hasArrivedAtWaypoint( px, pz, wx, wz, radius = 12 ) {

	return waypointDistance( px, pz, wx, wz ) <= radius;

}

export function mapPixelToWorld( px, py, size, x0, z0, ext ) {

	const s = size > 0 ? size : 1;
	return {
		x: x0 + ( px / s ) * ext,
		z: z0 + ( py / s ) * ext,
	};

}

export function worldToMapFraction( x, z, x0, z0, ext ) {

	const e = ext > 0 ? ext : 1;
	return {
		u: ( x - x0 ) / e,
		v: ( z - z0 ) / e,
	};

}
