import {
	BoxGeometry,
	Color,
	CylinderGeometry,
	Group,
	MathUtils,
	Mesh,
	RoundedBoxGeometry,
	SphereGeometry,
	TorusGeometry,
	Vector3,
} from '../engine/index.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';
import { GeoKit, alignY, mat4, mergePrepared, prepare } from '../world/boat/GeoKit.js';
import { Material } from '../engine/render/Material.js';
import { physical, standard } from '../materials/Materials.js';
import { VEHICLE_PAINTS, VEHICLE_LIGHT_TINTS } from './Vehicle.js';

const WHEELBASE = 2.38;
const HALF_WB = WHEELBASE * 0.5; // 1.19 m
const HALF_TRACK = 0.78; // 1.56 m track width
const WHEEL_RADIUS = 0.42;

const COL = {
	coral: 0xd96848,
	cream: 0xf1e6cf,
	teal: 0x267f7c,
	frame: 0x23272c,
	steel: 0x5c636b,
	alloy: 0xa2aab2,
	tire: 0x1d1f21,
	leather: 0x623b22,
	wood: 0x8f6b47,
	cooler: 0x359691,
	lid: 0xf0eadc,
	helmet: 0xeee5cf,
	shirt: 0x2f5f63,
	shorts: 0xb99d73,
	skin: 0xd29c76,
};

function makePBR( isPaint ) {

	const base = {
		vertexColors: true,
		attributes: { aux: 'vec4f' },
		varyings: { vAux: 'vec4f' },
		vertex: 'o.vAux = v.aux;',
		...( isPaint ? {
			uniforms: {
				paintColor: [ 'vec3f', new Vector3( 1, 1, 1 ) ],
				paintReplace: [ 'f32', 0 ],
			},
		} : {} ),
		// WGSL rule: never declare locals named s, in, v, o, or r
		surface: isPaint ? /* wgsl */`
	let pAux = in.vs.vAux;
	let baseC = in.color.rgb;
	let mxC = max( baseC.r, max( baseC.g, baseC.b ) );
	let mnC = min( baseC.r, min( baseC.g, baseC.b ) );
	let satC = ( mxC - mnC ) / max( mxC, 0.001 );
	let maskC = smoothstep( 0.42, 0.62, satC ) * mat.paintReplace;
	s.albedo = mix( baseC, mat.paintColor, maskC );
	s.roughness = pAux.x;
	s.metalness = pAux.y;
` : /* wgsl */`
	let pAux = in.vs.vAux;
	s.albedo = in.color.rgb;
	s.roughness = pAux.x;
	s.metalness = pAux.y;
`,
	};
	const m = isPaint
		? physical( { clearcoat: 0.88, clearcoatRoughness: 0.12, roughness: 0.24, metalness: 0.08, ...base } )
		: standard( { roughness: 0.52, metalness: 0.35, ...base } );
	m.name = isPaint ? 'buggyPaint' : 'buggyParts';
	return m;

}

const _paintTmp = new Color();

function makeHeadlightBeamMaterial( name ) {

	return new Material( {
		name,
		lit: false,
		transparent: true,
		blending: 'additive',
		depthWrite: false,
		side: 'double',
		uniforms: {
			beamColor: [ 'vec3f', new Vector3( 1.0, 0.91, 0.72 ) ],
			beamAlpha: [ 'f32', 0 ],
		},
		// WGSL rule: never declare locals s, in, v, o, or r
		surface: /* wgsl */`
	let uAx = clamp( 1.0 - in.uv.y, 0.0, 1.0 );
	let axial = smoothstep( 0.0, 0.05, uAx ) * pow( 1.0 - uAx, 1.85 );
	let fres = pow( abs( dot( normalize( in.N ), normalize( in.V ) ) ), 1.65 );
	let alp = clamp( axial * fres * 0.26 * mat.beamAlpha, 0.0, 0.52 );
	if ( alp < 0.002 ) { discard; }
	s.albedo = mat.beamColor * ( 1.35 * mat.beamAlpha );
	s.emissive = vec3f( 0.0 );
	s.alpha = alp;
`,
	} );

}

function addPart( parent, name, geometry, material, { pos = null, rot = null, cast = true, receive = true } = {} ) {

	const m = new Mesh( geometry, material );
	m.name = name;
	if ( pos ) m.position.copy( pos );
	if ( rot ) m.rotation.set( rot[ 0 ] || 0, rot[ 1 ] || 0, rot[ 2 ] || 0 );
	m.castShadow = cast;
	m.receiveShadow = receive;
	parent.add( m );
	return m;

}

