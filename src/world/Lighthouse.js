import {
	BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute,
	Group, MathUtils, Matrix4, Mesh, SphereGeometry, TorusGeometry, Uint16BufferAttribute, Vector3,
} from '../engine/index.js';
import { mergeGeometries } from '../engine/geometry/BufferGeometryUtils.js';
import { Material } from '../engine/render/Material.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';
import { G } from '../engine/render/Frame.js';
import { WORLD } from './WorldLayout.js';

const _vA = new Vector3();

function transformGeom( geom, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {} ) {

	if ( sx !== 1 || sy !== 1 || sz !== 1 ) geom.scale( sx, sy, sz );
	if ( rx ) geom.rotateX( rx );
	if ( ry ) geom.rotateY( ry );
	if ( rz ) geom.rotateZ( rz );
	if ( x || y || z ) geom.translate( x, y, z );
	return geom;

}

// Normalize indexed geometry attributes (position, normal, uv) so mergeGeometries never mismatches.
function prepGeom( geom ) {

	geom.deleteAttribute( 'tangent' );
	geom.deleteAttribute( 'color' );
	if ( ! geom.getAttribute( 'uv' ) ) {

		const count = geom.getAttribute( 'position' ).count;
		geom.setAttribute( 'uv', new Float32BufferAttribute( new Float32Array( count * 2 ), 2 ) );

	}

	if ( geom.index && geom.index.array instanceof Uint32Array && geom.getAttribute( 'position' ).count < 65535 ) {

		geom.setIndex( new Uint16BufferAttribute( new Uint16Array( geom.index.array ), 1 ) );

	}

	return geom;

}

function buildPart( parts, material, name, castShadow = true, receiveShadow = true ) {

	const geom = mergeGeometries( parts.map( prepGeom ), false );
	geom.computeBoundingBox();
	geom.computeBoundingSphere();
	const mesh = new Mesh( geom, material );
	mesh.name = name;
	mesh.castShadow = castShadow;
	mesh.receiveShadow = receiveShadow;
	return mesh;

}

