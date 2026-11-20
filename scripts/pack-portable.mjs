import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname( fileURLToPath( import.meta.url ) );
const PROJECT_ROOT = path.resolve( __dirname, '..' );
const DIST_DIR = path.join( PROJECT_ROOT, 'dist' );
const EXPORT_ROOT = process.env.EXPORT_DIR || path.join( PROJECT_ROOT, 'exports' );
const PORTABLE_DIR = path.join( EXPORT_ROOT, 'Tidewater-Portable' );
const WEB_DIR = path.join( PORTABLE_DIR, 'web' );
const ZIP_PATH = path.join( EXPORT_ROOT, 'Tidewater-Portable.zip' );

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

function assertPngIhDR8BitRgba( filePath ) {

	const buf = fs.readFileSync( filePath );
	const magic = '89504e470d0a1a0a';
	if ( buf.subarray( 0, 8 ).toString( 'hex' ) !== magic ) throw new Error( `Not a valid PNG: ${ filePath }` );
	const chunk = buf.subarray( 12, 16 ).toString( 'ascii' );
	if ( chunk !== 'IHDR' ) throw new Error( `Missing IHDR in PNG: ${ filePath }` );
	const width = buf.readUInt32BE( 16 );
	const height = buf.readUInt32BE( 20 );
	const bitDepth = buf[ 24 ];
	const colorType = buf[ 25 ];
	const interlace = buf[ 28 ];
	if ( bitDepth !== 8 || colorType !== 6 || interlace !== 0 ) {

		throw new Error( `Invalid whale PNG format in ${ path.basename( filePath ) }: bitDepth=${ bitDepth }, colorType=${ colorType }, interlace=${ interlace }` );

	}

	return { width, height, bitDepth, colorType, interlace };

}

const BAT_TEXT = [
	'@echo off',
	'setlocal',
	'cd /d "%~dp0"',
	'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"',
	'if errorlevel 1 (',
	'    echo.',
	'    echo Launch failed. Press any key to close...',
	'    pause >nul',
	')',
	'',
].join( '\r\n' );

