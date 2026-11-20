import {
	BoxGeometry,
	CatmullRomCurve3,
	CircleGeometry,
	Color,
	CylinderGeometry,
	Group,
	MathUtils,
	Mesh,
	RoundedBoxGeometry,
	SphereGeometry,
	TorusGeometry,
	TubeGeometry,
	Vector3,
} from '../engine/index.js';
import { LAYERS } from '../engine/render/SceneRenderer.js';
import { GeoKit, alignY, mat4, mergePrepared, prepare } from '../world/boat/GeoKit.js';
import { Material } from '../engine/render/Material.js';
import { physical, standard } from '../materials/Materials.js';
import { VEHICLE_PAINTS, VEHICLE_LIGHT_TINTS } from './Vehicle.js';

const RAKE = - 0.40; // ~23 deg steering head rake (top aft, axle forward)
const STEER_ORIGIN = new Vector3( 0, 0.87, 0.484 );
const SWINGARM_ORIGIN = new Vector3( 0, 0.34, - 0.18 );

// Coastal Scrambler colour palette (sRGB hex, linearized inside GeoKit.prepare)
const COL = {
	teal: 0x267f7c,
	cream: 0xf1e8d3,
	coral: 0xd96848,
	chrome: 0xd9dee2,
	alloy: 0x9aa2a8,
	frame: 0x22272c,
	engine: 0x3b4046,
	brass: 0xc29c52,
	tire: 0x1e2022,
	leather: 0x6f4024,
	leatherDark: 0x4d2a16,
	drybag: 0xd7c7a1,
	helmet: 0xeee5cf,
	jacket: 0x2d4a4c,
	pants: 0x8f7e62,
	boots: 0x3e271a,
	goggle: 0x1a2832,
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
		// Note: never name local variables s, in, v, o, or r in Material WGSL snippets
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
		? physical( { clearcoat: 0.92, clearcoatRoughness: 0.1, roughness: 0.22, metalness: 0.08, ...base } )
		: standard( { roughness: 0.5, metalness: 0.3, ...base } );
	m.name = isPaint ? 'motoPaint' : 'motoParts';
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
		// WGSL rule: never name locals s, in, v, o, or r
		surface: /* wgsl */`
	let uAx = clamp( 1.0 - in.uv.y, 0.0, 1.0 );
	let axial = smoothstep( 0.0, 0.05, uAx ) * pow( 1.0 - uAx, 1.85 );
	let fres = pow( abs( dot( normalize( in.N ), normalize( in.V ) ) ), 1.65 );
	let alp = clamp( axial * fres * 0.28 * mat.beamAlpha, 0.0, 0.55 );
	if ( alp < 0.002 ) { discard; }
	s.albedo = mat.beamColor * ( 1.35 * mat.beamAlpha );
	s.emissive = vec3f( 0.0 );
	s.alpha = alp;
`,
	} );

}

function buildWheelParts( radius, tireTube, hubRadius, discLeft = true ) {

	const rimRadius = radius - tireTube * 0.92;
	const list = [];

	// Main tire carcass in YZ plane (+X axle)
	list.push( prepare( new TorusGeometry( rimRadius, tireTube, 14, 34 ), {
		color: COL.tire, rough: 0.9, metal: 0.02,
		matrix: mat4( 0, 0, 0, 0, Math.PI * 0.5, 0 ),
	} ) );

	// Sidewall trim & knobby scrambler tread blocks
	const knobs = 18;
	for ( let i = 0; i < knobs; i ++ ) {

		const a = ( i / knobs ) * Math.PI * 2;
		const ca = Math.cos( a ), sa = Math.sin( a );
		const r = radius - 0.008;
		// Alternate center + staggered shoulder lugs
		list.push( prepare( new BoxGeometry( tireTube * 1.12, 0.026, 0.044 ), {
			color: COL.tire, rough: 0.92, metal: 0.02,
			matrix: mat4( 0, ca * r, sa * r, - a, 0, 0 ),
		} ) );
		const side = ( i % 2 === 0 ? 1 : - 1 ) * tireTube * 0.45;
		list.push( prepare( new BoxGeometry( tireTube * 0.52, 0.022, 0.038 ), {
			color: COL.tire, rough: 0.92, metal: 0.02,
			matrix: mat4( side, ca * ( r - 0.006 ), sa * ( r - 0.006 ), - a, 0, 0 ),
		} ) );

	}

	// Chrome outer rim & alloy hub
	list.push( prepare( new TorusGeometry( rimRadius - tireTube * 0.42, 0.024, 10, 32 ), {
		color: COL.chrome, rough: 0.16, metal: 0.92,
		matrix: mat4( 0, 0, 0, 0, Math.PI * 0.5, 0 ),
	} ) );
	list.push( prepare( new CylinderGeometry( hubRadius, hubRadius, 0.14, 16 ), {
		color: COL.alloy, rough: 0.35, metal: 0.82,
		matrix: mat4( 0, 0, 0, 0, 0, Math.PI * 0.5 ),
	} ) );

	// Crossed wire spokes
	const spokes = 12;
	const spokeLen = rimRadius - tireTube * 0.44;
	for ( let i = 0; i < spokes; i ++ ) {

		const a = ( i / spokes ) * Math.PI * 2;
		const side = ( i % 2 === 0 ? 1 : - 1 ) * 0.032;
		list.push( prepare( new CylinderGeometry( 0.004, 0.004, spokeLen, 5 ), {
			color: COL.chrome, rough: 0.2, metal: 0.9,
			matrix: mat4( side * 0.45, Math.cos( a ) * spokeLen * 0.5, Math.sin( a ) * spokeLen * 0.5, Math.PI * 0.5 - a, 0, side * 1.4 ),
		} ) );

	}

	// Stainless brake rotor
	const rx = discLeft ? 0.078 : - 0.078;
	list.push( prepare( new CylinderGeometry( 0.145, 0.145, 0.01, 22 ), {
		color: COL.alloy, rough: 0.24, metal: 0.88,
		matrix: mat4( rx, 0, 0, 0, 0, Math.PI * 0.5 ),
	} ) );

	return mergePrepared( list );

}