function createRingDiskGeometry( rInner, rOuter, radialSegments = 32 ) {

	const pos = [], nor = [], uv = [], idx = [];
	for ( let i = 0; i <= radialSegments; i ++ ) {

		const a = ( i / radialSegments ) * Math.PI * 2;
		const ca = Math.cos( a ), sa = Math.sin( a );
		pos.push( ca * rInner, 0, sa * rInner, ca * rOuter, 0, sa * rOuter );
		nor.push( 0, 1, 0, 0, 1, 0 );
		uv.push( i / radialSegments, 0, i / radialSegments, 1 );

	}

	for ( let i = 0; i < radialSegments; i ++ ) {

		const b = i * 2;
		idx.push( b, b + 1, b + 3, b, b + 3, b + 2 );

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'normal', new Float32BufferAttribute( nor, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	g.setIndex( idx );
	return g;

}

// Opposing twin beam cones along +Z and -Z rotated by -PI/2 around X so uv.y = 1 at the lens and 0 at the far tip.
function createTwinBeamGeometry( rNear = 0.42, rFar = 14.0, length = 124, pitchDown = 0.068 ) {

	const cones = [];
	for ( const dir of [ 1, - 1 ] ) {

		const cone = new CylinderGeometry( rNear, rFar, length, 24, 1, true );
		cone.rotateX( - Math.PI * 0.5 );
		cone.translate( 0, 0, length * 0.5 + 0.52 );
		cone.rotateX( pitchDown );
		if ( dir < 0 ) cone.rotateY( Math.PI );
		cones.push( cone );

	}

	const merged = mergeGeometries( cones.map( prepGeom ), false );
	merged.computeBoundingBox();
	merged.computeBoundingSphere();
	return merged;

}

// East Headland Lighthouse: coastal masonry tower, walkable stone plinth & stairs, iron gallery,
// glazed lantern house, spinning Fresnel optic and twin volumetric light shafts.
export class Lighthouse {

	constructor( { scene, terrain, colliders = null, village = null } = {} ) {

		const cfg = WORLD.lighthouse || { position: new Vector3( 296, 0, 122 ), padRadius: 11 };
		const lx = cfg.position.x, lz = cfg.position.z;
		const padR = cfg.padRadius || 11;
		const baseY = terrain.heightAt( lx, lz );

		// Flatten headland plateau BEFORE Vegetation / TerrainGPU / Rocks / Debris initialize
		terrain.flatten( lx, lz, padR, baseY, 7 );
		if ( village && village.footprints ) {

			village.footprints.push( { x: lx, z: lz, r: padR + 1.5 } );

		}

		this.position = new Vector3( lx, baseY, lz );
		this.baseY = baseY;
		this.angle = 0.55;
		this.spinSpeed = 0.62;
		this.beamDir = new Vector3( Math.sin( this.angle ), - 0.068, Math.cos( this.angle ) ).normalize();
		this.lanternPos = new Vector3( lx, baseY + 18.9, lz );

		this.group = new Group();
		this.group.name = 'Lighthouse';
		this.group.position.set( lx, baseY, lz );

		this.staticGroup = new Group();
		this.staticGroup.name = 'LighthouseStatic';
		this.group.add( this.staticGroup );

		this.rotorGroup = new Group();
		this.rotorGroup.name = 'LighthouseRotor';
		this.rotorGroup.position.set( 0, 18.9, 0 );
		this.rotorGroup.rotation.y = this.angle;
		this.group.add( this.rotorGroup );

		this._buildGeometry();
		this._buildColliders( colliders, lx, baseY, lz );

		this.group.updateMatrixWorld( true );
		if ( scene ) scene.add( this.group );

	}

	_buildGeometry() {

		// ---- materials (WGSL rule: avoid local variable names s, in, v, o, r)
		const stoneMat = new Material( {
			name: 'lighthouse-stone',
			roughness: 0.90,
			metalness: 0.0,
			surface: /* wgsl */`
	let wp = in.P;
	let gcoarse = sin( wp.x * 1.9 + wp.z * 0.7 ) * cos( wp.z * 1.7 - wp.y * 2.1 );
	let gfine = fract( sin( dot( floor( wp * 5.0 ), vec3f( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
	let course = abs( fract( wp.y * 2.4 ) - 0.5 );
	let mortar = smoothstep( 0.43, 0.49, course );
	let rainW = frame.weather.y;
	var stCol = mix( vec3f( 0.42, 0.39, 0.35 ), vec3f( 0.56, 0.52, 0.46 ), gfine * 0.6 + gcoarse * 0.2 + 0.2 );
	stCol = mix( stCol, vec3f( 0.27, 0.25, 0.22 ), mortar * 0.48 );
	stCol *= mix( 1.0, 0.68, rainW * 0.8 );
	s.albedo = stCol;
	s.roughness = mix( 0.90, 0.36, rainW * 0.75 );
`,
		} );

		const towerMat = new Material( {
			name: 'lighthouse-tower',
			roughness: 0.80,
			metalness: 0.0,
			surface: /* wgsl */`
	let uy = sat( in.uv.y );
	let stp = fract( sin( dot( floor( in.P * 6.0 ), vec3f( 19.3, 47.1, 83.7 ) ) ) * 19453.23 );
	// 5 alternating chalk-white and crimson coastal bands
	let bandIdx = floor( uy * 5.0 );
	let isRed = step( 0.5, bandIdx - floor( bandIdx * 0.5 ) * 2.0 );
	let whitePaint = vec3f( 0.90, 0.88, 0.83 ) * ( 0.93 + stp * 0.07 );
	let redPaint = vec3f( 0.68, 0.11, 0.09 ) * ( 0.90 + stp * 0.10 );
	let salt = smoothstep( 0.28, 0.0, uy ) * 0.14;
	let rainW = frame.weather.y;
	var tcol = mix( whitePaint, redPaint, isRed ) * ( 1.0 - salt );
	tcol *= mix( 1.0, 0.72, rainW * 0.75 );
	s.albedo = tcol;
	s.roughness = mix( 0.82, 0.32, rainW * 0.75 );
`,
		} );

		const woodMat = new Material( {
			name: 'lighthouse-wood',
			roughness: 0.84,
			metalness: 0.0,
			surface: /* wgsl */`
	let grain = fract( sin( floor( ( in.P.x + in.P.z ) * 14.0 ) * 12.9898 ) * 43758.5453 );
	let rainW = frame.weather.y;
	s.albedo = mix( vec3f( 0.24, 0.19, 0.14 ), vec3f( 0.36, 0.29, 0.22 ), grain * 0.65 ) * mix( 1.0, 0.65, rainW * 0.75 );
	s.roughness = mix( 0.86, 0.34, rainW * 0.7 );
`,
		} );

		const ironMat = new Material( {
			name: 'lighthouse-iron',
			roughness: 0.48,
			metalness: 0.68,
			surface: /* wgsl */`
	let rainW = frame.weather.y;
	s.albedo = vec3f( 0.11, 0.14, 0.16 );
	s.roughness = mix( 0.48, 0.20, rainW * 0.7 );
	s.metalness = 0.68;
`,
		} );

		const copperMat = new Material( {
			name: 'lighthouse-copper',
			roughness: 0.40,
			metalness: 0.74,
			surface: /* wgsl */`
	let pat = smoothstep( 0.35, 0.75, fract( sin( dot( floor( in.P * 3.0 ), vec3f( 12.7, 31.4, 57.1 ) ) ) * 9154.3 ) );
	s.albedo = mix( vec3f( 0.56, 0.14, 0.10 ), vec3f( 0.42, 0.20, 0.14 ), pat * 0.5 );
	s.roughness = 0.40;
	s.metalness = 0.74;
`,
		} );

		const warmWindowMat = new Material( {
			name: 'lighthouse-window',
			roughness: 0.16,
			metalness: 0.05,
			surface: /* wgsl */`
	let dusk = clamp( 0.18 + frame.night * 1.9 + frame.weather.z * 0.5, 0.18, 2.4 );
	s.albedo = vec3f( 0.14, 0.16, 0.18 );
	s.emissive = vec3f( 1.0, 0.76, 0.42 ) * dusk;
`,
		} );

		const glassRoomMat = new Material( {
			name: 'lighthouse-glass',
			lit: false,
			transparent: true,
			blending: 'normal',
			depthWrite: false,
			side: 'double',
			surface: /* wgsl */`
	let nv = abs( dot( normalize( in.N ), normalize( in.V ) ) );
	let rim = pow( 1.0 - clamp( nv, 0.0, 1.0 ), 2.2 );
	let warmGlow = 0.08 + frame.night * 0.22;
	s.albedo = mix( vec3f( 0.78, 0.90, 0.96 ), vec3f( 1.0, 0.88, 0.62 ), warmGlow );
	s.alpha = clamp( 0.14 + rim * 0.44, 0.14, 0.62 );
`,
		} );

		this.lensMat = new Material( {
			name: 'lighthouse-lens',
			roughness: 0.08,
			metalness: 0.1,
			uniforms: { beamStrength: [ 'f32', 0.25 ] },
			surface: /* wgsl */`
	let glow = 0.85 + mat.beamStrength * 6.5;
	s.albedo = vec3f( 1.0, 0.96, 0.84 );
	s.emissive = vec3f( 1.0, 0.90, 0.64 ) * glow;
`,
		} );

		this.beamMat = new Material( {
			name: 'lighthouse-beam',
			lit: false,
			transparent: true,
			blending: 'additive',
			depthWrite: false,
			side: 'double',
			uniforms: { beamStrength: [ 'f32', 0.25 ] },
			surface: /* wgsl */`
	// uv.y: 1.0 at lens, 0.0 at far cone tip
	let uAxial = clamp( 1.0 - in.uv.y, 0.0, 1.0 );
	let axial = smoothstep( 0.0, 0.035, uAxial ) * pow( 1.0 - uAxial, 1.85 );
	let fres = pow( abs( dot( normalize( in.N ), normalize( in.V ) ) ), 1.75 );
	let alp = clamp( axial * fres * 0.46 * mat.beamStrength, 0.0, 0.72 );
	if ( alp < 0.002 ) { discard; }
	s.albedo = vec3f( 1.0, 0.91, 0.68 ) * ( 1.45 * mat.beamStrength );
	s.emissive = vec3f( 0.0 );
	s.alpha = alp;
`,
		} );

		// ---- 1. Stone foundation plinth, NW steps & overlook posts
		const stoneParts = [];
		// Main octagonal masonry base (y = -2.2 .. 1.05 so it anchors firmly)
		stoneParts.push( transformGeom( new CylinderGeometry( 5.2, 5.8, 3.25, 8, 1 ), { y: - 0.575, ry: Math.PI / 8 } ) );
		stoneParts.push( transformGeom( new CylinderGeometry( 5.45, 5.45, 0.18, 8, 1 ), { y: 0.96, ry: Math.PI / 8 } ) );
		// NW entry staircase descending toward road arrival (-Z)
		stoneParts.push( transformGeom( new BoxGeometry( 2.8, 0.35, 0.9 ), { y: 0.87, z: - 5.15 } ) );
		stoneParts.push( transformGeom( new BoxGeometry( 2.8, 0.35, 0.9 ), { y: 0.52, z: - 5.95 } ) );
		stoneParts.push( transformGeom( new BoxGeometry( 2.8, 0.35, 0.9 ), { y: 0.17, z: - 6.75 } ) );
		// Staircheek low stone wing walls
		stoneParts.push( transformGeom( new BoxGeometry( 0.32, 0.85, 2.5 ), { x: - 1.56, y: 0.55, z: - 5.85 } ) );
		stoneParts.push( transformGeom( new BoxGeometry( 0.32, 0.85, 2.5 ), { x: 1.56, y: 0.55, z: - 5.85 } ) );
		// Upper tower stone cornice belt + gallery deck corbel base
		stoneParts.push( transformGeom( new CylinderGeometry( 2.75, 2.20, 0.42, 24, 1 ), { y: 17.26 } ) );
		stoneParts.push( transformGeom( new CylinderGeometry( 2.82, 2.75, 0.22, 24, 1 ), { y: 17.55 } ) );
		for ( let i = 0; i < 8; i ++ ) {

			const a = ( i / 8 ) * Math.PI * 2;
			stoneParts.push( transformGeom( new BoxGeometry( 0.26, 0.65, 0.68 ), {
				x: Math.sin( a ) * 2.34,
				y: 16.92,
				z: Math.cos( a ) * 2.34,
				ry: a,
			} ) );

		}

		// Coastal stone bollard posts around overlook perimeter (leave NW road opening gap)
		for ( let i = 0; i < 12; i ++ ) {

			const a = ( i / 12 ) * Math.PI * 2;
			const zPos = Math.cos( a );
			if ( zPos < - 0.78 ) continue; // open toward NW road entrance
			stoneParts.push( transformGeom( new CylinderGeometry( 0.14, 0.18, 0.92, 8, 1 ), {
				x: Math.sin( a ) * 9.1,
				y: 0.42,
				z: zPos * 9.1,
			} ) );

		}

		this.staticGroup.add( buildPart( stoneParts, stoneMat, 'lighthouse-stone' ) );

		// ---- 2. Tapered striped masonry tower (y = 1.05 .. 17.05)
		const towerParts = [
			transformGeom( new CylinderGeometry( 2.05, 3.18, 16.0, 32, 10 ), { y: 9.05 } ),
		];
		this.staticGroup.add( buildPart( towerParts, towerMat, 'lighthouse-tower' ) );

		// ---- 3. Coastal wood bench & keeper door panel
		const woodParts = [
			// Keeper's door on NW side (z < 0)
			transformGeom( new BoxGeometry( 1.08, 2.15, 0.24 ), { y: 2.12, z: - 3.04 } ),
			// Overlook bench on SW terrace
			transformGeom( new BoxGeometry( 1.9, 0.08, 0.52 ), { x: - 6.6, y: 0.46, z: 4.8, ry: 0.65 } ),
			transformGeom( new BoxGeometry( 0.12, 0.46, 0.44 ), { x: - 7.15, y: 0.23, z: 4.38, ry: 0.65 } ),
			transformGeom( new BoxGeometry( 0.12, 0.46, 0.44 ), { x: - 6.05, y: 0.23, z: 5.22, ry: 0.65 } ),
		];
		// Perimeter rope/timber rail connecting coastal overlook posts
		for ( let i = 0; i < 12; i ++ ) {

			const a0 = ( i / 12 ) * Math.PI * 2;
			const a1 = ( ( i + 1 ) / 12 ) * Math.PI * 2;
			const z0 = Math.cos( a0 ), z1 = Math.cos( a1 );
			if ( z0 < - 0.78 || z1 < - 0.78 ) continue;
			const x0 = Math.sin( a0 ) * 9.1, pz0 = z0 * 9.1;
			const x1 = Math.sin( a1 ) * 9.1, pz1 = z1 * 9.1;
			const mx = ( x0 + x1 ) * 0.5, mz = ( pz0 + pz1 ) * 0.5;
			const len = Math.hypot( x1 - x0, pz1 - pz0 );
			const yaw = Math.atan2( x1 - x0, pz1 - pz0 );
			woodParts.push( transformGeom( new BoxGeometry( 0.09, 0.09, len ), { x: mx, y: 0.76, z: mz, ry: yaw } ) );

		}

		this.staticGroup.add( buildPart( woodParts, woodMat, 'lighthouse-wood' ) );

		// ---- 4. Ironwork: door surround, window frames, gallery railing, lantern drum & mullions
		const ironParts = [];
		// Door frame + porthole casings
		ironParts.push( transformGeom( new BoxGeometry( 1.32, 2.28, 0.22 ), { y: 2.18, z: - 3.00 } ) );
		for ( const wy of [ 5.8, 9.6, 13.4 ] ) {

			const frac = ( wy - 1.05 ) / 16.0;
			const rAtY = MathUtils.lerp( 3.18, 2.05, frac );
			ironParts.push( transformGeom( new BoxGeometry( 0.74, 0.94, 0.24 ), { y: wy, z: - rAtY + 0.02 } ) );
			ironParts.push( transformGeom( new BoxGeometry( 0.74, 0.94, 0.24 ), { y: wy, z: rAtY - 0.02 } ) );

		}

		// Gallery railing at y = 17.66 .. 18.68
		for ( let i = 0; i < 16; i ++ ) {

			const a = ( i / 16 ) * Math.PI * 2;
			ironParts.push( transformGeom( new CylinderGeometry( 0.035, 0.04, 1.04, 6, 1 ), {
				x: Math.sin( a ) * 2.66,
				y: 18.18,
				z: Math.cos( a ) * 2.66,
			} ) );

		}

		ironParts.push( transformGeom( new TorusGeometry( 2.66, 0.04, 8, 32 ), { y: 18.68, rx: Math.PI * 0.5 } ) );
		ironParts.push( transformGeom( new TorusGeometry( 2.66, 0.03, 8, 32 ), { y: 18.18, rx: Math.PI * 0.5 } ) );
		// Lantern watch-room lower drum & cornice ring
		ironParts.push( transformGeom( new CylinderGeometry( 1.56, 1.58, 0.70, 24, 1 ), { y: 18.00 } ) );
		ironParts.push( transformGeom( new CylinderGeometry( 1.66, 1.66, 0.14, 24, 1 ), { y: 18.35 } ) );
		ironParts.push( transformGeom( new CylinderGeometry( 1.66, 1.66, 0.14, 24, 1 ), { y: 19.72 } ) );
		// 12 lantern vertical mullions
		for ( let i = 0; i < 12; i ++ ) {

			const a = ( i / 12 ) * Math.PI * 2;
			ironParts.push( transformGeom( new BoxGeometry( 0.07, 1.38, 0.07 ), {
				x: Math.sin( a ) * 1.54,
				y: 19.04,
				z: Math.cos( a ) * 1.54,
				ry: a,
			} ) );

		}

		this.staticGroup.add( buildPart( ironParts, ironMat, 'lighthouse-iron' ) );

		// ---- 5. Crimson-copper cupola dome & lightning spire
		const roofParts = [
			transformGeom( new CylinderGeometry( 0.18, 1.78, 1.35, 24, 2 ), { y: 20.42 } ),
			transformGeom( new SphereGeometry( 0.30, 14, 10 ), { y: 21.18 } ),
			transformGeom( new CylinderGeometry( 0.025, 0.055, 1.45, 8, 1 ), { y: 21.95 } ),
		];
		this.staticGroup.add( buildPart( roofParts, copperMat, 'lighthouse-cupola' ) );

		// ---- 6. Warm glazed porthole windows & door transom
		const winParts = [];
		winParts.push( transformGeom( new BoxGeometry( 0.86, 0.36, 0.08 ), { y: 3.16, z: - 3.10 } ) );
		for ( const wy of [ 5.8, 9.6, 13.4 ] ) {

			const frac = ( wy - 1.05 ) / 16.0;
			const rAtY = MathUtils.lerp( 3.18, 2.05, frac );
			winParts.push( transformGeom( new BoxGeometry( 0.56, 0.76, 0.08 ), { y: wy, z: - rAtY - 0.04 } ) );
			winParts.push( transformGeom( new BoxGeometry( 0.56, 0.76, 0.08 ), { y: wy, z: rAtY + 0.04 } ) );

		}

		this.staticGroup.add( buildPart( winParts, warmWindowMat, 'lighthouse-windows', false, false ) );

		// ---- 7. Lantern glass room (transparent pass)
		const glassGeom = prepGeom( transformGeom( new CylinderGeometry( 1.50, 1.50, 1.32, 24, 1, true ), { y: 19.04 } ) );
		const glassMesh = new Mesh( glassGeom, glassRoomMat );
		glassMesh.name = 'lighthouse-glass';
		glassMesh.castShadow = false;
		glassMesh.receiveShadow = false;
		glassMesh.layers.set( LAYERS.TRANSPARENT );
		this.staticGroup.add( glassMesh );

		// ---- 8. Rotating Fresnel optic + twin volumetric beam cones (inside rotorGroup)
		const lensParts = [
			new CylinderGeometry( 0.46, 0.46, 0.88, 16, 1 ),
			transformGeom( new CylinderGeometry( 0.36, 0.42, 0.28, 16, 1 ), { z: 0.44, rx: Math.PI * 0.5 } ),
			transformGeom( new CylinderGeometry( 0.36, 0.42, 0.28, 16, 1 ), { z: - 0.44, rx: - Math.PI * 0.5 } ),
		];
		const lensMesh = buildPart( lensParts, this.lensMat, 'lighthouse-fresnel', false, false );
		this.rotorGroup.add( lensMesh );

		const beamMesh = new Mesh( createTwinBeamGeometry( 0.42, 14.0, 124, 0.068 ), this.beamMat );
		beamMesh.name = 'lighthouse-beam';
		beamMesh.castShadow = false;
		beamMesh.receiveShadow = false;
		beamMesh.layers.set( LAYERS.TRANSPARENT );
		beamMesh.frustumCulled = false;
		this.rotorGroup.add( beamMesh );

	}

	_buildColliders( colliders, lx, baseY, lz ) {

		if ( ! colliders ) return;
		// Walkable plinth deck (top at baseY + 1.05)
		colliders.addBox( new Vector3( lx, baseY - 0.45, lz ), new Vector3( 4.4, 1.5, 4.4 ), 0, { walkable: true, solid: true, tag: 'lighthouse-plinth' } );
		// NW entry staircase treads facing toward the scenic road
		colliders.addBox( new Vector3( lx, baseY + 0.35, lz - 5.15 ), new Vector3( 1.4, 0.70, 0.48 ), 0, { walkable: true, solid: false, tag: 'lighthouse-step' } );
		colliders.addBox( new Vector3( lx, baseY + 0.18, lz - 5.95 ), new Vector3( 1.4, 0.52, 0.48 ), 0, { walkable: true, solid: false, tag: 'lighthouse-step' } );
		colliders.addBox( new Vector3( lx, baseY + 0.00, lz - 6.75 ), new Vector3( 1.4, 0.35, 0.48 ), 0, { walkable: true, solid: false, tag: 'lighthouse-step' } );
		// Solid tower trunk collider
		colliders.addCylinder( lx, lz, 3.25, baseY, baseY + 21, { tag: 'lighthouse-tower' } );

	}

	update( dt ) {

		this.angle = ( this.angle + dt * this.spinSpeed ) % ( Math.PI * 2 );
		this.rotorGroup.rotation.y = this.angle;
		this.beamDir.set( Math.sin( this.angle ), - 0.068, Math.cos( this.angle ) ).normalize();

		const night = G.night ? G.night.value : 0;
		const rain = G.weather ? G.weather.value.x : 0;
		const storm = G.weather ? G.weather.value.z : 0;
		const sunY = G.sunDir ? G.sunDir.value.y : 0.6;
		const sunLow = MathUtils.smoothstep( 0.32, - 0.04, sunY );
		const strength = 0.14 + sunLow * 0.45 + night * 0.85 + rain * 0.25 + storm * 0.35;
		this.beamMat.uniforms.beamStrength.value = strength;
		this.lensMat.uniforms.beamStrength.value = 0.5 + strength * 1.4;

	}

}

// Registers the Lighthouse lantern glow and rotating sweep spotlight in LocalLights.
export function addLighthouseLights( localLights, lighthouse ) {

	if ( ! localLights || ! lighthouse ) return;
	localLights.add( {
		position: lighthouse.lanternPos.clone(),
		color: new Color( 1.0, 0.86, 0.56 ),
		intensity: 10.0,
		range: 28,
		kind: 'lighthouseLantern',
	} );
	localLights.add( {
		position: lighthouse.lanternPos.clone(),
		color: new Color( 1.0, 0.91, 0.68 ),
		intensity: 34.0,
		range: 145,
		kind: 'lighthouseBeam',
		dir: lighthouse.beamDir.clone(),
		cosInner: 0.96,
		cosOuter: 0.86,
		update() {

			this.dir.copy( lighthouse.beamDir );

		},
	} );

}