const PS1_TEXT = [
	"$ErrorActionPreference = 'Stop'",
	'$OutputEncoding = [System.Text.Encoding]::UTF8',
	'[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
	'',
	'$root = Split-Path -Parent $MyInvocation.MyCommand.Path',
	'$webRoot = [System.IO.Path]::GetFullPath((Join-Path $root "web"))',
	'if (-not (Test-Path (Join-Path $webRoot "index.html"))) {',
	'    Write-Host "Missing web\\index.html. Please extract the full zip before launching." -ForegroundColor Red',
	'    Read-Host "Press Enter to exit"',
	'    exit 1',
	'}',
	'',
	'$mimeTypes = @{',
	'    ".html" = "text/html; charset=utf-8"',
	'    ".js"   = "application/javascript; charset=utf-8"',
	'    ".mjs"  = "application/javascript; charset=utf-8"',
	'    ".css"  = "text/css; charset=utf-8"',
	'    ".json" = "application/json; charset=utf-8"',
	'    ".wasm" = "application/wasm"',
	'    ".png"  = "image/png"',
	'    ".jpg"  = "image/jpeg"',
	'    ".jpeg" = "image/jpeg"',
	'    ".webp" = "image/webp"',
	'    ".svg"  = "image/svg+xml"',
	'    ".ico"  = "image/x-icon"',
	'    ".ogg"  = "audio/ogg"',
	'    ".mp3"  = "audio/mpeg"',
	'    ".wav"  = "audio/wav"',
	'    ".glb"  = "model/gltf-binary"',
	'    ".gltf" = "model/gltf+json"',
	'    ".bin"  = "application/octet-stream"',
	'    ".woff2"= "font/woff2"',
	'    ".txt"  = "text/plain; charset=utf-8"',
	'}',
	'',
	'$listener = $null',
	'$port = 5189',
	'for ($p = 5189; $p -le 5220; $p++) {',
	'    $try = New-Object System.Net.HttpListener',
	'    $try.Prefixes.Add("http://127.0.0.1:$p/")',
	'    try {',
	'        $try.Start()',
	'        $listener = $try',
	'        $port = $p',
	'        break',
	'    } catch {',
	'        $try.Close()',
	'    }',
	'}',
	'if (-not $listener) {',
	'    Write-Host "Unable to bind local port 5189..5220." -ForegroundColor Red',
	'    exit 1',
	'}',
	'',
	'$url = "http://127.0.0.1:$port/"',
	'Write-Host "==========================================" -ForegroundColor Cyan',
	'Write-Host "  Tidewater 便携版本地服务器已启动" -ForegroundColor Green',
	'Write-Host "  游戏地址: $url"',
	'Write-Host "  按 Ctrl+C 或关闭此窗口即可退出游戏"',
	'Write-Host "==========================================" -ForegroundColor Cyan',
	'Start-Process $url',
	'',
	'try {',
	'    while ($listener.IsListening) {',
	'        $ctx = $listener.GetContext()',
	'        $req = $ctx.Request',
	'        $res = $ctx.Response',
	'        try {',
	'            $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart("/"))',
	'            if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }',
	'            $relWin = $rel -replace "/", "\\"',
	'            $full = [System.IO.Path]::GetFullPath((Join-Path $webRoot $relWin))',
	'            if (-not $full.StartsWith($webRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -and ($full -ne $webRoot)) {',
	'                $res.StatusCode = 403',
	'                $res.Close()',
	'                continue',
	'            }',
	'            if ((Test-Path $full) -and (Get-Item $full).PSIsContainer) {',
	'                $full = Join-Path $full "index.html"',
	'            }',
	'            if (-not (Test-Path $full -PathType Leaf)) {',
	'                $res.StatusCode = 404',
	'                $res.Close()',
	'                continue',
	'            }',
	'            $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()',
	'            $res.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }',
	'            $res.AddHeader("Cache-Control", "no-cache")',
	'            $bytes = [System.IO.File]::ReadAllBytes($full)',
	'            $res.ContentLength64 = $bytes.Length',
	'            $res.OutputStream.Write($bytes, 0, $bytes.Length)',
	'        } catch {',
	'            $res.StatusCode = 500',
	'        } finally {',
	'            try { $res.Close() } catch {}',
	'        }',
	'    }',
	'} finally {',
	'    $listener.Stop()',
	'    $listener.Close()',
	'}',
	'',
].join( '\r\n' );

const SH_TEXT = [
	'#!/usr/bin/env bash',
	'set -e',
	'cd "$(dirname "$0")"',
	'PORT=5189',
	'while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done',
	'URL="http://127.0.0.1:$PORT/"',
	'echo "Tidewater local server: $URL"',
	'if command -v open >/dev/null 2>&1; then (sleep 1 && open "$URL") & elif command -v xdg-open >/dev/null 2>&1; then (sleep 1 && xdg-open "$URL") & fi',
	'if command -v python3 >/dev/null 2>&1; then exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory web',
	'elif command -v python >/dev/null 2>&1; then exec python -m http.server "$PORT" --bind 127.0.0.1 --directory web',
	'else echo "Python 3 is required on macOS/Linux."; exit 1; fi',
	'',
].join( '\n' );

