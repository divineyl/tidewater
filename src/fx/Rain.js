import { Material } from '../engine/render/Material.js';
import { Mesh } from '../engine/scene/Mesh.js';
import { PlaneGeometry } from '../engine/geometry/index.js';
import { ShaderModule, UniformBlock } from '../engine/gpu/Shader.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';
import { G } from '../engine/render/Frame.js';
import { Vector3 } from '../engine/math/index.js';

const BOX_XZ = 26;
const BOX_Y = 18;

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

// GPU instanced precipitation streaks wrapped around the camera.
// Zero CPU per-particle simulation; outputs motion vectors (VELOCITY_OPAQUE) for TAAU compatibility.
export class Rain {

	constructor( { terrain = null, clouds = null, count = 5500 } = {} ) {

		this.terrain = terrain;
		this.boxXZ = BOX_XZ;
		this.boxY = BOX_Y;
		this.uniforms = new UniformBlock( 'RainParams', {
			camPos: [ 'vec3f', new Vector3() ],
			pad0: [ 'f32', 0 ],
			drift: [ 'vec3f', new Vector3() ],
			pad1: [ 'f32', 0 ],
		}, { label: 'rain' } );
		this.camPos = this.uniforms.fields.camPos;
		this.drift = this.uniforms.fields.drift;

		const hasTerrain = !! ( terrain && terrain.module );
		const hasClouds = !! ( clouds && ( clouds.shadowModule || clouds.module ) );

		const params = new ShaderModule( {
			name: 'rainParams',
			uniforms: this.uniforms,
			uniformName: 'rain',
			code: /* wgsl */`
fn rainHash3( n: f32 ) -> vec3f {
	return fract( sin( vec3f( n, n + 19.17, n + 47.73 ) ) * vec3f( 43758.5453, 22578.1459, 19642.3490 ) );
}
`,
		} );

		const Bxz = f( BOX_XZ );
		const By = f( BOX_Y );

		const mat = new Material( {
			name: 'Rain',
			modules: [ params, hasTerrain && terrain.module, hasClouds && ( clouds.shadowModule || clouds.module ) ].filter( Boolean ),
			lit: false,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			side: 'double',
			blending: 'premultiplied',
			varyings: { vRainCol: 'vec4f', vRainUV: 'vec2f' },
			vertex: /* wgsl */`
	let id = f32( v.instance );
	let h = rainHash3( id * 0.8317 + 0.41 );
	let h2 = rainHash3( id * 1.4713 + 7.3 );
	let intensity = frame.weather.x;
	let keep = smoothstep( h2.z * 0.92, h2.z * 0.92 + 0.08, intensity );

	let Bx = ${ Bxz };
	let Bv = ${ By };
	let localXZ = ( fract( h.xz + ( rain.drift.xz - rain.camPos.xz ) / Bx ) - 0.5 ) * Bx;
	let localY = ( fract( h.y + ( rain.drift.y - rain.camPos.y ) / Bv ) - 0.5 ) * Bv;
	let p = rain.camPos + vec3f( localXZ.x, localY, localXZ.y );

	let ground = max( ${ hasTerrain ? 'terrainHeightAt( p.xz )' : '-50.0' }, frame.seaLevel );
	let aboveGround = smoothstep( ground - 0.1, ground + 0.35, p.y );

	let toCam = frame.cameraPos - p;
	let dist = max( length( toCam ), 0.05 );
	let Vd = toCam / dist;

	let edge = smoothstep( Bx * 0.5, Bx * 0.35, max( abs( localXZ.x ), abs( localXZ.y ) ) )
		* smoothstep( Bv * 0.5, Bv * 0.35, abs( localY ) );
	let distFade = smoothstep( 0.45, 1.35, dist ) * smoothstep( Bx * 0.48, Bx * 0.28, dist );

	let vel = vec3f( frame.windDir.x * frame.windSpeed * 0.42, -19.5, frame.windDir.y * frame.windSpeed * 0.42 );
	let streakDir = normalize( vel );
	let side = normalize( cross( Vd, streakDir ) + vec3f( 1e-5, 0.0, 0.0 ) );
	let along = normalize( cross( side, Vd ) );

	let p11 = frame.proj[ 1 ][ 1 ];
	let pixel = dist * 2.0 / max( p11 * frame.resolution.y, 1.0 );
	let width = max( 0.0032, pixel * 1.15 );
	let len = mix( 0.32, 0.68, h2.x );
	let corner = v.position.xy;
	let world = p + side * ( corner.x * width ) + along * ( corner.y * len * 0.5 );

	var vis = 1.0;
${ hasClouds ? '	vis *= cloudsShadow( p.xz );' : '' }
	let cosT = - dot( Vd, frame.sunDir );
	let phase = 0.25 + 0.55 * pow( max( cosT, 0.0 ), 4.0 );
	let col = frame.skyIrradiance * 0.45 + frame.sunColor * vis * phase + vec3f( 0.75, 0.88, 1.0 ) * frame.weather.w * 1.8;
	let a = keep * aboveGround * edge * distFade * ( 0.14 + 0.22 * intensity ) * ( 0.65 + 0.35 * h2.y );

	o.vRainCol = vec4f( col, a );
	o.vRainUV = corner;
	v.useWorld = true;
	v.worldPos = select( vec3f( 0.0, -1e5, 0.0 ), world, a > 0.002 );
	v.worldNormal = Vd;
	v.prevWorldPos = v.worldPos - vel * min( frame.dt, 0.033 );
`,
			surface: /* wgsl */`
	let uvq = in.vs.vRainUV;
	let prof = exp( - uvq.x * uvq.x * 3.8 ) * smoothstep( 1.0, 0.15, abs( uvq.y ) );
	let a = clamp( in.vs.vRainCol.w * prof, 0.0, 0.85 );
	if ( a < 0.003 ) { discard; }
	s.albedo = in.vs.vRainCol.rgb * a;
	s.emissive = vec3f( 0.0 );
	s.alpha = a;
`,
			output: 'r.color = vec4f( s.albedo, s.alpha );',
		} );

		const geo = new PlaneGeometry( 2, 2 );
		geo.instanceCount = count;
		this.material = mat;
		this.mesh = new Mesh( geo, mat );
		this.mesh.name = 'Rain';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.renderOrder = 22;
		this.mesh.layers.set( LAYERS.TRANSPARENT );

	}

	update( dt, camera, cameraWaterHeight = 0 ) {

		const intensity = G.weather ? G.weather.value.x : 0;
		const visible = intensity >= 0.015 && camera.position.y > cameraWaterHeight;
		this.mesh.visible = visible;
		if ( ! visible ) return;

		this.camPos.value.copy( camera.position );
		const vx = G.windDir.value.x * G.windSpeed.value * 0.42;
		const vz = G.windDir.value.y * G.windSpeed.value * 0.42;
		const d = this.drift.value;
		const wrap = ( v, m ) => ( ( v % m ) + m ) % m;
		d.x = wrap( d.x + vx * dt, this.boxXZ );
		d.y = wrap( d.y - 19.5 * dt, this.boxY );
		d.z = wrap( d.z + vz * dt, this.boxXZ );

	}

}