function buildBuggyWheelGeom( radius = WHEEL_RADIUS ) {

	const tireTube = 0.13;
	const rimRadius = radius - tireTube * 0.9;
	const parts = [];

	// Wide Baja tire carcass in YZ plane (+X axle)
	parts.push( prepare( new TorusGeometry( rimRadius, tireTube, 14, 28 ), {
		color: COL.tire, rough: 0.92, metal: 0.02,
		matrix: mat4( 0, 0, 0, 0, Math.PI * 0.5, 0 ),
	} ) );
	parts.push( prepare( new CylinderGeometry( rimRadius * 0.96, rimRadius * 0.96, tireTube * 1.45, 24 ), {
		color: COL.tire, rough: 0.9, metal: 0.04,
		matrix: mat4( 0, 0, 0, 0, 0, Math.PI * 0.5 ),
	} ) );

	// Tread lugs
	const lugs = 16;
	for ( let i = 0; i < lugs; i ++ ) {

		const a = ( i / lugs ) * Math.PI * 2;
		const r = radius - 0.008;
		parts.push( prepare( new BoxGeometry( tireTube * 1.65, 0.032, 0.068 ), {
			color: COL.tire, rough: 0.94, metal: 0.02,
			matrix: mat4( 0, Math.cos( a ) * r, Math.sin( a ) * r, - a, 0, 0 ),
		} ) );

	}

	// Beadlock alloy wheel dish & hub bolts
	parts.push( prepare( new CylinderGeometry( rimRadius * 0.72, rimRadius * 0.72, 0.19, 16 ), {
		color: COL.alloy, rough: 0.34, metal: 0.84,
		matrix: mat4( 0, 0, 0, 0, 0, Math.PI * 0.5 ),
	} ) );
	parts.push( prepare( new CylinderGeometry( 0.075, 0.085, 0.24, 12 ), {
		color: COL.frame, rough: 0.45, metal: 0.72,
		matrix: mat4( 0, 0, 0, 0, 0, Math.PI * 0.5 ),
	} ) );
	return mergePrepared( parts );

}

// Procedural 4x4 Coastal Buggy / Mini-Pickup model:
// tubular roll cage, roof LED rally light bar, wooden flatbed with cooler & spare wheel,
// articulated steered front wheels, 4 spinning off-road tires, steering wheel & driver.
export class BuggyModel {

	constructor() {

		this.paintMat = makePBR( true );
		this.partsMat = makePBR( false );
		this.headlightMat = standard( { color: 0xfff4d6, emissive: 0xffefc2, emissiveIntensity: 0.04, roughness: 0.15, metalness: 0.1 } );
		this.headlightMat.name = 'buggyHeadlight';
		this.ledBarMat = standard( { color: 0xe6f2ff, emissive: 0xfff8e4, emissiveIntensity: 0.05, roughness: 0.15, metalness: 0.1 } );
		this.ledBarMat.name = 'buggyLedBar';
		this.taillightMat = standard( { color: 0x701010, emissive: 0xff2214, emissiveIntensity: 0.08, roughness: 0.18, metalness: 0.05 } );
		this.taillightMat.name = 'buggyTaillight';

		this.group = new Group();
		this.group.name = 'CoastalBuggy';

		this.bodyPivot = new Group();
		this.bodyPivot.name = 'buggyBodyPivot';
		this.group.add( this.bodyPivot );

		this.chassisGroup = new Group();
		this.chassisGroup.name = 'buggyChassis';
		this.bodyPivot.add( this.chassisGroup );

		// Local lighting anchors matching LocalLights (direction +Z slightly downward)
		this.headlightLocal = new Vector3( 0, 0.86, 1.72 );
		this.headlightDirLocal = new Vector3( 0, - 0.14, 0.99 ).normalize();
		this.taillightLocal = new Vector3( 0, 0.86, - 1.70 );

		this._buildBody();
		this._buildWheels();
		this._buildDriver();

	}

