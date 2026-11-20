import { Material } from '../engine/render/Material.js';
import { Mesh } from '../engine/scene/Mesh.js';
import { PlaneGeometry, Vector3 } from '../engine/index.js';
import { StorageBuffer } from '../engine/webgpu.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';
import { G } from '../engine/render/Frame.js';
import { SPRAY } from './Spray.js';

const MAX_DUST = 256;

const SURFACE_TINTS = {
	sand: [ 0.78, 0.69, 0.52 ],
	path: [ 0.56, 0.44, 0.30 ],
	grass: [ 0.46, 0.45, 0.34 ],
	rock: [ 0.52, 0.50, 0.46 ],
	wood: [ 0.52, 0.44, 0.34 ],
};

const _vel = new Vector3();
const _fwd = new Vector3();

// Surface dust plumes and shallow-water/wet-road spray emitted by land vehicles.
// Dry dust renders in one instanced billboard mesh; wet splatter reuses Spray.js GPU emitters.
export class VehicleFX {

	constructor( { spray = null, vehicles = null, terrain = null } = {} ) {

		this.spray = spray;
		this.vehicles = vehicles;
		this.terrain = terrain;

		this.posArr = new Float32Array( MAX_DUST * 4 );
		this.colArr = new Float32Array( MAX_DUST * 4 );
		this.posBuf = new StorageBuffer( { label: 'vehicleDustPos', count: MAX_DUST, type: 'vec4f', data: this.posArr } );
		this.colBuf = new StorageBuffer( { label: 'vehicleDustCol', count: MAX_DUST, type: 'vec4f', data: this.colArr } );

		this.particles = [];
		this._head = 0;
		for ( let i = 0; i < MAX_DUST; i ++ ) {

			this.particles.push( {
				alive: false,
				x: 0, y: - 1000, z: 0,
				vx: 0, vy: 0, vz: 0,
				size: 0.2, growth: 0.4,
				age: 0, life: 1,
				alpha0: 0,
				r: 0.7, g: 0.6, b: 0.45,
			} );
			this.posArr[ i * 4 + 1 ] = - 1e4;

		}

		// WGSL rule: avoid local variable names s, in, v, o, r
		const mat = new Material( {
			name: 'VehicleDust',
			lit: false,
			transparent: true,
			depthWrite: false,
			depthTest: true,
			side: 'double',
			blending: 'premultiplied',
			storage: {
				dustPos: this.posBuf,
				dustCol: this.colBuf,
			},
			varyings: {
				vDustCol: 'vec4f',
				vDustUV: 'vec2f',
			},
			vertex: /* wgsl */`
	let dp = dustPos[ v.instance ];
	let dc = dustCol[ v.instance ];
	let rad = dp.w;
	let alive = dc.a > 0.002 && rad > 0.002;
	let pCenter = dp.xyz;
	let toCam = frame.cameraPos - pCenter;
	let dLen = max( length( toCam ), 0.05 );
	let lookV = toCam / dLen;
	let sideV = normalize( cross( vec3f( 0.0, 1.0, 0.0 ), lookV ) + vec3f( 1e-5, 0.0, 0.0 ) );
	let upV = cross( lookV, sideV );
	let qv = v.position.xy;
	let worldP = pCenter + sideV * ( qv.x * rad ) + upV * ( qv.y * rad );
	let sunVis = max( frame.sunDir.y, 0.0 );
	let lit = frame.sunColor * ( 0.35 + 0.65 * sunVis ) + frame.skyIrradiance * 0.8;
	o.vDustCol = vec4f( dc.rgb * lit, dc.a );
	o.vDustUV = qv;
	v.useWorld = true;
	v.worldPos = select( vec3f( 0.0, -1e5, 0.0 ), worldP, alive );
	v.worldNormal = lookV;
`,
			surface: /* wgsl */`
	let duv = in.vs.vDustUV;
	let d2 = dot( duv, duv );
	let soft = exp( - d2 * 3.6 ) * smoothstep( 1.0, 0.2, d2 );
	let alp = clamp( in.vs.vDustCol.a * soft, 0.0, 0.82 );
	if ( alp < 0.002 ) { discard; }
	s.albedo = in.vs.vDustCol.rgb * alp;
	s.emissive = vec3f( 0.0 );
	s.alpha = alp;
`,
			output: 'r.color = vec4f( s.albedo, s.alpha );',
		} );

		const geo = new PlaneGeometry( 2, 2 );
		geo.instanceCount = MAX_DUST;
		this.material = mat;
		this.mesh = new Mesh( geo, mat );
		this.mesh.name = 'VehicleDust';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.renderOrder = 21;
		this.mesh.layers.set( LAYERS.TRANSPARENT );
		this.mesh.visible = false;

		this._emitAcc = 0;

	}

	_spawnDust( x, y, z, vx, vy, vz, size, growth, life, alpha0, tint ) {

		const p = this.particles[ this._head ];
		this._head = ( this._head + 1 ) % MAX_DUST;
		p.alive = true;
		p.x = x; p.y = y; p.z = z;
		p.vx = vx; p.vy = vy; p.vz = vz;
		p.size = size;
		p.growth = growth;
		p.age = 0;
		p.life = life;
		p.alpha0 = alpha0;
		p.r = tint[ 0 ]; p.g = tint[ 1 ]; p.b = tint[ 2 ];

	}

