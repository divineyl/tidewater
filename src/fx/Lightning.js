import { Material } from '../engine/render/Material.js';
import { Mesh } from '../engine/scene/Mesh.js';
import { PlaneGeometry } from '../engine/geometry/index.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';
import { Vector3, MathUtils } from '../engine/math/index.js';

// Procedural lightning bolts, internal cloud illumination, and distance-delayed thunder triggers.
export class Lightning {

	constructor( { clouds = null, onThunder = null } = {} ) {

		this.clouds = clouds;
		this.onThunder = onThunder;

		this.pos = new Vector3( 0, 0, - 900 );
		this.cloudPos = new Vector3( 0, 1200, - 900 );
		this.flash = 0;
		this.boltAlpha = 0;
		this.cloudLight = [ 0, 0, 0, 0 ];

		this._timer = 7 + Math.random() * 10;
		this._active = null;
		this._thunders = [];

		const mat = new Material( {
			name: 'LightningBolt',
			lit: false,
			transparent: true,
			blending: 'add',
			depthWrite: false,
			depthTest: true,
			side: 'double',
			varyings: { vBoltUV: 'vec2f' },
			uniforms: {
				boltPos: [ 'vec3f', new Vector3( 0, 0, - 900 ) ],
				boltTop: [ 'f32', 1100 ],
				boltAlpha: [ 'f32', 0 ],
				boltSeed: [ 'f32', 1 ],
			},
			vertex: /* wgsl */`
	let toCam = frame.cameraPos.xz - mat.boltPos.xz;
	let dist = max( length( toCam ), 1.0 );
	let fwd = toCam / dist;
	let right = vec3f( -fwd.y, 0.0, fwd.x );
	let hSpan = max( mat.boltTop, 600.0 );
	let wSpan = hSpan * 0.42;
	let world = vec3f( mat.boltPos.x, 0.0, mat.boltPos.z )
		+ right * ( v.position.x * wSpan )
		+ vec3f( 0.0, ( v.position.y * 0.5 + 0.5 ) * hSpan, 0.0 );
	o.vBoltUV = vec2f( v.position.x, v.position.y * 0.5 + 0.5 );
	v.useWorld = true;
	v.worldPos = select( vec3f( 0.0, -1e5, 0.0 ), world, mat.boltAlpha > 0.005 );
	v.worldNormal = vec3f( fwd.x, 0.0, fwd.y );
`,
			surface: /* wgsl */`
	if ( mat.boltAlpha <= 0.005 ) { discard; }
	let uv = in.vs.vBoltUV;
	let y = uv.y;
	let sd = mat.boltSeed;

	// 1D piecewise-linear jagged offset for the main lightning channel
	let y1 = y * 10.0 + sd * 3.1;
	let i1 = floor( y1 ); let f1 = fract( y1 );
	let n1 = mix( fract( sin( i1 * 127.1 + sd * 17.0 ) * 43758.54 ) - 0.5,
		fract( sin( ( i1 + 1.0 ) * 127.1 + sd * 17.0 ) * 43758.54 ) - 0.5, f1 );
	let y2 = y * 28.0 + sd * 7.7;
	let i2 = floor( y2 ); let f2 = fract( y2 );
	let n2 = mix( fract( sin( i2 * 269.5 + sd * 31.0 ) * 43758.54 ) - 0.5,
		fract( sin( ( i2 + 1.0 ) * 269.5 + sd * 31.0 ) * 43758.54 ) - 0.5, f2 );

	let trunkX = n1 * 0.22 + n2 * 0.07 + ( 0.5 - y ) * ( fract( sin( sd * 91.3 ) * 1437.5 ) - 0.5 ) * 0.28;
	var d = abs( uv.x - trunkX );

	// two forked side branches
	let by1 = 0.42 + fract( sin( sd * 13.7 ) * 4375.5 ) * 0.35;
	if ( y < by1 && y > by1 - 0.38 ) {
		let dir1 = select( -1.0, 1.0, fract( sd * 3.7 ) > 0.5 );
		let bx1 = trunkX + dir1 * ( by1 - y ) * 0.55 + n2 * 0.06;
		d = min( d, abs( uv.x - bx1 ) * 1.45 + 0.002 );
	}
	let by2 = 0.25 + fract( sin( sd * 41.9 ) * 2911.3 ) * 0.4;
	if ( y < by2 && y > by2 - 0.3 ) {
		let dir2 = select( 1.0, -1.0, fract( sd * 5.3 ) > 0.5 );
		let bx2 = trunkX + dir2 * ( by2 - y ) * 0.48 + n1 * 0.05;
		d = min( d, abs( uv.x - bx2 ) * 1.65 + 0.003 );
	}

	let core = exp( -d * 210.0 ) * 22.0 + exp( -d * 32.0 ) * 3.2 + exp( -d * 7.5 ) * 0.35;
	let edgeMask = smoothstep( 1.0, 0.65, abs( uv.x ) ) * smoothstep( 1.0, 0.8, y ) * smoothstep( 0.0, 0.04, y );
	let col = vec3f( 0.76, 0.88, 1.0 ) * core * edgeMask * mat.boltAlpha;
	let a = clamp( core * edgeMask * mat.boltAlpha, 0.0, 1.0 );
	if ( a < 0.005 ) { discard; }
	s.albedo = vec3f( 0.0 );
	s.emissive = col;
	s.alpha = a;
`,
			output: 'r.color = vec4f( s.emissive, s.alpha );',
		} );

		this.material = mat;
		const geo = new PlaneGeometry( 2, 2 );
		this.mesh = new Mesh( geo, mat );
		this.mesh.name = 'LightningBolt';
		this.mesh.frustumCulled = false;
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.renderOrder = 23;
		this.mesh.layers.set( LAYERS.TRANSPARENT );
		this.mesh.visible = false;

	}