function addPart( parent, name, geo, mat, { pos = null, rot = null, cast = true, receive = true } = {} ) {

	const mesh = new Mesh( geo, mat );
	mesh.name = name;
	mesh.castShadow = cast;
	mesh.receiveShadow = receive;
	if ( pos ) mesh.position.copy( pos );
	if ( rot ) mesh.rotation.set( rot[ 0 ], rot[ 1 ], rot[ 2 ] );
	parent.add( mesh );
	return mesh;

}

// Procedural Coastal Scrambler motorcycle (~13 draw calls total).
// Frame convention: +Z forward, +Y up, +X left/port, y = 0 at tire ground contact.
export class MotorcycleModel {

	constructor() {

		this.paintMat = makePBR( true );
		this.partsMat = makePBR( false );
		this.headlightMat = standard( { color: 0xdfe6ea, emissive: 0xffe4b2, emissiveIntensity: 0.05, roughness: 0.12, metalness: 0.1 } );
		this.headlightMat.name = 'motoHeadlight';
		this.taillightMat = standard( { color: 0x701010, emissive: 0xff1e12, emissiveIntensity: 0.08, roughness: 0.18, metalness: 0.05 } );
		this.taillightMat.name = 'motoTaillight';
		this.gaugeMat = standard( { color: 0x162228, emissive: 0x76d6cc, emissiveIntensity: 0.12, roughness: 0.25, metalness: 0.1 } );
		this.gaugeMat.name = 'motoGauge';

		this.group = new Group();
		this.group.name = 'Motorcycle';
		this.chassisGroup = new Group();
		this.chassisGroup.name = 'motoChassis';
		this.group.add( this.chassisGroup );

		// Local anchors matching Vehicle / LocalLights
		this.seatEyeLocal = new Vector3( 0, 1.38, - 0.14 );
		this.headlightLocal = new Vector3( 0, - 0.08, 0.23 ); // inside steerPivot
		this.taillightLocal = new Vector3( 0, 0.72, - 1.02 ); // inside chassisGroup
		this.exhaustLocal = new Vector3( - 0.19, 0.72, - 0.85 );

		const kit = new GeoKit();
		this._buildChassis( kit );

		for ( const key of [ 'paint', 'parts' ] ) {

			const geo = kit.merged( key );
			if ( ! geo ) continue;
			addPart( this.chassisGroup, 'moto-chassis-' + key, geo, key === 'paint' ? this.paintMat : this.partsMat );

		}

		// Taillight ruby lens
		addPart( this.chassisGroup, 'moto-taillight', new BoxGeometry( 0.095, 0.044, 0.036 ), this.taillightMat, {
			pos: new Vector3( 0, 0.725, - 0.99 ),
			cast: false,
			receive: false,
		} );

		this._buildSteerAssembly();
		this._buildRearSwingarm();
		this._buildKickstand();
		this._buildRider();

	}