const README_TEXT = [
	'============================================================',
	'  《Tidewater · 潮汐湾》WebGPU 海岛垂钓与探索便携版',
	'============================================================',
	'',
	'【运行方式】',
	'1. 请先将压缩包完全解压到任意文件夹后再启动（请勿在压缩包内直接双击）。',
	'2. Windows 用户直接双击「双击启动游戏.bat」，程序会自动开启本地服务并打开浏览器。',
	'   - 本启动器基于 Windows 内置 PowerShell 运行，无需安装 Node.js 或 Python。',
	'3. macOS / Linux 用户请在终端运行 ./start-mac-linux.sh。',
	'',
	'【浏览器与显卡要求】',
	'- 推荐使用最新版 Chrome / Edge（113+），并在浏览器设置中开启「硬件/图形加速」。',
	'- 若页面提示未检测到 WebGPU，页面会自动展示中文排查指引。',
	'',
	'【新版特性与核心操作】',
	'- 简体中文 / English 双语界面：点击设置面板（H）右上角「EN/中文」或在常规设置内无缝切换。',
	'- 实时动态天气系统：晴空 / 多云 / 阴天 / 热带阵雨 / 海上雷暴动态演进，含雨滴、闪电、雷声与镜头水滴特效。',
	'- 双陆地载具系统：海滩越野摩托车（两轮压弯）与四轮海岸越野车（独立悬挂与货斗冰桶），支持第一/三人称及扬尘水花。',
	'- 钓鱼经济 × 载具改装联动：找玛塔（Marta）购买全地形轮胎、涡轮动力、越野悬挂涉水喉与车顶 LED 灯条，解锁沙地极速与深水涉滩。',
	'- 东岬景区公路与灯塔地标：沿盘山砂土公路驾驶至东岬观景灯塔，附带实时轮胎/脚印压痕与草地倒伏效果。',
	'- 全岛地图与 3D 信标导航：按 N 展开全岛地形图点击标点，场景内自动升起高空青色光柱与实时方位测距。',
	'- 4 档画质预设 & 增强拍照模式：省电/均衡/高清/电影预设自动持久化；按 P 纯净拍照，[ / ] 调焦，F2 保存高清截图。',
	'- 视角防跳变优化 & 原生手柄即插即用：屏蔽 Pointer Lock 异常瞬移；支持 Xbox / PlayStation 手柄操作。',
	'- 基础按键：',
	'  WASD 移动/驾驶  |  Shift 奔跑/加速    |  Space 跳跃/手刹漂移  |  E 登船/骑车/开车/对话',
	'  V 切换人称视角  |  R 鱼竿/载具扶正脱困  |  L 手电筒/车灯开关    |  G 鸣笛',
	'  N 展开全岛地图  |  I/Tab 冰桶与图鉴     |  T 暂停/流动时间      |  H 设置面板',
	'  P 纯净拍照模式  |  F 自由飞行相机       |  M 静音               |  F1 完整快捷键表',
	'',
].join( '\r\n' );

function writeBOMFile( filePath, text ) {

	fs.writeFileSync( filePath, Buffer.concat( [ Buffer.from( [ 0xef, 0xbb, 0xbf ] ), Buffer.from( text, 'utf8' ) ] ) );

}

function optimizeCopiedTextures() {

	const pyScript = `
import os, sys
from PIL import Image

web_dir = sys.argv[1]
saved = 0

whale_files = [
    os.path.join(web_dir, 'models', 'whale', 'humpback_height.png'),
    os.path.join(web_dir, 'models', 'whale', 'humpback_albedo.png'),
]
for wf in whale_files:
    if os.path.isfile(wf):
        before = os.path.getsize(wf)
        with Image.open(wf) as im:
            rgba = im.convert('RGBA')
            if rgba.width > 2048 or rgba.height > 1024:
                rgba = rgba.resize((2048, 1024), Image.Resampling.LANCZOS)
            rgba.save(wf, format='PNG', optimize=True, compress_level=9)
        after = os.path.getsize(wf)
        saved += max(0, before - after)
        print(f"WHALE {os.path.basename(wf)}: {before} -> {after} bytes")

for sub in ('models', 'ui'):
    base = os.path.join(web_dir, sub)
    if not os.path.isdir(base):
        continue
    for root, _, files in os.walk(base):
        for fn in files:
            low = fn.lower()
            if not (low.endswith('.jpg') or low.endswith('.jpeg')):
                continue
            p = os.path.join(root, fn)
            before = os.path.getsize(p)
            if before < 300 * 1024:
                continue
            tmp = p + '.tmp.jpg'
            try:
                with Image.open(p) as im:
                    rgb = im.convert('RGB')
                    if max(rgb.width, rgb.height) > 2048:
                        rgb.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
                    rgb.save(tmp, format='JPEG', quality=82, optimize=True)
                after = os.path.getsize(tmp)
                if after < before * 0.92:
                    os.replace(tmp, p)
                    saved += before - after
                    print(f"JPG   {fn}: {before} -> {after} bytes")
                else:
                    os.remove(tmp)
            except Exception as e:
                if os.path.exists(tmp):
                    os.remove(tmp)
                print(f"WARN  {fn}: {e}")

print(f"TOTAL_SAVED_BYTES={saved}")
`;
	const res = spawnSync( 'python', [ '-c', pyScript, WEB_DIR ], { encoding: 'utf8' } );
	if ( res.status !== 0 ) {

		console.warn( '[pack] Texture optimization skipped (Python/PIL unavailable or failed):', res.stderr || res.error?.message );
		return 0;

	}

	process.stdout.write( res.stdout );
	const m = /TOTAL_SAVED_BYTES=(\d+)/.exec( res.stdout );
	return m ? Number( m[ 1 ] ) : 0;

}

