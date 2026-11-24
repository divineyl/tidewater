import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname( fileURLToPath( import.meta.url ) );
const PROJECT_ROOT = path.resolve( __dirname, '..' );
const DIST_DIR = path.join( PROJECT_ROOT, 'dist' );
const DESKTOP_DIR = path.join( PROJECT_ROOT, 'desktop' );
const DESKTOP_DIST_DIR = path.join( DESKTOP_DIR, 'app-dist' );
const EXPORT_ROOT = process.env.EXPORT_DIR || path.join( PROJECT_ROOT, 'exports' );
const STAGING_DIR = path.join( EXPORT_ROOT, '_desktop-staging' );
const WIN64_DIR = path.join( EXPORT_ROOT, 'Tidewater-Win64' );
const ZIP_PATH = path.join( EXPORT_ROOT, 'Tidewater-Win64.zip' );

function fmtMB( bytes ) {

	return `${ ( bytes / ( 1024 * 1024 ) ).toFixed( 2 ) } MB`;

}

function folderStats( dir ) {

	let count = 0;
	let bytes = 0;
	const walk = ( cur ) => {

		for ( const ent of fs.readdirSync( cur, { withFileTypes: true } ) ) {

			const full = path.join( cur, ent.name );
			if ( ent.isDirectory() ) walk( full );
			else {

				count ++;
				bytes += fs.statSync( full ).size;

			}

		}

	};

	walk( dir );
	return { count, bytes };

}

function removeDirSafe( dir ) {

	if ( fs.existsSync( dir ) ) {

		fs.rmSync( dir, { recursive: true, force: true } );

	}

}

async function main() {

	console.log( '[pack:desktop] Building Tidewater production web bundle...' );
	const buildRes = spawnSync( 'npm', [ 'run', 'build' ], {
		cwd: PROJECT_ROOT,
		shell: process.platform === 'win32',
		stdio: 'inherit',
	} );
	if ( buildRes.status !== 0 ) {

		throw new Error( `vite build failed with code ${ buildRes.status }` );

	}

	console.log( '[pack:desktop] Copying dist/ -> desktop/app-dist/...' );
	removeDirSafe( DESKTOP_DIST_DIR );
	fs.cpSync( DIST_DIR, DESKTOP_DIST_DIR, { recursive: true } );

	removeDirSafe( STAGING_DIR );
	removeDirSafe( WIN64_DIR );
	if ( fs.existsSync( ZIP_PATH ) ) fs.rmSync( ZIP_PATH, { force: true } );

	const req = createRequire( path.join( DESKTOP_DIR, 'package.json' ) );
	const packagerEntry = req.resolve( '@electron/packager' );
	const packagerMod = await import( pathToFileURL( packagerEntry ).href );
	const packager = packagerMod.packager || packagerMod.default;
	if ( typeof packager !== 'function' ) {

		throw new Error( 'Failed to resolve @electron/packager function' );

	}

	console.log( `[pack:desktop] Packaging Win64 Electron app into ${ STAGING_DIR }...` );
	const appPaths = await packager( {
		dir: DESKTOP_DIR,
		name: 'Tidewater',
		platform: 'win32',
		arch: 'x64',
		asar: true,
		prune: false,
		icon: path.join( DESKTOP_DIR, 'assets', 'icon.ico' ),
		overwrite: true,
		out: STAGING_DIR,
		ignore: [ /^\/node_modules/, /^\/out/, /\.map$/ ],
		win32metadata: {
			ProductName: 'Tidewater',
			FileDescription: 'Tidewater Coastal Sandbox Game',
			OriginalFilename: 'Tidewater.exe',
		},
	} );

	const builtDir = appPaths[ 0 ] || path.join( STAGING_DIR, 'Tidewater-win32-x64' );
	if ( ! fs.existsSync( builtDir ) ) {

		throw new Error( `Packaged directory not found at ${ builtDir }` );

	}

	fs.mkdirSync( EXPORT_ROOT, { recursive: true } );
	fs.renameSync( builtDir, WIN64_DIR );
	removeDirSafe( STAGING_DIR );
	removeDirSafe( DESKTOP_DIST_DIR );

	const localesDir = path.join( WIN64_DIR, 'locales' );
	if ( fs.existsSync( localesDir ) ) {

		const keepLocales = new Set( [ 'zh-CN.pak', 'en-US.pak' ] );
		let removedCount = 0;
		let removedBytes = 0;
		for ( const ent of fs.readdirSync( localesDir, { withFileTypes: true } ) ) {

			if ( ! ent.isFile() || keepLocales.has( ent.name ) ) continue;
			const fp = path.join( localesDir, ent.name );
			removedBytes += fs.statSync( fp ).size;
			fs.rmSync( fp, { force: true } );
			removedCount ++;

		}

		console.log( `[pack:desktop] Pruned ${ removedCount } extra locale packs (saved ${ fmtMB( removedBytes ) })` );

	}

	const stats = folderStats( WIN64_DIR );
	console.log( `[pack:desktop] Packaged ${ stats.count } files (${ fmtMB( stats.bytes ) }) -> ${ WIN64_DIR }` );

	console.log( `[pack:desktop] Compressing archive -> ${ ZIP_PATH }` );
	const zipPy = `
import os, sys, zipfile
src_dir = sys.argv[1]
zip_path = sys.argv[2]
parent = os.path.dirname(src_dir)
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(src_dir):
        for fn in files:
            full = os.path.join(root, fn)
            arc = os.path.relpath(full, parent)
            zf.write(full, arc)
`;
	const zipRes = spawnSync( 'python', [ '-c', zipPy, WIN64_DIR, ZIP_PATH ], {
		encoding: 'utf8',
		stdio: 'inherit',
	} );
	if ( zipRes.status !== 0 ) {

		throw new Error( `ZIP compression failed with code ${ zipRes.status }` );

	}

	const zipBytes = fs.statSync( ZIP_PATH ).size;
	console.log( `[pack:desktop] Done! Archive size: ${ fmtMB( zipBytes ) } (${ ZIP_PATH })` );

}

main().catch( ( err ) => {

	console.error( '[pack:desktop] Error:', err );
	process.exit( 1 );

} );
