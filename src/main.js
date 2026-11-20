import './core/BenchSeed.js';
import { App } from './App.js';
import { UI } from './ui/UI.js';
import { AppUI } from './ui/AppUI.js';
import { getLang, localizeLoader, tr } from './i18n/i18n.js';

localizeLoader();

// ?bench runs in background tabs too (automation): rAF does not fire in a hidden page
if ( /[?&]bench\b/.test( location.search ) ) {

	const raf = window.requestAnimationFrame.bind( window ), caf = window.cancelAnimationFrame.bind( window );
	window.requestAnimationFrame = ( cb ) => document.visibilityState === 'hidden' ? setTimeout( () => cb( performance.now() ), 16 ) : raf( cb );
	window.cancelAnimationFrame = ( id ) => ( clearTimeout( id ), caf( id ) );

}

const ui = new UI();
const app = new App();
window.__ui = ui;

function formatBootError( e ) {

	const zh = getLang() === 'zh';
	const code = e && e.code;
	if ( code === 'NO_WEBGPU' ) {

		return {
			title: zh ? '当前浏览器未启用 WebGPU 图形接口' : 'WebGPU is not available in this browser',
			html: zh
				? `<p>《Tidewater》使用实时 WebGPU 渲染管线，请按以下排查步骤开启后刷新页面：</p>
					<ol>
						<li>请使用最新版 <b>Google Chrome / Microsoft Edge（113+）</b>，暂勿使用内置精简/旧版浏览器。</li>
						<li>打开浏览器 <b>设置 → 系统</b>，确认开启 <b>「使用图形加速 / 硬件加速」</b> 并重启浏览器。</li>
						<li>如果是双显卡笔记本，请在系统显示设置中将浏览器指定为 <b>高性能独立显卡</b> 运行。</li>
					</ol>`
				: `<p>Tidewater requires WebGPU. Please check the following and reload:</p>
					<ol>
						<li>Use a recent desktop build of <b>Google Chrome or Microsoft Edge (113+)</b>.</li>
						<li>Enable <b>Use graphics/hardware acceleration</b> in browser Settings and restart.</li>
						<li>On dual-GPU laptops, assign your browser to the high-performance GPU.</li>
					</ol>`,
		};

	}

	if ( code === 'NO_ADAPTER' ) {

		return {
			title: zh ? '未检测到可用的 WebGPU 显卡适配器' : 'No WebGPU graphics adapter was found',
			html: zh
				? `<p>浏览器未能获取到可用 GPU，建议排查：</p>
					<ol>
						<li>检查显卡驱动是否为最新版本（NVIDIA / AMD / Intel 官网驱动）。</li>
						<li>确认未通过无 GPU 的远程桌面或纯软件兼容模式启动浏览器。</li>
						<li>尝试重启浏览器，或访问 <code>chrome://gpu</code> 查看 WebGPU 状态。</li>
					</ol>`
				: `<p>No compatible GPU adapter could be initialized:</p>
					<ol>
						<li>Update your GPU drivers (NVIDIA / AMD / Intel) and restart the browser.</li>
						<li>Ensure hardware acceleration is enabled and you are not in a headless session.</li>
					</ol>`,
		};

	}

	return {
		title: ( zh ? '启动失败：' : 'Something went wrong: ' ) + ( e?.message || String( e ) ),
		html: zh ? '<p>请尝试刷新页面；若问题持续，请检查浏览器控制台错误或开启硬件加速。</p>' : '<p>Try reloading the page or check the browser console for details.</p>',
	};

}

app.init( ( p, text, until ) => ui.setLoading( p, tr( text ), until ) ).then( async () => {

	app.ui = new AppUI( app, ui );
	ui.setLoading( 1, tr( 'Ready' ) );
	await ui.hideLoader();
	// frame-time benchmark and reference shots (see core/Bench.js): it drives the frames itself
	if ( app.qs.has( 'bench' ) ) {

		window.__bench = new ( await import( './core/Bench.js' ) ).Bench( app );
		if ( app.qs.has( 'auto' ) ) window.__job = window.__bench.auto( app.qs.get( 'auto' ), { runs: Number( app.qs.get( 'runs' ) ) || 1 } );
		// ?bench&shots=view1,view2[&tag=name][&dt=seconds][&seq=n&every=frames]: reference shots of the named views only (core/DebugViews.js; dt > 0: the clock runs, e.g. for the eased lens flare)
		// &wdbg=N: the water shader's debug view (WaterMaterial debugMode) in the shots
		if ( app.qs.has( 'wdbg' ) && app.waterMaterial ) app.waterMaterial.debugMode.value = Number( app.qs.get( 'wdbg' ) );
		if ( app.qs.has( 'shots' ) ) window.__job = window.__bench.shots( app.qs.get( 'shots' ).split( ',' ), { tag: app.qs.get( 'tag' ) || 'shot', dt: Number( app.qs.get( 'dt' ) ) || 0, seq: Number( app.qs.get( 'seq' ) ) || 1, every: Number( app.qs.get( 'every' ) ) || 1 } );

	} else app.start();
	ui.showStartOverlay( () => {

		app.input.requestLock();
		if ( app.audio ) app.audio.resume();

	} );

} ).catch( ( e ) => {

	console.error( e );
	const info = formatBootError( e );
	ui.setLoadingError( info.title, info.html );

} );
