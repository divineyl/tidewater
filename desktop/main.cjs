'use strict';

const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFile } = require( 'node:child_process' );
const { app, BrowserWindow, ipcMain, Menu, protocol, screen, session, shell } = require( 'electron' );
const { createLanServer } = require( './lanServer.cjs' );

let lanServer = null;

const isSmokeTest = process.argv.includes( '--smoke-test' );
const smokeOutArg = process.argv.find( ( arg ) => arg.startsWith( '--smoke-out=' ) );
const smokeOutPath = smokeOutArg ? smokeOutArg.slice( '--smoke-out='.length ) : null;

// Store saves alongside the executable when packaged on a writable folder (portable game behavior).
if ( app.isPackaged ) {

	try {

		const exeDir = path.dirname( process.execPath );
		const probe = path.join( exeDir, `.tw_write_test_${ process.pid }` );
		fs.writeFileSync( probe, 'ok' );
		fs.unlinkSync( probe );
		app.setPath( 'userData', path.join( exeDir, 'save-data' ) );

	} catch {

		// Read-only install location (e.g. Program Files): keep Electron's default userData path.

	}

}

app.commandLine.appendSwitch( 'enable-unsafe-webgpu' );

protocol.registerSchemesAsPrivileged( [
	{
		scheme: 'tidewater',
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			corsEnabled: true,
			stream: true,
		},
	},
] );

const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript; charset=utf-8',
	'.mjs': 'application/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.wasm': 'application/wasm',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.ogg': 'audio/ogg',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.glb': 'model/gltf-binary',
	'.gltf': 'model/gltf+json',
	'.bin': 'application/octet-stream',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8',
	'.md': 'text/markdown; charset=utf-8',
};

function createMainWindow() {

	const distRoot = path.resolve( __dirname, 'app-dist' );

	protocol.handle( 'tidewater', async ( request ) => {

		try {

			const parsed = new URL( request.url );
			let reqPath = decodeURIComponent( parsed.pathname || '/' );
			if ( reqPath === '/' || reqPath === '' ) reqPath = '/index.html';
			const relPath = reqPath.replace( /^\/+/, '' );
			const resolved = path.resolve( distRoot, relPath );

			if ( resolved !== distRoot && ! resolved.startsWith( distRoot + path.sep ) ) {

				return new Response( 'Forbidden', { status: 403 } );

			}

			const data = await fs.promises.readFile( resolved );
			const ext = path.extname( resolved ).toLowerCase();
			const contentType = MIME_TYPES[ ext ] || 'application/octet-stream';
			return new Response( data, {
				status: 200,
				headers: { 'Content-Type': contentType },
			} );

		} catch {

			return new Response( 'Not Found', { status: 404 } );

		}

	} );

	session.defaultSession.setPermissionCheckHandler( ( _wc, permission ) => {

		return permission === 'pointerLock' || permission === 'fullscreen';

	} );

	session.defaultSession.setPermissionRequestHandler( ( _wc, permission, callback ) => {

		callback( permission === 'pointerLock' || permission === 'fullscreen' );

	} );

	const { width: waW, height: waH } = screen.getPrimaryDisplay().workAreaSize;
	const width = Math.min( 1440, Math.max( 800, waW - 40 ) );
	const height = Math.min( 900, Math.max( 600, waH - 40 ) );

	const win = new BrowserWindow( {
		width,
		height,
		title: 'Tidewater — 潮汐海湾',
		backgroundColor: '#0b1622',
		show: false,
		autoHideMenuBar: true,
		icon: path.join( __dirname, 'assets', 'icon.ico' ),
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			backgroundThrottling: false,
			preload: path.join( __dirname, 'preload.cjs' ),
		},
	} );

	if ( ! isSmokeTest ) {

		win.once( 'ready-to-show', () => win.show() );

	}

	win.webContents.on( 'before-input-event', ( event, input ) => {

		if ( input.type !== 'keyDown' ) return;
		if ( input.key === 'F11' || ( input.key === 'Enter' && input.alt ) ) {

			event.preventDefault();
			win.setFullScreen( ! win.isFullScreen() );

		}

	} );

	win.webContents.setWindowOpenHandler( ( { url } ) => {

		if ( /^https?:/i.test( url ) ) shell.openExternal( url );
		return { action: 'deny' };

	} );

	if ( isSmokeTest ) {

		let finished = false;
		const finishSmoke = ( payload, exitCode ) => {

			if ( finished ) return;
			finished = true;
			const text = JSON.stringify( payload, null, 2 );
			if ( smokeOutPath ) {

				fs.mkdirSync( path.dirname( path.resolve( smokeOutPath ) ), { recursive: true } );
				fs.writeFileSync( path.resolve( smokeOutPath ), text, 'utf8' );

			} else {

				console.log( text );

			}

			app.exit( exitCode );

		};

		const timer = setTimeout( () => {

			finishSmoke( { ok: false, error: 'Smoke test timed out after 20000ms' }, 1 );

		}, 20000 );

		win.webContents.once( 'did-finish-load', () => {

			setTimeout( async () => {

				try {

					const probe = await win.webContents.executeJavaScript( `
						(async () => {
							const deadline = Date.now() + 8000;
							while (document.querySelectorAll('canvas').length === 0 && Date.now() < deadline) {
								await new Promise((r) => setTimeout(r, 200));
							}
							const href = location.href;
							const title = document.title;
							const canvasCount = document.querySelectorAll('canvas').length;
							const hasWebGPU = Boolean(navigator.gpu);
							let adapterOk = false;
							if (navigator.gpu) {
								const ad = await navigator.gpu.requestAdapter();
								adapterOk = Boolean(ad);
							}
							let localStorageOk = false;
							try {
								const k = '__tw_smoke_ls__';
								localStorage.setItem(k, '1');
								localStorageOk = localStorage.getItem(k) === '1';
								localStorage.removeItem(k);
							} catch {
								localStorageOk = false;
							}
							const hasDesktopBridge = Boolean( window.tidewaterDesktop && window.tidewaterDesktop.isDesktop );
							const ok = href.startsWith('tidewater://app/') && hasWebGPU && adapterOk && canvasCount >= 1 && localStorageOk && hasDesktopBridge;
							return { ok, href, title, hasWebGPU, adapterOk, canvasCount, localStorageOk, hasDesktopBridge };
						})()
					` );
					clearTimeout( timer );
					finishSmoke( probe, probe.ok ? 0 : 1 );

				} catch ( err ) {

					clearTimeout( timer );
					finishSmoke( { ok: false, error: String( err ) }, 1 );

				}

			}, 1000 );

		} );

	}

	win.loadURL( isSmokeTest ? 'tidewater://app/index.html?bench' : 'tidewater://app/index.html' );

}

