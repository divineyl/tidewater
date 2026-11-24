// Lightweight Semver comparator (supports optional leading 'v', major.minor.patch).

export function parseSemver( raw ) {

	if ( typeof raw !== 'string' ) return null;
	const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec( raw.trim() );
	if ( ! m ) return null;
	return [ Number( m[ 1 ] ), Number( m[ 2 ] ), Number( m[ 3 ] ) ];

}

export function compareSemver( a, b ) {

	const pa = parseSemver( a );
	const pb = parseSemver( b );
	if ( ! pa || ! pb ) return 0;
	for ( let i = 0; i < 3; i ++ ) {

		if ( pa[ i ] > pb[ i ] ) return 1;
		if ( pa[ i ] < pb[ i ] ) return - 1;

	}

	return 0;

}