console.log( '[pack] Building Tidewater production bundle...' );
const buildRes = spawnSync( 'npm run build', { cwd: PROJECT_ROOT, shell: true, stdio: 'inherit' } );
if ( buildRes.status !== 0 ) throw new Error( 'vite build failed' );

console.log( `[pack] Staging portable folder: ${ PORTABLE_DIR }` );
fs.rmSync( PORTABLE_DIR, { recursive: true, force: true } );
fs.mkdirSync( WEB_DIR, { recursive: true } );
fs.cpSync( DIST_DIR, WEB_DIR, { recursive: true } );

fs.writeFileSync( path.join( PORTABLE_DIR, '双击启动游戏.bat' ), BAT_TEXT, 'ascii' );
writeBOMFile( path.join( PORTABLE_DIR, 'start.ps1' ), PS1_TEXT );
fs.writeFileSync( path.join( PORTABLE_DIR, 'start-mac-linux.sh' ), SH_TEXT, 'utf8' );
writeBOMFile( path.join( PORTABLE_DIR, '游玩说明.txt' ), README_TEXT );

const savedBytes = optimizeCopiedTextures();

for ( const fn of [ 'humpback_height.png', 'humpback_albedo.png' ] ) {

	const fp = path.join( WEB_DIR, 'models', 'whale', fn );
	if ( fs.existsSync( fp ) ) {

		const info = assertPngIhDR8BitRgba( fp );
		console.log( `[pack] Verified whale PNG IHDR ${ fn }: ${ info.width }x${ info.height }, bitDepth=${ info.bitDepth }, colorType=${ info.colorType }, interlace=${ info.interlace }` );

	}

}

const stats = folderStats( PORTABLE_DIR );
console.log( `[pack] Staged ${ stats.count } files (${ fmtMB( stats.bytes ) }), saved ${ fmtMB( savedBytes ) } via texture optimization.` );

if ( fs.existsSync( ZIP_PATH ) ) fs.rmSync( ZIP_PATH, { force: true } );
console.log( `[pack] Compressing UTF-8 archive -> ${ ZIP_PATH }` );
const psZip = [
	'Add-Type -AssemblyName System.IO.Compression.FileSystem',
	`$src = '${ PORTABLE_DIR.replace( /'/g, "''" ) }'`,
	`$dst = '${ ZIP_PATH.replace( /'/g, "''" ) }'`,
	'[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $dst, [System.IO.Compression.CompressionLevel]::Optimal, $true, [System.Text.Encoding]::UTF8)',
].join( '; ' );
execFileSync( 'powershell', [ '-NoProfile', '-Command', psZip ], { stdio: 'inherit' } );

const zipSize = fs.statSync( ZIP_PATH ).size;
console.log( `[pack] Done! ZIP size: ${ fmtMB( zipSize ) } (${ ZIP_PATH })` );
