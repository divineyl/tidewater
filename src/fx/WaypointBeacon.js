import { CylinderGeometry, Group, Mesh } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';

// Translucent 3D waypoint light pillar + pulsing ground ring shown when a map waypoint is set.
export class WaypointBeacon {

	constructor( { scene = null, terrain = null } = {} ) {

		this.scene = scene;
		this.terrain = terrain;
		this.target = null;

		this.group = new Group();
		this.group.name = 'WaypointBeacon';
		this.group.visible = false;

		// WGSL rule: avoid local identifiers s, in, v, o, r
		this.pillarMat = new Material( {
			name: 'waypoint-pillar',
			lit: false,
			transparent: true,
			blending: 'additive',
			depthWrite: false,
			side: 'double',
			uniforms: { fade: [ 'f32', 1 ] },
			surface: /* wgsl */`
	let uy = clamp( 1.0 - in.uv.y, 0.0, 1.0 );
	let rise = smoothstep( 0.0, 0.04, uy ) * pow( 1.0 - uy, 1.65 );
	let shimmer = 0.78 + 0.22 * sin( in.uv.y * 28.0 + frame.time * 3.4 );
	let fres = pow( abs( dot( normalize( in.N ), normalize( in.V ) ) ), 1.35 );
	let alp = clamp( rise * fres * shimmer * 0.56 * mat.fade, 0.0, 0.78 );
	if ( alp < 0.002 ) { discard; }
	s.albedo = vec3f( 0.36, 0.94, 0.88 ) * ( 1.45 * mat.fade );
	s.emissive = vec3f( 0.0 );
	s.alpha = alp;
`,
		} );

		this.ringMat = new Material( {
			name: 'waypoint-ring',
			lit: false,
			transparent: true,
			blending: 'additive',
			depthWrite: false,
			side: 'double',
			uniforms: { fade: [ 'f32', 1 ] },
			surface: /* wgsl */`
	let pulse = 0.65 + 0.35 * sin( frame.time * 3.2 );
	let alp = clamp( 0.58 * pulse * mat.fade, 0.0, 0.8 );
	if ( alp < 0.002 ) { discard; }
	s.albedo = vec3f( 0.45, 0.96, 0.90 ) * ( 1.55 * mat.fade );
	s.emissive = vec3f( 0.0 );
	s.alpha = alp;
`,
		} );

		const pillarGeom = new CylinderGeometry( 0.52, 0.85, 76, 20, 1, true );
		pillarGeom.translate( 0, 38, 0 );
		const pillar = new Mesh( pillarGeom, this.pillarMat );
		pillar.name = 'waypoint-pillar-mesh';
		pillar.layers.set( LAYERS.TRANSPARENT );
		pillar.frustumCulled = false;

		const ringGeom = new CylinderGeometry( 2.8, 2.8, 0.16, 36, 1, true );
		ringGeom.translate( 0, 0.25, 0 );
		this.ringMesh = new Mesh( ringGeom, this.ringMat );
		this.ringMesh.name = 'waypoint-ring-mesh';
		this.ringMesh.layers.set( LAYERS.TRANSPARENT );

		this.group.add( pillar, this.ringMesh );
		if ( scene ) scene.add( this.group );

	}

	setTarget( x, z, terrainData = this.terrain ) {

		this.target = { x, z };
		const groundY = terrainData ? Math.max( 0.15, terrainData.heightAt( x, z ) ) : 0.15;
		this.group.position.set( x, groundY, z );
		this.group.visible = true;

	}

	clear() {

		this.target = null;
		this.group.visible = false;

	}

	update( dt, cameraPos ) {

		if ( ! this.target || ! this.group.visible ) return;
		const dist = cameraPos ? Math.hypot( cameraPos.x - this.target.x, cameraPos.z - this.target.z ) : 50;
		const t = Math.max( 0, Math.min( 1, ( dist - 6 ) / 16 ) );
		const fade = t * t * ( 3 - 2 * t );
		this.pillarMat.uniforms.fade.value = fade;
		this.ringMat.uniforms.fade.value = fade;
		this._t = ( this._t || 0 ) + dt;
		const pulseScale = 1 + 0.10 * Math.sin( this._t * 3.0 );
		this.ringMesh.scale.set( pulseScale, 1, pulseScale );

	}

}