	_buildChassis( kit ) {

		const P = ( geo, color, rough = 0.22, metal = 0.08, m = null ) => kit.add( 'paint', geo, { color, rough, metal, matrix: m } );
		const M = ( geo, color, rough = 0.45, metal = 0.72, m = null ) => kit.add( 'parts', geo, { color, rough, metal, matrix: m } );

		// ---- Tubular steel double-cradle frame
		const tube = ( p1, p2, r = 0.017, c = COL.frame ) => {

			const curve = new CatmullRomCurve3( [ new Vector3( ...p1 ), new Vector3( ...p2 ) ] );
			M( new TubeGeometry( curve, 4, r, 8, false ), c, 0.42, 0.75 );

		};
		// Headtube collar
		M( new CylinderGeometry( 0.036, 0.036, 0.21, 14 ), COL.frame, 0.4, 0.8, mat4( 0, 0.86, 0.48, RAKE, 0, 0 ) );
		// Spine backbone & seat rails
		tube( [ 0, 0.91, 0.43 ], [ 0, 0.74, - 0.14 ], 0.022 );
		tube( [ 0, 0.74, - 0.14 ], [ 0.12, 0.75, - 0.86 ], 0.016 );
		tube( [ 0, 0.74, - 0.14 ], [ - 0.12, 0.75, - 0.86 ], 0.016 );
		tube( [ 0.12, 0.75, - 0.86 ], [ - 0.12, 0.75, - 0.86 ], 0.015 );
		// Downtubes + skidplate cradle + subframes
		for ( const sgn of [ - 1, 1 ] ) {

			const sx = sgn * 0.095;
			tube( [ sgn * 0.02, 0.82, 0.44 ], [ sx, 0.45, 0.28 ], 0.015 );
			tube( [ sx, 0.45, 0.28 ], [ sx, 0.27, 0.12 ], 0.015 );
			tube( [ sx, 0.27, 0.12 ], [ sx, 0.28, - 0.18 ], 0.015 );
			tube( [ sx, 0.28, - 0.18 ], [ sgn * 0.12, 0.75, - 0.26 ], 0.015 );
			tube( [ sx, 0.36, - 0.18 ], [ sgn * 0.12, 0.75, - 0.78 ], 0.013 );
			// Footpegs
			M( new CylinderGeometry( 0.014, 0.014, 0.11, 8 ), COL.tire, 0.85, 0.05, mat4( sgn * 0.21, 0.33, - 0.09, 0, 0, Math.PI * 0.5 ) );
			M( new BoxGeometry( 0.04, 0.016, 0.04 ), COL.alloy, 0.35, 0.8, mat4( sgn * 0.15, 0.33, - 0.09 ) );

		}
		// Brushed aluminum bash plate under engine
		M( new RoundedBoxGeometry( 0.20, 0.025, 0.36, 2, 0.008 ), COL.alloy, 0.34, 0.82, mat4( 0, 0.255, 0.05, 0.12, 0, 0 ) );

		// ---- Air-cooled thumper engine block with finned cylinder head
		M( new RoundedBoxGeometry( 0.26, 0.20, 0.28, 3, 0.02 ), COL.engine, 0.45, 0.7, mat4( 0, 0.38, 0.02 ) );
		M( new CylinderGeometry( 0.088, 0.088, 0.09, 16 ), COL.alloy, 0.34, 0.82, mat4( 0.11, 0.37, - 0.02, 0, 0, Math.PI * 0.5 ) );
		M( new CylinderGeometry( 0.082, 0.082, 0.08, 16 ), COL.alloy, 0.34, 0.82, mat4( - 0.11, 0.37, 0.03, 0, 0, Math.PI * 0.5 ) );
		// Cylinder & stacked cooling fins
		M( new RoundedBoxGeometry( 0.15, 0.19, 0.16, 2, 0.012 ), COL.engine, 0.46, 0.68, mat4( 0, 0.56, 0.06, - 0.16, 0, 0 ) );
		for ( let i = 0; i < 6; i ++ ) {

			M( new BoxGeometry( 0.19, 0.007, 0.20 ), COL.alloy, 0.38, 0.78, mat4( 0, 0.49 + i * 0.026, 0.06 - i * 0.004, - 0.16, 0, 0 ) );

		}
		// Valve cover & spark plug cap
		M( new RoundedBoxGeometry( 0.18, 0.045, 0.19, 2, 0.01 ), COL.alloy, 0.28, 0.85, mat4( 0, 0.66, 0.04, - 0.16, 0, 0 ) );

		// ---- High-mount scrambler exhaust pipe & brushed muffler (starboard -X side)
		const exCurve = new CatmullRomCurve3( [
			new Vector3( - 0.04, 0.57, 0.15 ),
			new Vector3( - 0.11, 0.52, 0.29 ),
			new Vector3( - 0.14, 0.39, 0.16 ),
			new Vector3( - 0.15, 0.43, - 0.08 ),
			new Vector3( - 0.17, 0.61, - 0.30 ),
			new Vector3( - 0.19, 0.69, - 0.54 ),
		] );
		M( new TubeGeometry( exCurve, 28, 0.023, 10, false ), COL.brass, 0.22, 0.9 );
		// Muffler canister + tip + heat shield
		M( new CylinderGeometry( 0.052, 0.048, 0.38, 16 ), COL.chrome, 0.18, 0.92, mat4( - 0.19, 0.71, - 0.68, Math.PI * 0.5 - 0.12, 0, 0 ) );
		M( new CylinderGeometry( 0.03, 0.042, 0.06, 14 ), COL.frame, 0.55, 0.75, mat4( - 0.19, 0.73, - 0.88, Math.PI * 0.5 - 0.12, 0, 0 ) );
		M( new RoundedBoxGeometry( 0.025, 0.065, 0.26, 2, 0.008 ), COL.alloy, 0.3, 0.85, mat4( - 0.24, 0.68, - 0.52, - 0.12, 0, 0 ) );

		// ---- Sculpted Teardrop Fuel Tank (coastal teal paint + cream racing stripe + chrome cap)
		P( new SphereGeometry( 0.185, 22, 16 ), COL.teal, 0.2, 0.12, mat4( 0, 0.84, 0.14, 0.14, 0, 0, 0.96, 0.78, 1.48 ) );
		P( new BoxGeometry( 0.058, 0.032, 0.42 ), COL.cream, 0.22, 0.08, mat4( 0, 0.955, 0.15, 0.14, 0, 0 ) );
		// Tank knee grips & chrome cap
		for ( const sgn of [ - 1, 1 ] ) {

			M( new RoundedBoxGeometry( 0.02, 0.08, 0.20, 2, 0.008 ), COL.tire, 0.88, 0.04, mat4( sgn * 0.155, 0.81, 0.06, 0.14, sgn * 0.14, 0 ) );

		}
		M( new CylinderGeometry( 0.032, 0.034, 0.022, 14 ), COL.chrome, 0.14, 0.94, mat4( 0.03, 0.975, 0.22, 0.14, 0, 0 ) );

		// ---- Ribbed Saddle Brown Leather Scrambler Seat
		M( new RoundedBoxGeometry( 0.24, 0.095, 0.66, 3, 0.032 ), COL.leather, 0.68, 0.02, mat4( 0, 0.785, - 0.44, - 0.03, 0, 0 ) );
		for ( let i = 0; i < 8; i ++ ) {

			M( new CylinderGeometry( 0.011, 0.011, 0.19, 8 ), COL.leatherDark, 0.74, 0.02, mat4( 0, 0.832 - i * 0.001, - 0.20 - i * 0.055, 0, 0, Math.PI * 0.5 ) );

		}

		// ---- Side number plate / airbox covers
		for ( const sgn of [ - 1, 1 ] ) {

			P( new RoundedBoxGeometry( 0.025, 0.15, 0.25, 2, 0.01 ), COL.cream, 0.26, 0.06, mat4( sgn * 0.13, 0.65, - 0.25, 0, sgn * 0.08, 0 ) );

		}

		// ---- Bobbed Rear Fender, Tail Lamp Bracket & Rear Luggage Rack + Coastal Drybag
		const rearArc = new CatmullRomCurve3( [
			new Vector3( 0, 0.67, - 0.58 ),
			new Vector3( 0, 0.73, - 0.82 ),
			new Vector3( 0, 0.68, - 1.01 ),
		] );
		P( new TubeGeometry( rearArc, 10, 0.09, 8, false ), COL.teal, 0.22, 0.1, mat4( 0, 0, 0, 0, 0, 0, 1.0, 0.35, 1.0 ) );
		M( new BoxGeometry( 0.11, 0.058, 0.04 ), COL.frame, 0.4, 0.7, mat4( 0, 0.725, - 0.97 ) );
		// Compact rear tubular rack + drybag roll
		M( new BoxGeometry( 0.22, 0.016, 0.22 ), COL.frame, 0.45, 0.75, mat4( 0, 0.79, - 0.88 ) );
		M( new CylinderGeometry( 0.085, 0.085, 0.32, 14 ), COL.drybag, 0.78, 0.02, mat4( 0, 0.875, - 0.87, 0, 0, Math.PI * 0.5 ) );
		for ( const sx of [ - 0.09, 0.09 ] ) {

			M( new TorusGeometry( 0.09, 0.008, 6, 14 ), COL.leatherDark, 0.7, 0.05, mat4( sx, 0.875, - 0.87, 0, Math.PI * 0.5, 0 ) );

		}

		// ---- Twin Rear Coilover Shocks
		for ( const sgn of [ - 1, 1 ] ) {

			const x = sgn * 0.14;
			M( new CylinderGeometry( 0.018, 0.018, 0.36, 10 ), COL.alloy, 0.26, 0.85, mat4( x, 0.56, - 0.66, 0.22, 0, 0 ) );
			for ( let c = 0; c < 6; c ++ ) {

				M( new TorusGeometry( 0.025, 0.006, 6, 12 ), COL.coral, 0.32, 0.3, mat4( x, 0.45 + c * 0.036, - 0.685 + c * 0.008, Math.PI * 0.5 + 0.22, 0, 0 ) );

			}

		}

	}

