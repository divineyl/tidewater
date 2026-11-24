import {
	Group, Mesh, BoxGeometry, SphereGeometry, CylinderGeometry, Color, MathUtils, Vector3, Quaternion,
} from '../engine/index.js';
import { LAYERS } from '../core/SceneRenderer.js';
import { standard } from '../materials/Materials.js';
import { VEHICLE_PAINTS, VEHICLE_LIGHT_TINTS } from '../vehicles/Vehicle.js';
import { BOAT_PAINTS } from '../game/Gear.js';

const _yUp = new Vector3( 0, 1, 0 );
const _tipL = new Vector3();
const _bobL = new Vector3();
const _dirL = new Vector3();

const SKIN = 0xe8be9e;
const HAT = 0xd9b87a;
const SHORTS = 0x2a3b4c;
const DARK = 0x1c2228;
const CHROME = 0xcfd6de;
const HULL = 0xf2ede4;
const CABIN = 0xd6a45b;

function mkPart( parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 ) {

	const m = new Mesh( geo, mat );
	m.position.set( x, y, z );
	if ( rx || ry || rz ) m.rotation.set( rx, ry, rz );
	m.layers.set( LAYERS.OPAQUE );
	m.castShadow = true;
	m.receiveShadow = true;
	parent.add( m );
	return m;

}

// Lightweight 3D remote player avatar built from Tidewater's native SceneMaterial primitives.
// Local convention: +Z forward, +Y up, base at y = 0.
export class RemotePlayerAvatar {

	constructor( { id, name = 'Angler', color = '#5ce0d2' } = {} ) {

		this.id = id;
		this.name = name;
		this.accentHex = color;
		this.group = new Group();
		this.group.name = `remote-player-${ id }`;

		this._phase = 0;
		this._paintId = 'stock';
		this._boatPaintId = 'classic';
		this._lightTint = 'warm';
		this._lightOn = false;
		this._emoteTimer = 0;
		this._emoteKind = 'wave';

		this.shirtMat = standard( { color: new Color( color ), roughness: 0.72, metalness: 0.02 } );
		this.skinMat = standard( { color: SKIN, roughness: 0.68, metalness: 0.02 } );
		this.hatMat = standard( { color: HAT, roughness: 0.85, metalness: 0.0 } );
		this.shortsMat = standard( { color: SHORTS, roughness: 0.8, metalness: 0.02 } );
		this.darkMat = standard( { color: DARK, roughness: 0.75, metalness: 0.15 } );
		this.chromeMat = standard( { color: CHROME, roughness: 0.25, metalness: 0.85 } );
		this.paintMat = standard( { color: 0xc84b31, roughness: 0.25, metalness: 0.12 } );
		this.hullMat = standard( { color: HULL, roughness: 0.45, metalness: 0.05 } );
		this.cabinMat = standard( { color: CABIN, roughness: 0.65, metalness: 0.04 } );
		this.headLightMat = standard( { color: 0xffecc4, emissive: 0xffecc4, emissiveIntensity: 0.2, roughness: 0.2 } );
		this.bobberMat = standard( { color: 0xff5a3c, emissive: 0xff4526, emissiveIntensity: 0.6, roughness: 0.3 } );
		this.lineMat = standard( { color: 0xdff5ff, emissive: 0x8ad8f0, emissiveIntensity: 0.3, roughness: 0.2 } );

		this._buildCharacter();
		this._buildFishingRig();
		this._buildMotorcycle();
		this._buildBuggy();
		this._buildBoat();

		this._setActiveGroup( 'walk', null );

	}

