import { Vector4 } from '../engine/index.js';
import { GPU } from '../engine/gpu/GPU.js';
import { Texture } from '../engine/gpu/Texture.js';
import { ShaderModule, UniformBlock } from '../engine/gpu/Shader.js';
import { commonModule } from '../engine/render/wgsl/common.js';

const RES = 256;
const SIZE = 80;
const TEXEL = SIZE / RES; // 0.3125 m per texel (80 m x 80 m sliding window)

// Dynamic world-aligned ground interaction buffer:
//   R = persistent grass trampling / bend intensity (0..1)
//   G = tire track rut depth (0..1)
//   B, A = encoded XZ push direction (0.5 = neutral)
// Maintains a texel-snapped sliding window around the player / vehicle with zero GPU render-pass overhead.
export class GroundInteraction {

	constructor() {

		const count = RES * RES;
		this.res = RES;
		this.size = SIZE;
		this.texel = TEXEL;

		this.grass = new Float32Array( count );
		this.track = new Float32Array( count );
		this.dirX = new Float32Array( count );
		this.dirZ = new Float32Array( count );
		this.pixels = new Uint8Array( count * 4 );

		this._tmpG = new Float32Array( count );
		this._tmpT = new Float32Array( count );
		this._tmpX = new Float32Array( count );
		this._tmpZ = new Float32Array( count );

		for ( let i = 0; i < count; i ++ ) {

			const o = i * 4;
			this.pixels[ o + 2 ] = 128;
			this.pixels[ o + 3 ] = 128;

		}

		this.originX = - SIZE * 0.5;
		this.originZ = - SIZE * 0.5;
		this._initialized = false;
		this._dirty = true;
		this._hasActive = false;

		this.texture = new Texture( {
			label: 'groundInteraction',
			width: RES,
			height: RES,
			format: 'rgba8unorm',
			usage: [ 'sample', 'copyDst' ],
			sampler: 'linearClamp',
			data: this.pixels,
		} );

		this.uniforms = new UniformBlock( 'GroundInteractionParams', {
			bounds: [ 'vec4f', new Vector4( this.originX, this.originZ, 1 / SIZE, 1 ) ],
		}, { label: 'giParams' } );

		this.module = new ShaderModule( {
			name: 'groundInteraction',
			deps: [ commonModule ],
			uniforms: this.uniforms,
			uniformName: 'giParams',
			bindings: {
				giTex: { texture: this.texture },
			},
			code: /* wgsl */`
fn groundInteractionAt( xz: vec2f ) -> vec4f {
	let uv = ( xz - giParams.bounds.xy ) * giParams.bounds.z;
	let edge = smoothstep( 0.0, 0.06, uv.x ) * smoothstep( 1.0, 0.94, uv.x )
		* smoothstep( 0.0, 0.06, uv.y ) * smoothstep( 1.0, 0.94, uv.y );
	let samp = textureSampleLevel( giTex, smpLinearClamp, clamp( uv, vec2f( 0.002 ), vec2f( 0.998 ) ), 0.0 );
	return vec4f( samp.r * edge * giParams.bounds.w, samp.g * edge * giParams.bounds.w, samp.b, samp.a );
}
`,
		} );

	}