	_buildSteerAssembly() {

		// Outer tilted holder maintains the 23 deg steering rake axis
		this.steerHolder = new Group();
		this.steerHolder.name = 'motoSteerHolder';
		this.steerHolder.position.copy( STEER_ORIGIN );
		this.steerHolder.rotation.x = RAKE;
		this.chassisGroup.add( this.steerHolder );

		// Rotates around local Y (rake axis) when steering
		this.steerPivot = new Group();
		this.steerPivot.name = 'motoSteerPivot';
		this.steerHolder.add( this.steerPivot );

		const kit = new GeoKit();
		const P = ( geo, color, m = null ) => kit.add( 'paint', geo, { color, rough: 0.22, metal: 0.08, matrix: m } );
		const M = ( geo, color, rough = 0.3, metal = 0.8, m = null ) => kit.add( 'parts', geo, { color, rough, metal, matrix: m } );

		// Upper & lower triple clamps + steering nut
		M( new RoundedBoxGeometry( 0.24, 0.024, 0.09, 2, 0.008 ), COL.alloy, 0.28, 0.86, mat4( 0, 0.06, 0.02 ) );
		M( new RoundedBoxGeometry( 0.24, 0.026, 0.09, 2, 0.008 ), COL.alloy, 0.28, 0.86, mat4( 0, - 0.09, 0.02 ) );
		M( new CylinderGeometry( 0.018, 0.018, 0.02, 8 ), COL.chrome, 0.16, 0.92, mat4( 0, 0.08, 0 ) );

		// Upper fork tubes + rubber accordion gaiters
		for ( const sgn of [ - 1, 1 ] ) {

			const fx = sgn * 0.098;
			M( new CylinderGeometry( 0.021, 0.021, 0.28, 12 ), COL.chrome, 0.14, 0.94, mat4( fx, - 0.06, 0.03 ) );
			M( new CylinderGeometry( 0.027, 0.027, 0.14, 12 ), COL.tire, 0.86, 0.04, mat4( fx, - 0.19, 0.03 ) );
			// Handlebar risers
			M( new CylinderGeometry( 0.015, 0.016, 0.055, 8 ), COL.alloy, 0.28, 0.84, mat4( fx * 0.5, 0.10, 0.01 ) );

		}

		// Wide braced scrambler handlebars
		const barCurve = new CatmullRomCurve3( [
			new Vector3( 0.36, 0.18, - 0.06 ),
			new Vector3( 0.21, 0.19, - 0.01 ),
			new Vector3( 0.09, 0.13, 0.01 ),
			new Vector3( - 0.09, 0.13, 0.01 ),
			new Vector3( - 0.21, 0.19, - 0.01 ),
			new Vector3( - 0.36, 0.18, - 0.06 ),
		] );
		M( new TubeGeometry( barCurve, 22, 0.0125, 8, false ), COL.chrome, 0.15, 0.94 );
		// Crossbar + leather brace pad
		M( new CylinderGeometry( 0.007, 0.007, 0.30, 8 ), COL.chrome, 0.16, 0.92, mat4( 0, 0.18, - 0.01, 0, 0, Math.PI * 0.5 ) );
		M( new CylinderGeometry( 0.019, 0.019, 0.14, 10 ), COL.leather, 0.72, 0.02, mat4( 0, 0.18, - 0.01, 0, 0, Math.PI * 0.5 ) );

		// Waffle grips + hand levers + twin retro round mirrors
		for ( const sgn of [ - 1, 1 ] ) {

			M( new CylinderGeometry( 0.017, 0.017, 0.125, 10 ), COL.tire, 0.88, 0.04, mat4( sgn * 0.30, 0.184, - 0.04, 0.25, 0, Math.PI * 0.5 ) );
			M( new BoxGeometry( 0.09, 0.008, 0.016 ), COL.alloy, 0.26, 0.85, mat4( sgn * 0.27, 0.18, - 0.005, 0, - sgn * 0.25, 0 ) );
			// Mirror stalks & housings (mirror glass faces -Z toward rider)
			M( new CylinderGeometry( 0.005, 0.005, 0.13, 6 ), COL.chrome, 0.16, 0.92, mat4( sgn * 0.22, 0.26, - 0.01, 0, 0, - sgn * 0.3 ) );
			M( new CylinderGeometry( 0.046, 0.042, 0.016, 14 ), COL.chrome, 0.15, 0.94, mat4( sgn * 0.25, 0.33, - 0.01, - Math.PI * 0.5 + 0.15, sgn * 0.22, 0 ) );
			M( new CylinderGeometry( 0.040, 0.040, 0.005, 14 ), COL.alloy, 0.04, 0.98, mat4( sgn * 0.25, 0.329, - 0.019, - Math.PI * 0.5 + 0.15, sgn * 0.22, 0 ) );

		}

		// Retro round 7-inch chrome headlamp bucket (oriented counter-rake so beam points level forward)
		M( new SphereGeometry( 0.095, 16, 12 ), COL.frame, 0.38, 0.72, mat4( 0, - 0.08, 0.14, - RAKE, 0, 0, 1.0, 1.0, 1.05 ) );
		M( new TorusGeometry( 0.088, 0.012, 8, 20 ), COL.chrome, 0.14, 0.94, mat4( 0, - 0.08, 0.185, - RAKE + 0.06, 0, 0 ) );

		// Twin analog instrument pods (tilted aft toward rider eyes)
		for ( const ox of [ - 0.054, 0.054 ] ) {

			M( new CylinderGeometry( 0.042, 0.04, 0.045, 16 ), COL.chrome, 0.16, 0.92, mat4( ox, 0.105, 0.08, - 0.48, 0, 0 ) );

		}

		// High-mount scrambler front fender tucked under lower clamp
		const fArc = new CatmullRomCurve3( [
			new Vector3( 0, - 0.18, 0.27 ),
			new Vector3( 0, - 0.14, 0.06 ),
			new Vector3( 0, - 0.17, - 0.11 ),
		] );
		P( new TubeGeometry( fArc, 8, 0.075, 8, false ), COL.cream, mat4( 0, 0, 0, 0, 0, 0, 1.0, 0.32, 1.0 ) );

		for ( const key of [ 'paint', 'parts' ] ) {

			const geo = kit.merged( key );
			if ( ! geo ) continue;
			addPart( this.steerPivot, 'moto-steer-' + key, geo, key === 'paint' ? this.paintMat : this.partsMat );

		}

		// Emissive headlight lens + volumetric cone beam (pointed slightly down ahead)
		this.headlightMesh = addPart( this.steerPivot, 'moto-headlight-lens', new CircleGeometry( 0.082, 20 ), this.headlightMat, {
			pos: new Vector3( 0, - 0.08, 0.192 ),
			rot: [ - RAKE + 0.06, 0, 0 ],
			cast: false,
			receive: false,
		} );

		this.beamMat = makeHeadlightBeamMaterial( 'moto-headlight-beam' );
		const beamGeo = new CylinderGeometry( 0.085, 1.85, 14.0, 20, 1, true );
		beamGeo.rotateX( - Math.PI * 0.5 );
		beamGeo.translate( 0, 0, 7.0 );
		this.beamMesh = addPart( this.steerPivot, 'moto-beam', beamGeo, this.beamMat, {
			pos: new Vector3( 0, - 0.08, 0.21 ),
			rot: [ - RAKE + 0.06, 0, 0 ],
			cast: false,
			receive: false,
		} );
		this.beamMesh.layers.set( LAYERS.TRANSPARENT );
		this.beamMesh.frustumCulled = false;
		this.beamMesh.visible = false;

		// Twin illuminated gauge faces + animated needles facing rider
		const dialGeo = new CircleGeometry( 0.036, 16 );
		const dialRot = [ - Math.PI * 0.5 - 0.48, 0, 0 ];
		addPart( this.steerPivot, 'moto-dial-speed', dialGeo, this.gaugeMat, {
			pos: new Vector3( 0.054, 0.126, 0.068 ),
			rot: dialRot,
			cast: false,
			receive: false,
		} );
		addPart( this.steerPivot, 'moto-dial-rpm', dialGeo, this.gaugeMat, {
			pos: new Vector3( - 0.054, 0.126, 0.068 ),
			rot: dialRot,
			cast: false,
			receive: false,
		} );

		const makeNeedle = ( name, x ) => {

			const holder = new Group();
			holder.position.set( x, 0.128, 0.066 );
			holder.rotation.set( dialRot[ 0 ], 0, 0 );
			const needle = new Group();
			const nGeo = prepare( new BoxGeometry( 0.004, 0.024, 0.003 ), {
				color: COL.coral, rough: 0.3, metal: 0.1,
				matrix: mat4( 0, 0.011, 0 ),
			} );
			addPart( needle, name, nGeo, this.partsMat, { cast: false, receive: false } );
			holder.add( needle );
			this.steerPivot.add( holder );
			return needle;

		};
		this.speedNeedle = makeNeedle( 'moto-needle-speed', 0.054 );
		this.rpmNeedle = makeNeedle( 'moto-needle-rpm', - 0.054 );

		// Telescopic fork slider + Front wheel
		this.frontForkSlider = new Group();
		this.frontForkSlider.name = 'motoForkSlider';
		this.steerPivot.add( this.frontForkSlider );

		const forkList = [];
		for ( const sgn of [ - 1, 1 ] ) {

			forkList.push( prepare( new CylinderGeometry( 0.025, 0.024, 0.36, 10 ), {
				color: COL.frame, rough: 0.36, metal: 0.78,
				matrix: mat4( sgn * 0.098, - 0.40, 0.03 ),
			} ) );

		}
		// Brake caliper
		forkList.push( prepare( new BoxGeometry( 0.036, 0.075, 0.06 ), {
			color: COL.brass, rough: 0.32, metal: 0.8,
			matrix: mat4( 0.082, - 0.54, - 0.08 ),
		} ) );
		addPart( this.frontForkSlider, 'moto-fork-lowers', mergePrepared( forkList ), this.partsMat );

		this.frontWheelGroup = new Group();
		this.frontWheelGroup.name = 'motoFrontWheel';
		this.frontWheelGroup.position.set( 0, - 0.58, 0 );
		this.frontForkSlider.add( this.frontWheelGroup );
		addPart( this.frontWheelGroup, 'moto-front-wheel', buildWheelParts( 0.335, 0.072, 0.052, true ), this.partsMat );

	}