	_buildBody() {

		const kit = new GeoKit();
		const P = ( geo, color, rough = 0.24, metal = 0.08, m = null ) => kit.add( 'paint', geo, { color, rough, metal, matrix: m } );
		const M = ( geo, color, rough = 0.50, metal = 0.60, m = null ) => kit.add( 'parts', geo, { color, rough, metal, matrix: m } );
		const limb = ( a, b, rad, c = COL.frame ) => {

			const pA = new Vector3( ...a ), pB = new Vector3( ...b );
			const mid = pA.clone().add( pB ).multiplyScalar( 0.5 );
			const dir = pB.clone().sub( pA );
			M( new CylinderGeometry( rad, rad, dir.length(), 10 ), c, 0.42, 0.72, alignY( mid, dir ) );

		};

		// Chassis tub & steel skid rails
		M( new BoxGeometry( 1.24, 0.14, 2.96 ), COL.frame, 0.55, 0.65, mat4( 0, 0.44, - 0.06 ) );
		M( new BoxGeometry( 0.96, 0.08, 0.55 ), COL.steel, 0.36, 0.85, mat4( 0, 0.43, 1.46, 0.35, 0, 0 ) );

		// Painted coral hood, side panels & cream racing stripe
		P( new RoundedBoxGeometry( 1.28, 0.34, 0.96, 2, 0.06 ), COL.coral, 0.22, 0.1, mat4( 0, 0.76, 1.14, 0.08, 0, 0 ) );
		P( new BoxGeometry( 0.42, 0.025, 0.92 ), COL.cream, 0.24, 0.06, mat4( 0, 0.935, 1.15, 0.08, 0, 0 ) );
		// Grille bezel
		M( new BoxGeometry( 1.02, 0.24, 0.06 ), COL.frame, 0.5, 0.5, mat4( 0, 0.72, 1.62 ) );
		for ( const sx of [ - 1, 1 ] ) {

			// Flared beach fenders over all 4 wheels
			P( new BoxGeometry( 0.34, 0.07, 0.74 ), COL.cream, 0.28, 0.05, mat4( sx * 0.76, 0.96, HALF_WB ) );
			P( new BoxGeometry( 0.34, 0.07, 0.74 ), COL.cream, 0.28, 0.05, mat4( sx * 0.76, 0.98, - HALF_WB ) );
			// Low beach sills
			P( new BoxGeometry( 0.14, 0.26, 1.18 ), COL.coral, 0.24, 0.08, mat4( sx * 0.66, 0.62, 0.10 ) );

		}

		// Open-air cabin dashboard, bucket seats & rear timber cargo bed
		M( new BoxGeometry( 1.18, 0.26, 0.24 ), COL.frame, 0.55, 0.2, mat4( 0, 0.88, 0.62 ) );
		for ( const sx of [ - 0.36, 0.36 ] ) {

			M( new RoundedBoxGeometry( 0.44, 0.12, 0.44, 2, 0.04 ), COL.leather, 0.72, 0.04, mat4( sx, 0.58, - 0.02 ) );
			M( new RoundedBoxGeometry( 0.42, 0.58, 0.12, 2, 0.04 ), COL.leather, 0.72, 0.04, mat4( sx, 0.86, - 0.22, - 0.18, 0, 0 ) );

		}

		// Rear slatted timber cargo bed
		M( new BoxGeometry( 1.30, 0.08, 1.24 ), COL.frame, 0.52, 0.6, mat4( 0, 0.68, - 1.06 ) );
		for ( let k = - 2; k <= 2; k ++ ) {

			M( new BoxGeometry( 0.21, 0.03, 1.18 ), COL.wood, 0.82, 0.02, mat4( k * 0.24, 0.735, - 1.06 ) );

		}

		// Bed side rails & tailgate
		P( new BoxGeometry( 1.32, 0.28, 0.08 ), COL.coral, 0.24, 0.08, mat4( 0, 0.84, - 1.66 ) );
		for ( const sx of [ - 1, 1 ] ) {

			P( new BoxGeometry( 0.08, 0.28, 1.24 ), COL.coral, 0.24, 0.08, mat4( sx * 0.64, 0.84, - 1.06 ) );

		}

		// Strapped insulated cooler & fishing rod tubes inside cargo bed
		M( new RoundedBoxGeometry( 0.58, 0.34, 0.42, 2, 0.03 ), COL.cooler, 0.38, 0.05, mat4( - 0.22, 0.91, - 0.86 ) );
		M( new RoundedBoxGeometry( 0.60, 0.06, 0.44, 2, 0.02 ), COL.lid, 0.35, 0.04, mat4( - 0.22, 1.09, - 0.86 ) );
		// Rear-mounted spare tire tilted on tailgate
		M( new TorusGeometry( 0.25, 0.09, 10, 22 ), COL.tire, 0.92, 0.02, mat4( 0.32, 0.96, - 1.46, 0.28, 0, 0 ) );
		M( new CylinderGeometry( 0.17, 0.17, 0.14, 12 ), COL.alloy, 0.36, 0.8, mat4( 0.32, 0.96, - 1.46, Math.PI * 0.5 + 0.28, 0, 0 ) );

		// Front tubular bull bar & skid bumper
		limb( [ - 0.64, 0.54, 1.68 ], [ 0.64, 0.54, 1.68 ], 0.032 );
		limb( [ - 0.54, 0.54, 1.68 ], [ - 0.42, 0.86, 1.68 ], 0.024 );
		limb( [ 0.54, 0.54, 1.68 ], [ 0.42, 0.86, 1.68 ], 0.024 );
		limb( [ - 0.42, 0.86, 1.68 ], [ 0.42, 0.86, 1.68 ], 0.024 );

		// 4-post tubular coastal roll cage over cabin
		for ( const sx of [ - 1, 1 ] ) {

			const cx = sx * 0.58;
			limb( [ cx, 0.86, 0.66 ], [ cx * 0.92, 1.68, 0.28 ], 0.026 ); // A-pillar
			limb( [ cx * 0.92, 1.68, 0.28 ], [ cx * 0.92, 1.68, - 0.42 ], 0.026 ); // Roof rail
			limb( [ cx * 0.92, 1.68, - 0.42 ], [ cx, 0.88, - 0.44 ], 0.026 ); // B-pillar
			limb( [ cx * 0.92, 1.68, - 0.42 ], [ cx, 0.94, - 1.15 ], 0.022 ); // Rear brace

		}

		limb( [ - 0.53, 1.68, 0.28 ], [ 0.53, 1.68, 0.28 ], 0.026 ); // Front roof header
		limb( [ - 0.53, 1.68, - 0.42 ], [ 0.53, 1.68, - 0.42 ], 0.026 ); // Rear roof header
		// Roof Rally LED bar housing
		M( new BoxGeometry( 0.84, 0.08, 0.10 ), COL.frame, 0.42, 0.7, mat4( 0, 1.75, 0.28 ) );

		// Headlight & taillight housings
		for ( const sx of [ - 0.54, 0.54 ] ) {

			M( new CylinderGeometry( 0.095, 0.10, 0.09, 14 ), COL.chrome || COL.alloy, 0.25, 0.85, mat4( sx, 0.76, 1.60, Math.PI * 0.5, 0, 0 ) );

		}

		for ( const key of [ 'paint', 'parts' ] ) {

			const geo = kit.merged( key );
			if ( ! geo ) continue;
			addPart( this.chassisGroup, 'buggy-' + key, geo, key === 'paint' ? this.paintMat : this.partsMat );

		}

		// Emissive front headlights, roof LED bar, & rear taillights
		for ( const sx of [ - 0.54, 0.54 ] ) {

			addPart( this.chassisGroup, 'buggy-headlamp-' + sx, new CylinderGeometry( 0.082, 0.082, 0.03, 14 ), this.headlightMat, {
				pos: new Vector3( sx, 0.76, 1.64 ),
				rot: [ Math.PI * 0.5, 0, 0 ],
				cast: false,
				receive: false,
			} );

		}

		addPart( this.chassisGroup, 'buggy-ledbar', new BoxGeometry( 0.78, 0.055, 0.04 ), this.ledBarMat, {
			pos: new Vector3( 0, 1.75, 0.33 ),
			cast: false,
			receive: false,
		} );

		// Twin volumetric headlight cones anchored at the front headlamps
		this.beamMat = makeHeadlightBeamMaterial( 'buggy-headlight-beam' );
		this.beamMesh = new Group();
		this.beamMesh.name = 'buggy-beams';
		this.beamMesh.position.set( 0, 0.76, 1.65 );
		this.beamMesh.rotation.x = Math.asin( 0.14 );
		this.beamMesh.visible = false;
		const coneGeo = new CylinderGeometry( 0.09, 1.72, 15.0, 20, 1, true );
		coneGeo.rotateX( - Math.PI * 0.5 );
		coneGeo.translate( 0, 0, 7.5 );
		for ( const sx of [ - 0.54, 0.54 ] ) {

			const m = addPart( this.beamMesh, 'buggy-beam-' + sx, coneGeo, this.beamMat, {
				pos: new Vector3( sx, 0, 0 ),
				cast: false,
				receive: false,
			} );
			m.layers.set( LAYERS.TRANSPARENT );
			m.frustumCulled = false;

		}

		this.chassisGroup.add( this.beamMesh );

		for ( const sx of [ - 0.54, 0.54 ] ) {

			addPart( this.chassisGroup, 'buggy-tail-' + sx, new BoxGeometry( 0.14, 0.065, 0.04 ), this.taillightMat, {
				pos: new Vector3( sx, 0.84, - 1.70 ),
				cast: false,
				receive: false,
			} );

		}

		// Steering wheel on left driver side (+X = +0.36)
		this.steerWheelPivot = new Group();
		this.steerWheelPivot.position.set( 0.36, 0.98, 0.44 );
		this.steerWheelPivot.rotation.x = 0.42;
		this.chassisGroup.add( this.steerWheelPivot );
		const swParts = [
			prepare( new TorusGeometry( 0.16, 0.02, 8, 20 ), { color: COL.frame, rough: 0.65, metal: 0.15 } ),
			prepare( new BoxGeometry( 0.28, 0.024, 0.015 ), { color: COL.alloy, rough: 0.35, metal: 0.8 } ),
		];
		addPart( this.steerWheelPivot, 'buggy-steerwheel', mergePrepared( swParts ), this.partsMat, { cast: false } );

	}