	recenter( cx, cz ) {

		const nx = Math.floor( ( cx - SIZE * 0.5 ) / TEXEL ) * TEXEL;
		const nz = Math.floor( ( cz - SIZE * 0.5 ) / TEXEL ) * TEXEL;

		if ( ! this._initialized ) {

			this.originX = nx;
			this.originZ = nz;
			this.uniforms.set( 'bounds', this.uniforms.fields.bounds.value.set( nx, nz, 1 / SIZE, 1 ) );
			this._initialized = true;
			this._dirty = true;
			return;

		}

		const dx = Math.round( ( nx - this.originX ) / TEXEL );
		const dz = Math.round( ( nz - this.originZ ) / TEXEL );
		if ( Math.abs( dx ) < 10 && Math.abs( dz ) < 10 ) return;

		if ( Math.abs( dx ) >= RES || Math.abs( dz ) >= RES ) {

			this.grass.fill( 0 );
			this.track.fill( 0 );
			this.dirX.fill( 0 );
			this.dirZ.fill( 0 );
			this._hasActive = false;

		} else {

			const tg = this._tmpG, tt = this._tmpT, tx = this._tmpX, tz = this._tmpZ;
			tg.fill( 0 );
			tt.fill( 0 );
			tx.fill( 0 );
			tz.fill( 0 );
			let active = false;

			const iMin = Math.max( 0, - dx ), iMax = Math.min( RES - 1, RES - 1 - dx );
			const jMin = Math.max( 0, - dz ), jMax = Math.min( RES - 1, RES - 1 - dz );
			for ( let j = jMin; j <= jMax; j ++ ) {

				const oldJ = j + dz;
				const dstRow = j * RES;
				const srcRow = oldJ * RES;
				for ( let i = iMin; i <= iMax; i ++ ) {

					const sk = srcRow + i + dx;
					const gv = this.grass[ sk ], tv = this.track[ sk ];
					if ( gv <= 0 && tv <= 0 ) continue;
					const dk = dstRow + i;
					tg[ dk ] = gv;
					tt[ dk ] = tv;
					tx[ dk ] = this.dirX[ sk ];
					tz[ dk ] = this.dirZ[ sk ];
					active = true;

				}

			}

			this.grass.set( tg );
			this.track.set( tt );
			this.dirX.set( tx );
			this.dirZ.set( tz );
			this._hasActive = active;

		}

		this.originX += dx * TEXEL;
		this.originZ += dz * TEXEL;
		this.uniforms.set( 'bounds', this.uniforms.fields.bounds.value.set( this.originX, this.originZ, 1 / SIZE, 1 ) );
		this._dirty = true;

	}

	stamp( wx, wz, radius, { grass = 0, track = 0, dx = 0, dz = 0 } = {} ) {

		if ( grass <= 0 && track <= 0 ) return;
		const rTex = Math.ceil( radius / TEXEL ) + 1;
		const ci = Math.floor( ( wx - this.originX ) / TEXEL );
		const cj = Math.floor( ( wz - this.originZ ) / TEXEL );
		const i0 = Math.max( 0, ci - rTex ), i1 = Math.min( RES - 1, ci + rTex );
		const j0 = Math.max( 0, cj - rTex ), j1 = Math.min( RES - 1, cj + rTex );
		if ( i0 > i1 || j0 > j1 ) return;

		const vLen = Math.hypot( dx, dz );
		const mx = vLen > 0.05 ? dx / vLen : 0;
		const mz = vLen > 0.05 ? dz / vLen : 0;
		const invR = 1 / Math.max( radius, 0.05 );

		for ( let j = j0; j <= j1; j ++ ) {

			const tz = this.originZ + ( j + 0.5 ) * TEXEL;
			const oz = tz - wz;
			for ( let i = i0; i <= i1; i ++ ) {

				const tx = this.originX + ( i + 0.5 ) * TEXEL;
				const ox = tx - wx;
				const dist = Math.hypot( ox, oz );
				const u = dist * invR;
				if ( u >= 1 ) continue;

				const b = 1 - u * u;
				const fall = b * Math.sqrt( b );
				const k = j * RES + i;

				if ( grass > 0 ) {

					const gv = Math.min( 1, grass * fall );
					const invD = 1 / ( dist + 0.08 );
					let px = mx + ox * invD * 0.45;
					let pz = mz + oz * invD * 0.45;
					const pl = Math.hypot( px, pz );
					if ( pl > 1e-4 ) { px /= pl; pz /= pl; }
					if ( gv >= this.grass[ k ] ) {

						this.grass[ k ] = gv;
						this.dirX[ k ] = px;
						this.dirZ[ k ] = pz;

					} else if ( gv > 0.05 ) {

						this.dirX[ k ] += ( px - this.dirX[ k ] ) * 0.25;
						this.dirZ[ k ] += ( pz - this.dirZ[ k ] ) * 0.25;

					}

				}

				if ( track > 0 ) {

					const tv = Math.min( 1, track * fall );
					if ( tv > this.track[ k ] ) this.track[ k ] = tv;

				}

				this._hasActive = true;
				this._dirty = true;

			}

		}

	}