	_buildRearSwingarm() {

		this.swingarmGroup = new Group();
		this.swingarmGroup.name = 'motoSwingarm';
		this.swingarmGroup.position.copy( SWINGARM_ORIGIN );
		this.chassisGroup.add( this.swingarmGroup );

		const list = [];
		for ( const sgn of [ - 1, 1 ] ) {

			list.push( prepare( new RoundedBoxGeometry( 0.034, 0.044, 0.58, 2, 0.008 ), {
				color: COL.frame, rough: 0.4, metal: 0.78,
				matrix: mat4( sgn * 0.12, - 0.01, - 0.26 ),
			} ) );

		}
		// Drive chain + guard along left (+X) side
		list.push( prepare( new BoxGeometry( 0.02, 0.024, 0.54 ), {
			color: COL.engine, rough: 0.5, metal: 0.7,
			matrix: mat4( 0.10, 0.035, - 0.25 ),
		} ) );
		addPart( this.swingarmGroup, 'moto-swingarm', mergePrepared( list ), this.partsMat );

		this.rearWheelGroup = new Group();
		this.rearWheelGroup.name = 'motoRearWheel';
		this.rearWheelGroup.position.set( 0, - 0.015, - 0.53 );
		this.swingarmGroup.add( this.rearWheelGroup );
		// Rear wheel includes sprocket on left (+X) and rotor on right (-X)
		const rwList = [ buildWheelParts( 0.325, 0.088, 0.06, false ) ];
		rwList.push( prepare( new CylinderGeometry( 0.135, 0.135, 0.012, 20 ), {
			color: COL.engine, rough: 0.42, metal: 0.78,
			matrix: mat4( 0.095, 0, 0, 0, 0, Math.PI * 0.5 ),
		} ) );
		addPart( this.rearWheelGroup, 'moto-rear-wheel', mergePrepared( rwList ), this.partsMat );

	}