	triggerNow( camera, cloudAltitude = 1100 ) {

		const cam = camera ? camera.position : new Vector3();
		// Pick a strike point mostly forward/around the island horizon (450..2100 m away)
		let baseYaw = Math.random() * Math.PI * 2;
		if ( camera ) {

			const fwd = new Vector3();
			camera.getWorldDirection( fwd );
			baseYaw = Math.atan2( fwd.x, fwd.z ) + ( Math.random() - 0.5 ) * 0.85;

		}

		const dist = 550 + Math.random() * 1100;
		const x = cam.x + Math.sin( baseYaw ) * dist;
		const z = cam.z + Math.cos( baseYaw ) * dist;
		const topY = Math.max( 750, cloudAltitude + 250 );

		this.pos.set( x, 0, z );
		this.cloudPos.set( x, topY + 250, z );
		const seed = Math.random() * 100 + 1;

		const count = Math.random() < 0.65 ? 2 : ( Math.random() < 0.4 ? 3 : 1 );
		const pulses = [];
		let t0 = 0;
		for ( let i = 0; i < count; i ++ ) {

			const dur = 0.08 + Math.random() * 0.09;
			const peak = i === 0 ? 1.0 : 0.45 + Math.random() * 0.45;
			pulses.push( { start: t0, dur, peak } );
			t0 += dur + 0.05 + Math.random() * 0.11;

		}

		const strength = 0.65 + Math.random() * 0.5;
		this._active = { pulses, t: 0, total: t0 + 0.18, seed, topY, strength };

		this.material.uniforms.boltPos.value.copy( this.pos );
		this.material.uniforms.boltTop.value = topY;
		this.material.uniforms.boltSeed.value = seed;

		// Queue speed-of-sound delayed thunder
		const travel = MathUtils.clamp( dist / 343, 0.25, 7.5 );
		this._thunders.push( { t: travel, pos: this.pos.clone(), dist, strength } );

	}

	update( dt, camera, lightningRate = 0, cloudAltitude = 1100 ) {

		dt = Math.min( 0.1, Math.max( 0, dt ) );

		// ---- Delayed thunder events
		for ( let i = this._thunders.length - 1; i >= 0; i -- ) {

			const th = this._thunders[ i ];
			th.t -= dt;
			if ( th.t <= 0 ) {

				this._thunders.splice( i, 1 );
				if ( this.onThunder ) this.onThunder( th.pos, th.dist, th.strength );

			}

		}

		// ---- Random storm triggers
		if ( lightningRate > 0.02 ) {

			this._timer -= dt * lightningRate;
			if ( this._timer <= 0 ) {

				this.triggerNow( camera, cloudAltitude );
				this._timer = 7 + Math.random() * 12;

			}

		} else {

			this._timer = Math.min( this._timer, 4 + Math.random() * 6 );

		}

		// ---- Active bolt & flash envelope
		if ( this._active ) {

			const a = this._active;
			a.t += dt;
			let env = 0;
			for ( const p of a.pulses ) {

				if ( a.t >= p.start && a.t <= p.start + p.dur ) {

					const u = ( a.t - p.start ) / p.dur;
					env = Math.max( env, Math.sin( Math.min( 1, u * 4 ) * Math.PI * 0.5 ) * Math.exp( - u * 2.8 ) * p.peak );

				}

			}

			this.boltAlpha = env * a.strength;
			// Ambient/cloud flash decays slightly slower than the crisp bolt arc
			this.flash = Math.max( this.flash * Math.exp( - dt * 11 ), env * a.strength * 1.45 );
			if ( a.t >= a.total ) this._active = null;

		} else {

			this.boltAlpha = 0;
			this.flash *= Math.exp( - dt * 12 );
			if ( this.flash < 0.002 ) this.flash = 0;

		}

		this.material.uniforms.boltAlpha.value = this.boltAlpha;
		this.mesh.visible = this.boltAlpha > 0.005;
		const cloudGain = Math.max( this.flash * 3.8, this.boltAlpha * 2.4 );
		this.cloudLight[ 0 ] = this.cloudPos.x;
		this.cloudLight[ 1 ] = this.cloudPos.y;
		this.cloudLight[ 2 ] = this.cloudPos.z;
		this.cloudLight[ 3 ] = cloudGain;

	}

}