	update( dt ) {

		const clampedDt = Math.min( Math.max( dt, 0 ), 0.1 );
		const wetness = G && G.weather ? G.weather.value.y : 0;
		const windX = G && G.windDir ? G.windDir.value.x * G.windSpeed.value * 0.25 : 0;
		const windZ = G && G.windDir ? G.windDir.value.y * G.windSpeed.value * 0.25 : 0;

		if ( this.vehicles ) {

			for ( const vh of this.vehicles.vehicles ) {

				if ( vh.airborne ) continue;
				const spd = vh.speed || 0;
				const drift = vh.driftAmount || 0;
				if ( spd < 1.6 && drift < 0.2 ) continue;

				const wheels = vh.rearWheelWorlds && vh.rearWheelWorlds.length ? vh.rearWheelWorlds : [ vh.rearWheelWorld || vh.position ];
				vh.forward( _fwd );
				const rate = spd * ( 1.4 + drift * 2.8 ) * ( vh.surface === 'sand' ? 1.45 : vh.surface === 'path' ? 1.1 : 0.7 ) * ( wheels.length > 1 ? 1.25 : 1.0 );
				vh._fxEmitAcc = Math.min( 12, ( vh._fxEmitAcc || 0 ) + rate * clampedDt );

				const emitWater = ( vh.waterDepth > 0.03 || ( wetness > 0.35 && spd > 4.2 ) ) && this.spray;
				const emitDry = wetness < 0.55 && vh.waterDepth <= 0.03 && vh.surface !== 'wood';

				const count = Math.floor( vh._fxEmitAcc );
				if ( count > 0 ) {

					vh._fxEmitAcc -= count;
					if ( emitWater ) {

						const nTotal = Math.min( 10, count + Math.round( drift * 4 ) );
						const perWheel = Math.max( 1, Math.ceil( nTotal / wheels.length ) );
						_vel.set(
							- _fwd.x * spd * 0.22 + ( Math.random() - 0.5 ) * 1.4,
							1.5 + spd * 0.16,
							- _fwd.z * spd * 0.22 + ( Math.random() - 0.5 ) * 1.4
						);
						for ( const wheelPos of wheels ) {

							this.spray.emit( wheelPos, _vel, perWheel, 0.045, SPRAY.DROPLET, { spread: 1.5, jitter: 0.16, life: 0.7 } );
							if ( vh.waterDepth > 0.05 ) {

								this.spray.emit( wheelPos, _vel, Math.ceil( perWheel * 0.6 ), 0.18, SPRAY.SPRAY, { spread: 1.8, jitter: 0.2, life: 0.9 } );

							}

						}

					} else if ( emitDry ) {

						const tint = SURFACE_TINTS[ vh.surface ] || SURFACE_TINTS.path;
						const dryMul = 1 - wetness * 1.3;
						const puffs = Math.min( 6, count );
						for ( let k = 0; k < puffs; k ++ ) {

							const a = 0.22 * dryMul * Math.min( 1, spd / 10 + drift * 0.6 );
							if ( a < 0.02 ) continue;
							const wheelPos = wheels[ k % wheels.length ];
							this._spawnDust(
								wheelPos.x + ( Math.random() - 0.5 ) * 0.28,
								wheelPos.y + 0.08 + Math.random() * 0.12,
								wheelPos.z + ( Math.random() - 0.5 ) * 0.28,
								- _fwd.x * spd * 0.14 + ( Math.random() - 0.5 ) * 1.2 + windX * 0.4,
								0.45 + Math.random() * 0.65 + drift * 0.5,
								- _fwd.z * spd * 0.14 + ( Math.random() - 0.5 ) * 1.2 + windZ * 0.4,
								0.18 + Math.random() * 0.12,
								0.65 + drift * 0.4,
								0.75 + Math.random() * 0.7,
								a,
								tint
							);

						}

					}

				}

			}

		}

		let anyAlive = false;
		const drag = Math.exp( - clampedDt * 1.8 );
		for ( let i = 0; i < MAX_DUST; i ++ ) {

			const p = this.particles[ i ];
			const o = i * 4;
			if ( ! p.alive ) {

				this.posArr[ o + 1 ] = - 1e4;
				this.posArr[ o + 3 ] = 0;
				this.colArr[ o + 3 ] = 0;
				continue;

			}

			p.age += clampedDt;
			if ( p.age >= p.life ) {

				p.alive = false;
				this.posArr[ o + 1 ] = - 1e4;
				this.posArr[ o + 3 ] = 0;
				this.colArr[ o + 3 ] = 0;
				continue;

			}

			anyAlive = true;
			const f = p.age / p.life;
			p.vx = p.vx * drag + windX * clampedDt * 1.2;
			p.vz = p.vz * drag + windZ * clampedDt * 1.2;
			p.vy *= drag;
			p.x += p.vx * clampedDt;
			p.y += p.vy * clampedDt;
			p.z += p.vz * clampedDt;
			p.size += p.growth * clampedDt;

			const fadeIn = Math.min( 1, f / 0.15 );
			const fadeOut = Math.max( 0, 1 - ( f - 0.15 ) / 0.85 );
			const alpha = p.alpha0 * fadeIn * fadeOut * fadeOut;

			this.posArr[ o ] = p.x;
			this.posArr[ o + 1 ] = p.y;
			this.posArr[ o + 2 ] = p.z;
			this.posArr[ o + 3 ] = p.size;

			this.colArr[ o ] = p.r;
			this.colArr[ o + 1 ] = p.g;
			this.colArr[ o + 2 ] = p.b;
			this.colArr[ o + 3 ] = alpha;

		}

		this.mesh.visible = anyAlive;
		if ( anyAlive ) {

			this.posBuf.write( this.posArr );
			this.colBuf.write( this.colArr );

		}

	}

}