	_buildWheels() {

		const wheelGeom = buildBuggyWheelGeom( WHEEL_RADIUS );
		const buildWheel = ( name ) => {

			const steer = new Group();
			const hub = new Group();
			const mesh = new Mesh( wheelGeom, this.partsMat );
			mesh.name = name;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			hub.add( mesh );
			steer.add( hub );
			this.group.add( steer );
			return { steer, hub };

		};

		this.wheels = {
			fl: buildWheel( 'buggy-wheel-fl' ),
			fr: buildWheel( 'buggy-wheel-fr' ),
			rl: buildWheel( 'buggy-wheel-rl' ),
			rr: buildWheel( 'buggy-wheel-rr' ),
		};
		this.wheels.fl.steer.position.set( HALF_TRACK, WHEEL_RADIUS, HALF_WB );
		this.wheels.fr.steer.position.set( - HALF_TRACK, WHEEL_RADIUS, HALF_WB );
		this.wheels.rl.steer.position.set( HALF_TRACK, WHEEL_RADIUS, - HALF_WB );
		this.wheels.rr.steer.position.set( - HALF_TRACK, WHEEL_RADIUS, - HALF_WB );

	}

	_buildDriver() {

		this.driverGroup = new Group();
		this.driverGroup.name = 'buggyDriver';
		this.driverGroup.position.set( 0.36, 0.62, - 0.02 );
		this.driverGroup.visible = false;
		this.chassisGroup.add( this.driverGroup );

		const parts = [];
		const limb = ( a, b, rad, c ) => {

			const pA = new Vector3( ...a ), pB = new Vector3( ...b );
			const mid = pA.clone().add( pB ).multiplyScalar( 0.5 );
			const dir = pB.clone().sub( pA );
			parts.push( prepare( new CylinderGeometry( rad, rad, dir.length(), 8 ), { color: c, rough: 0.72, metal: 0.02, matrix: alignY( mid, dir ) } ) );

		};

		// Seated pelvis, torso, helmet & hands reaching wheel
		parts.push( prepare( new RoundedBoxGeometry( 0.34, 0.42, 0.22, 2, 0.05 ), { color: COL.shirt, rough: 0.7, metal: 0.04, matrix: mat4( 0, 0.25, - 0.08, - 0.14, 0, 0 ) } ) );
		parts.push( prepare( new SphereGeometry( 0.12, 14, 10 ), { color: COL.helmet, rough: 0.25, metal: 0.1, matrix: mat4( 0, 0.62, - 0.10 ) } ) );
		parts.push( prepare( new SphereGeometry( 0.09, 10, 8 ), { color: COL.skin, rough: 0.7, metal: 0.0, matrix: mat4( 0, 0.58, - 0.04 ) } ) );
		for ( const sx of [ - 0.15, 0.15 ] ) {

			limb( [ sx, 0.38, - 0.06 ], [ sx * 0.9, 0.32, 0.38 ], 0.036, COL.skin );
			limb( [ sx * 0.85, 0.02, 0.06 ], [ sx * 0.95, 0.02, 0.48 ], 0.055, COL.shorts );

		}

		addPart( this.driverGroup, 'buggy-driver', mergePrepared( parts ), this.partsMat );

	}