ipcMain.handle( 'lan:start', async ( _ev, port = 5195 ) => {

	if ( ! lanServer ) lanServer = createLanServer( { port: Number( port ) || 5195 } );
	return lanServer.start();

} );

ipcMain.handle( 'lan:stop', async () => {

	if ( lanServer ) {

		await lanServer.stop();
		lanServer = null;

	}

	return { ok: true };

} );

ipcMain.handle( 'lan:info', () => {

	if ( ! lanServer ) return { running: false, port: 5195, addresses: [], clients: 0 };
	return {
		running: true,
		port: lanServer.getPort(),
		addresses: lanServer.getAddresses(),
		clients: lanServer.clientCount(),
	};

} );

ipcMain.handle( 'desktop:createShortcut', async () => {

	if ( process.platform !== 'win32' ) return { ok: false, error: 'Unsupported platform' };
	const desktopDir = app.getPath( 'desktop' );
	const shortcutPath = path.join( desktopDir, 'Tidewater 潮汐湾.lnk' );
	const targetExe = process.execPath;
	const workDir = path.dirname( targetExe );
	const escPs = ( v ) => String( v ).replace( /'/g, "''" );
	const psCmd = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${ escPs( shortcutPath ) }'); $s.TargetPath = '${ escPs( targetExe ) }'; $s.WorkingDirectory = '${ escPs( workDir ) }'; $s.IconLocation = '${ escPs( targetExe ) },0'; $s.Description = 'Tidewater 潮汐湾'; $s.Save()`;

	return new Promise( ( resolve ) => {

		execFile( 'powershell.exe', [ '-NoProfile', '-NonInteractive', '-Command', psCmd ], { windowsHide: true }, ( err ) => {

			if ( err ) resolve( { ok: false, error: err.message } );
			else resolve( { ok: true, path: shortcutPath } );

		} );

	} );

} );

app.whenReady().then( () => {

	Menu.setApplicationMenu( null );
	createMainWindow();

} );

app.on( 'before-quit', () => {

	if ( lanServer ) {

		lanServer.stop().catch( () => {} );
		lanServer = null;

	}

} );

app.on( 'window-all-closed', () => {

	app.quit();

} );