	_buildCharacter() {

		const g = this.charGroup = new Group();
		this.charRig = new Group();
		g.add( this.charRig );

		// Torso, head & sun hat
		mkPart( this.charRig, new BoxGeometry( 0.42, 0.56, 0.24 ), this.shirtMat, 0, 1.12, 0 );
		mkPart( this.charRig, new BoxGeometry( 0.38, 0.22, 0.22 ), this.shortsMat, 0, 0.78, 0 );
		mkPart( this.charRig, new SphereGeometry( 0.16, 12, 10 ), this.skinMat, 0, 1.56, 0 );
		mkPart( this.charRig, new CylinderGeometry( 0.30, 0.32, 0.03, 14 ), this.hatMat, 0, 1.69, 0 );
		mkPart( this.charRig, new CylinderGeometry( 0.15, 0.18, 0.11, 14 ), this.hatMat, 0, 1.75, 0 );

		// Pivoted limbs for walking/swimming cycle
		this.leftArm = new Group();
		this.leftArm.position.set( 0.28, 1.34, 0 );
		mkPart( this.leftArm, new BoxGeometry( 0.12, 0.48, 0.12 ), this.skinMat, 0, - 0.20, 0 );
		this.charRig.add( this.leftArm );

		this.rightArm = new Group();
		this.rightArm.position.set( - 0.28, 1.34, 0 );
		mkPart( this.rightArm, new BoxGeometry( 0.12, 0.48, 0.12 ), this.skinMat, 0, - 0.20, 0 );
		this.charRig.add( this.rightArm );

		// Fishing rod held in right hand when rodOut === true
		this.rodMesh = mkPart( this.rightArm, new CylinderGeometry( 0.012, 0.022, 1.85, 6 ), this.chromeMat, 0, - 0.32, 0.72, Math.PI * 0.35, 0, 0 );
		this.rodMesh.visible = false;

		// Caught fish silhouette dangling below rod tip when landing
		this.caughtFishMesh = mkPart( this.rightArm, new SphereGeometry( 0.13, 8, 6 ), this.bobberMat, 0, 0.05, 1.55 );
		this.caughtFishMesh.scale.set( 0.55, 0.75, 1.9 );
		this.caughtFishMesh.visible = false;

		this.leftLeg = new Group();
		this.leftLeg.position.set( 0.11, 0.68, 0 );
		mkPart( this.leftLeg, new BoxGeometry( 0.14, 0.62, 0.14 ), this.skinMat, 0, - 0.31, 0 );
		this.charRig.add( this.leftLeg );

		this.rightLeg = new Group();
		this.rightLeg.position.set( - 0.11, 0.68, 0 );
		mkPart( this.rightLeg, new BoxGeometry( 0.14, 0.62, 0.14 ), this.skinMat, 0, - 0.31, 0 );
		this.charRig.add( this.rightLeg );

		this.group.add( g );

	}

	_buildFishingRig() {

		this.fishingGroup = new Group();
		this.bobberMesh = new Mesh( new SphereGeometry( 0.08, 8, 6 ), this.bobberMat );
		this.bobberMesh.layers.set( LAYERS.OPAQUE );
		this.lineMesh = new Mesh( new CylinderGeometry( 0.008, 0.008, 1, 5 ), this.lineMat );
		this.lineMesh.layers.set( LAYERS.OPAQUE );
		this.fishingGroup.add( this.bobberMesh, this.lineMesh );
		this.fishingGroup.visible = false;
		this.group.add( this.fishingGroup );

	}

	_buildMotorcycle() {

		const g = this.motoGroup = new Group();
		// Wheels (front +Z, rear -Z)
		mkPart( g, new CylinderGeometry( 0.34, 0.34, 0.14, 14 ), this.darkMat, 0, 0.34, 0.68, 0, 0, Math.PI * 0.5 );
		mkPart( g, new CylinderGeometry( 0.35, 0.35, 0.16, 14 ), this.darkMat, 0, 0.35, - 0.66, 0, 0, Math.PI * 0.5 );
		// Frame, tank & handlebars
		mkPart( g, new BoxGeometry( 0.26, 0.26, 1.12 ), this.darkMat, 0, 0.60, 0 );
		mkPart( g, new BoxGeometry( 0.30, 0.22, 0.50 ), this.paintMat, 0, 0.84, 0.24 );
		mkPart( g, new BoxGeometry( 0.24, 0.12, 0.54 ), this.shortsMat, 0, 0.80, - 0.34 );
		mkPart( g, new BoxGeometry( 0.74, 0.05, 0.06 ), this.chromeMat, 0, 1.06, 0.50 );
		mkPart( g, new SphereGeometry( 0.10, 10, 8 ), this.headLightMat, 0, 0.88, 0.72 );
		// Stylized rider
		mkPart( g, new BoxGeometry( 0.38, 0.50, 0.24 ), this.shirtMat, 0, 1.18, - 0.16, 0.22, 0, 0 );
		mkPart( g, new SphereGeometry( 0.15, 10, 8 ), this.skinMat, 0, 1.54, - 0.04 );
		mkPart( g, new CylinderGeometry( 0.26, 0.28, 0.04, 12 ), this.hatMat, 0, 1.66, - 0.04 );
		this.group.add( g );

	}