	setRiderVisible( visible ) {

		if ( this.driverGroup ) this.driverGroup.visible = !! visible;

	}

	setState( state = {} ) {

		const steerAngle = state.steerAngle || 0;
		const spin = state.wheelSpin || 0;

		this.wheels.fl.steer.rotation.y = steerAngle;
		this.wheels.fr.steer.rotation.y = steerAngle;
		this.wheels.fl.hub.rotation.x = spin;
		this.wheels.fr.hub.rotation.x = spin;
		this.wheels.rl.hub.rotation.x = spin;
		this.wheels.rr.hub.rotation.x = spin;

		this.wheels.fl.steer.position.y = WHEEL_RADIUS + ( state.compFL || 0 );
		this.wheels.fr.steer.position.y = WHEEL_RADIUS + ( state.compFR || 0 );
		this.wheels.rl.steer.position.y = WHEEL_RADIUS + ( state.compRL || 0 );
		this.wheels.rr.steer.position.y = WHEEL_RADIUS + ( state.compRR || 0 );

		// Sprung chassis pitch/roll relative to suspension travel
		this.bodyPivot.rotation.set( state.dynPitch || 0, 0, state.dynRoll || 0, 'YXZ' );
		const avgComp = ( ( state.compFL || 0 ) + ( state.compFR || 0 ) + ( state.compRL || 0 ) + ( state.compRR || 0 ) ) * 0.25;
		this.bodyPivot.position.y = avgComp;

		if ( this.steerWheelPivot ) this.steerWheelPivot.rotation.z = steerAngle * 2.1;

		const boost = state.ledBoost ? 1.75 : 1.0;
		this.headlightMat.emissiveIntensity = state.headlightOn ? 4.2 * boost : 0.04;
		this.ledBarMat.emissiveIntensity = state.headlightOn ? ( state.ledBoost ? 6.8 : 2.6 ) : 0.05;
		this.taillightMat.emissiveIntensity = state.brakeLight ? 4.4 : ( state.runningLight ? 0.9 : 0.06 );
		if ( this.beamMesh && this.beamMat ) {

			const weatherVis = Math.max( state.night || 0, ( state.rain || 0 ) * 0.75, ( state.storm || 0 ) * 0.9 );
			const visAlpha = 0.24 + 0.88 * weatherVis;
			this.beamMat.uniforms.beamAlpha.value = state.headlightOn ? visAlpha * ( state.ledBoost ? 1.45 : 1.0 ) : 0;
			this.beamMesh.visible = !! state.headlightOn;
			this.beamMesh.scale.set( state.ledBoost ? 1.18 : 1.0, state.ledBoost ? 1.18 : 1.0, state.ledBoost ? 1.28 : 1.0 );

		}

	}

	setPaint( id ) {

		const hex = VEHICLE_PAINTS[ id ];
		if ( ! this.paintMat?.uniforms ) return;
		if ( hex == null ) {

			this.paintMat.uniforms.paintReplace.value = 0;

		} else {

			_paintTmp.setHex( hex );
			this.paintMat.uniforms.paintColor.value.set( _paintTmp.r, _paintTmp.g, _paintTmp.b );
			this.paintMat.uniforms.paintReplace.value = 1;

		}

	}

	setLightTint( id ) {

		const t = VEHICLE_LIGHT_TINTS[ id ] || VEHICLE_LIGHT_TINTS.warm;
		_paintTmp.setHex( t.hex );
		this.headlightMat.color.copy( _paintTmp );
		this.headlightMat.emissive.copy( _paintTmp );
		this.ledBarMat.color.copy( _paintTmp );
		this.ledBarMat.emissive.copy( _paintTmp );
		if ( this.beamMat?.uniforms?.beamColor ) {

			this.beamMat.uniforms.beamColor.value.set( _paintTmp.r, _paintTmp.g, _paintTmp.b );

		}

	}

}