	stampFoot( x, z, vx = 0, vz = 0, speed = 0 ) {

		this.stamp( x, z, 0.72, {
			grass: Math.min( 1, 0.65 + speed * 0.12 ),
			track: 0,
			dx: vx,
			dz: vz,
		} );

	}

	stampWheel( x, z, vx = 0, vz = 0, { radius = 0.62, grass = 1.0, track = 0.85 } = {} ) {

		this.stamp( x, z, radius, { grass, track, dx: vx, dz: vz } );

	}

	// CPU bilinear lookup (used by unit tests & diagnostics).
	sampleAt( wx, wz ) {

		const fx = ( wx - this.originX ) / TEXEL - 0.5;
		const fz = ( wz - this.originZ ) / TEXEL - 0.5;
		if ( fx < 0 || fz < 0 || fx >= RES - 1 || fz >= RES - 1 ) {

			return { grass: 0, track: 0, dirX: 0, dirZ: 0 };

		}

		const i = Math.floor( fx ), j = Math.floor( fz );
		const tx = fx - i, tz = fz - j;
		const k00 = j * RES + i, k10 = k00 + 1, k01 = k00 + RES, k11 = k01 + 1;
		const bilerp = ( arr ) => ( arr[ k00 ] * ( 1 - tx ) + arr[ k10 ] * tx ) * ( 1 - tz )
			+ ( arr[ k01 ] * ( 1 - tx ) + arr[ k11 ] * tx ) * tz;
		return {
			grass: bilerp( this.grass ),
			track: bilerp( this.track ),
			dirX: bilerp( this.dirX ),
			dirZ: bilerp( this.dirZ ),
		};

	}

	update( dt, centerX, centerZ, rainIntensity = 0 ) {

		this.recenter( centerX, centerZ );

		if ( this._hasActive && dt > 0 ) {

			const gDecay = Math.exp( - dt / 15.0 );
			const rain = Math.max( 0, Math.min( 1, rainIntensity ) );
			const tTau = 38.0 - 26.0 * rain;
			const tDecay = Math.exp( - dt / tTau );

			const g = this.grass, t = this.track, dx = this.dirX, dz = this.dirZ;
			let any = false;
			for ( let i = 0; i < g.length; i ++ ) {

				let gv = g[ i ], tv = t[ i ];
				if ( gv > 0 ) {

					gv *= gDecay;
					if ( gv < 0.004 ) {

						gv = 0;
						dx[ i ] = 0;
						dz[ i ] = 0;

					} else {

						any = true;

					}

					g[ i ] = gv;

				}

				if ( tv > 0 ) {

					tv *= tDecay;
					if ( tv < 0.004 ) tv = 0;
					else any = true;
					t[ i ] = tv;

				}

			}

			this._hasActive = any;
			this._dirty = true;

		}

		if ( this._dirty ) {

			const g = this.grass, t = this.track, dx = this.dirX, dz = this.dirZ, px = this.pixels;
			for ( let i = 0; i < g.length; i ++ ) {

				const o = i * 4;
				px[ o ] = Math.min( 255, Math.max( 0, Math.round( g[ i ] * 255 ) ) );
				px[ o + 1 ] = Math.min( 255, Math.max( 0, Math.round( t[ i ] * 255 ) ) );
				px[ o + 2 ] = Math.min( 255, Math.max( 0, Math.round( ( dx[ i ] * 0.5 + 0.5 ) * 255 ) ) );
				px[ o + 3 ] = Math.min( 255, Math.max( 0, Math.round( ( dz[ i ] * 0.5 + 0.5 ) * 255 ) ) );

			}

			if ( GPU.device ) this.texture.upload( px );
			this._dirty = false;

		}

	}

}