	_buildBuggy() {

		const g = this.buggyGroup = new Group();
		const wheelGeo = new CylinderGeometry( 0.38, 0.38, 0.24, 14 );
		for ( const wx of [ - 0.78, 0.78 ] ) {

			for ( const wz of [ - 0.96, 0.96 ] ) {

				mkPart( g, wheelGeo, this.darkMat, wx, 0.38, wz, 0, 0, Math.PI * 0.5 );

			}

		}

		// Chassis, painted hood & roll cage
		mkPart( g, new BoxGeometry( 1.24, 0.34, 2.30 ), this.darkMat, 0, 0.52, 0 );
		mkPart( g, new BoxGeometry( 1.18, 0.24, 0.86 ), this.paintMat, 0, 0.74, 0.68 );
		mkPart( g, new BoxGeometry( 1.14, 0.24, 0.68 ), this.paintMat, 0, 0.76, - 0.78 );
		mkPart( g, new BoxGeometry( 1.12, 0.06, 1.15 ), this.darkMat, 0, 1.46, - 0.15 );
		mkPart( g, new BoxGeometry( 0.88, 0.09, 0.09 ), this.headLightMat, 0, 1.52, 0.42 );
		// Driver silhouette
		mkPart( g, new BoxGeometry( 0.38, 0.48, 0.24 ), this.shirtMat, 0.26, 1.06, - 0.12 );
		mkPart( g, new SphereGeometry( 0.15, 10, 8 ), this.skinMat, 0.26, 1.40, - 0.12 );
		this.group.add( g );

	}

	_buildBoat() {

		const g = this.boatGroup = new Group();
		// Hull + flared bow + wheelhouse
		mkPart( g, new BoxGeometry( 2.30, 0.88, 6.20 ), this.hullMat, 0, 0.18, - 0.2 );
		mkPart( g, new BoxGeometry( 1.55, 0.86, 1.80 ), this.hullMat, 0, 0.24, 3.10 );
		mkPart( g, new BoxGeometry( 1.56, 1.25, 2.15 ), this.cabinMat, 0, 1.12, 0.85 );
		mkPart( g, new CylinderGeometry( 0.07, 0.07, 0.70, 8 ), this.chromeMat, 0, 2.02, 0.85 );
		mkPart( g, new BoxGeometry( 0.36, 0.50, 0.22 ), this.shirtMat, 0.28, 1.08, 0.35 );
		mkPart( g, new SphereGeometry( 0.14, 10, 8 ), this.skinMat, 0.28, 1.44, 0.35 );
		this.group.add( g );

	}

	_setActiveGroup( mode, vehId ) {

		const isVeh = mode === 'vehicle';
		const isBoat = mode === 'boat';
		this.motoGroup.visible = isVeh && vehId === 'motorcycle';
		this.buggyGroup.visible = isVeh && vehId === 'buggy';
		this.boatGroup.visible = isBoat;
		this.charGroup.visible = ! this.motoGroup.visible && ! this.buggyGroup.visible && ! this.boatGroup.visible;

	}

	_applyAppearance( state ) {

		const hasOwn = ( obj, k ) => typeof k === 'string' && Object.prototype.hasOwnProperty.call( obj, k );
		const paintId = hasOwn( VEHICLE_PAINTS, state.paint ) ? state.paint : 'stock';
		if ( paintId !== this._paintId ) {

			this._paintId = paintId;
			const customHex = VEHICLE_PAINTS[ paintId ];
			this.paintMat.uniforms.color.value.set( customHex !== null && customHex !== undefined ? customHex : 0xc84b31 );

		}

		const boatPaintId = hasOwn( BOAT_PAINTS, state.boatPaint ) ? state.boatPaint : 'classic';
		if ( boatPaintId !== this._boatPaintId ) {

			this._boatPaintId = boatPaintId;
			const bSpec = BOAT_PAINTS[ boatPaintId ];
			this.hullMat.uniforms.color.value.set( bSpec.topside );
			this.cabinMat.uniforms.color.value.set( bSpec.stripe === 0xf2efe6 ? 0x2a486e : CABIN );

		}

		const tint = hasOwn( VEHICLE_LIGHT_TINTS, state.lightTint ) ? state.lightTint : 'warm';
		const lightOn = !! state.lightOn;
		if ( tint !== this._lightTint || lightOn !== this._lightOn ) {

			this._lightTint = tint;
			this._lightOn = lightOn;
			const spec = VEHICLE_LIGHT_TINTS[ tint ];
			this.headLightMat.uniforms.color.value.set( spec.hex );
			this.headLightMat.uniforms.emissive.value.set( spec.hex );
			this.headLightMat.emissiveIntensity = lightOn ? 3.2 : 0.15;

		}

	}

	nameplateAnchorY( state ) {

		if ( state?.mode === 'boat' ) return 2.55;
		if ( state?.mode === 'vehicle' ) return state.vehId === 'buggy' ? 2.15 : 2.25;
		if ( state?.mode === 'swim' || state?.mode === 'dive' ) return 0.95;
		return 2.18;

	}

	triggerEmote( kind = 'wave' ) {

		this._emoteKind = kind;
		this._emoteTimer = 2.4;

	}