	_buildKickstand() {

		this.kickstandGroup = new Group();
		this.kickstandGroup.name = 'motoKickstand';
		this.kickstandGroup.position.set( 0.13, 0.25, - 0.14 );
		this.chassisGroup.add( this.kickstandGroup );

		const parts = [
			prepare( new CylinderGeometry( 0.011, 0.009, 0.30, 8 ), {
				color: COL.frame, rough: 0.4, metal: 0.78,
				matrix: mat4( 0, - 0.14, 0 ),
			} ),
			prepare( new BoxGeometry( 0.04, 0.012, 0.045 ), {
				color: COL.frame, rough: 0.45, metal: 0.75,
				matrix: mat4( 0, - 0.29, 0.01 ),
			} ),
		];
		addPart( this.kickstandGroup, 'moto-kickstand', mergePrepared( parts ), this.partsMat );

	}

	_buildRider() {

		// Stylized coastal rider shown only in 3rd-person / exterior views
		this.riderGroup = new Group();
		this.riderGroup.name = 'motoRider';
		this.riderGroup.visible = false;
		this.chassisGroup.add( this.riderGroup );

		const torsoPivot = this.riderTorso = new Group();
		torsoPivot.position.set( 0, 0.87, - 0.28 );
		this.riderGroup.add( torsoPivot );

		const legs = [];
		// Pelvis on seat
		legs.push( prepare( new RoundedBoxGeometry( 0.26, 0.12, 0.20, 2, 0.04 ), {
			color: COL.pants, rough: 0.78, metal: 0.02,
			matrix: mat4( 0, 0.85, - 0.28 ),
		} ) );
		// Thighs -> knees -> shins -> boots resting on footpegs (±0.21, 0.33, -0.09)
		for ( const sgn of [ - 1, 1 ] ) {

			legs.push( prepare( new CylinderGeometry( 0.068, 0.054, 0.36, 10 ), {
				color: COL.pants, rough: 0.78, metal: 0.02,
				matrix: mat4( sgn * 0.16, 0.72, - 0.14, 0.95, 0, - sgn * 0.18 ),
			} ) );
			legs.push( prepare( new CylinderGeometry( 0.052, 0.042, 0.34, 10 ), {
				color: COL.pants, rough: 0.78, metal: 0.02,
				matrix: mat4( sgn * 0.20, 0.49, - 0.04, - 0.18, 0, 0 ),
			} ) );
			legs.push( prepare( new RoundedBoxGeometry( 0.085, 0.075, 0.18, 2, 0.02 ), {
				color: COL.boots, rough: 0.62, metal: 0.05,
				matrix: mat4( sgn * 0.21, 0.36, - 0.05 ),
			} ) );

		}
		addPart( this.riderGroup, 'moto-rider-legs', mergePrepared( legs ), this.partsMat );

		// Upper body + retro open-face helmet + arms reaching handlebar grips
		const upper = [];
		upper.push( prepare( new RoundedBoxGeometry( 0.31, 0.44, 0.19, 3, 0.05 ), {
			color: COL.jacket, rough: 0.68, metal: 0.04,
			matrix: mat4( 0, 0.24, 0.06, 0.24, 0, 0 ),
		} ) );
		// Cream coastal chest stripe + collar
		upper.push( prepare( new BoxGeometry( 0.28, 0.06, 0.196 ), {
			color: COL.cream, rough: 0.65, metal: 0.04,
			matrix: mat4( 0, 0.30, 0.075, 0.24, 0, 0 ),
		} ) );
		// Helmet & visor & dark goggles
		upper.push( prepare( new SphereGeometry( 0.122, 16, 12 ), {
			color: COL.helmet, rough: 0.25, metal: 0.1,
			matrix: mat4( 0, 0.57, 0.15, 0.1, 0, 0, 0.95, 1.05, 1.08 ),
		} ) );
		upper.push( prepare( new BoxGeometry( 0.16, 0.018, 0.08 ), {
			color: COL.leatherDark, rough: 0.6, metal: 0.1,
			matrix: mat4( 0, 0.635, 0.24, 0.12, 0, 0 ),
		} ) );
		upper.push( prepare( new RoundedBoxGeometry( 0.175, 0.048, 0.09, 2, 0.015 ), {
			color: COL.goggle, rough: 0.12, metal: 0.4,
			matrix: mat4( 0, 0.56, 0.235, 0.1, 0, 0 ),
		} ) );
		upper.push( prepare( new SphereGeometry( 0.09, 12, 10 ), {
			color: COL.skin, rough: 0.72, metal: 0.0,
			matrix: mat4( 0, 0.52, 0.175 ),
		} ) );

		// Arms connecting shoulder -> elbow -> handlebar grips cleanly via vector alignment
		const limb = ( a, b, rTop, rBot, color, rough = 0.68, metal = 0.04 ) => {

			const mid = a.clone().add( b ).multiplyScalar( 0.5 );
			const dir = b.clone().sub( a );
			const len = dir.length();
			upper.push( prepare( new CylinderGeometry( rBot, rTop, len, 10 ), {
				color, rough, metal, matrix: alignY( mid, dir ),
			} ) );

		};

		for ( const sgn of [ - 1, 1 ] ) {

			const sh = new Vector3( sgn * 0.16, 0.36, 0.10 );
			const el = new Vector3( sgn * 0.25, 0.23, 0.30 );
			const gr = new Vector3( sgn * 0.30, 0.17, 0.53 );
			upper.push( prepare( new SphereGeometry( 0.056, 10, 8 ), { color: COL.jacket, rough: 0.68, metal: 0.04, matrix: mat4( sh.x, sh.y, sh.z ) } ) );
			upper.push( prepare( new SphereGeometry( 0.044, 8, 8 ), { color: COL.jacket, rough: 0.68, metal: 0.04, matrix: mat4( el.x, el.y, el.z ) } ) );
			limb( sh, el, 0.052, 0.042, COL.jacket );
			limb( el, gr, 0.040, 0.032, COL.jacket );
			upper.push( prepare( new SphereGeometry( 0.038, 8, 8 ), {
				color: COL.boots, rough: 0.62, metal: 0.05,
				matrix: mat4( gr.x, gr.y, gr.z ),
			} ) );

		}
		addPart( torsoPivot, 'moto-rider-torso', mergePrepared( upper ), this.partsMat );

	}

