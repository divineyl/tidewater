import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname( fileURLToPath( import.meta.url ) );
const PROJECT_ROOT = path.resolve( __dirname, '..' );
const TARGET_DIR = path.resolve( process.argv[ 2 ] || path.join( PROJECT_ROOT, 'public' ) );

export function assertPngIhDR8BitRgba( filePath ) {

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

		throw new Error( `Invalid PNG IHDR in ${ path.basename( filePath ) }: bitDepth=${ bitDepth }, colorType=${ colorType }, interlace=${ interlace }` );

	}

	return { width, height, bitDepth, colorType, interlace, bytes: buf.length };

}

const pyScript = `
import os, sys
from PIL import Image

root_dir = sys.argv[1]
saved = 0

whale_files = [
    os.path.join(root_dir, 'models', 'whale', 'humpback_height.png'),
    os.path.join(root_dir, 'models', 'whale', 'humpback_albedo.png'),
]
for wf in whale_files:
    if os.path.isfile(wf):
        before = os.path.getsize(wf)
        tmp = wf + '.tmp.png'
        with Image.open(wf) as im:
            rgba = im.convert('RGBA')
            if rgba.width > 2048 or rgba.height > 1024:
                rgba = rgba.resize((2048, 1024), Image.Resampling.LANCZOS)
            rgba.save(tmp, format='PNG', optimize=True, compress_level=9)
        after = os.path.getsize(tmp)
        if after < before * 0.99:
            os.replace(tmp, wf)
            saved += before - after
            print(f"WHALE {os.path.basename(wf)}: {before} -> {after} bytes")
        else:
            os.remove(tmp)
            print(f"WHALE {os.path.basename(wf)}: already optimal ({before} bytes)")

for sub in ('models', 'ui'):
    base = os.path.join(root_dir, sub)
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

if ( process.argv[ 1 ] && path.resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {

	console.log( `[optimize] Optimizing WebGPU assets in ${ TARGET_DIR }` );
	const res = spawnSync( 'python', [ '-c', pyScript, TARGET_DIR ], { encoding: 'utf8' } );
	if ( res.status !== 0 ) {

		console.error( res.stderr || res.error?.message || 'Python/PIL optimization failed' );
		process.exit( res.status || 1 );

	}

	process.stdout.write( res.stdout );
	for ( const fn of [ 'humpback_height.png', 'humpback_albedo.png' ] ) {

		const fp = path.join( TARGET_DIR, 'models', 'whale', fn );
		if ( fs.existsSync( fp ) ) {

			const info = assertPngIhDR8BitRgba( fp );
			console.log( `[optimize] Verified PNG IHDR ${ fn }: ${ info.width }x${ info.height }, bitDepth=${ info.bitDepth }, colorType=${ info.colorType }, interlace=${ info.interlace }, size=${ ( info.bytes / ( 1024 * 1024 ) ).toFixed( 2 ) } MB` );

		}

	}

}