	update( dt, state ) {

		if ( ! state ) return;
		this.group.position.set( state.x, state.y, state.z );
		this.group.rotation.set( 0, state.yaw || 0, 0 );
		this._setActiveGroup( state.mode, state.vehId );
		this._applyAppearance( state );

		if ( this._emoteTimer > 0 ) this._emoteTimer = Math.max( 0, this._emoteTimer - dt );

		const speed = Math.abs( state.speed || 0 );
		const swim = state.mode === 'swim' || state.mode === 'dive';

		if ( this.charGroup.visible ) {

			this.charRig.rotation.x = swim ? Math.PI * 0.42 : 0;
			this.charRig.position.y = swim ? 0.15 : 0;
			this.rodMesh.visible = !! state.rodOut && ! swim;
			this.caughtFishMesh.visible = !! ( state.rodOut && ! swim && state.castPhase === 'landing' );

			if ( speed > 0.25 || swim ) {

				this._phase += dt * MathUtils.clamp( speed * 2.2 + ( swim ? 3.5 : 0 ), 2.5, 13 );
				const swing = Math.sin( this._phase ) * ( swim ? 0.65 : Math.min( 0.65, speed * 0.13 ) );
				this.leftArm.rotation.x = swing;
				this.rightArm.rotation.x = state.rodOut ? - 0.55 : - swing;
				this.leftLeg.rotation.x = - swing;
				this.rightLeg.rotation.x = swing;

			} else {

				const k = 1 - Math.exp( - Math.min( 0.2, dt ) * 12 );
				this.leftArm.rotation.x *= 1 - k;
				const fightPull = state.rodOut && state.castPhase === 'fighting' ? Math.sin( performance.now() * 0.012 ) * 0.22 - 0.72 : ( state.rodOut ? - 0.55 : 0 );
				this.rightArm.rotation.x += ( fightPull - this.rightArm.rotation.x ) * k;
				this.leftLeg.rotation.x *= 1 - k;
				this.rightLeg.rotation.x *= 1 - k;

			}

			if ( this._emoteTimer > 0 && ( this._emoteKind === 'wave' || this._emoteKind === 'cheer' ) ) {

				const t = ( 2.4 - this._emoteTimer ) * 9.0;
				this.leftArm.rotation.z = 2.35 + Math.sin( t ) * 0.35;
				this.leftArm.rotation.x = - 0.25;

			} else {

				this.leftArm.rotation.z *= 1 - ( 1 - Math.exp( - Math.min( 0.2, dt ) * 14 ) );

			}

			const showLine = !! state.rodOut && ! swim && ( state.castPhase === 'floating' || state.castPhase === 'fighting' || state.castPhase === 'casting' )
				&& Number.isFinite( state.bobX ) && Number.isFinite( state.bobY ) && Number.isFinite( state.bobZ );
			this.fishingGroup.visible = showLine;
			if ( showLine ) {

				const yaw = state.yaw || 0;
				const c = Math.cos( yaw ), sn = Math.sin( yaw );
				const dx = state.bobX - state.x;
				const dy = state.bobY - state.y;
				const dz = state.bobZ - state.z;
				_bobL.set( dx * c - dz * sn, dy, dx * sn + dz * c );
				_tipL.set( - 0.28, 1.55, 1.45 );
				_dirL.subVectors( _bobL, _tipL );
				const len = _dirL.length();
				if ( len > 0.05 && len < 120 ) {

					this.bobberMesh.position.copy( _bobL );
					this.lineMesh.position.copy( _tipL ).addScaledVector( _dirL, 0.5 );
					_dirL.multiplyScalar( 1 / len );
					this.lineMesh.quaternion.setFromUnitVectors( _yUp, _dirL );
					this.lineMesh.scale.set( 1, len, 1 );
					this.lineMesh.visible = true;

				} else {

					this.fishingGroup.visible = false;

				}

			}

		} else {

			this.fishingGroup.visible = false;

		}

	}

	dispose( scene ) {

		const geometries = new Set();
		const materials = new Set();
		this.group.traverse( ( obj ) => {

			if ( obj.geometry ) geometries.add( obj.geometry );
			if ( obj.material ) {

				if ( Array.isArray( obj.material ) ) {

					for ( const m of obj.material ) if ( m ) materials.add( m );

				} else {

					materials.add( obj.material );

				}

			}

		} );
		for ( const g of geometries ) g.dispose?.();
		for ( const m of materials ) m.dispose?.();
		this.group.clear?.();
		if ( scene && this.group.parent === scene ) scene.remove( this.group );
		else if ( this.group.parent ) this.group.parent.remove?.( this.group );

	}

}