	setState( state = {} ) {

		const steerAngle = state.steerAngle || 0;
		const frontComp = state.frontComp || 0;
		const rearComp = state.rearComp || 0;

		this.steerPivot.rotation.y = steerAngle;
		this.frontForkSlider.position.y = frontComp;
		this.frontWheelGroup.rotation.x = state.frontSpin || 0;

		this.swingarmGroup.rotation.x = - rearComp * 0.45;
		this.rearWheelGroup.rotation.x = state.rearSpin || 0;

		// Kickstand: 0 = tucked back horizontally along frame; 1 = deployed down & outward
		const ks = MathUtils.clamp( state.kickstand ?? 1, 0, 1 );
		this.kickstandGroup.rotation.x = MathUtils.lerp( - Math.PI * 0.48, 0.22, ks );
		this.kickstandGroup.rotation.z = MathUtils.lerp( - 0.05, 0.36, ks );

		// Rider posture & visibility (set externally by App/Player when in 1st person)
		if ( this.riderTorso ) {

			const tuck = state.riderTuck || 0;
			this.riderTorso.rotation.x = tuck * 0.26;
			this.riderTorso.rotation.y = steerAngle * 0.22;

		}

		// Emissive lamps & needles
		if ( this.speedNeedle ) this.speedNeedle.rotation.z = MathUtils.lerp( 2.1, - 2.1, MathUtils.clamp( ( state.speedKmh || 0 ) / 110, 0, 1 ) );
		if ( this.rpmNeedle ) this.rpmNeedle.rotation.z = MathUtils.lerp( 2.1, - 2.1, MathUtils.clamp( state.rpm || 0, 0, 1 ) );
		const boost = state.ledBoost ? 1.65 : 1.0;
		this.headlightMat.emissiveIntensity = state.headlightOn ? 4.4 * boost : 0.04;
		this.taillightMat.emissiveIntensity = state.brakeLight ? 4.2 : ( state.runningLight ? 0.85 : 0.06 );
		const night = state.night || 0;
		this.gaugeMat.emissiveIntensity = state.occupied ? ( 0.35 + 1.4 * Math.max( night, state.headlightOn ? 0.8 : 0 ) ) : 0.05;
		if ( this.beamMesh && this.beamMat ) {

			const weatherVis = Math.max( night, ( state.rain || 0 ) * 0.75, ( state.storm || 0 ) * 0.9 );
			const visAlpha = 0.26 + 0.88 * weatherVis;
			this.beamMat.uniforms.beamAlpha.value = state.headlightOn ? visAlpha * ( state.ledBoost ? 1.42 : 1.0 ) : 0;
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
		if ( this.beamMat?.uniforms?.beamColor ) {

			this.beamMat.uniforms.beamColor.value.set( _paintTmp.r, _paintTmp.g, _paintTmp.b );

		}

	}

	setRiderVisible( visible ) {

		if ( this.riderGroup ) this.riderGroup.visible = !! visible;

	}

}
