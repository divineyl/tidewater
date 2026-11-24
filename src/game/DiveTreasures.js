import { Group, Mesh, BoxGeometry, SphereGeometry, CylinderGeometry } from '../engine/index.js';
import { standard } from '../materials/Materials.js';
import { LAYERS } from '../core/SceneRenderer.js';

export const DIVE_TREASURES = Object.freeze( [
	{
		id: 'pearl_reef_west', x: - 84, z: 52, reward: 120, kind: 'pearl',
		nameEn: 'Giant Reef Pearl', nameZh: '珊瑚礁巨型珍珠贝',
		hintEn: 'West coral reef seabed.', hintZh: '海湾西侧珊瑚礁海底。',
	},
	{
		id: 'anchor_pier', x: 50, z: 44, reward: 95, kind: 'relic',
		nameEn: 'Old Pier Brass Compass', nameZh: '老码头黄铜罗盘',
		hintEn: 'Deep pilings just off the pier head.', hintZh: '木栈桥尽头外侧的深水桩底。',
	},
	{
		id: 'chest_coral_arch', x: - 96, z: 76, reward: 185, kind: 'chest',
		nameEn: 'Sunken Reef Chest', nameZh: '珊瑚礁沉船宝盒',
		hintEn: 'Outer edge of the western reef.', hintZh: '西侧珊瑚礁外缘深槽处。',
	},
	{
		id: 'bottle_west_cove', x: - 74, z: - 46, reward: 80, kind: 'bottle',
		nameEn: 'Driftwood Message Bottle', nameZh: '西岸漂流瓶日记',
		hintEn: 'Shallow cove off the west palm beach.', hintZh: '西岸椰林海滩外浅水沙底。',
	},
	{
		id: 'amphora_east_drop', x: 148, z: 36, reward: 140, kind: 'relic',
		nameEn: 'Terracotta Amphora', nameZh: '东崖海底古陶罐',
		hintEn: 'Rocky drop-off east of the harbor.', hintZh: '东岬渔港外侧礁崖水下。',
	},
	{
		id: 'crown_shell_bay', x: - 24, z: 38, reward: 110, kind: 'pearl',
		nameEn: 'Imperial Conch Shell', nameZh: '海湾皇冠海螺',
		hintEn: 'Sandy mid-bay shelf.', hintZh: '中心海湾浅滩砂底。',
	},
	{
		id: 'lantern_wreck', x: 22, z: 118, reward: 175, kind: 'chest',
		nameEn: 'Shipwreck Brass Lantern', nameZh: '沉船黄铜航标灯',
		hintEn: 'South bay outer drop-off.', hintZh: '海湾南侧外缘沉船斜坡。',
	},
	{
		id: 'abyss_relic', x: - 62, z: 115, reward: 240, kind: 'chest',
		nameEn: 'Abyssal Astrolabe', nameZh: '深海青铜星盘',
		hintEn: 'Deep reef shelf south of the lagoon.', hintZh: '珊瑚泻湖南侧深海陡坡。',
	},
] );

const hasOwn = ( obj, k ) => typeof k === 'string' && Object.prototype.hasOwnProperty.call( obj, k );

export function checkTreasureCollect( pos, collectedMap = {}, maxDist = 3.6 ) {

	if ( ! pos || ! Number.isFinite( pos.x ) || ! Number.isFinite( pos.z ) ) return null;
	if ( Number.isFinite( pos.y ) && pos.y >= - 0.45 ) return null;

	for ( const tr of DIVE_TREASURES ) {

		if ( collectedMap && hasOwn( collectedMap, tr.id ) && collectedMap[ tr.id ] ) continue;
		const dist = Math.hypot( pos.x - tr.x, pos.z - tr.z );
		if ( dist <= maxDist ) return tr;

	}

	return null;

}

function buildTreasureProp( tr ) {

	const g = new Group();
	const glowColor = tr.kind === 'chest' ? 0xffd166 : tr.kind === 'pearl' ? 0x8ef5eb : 0x5ce0d2;
	const glowMat = standard( { color: glowColor, emissive: glowColor, emissiveIntensity: 1.5, roughness: 0.25 } );
	const baseMat = standard( { color: tr.kind === 'chest' ? 0x6f4b2a : 0xb98a4e, roughness: 0.65, metalness: tr.kind === 'relic' ? 0.6 : 0.1 } );

	if ( tr.kind === 'chest' ) {

		const box = new Mesh( new BoxGeometry( 0.72, 0.44, 0.48 ), baseMat );
		box.position.y = 0.22;
		box.layers.set( LAYERS.OPAQUE );
		g.add( box );

		const trim = new Mesh( new BoxGeometry( 0.75, 0.08, 0.51 ), glowMat );
		trim.position.y = 0.34;
		trim.layers.set( LAYERS.OPAQUE );
		g.add( trim );

	} else if ( tr.kind === 'pearl' ) {

		const shell = new Mesh( new CylinderGeometry( 0.4, 0.28, 0.16, 12 ), baseMat );
		shell.position.y = 0.08;
		shell.layers.set( LAYERS.OPAQUE );
		g.add( shell );

		const pearl = new Mesh( new SphereGeometry( 0.14, 12, 10 ), glowMat );
		pearl.position.y = 0.24;
		pearl.layers.set( LAYERS.OPAQUE );
		g.add( pearl );

	} else {

		const body = new Mesh( new CylinderGeometry( 0.16, 0.13, 0.46, 10 ), baseMat );
		body.position.y = 0.23;
		body.layers.set( LAYERS.OPAQUE );
		g.add( body );

		const core = new Mesh( new SphereGeometry( 0.1, 10, 8 ), glowMat );
		core.position.y = 0.52;
		core.layers.set( LAYERS.OPAQUE );
		g.add( core );

	}

	const halo = new Mesh( new CylinderGeometry( 0.75, 0.75, 0.04, 16 ), glowMat );
	halo.position.y = 0.03;
	halo.layers.set( LAYERS.OPAQUE );
	g.add( halo );

	return { group: g, glowMat };

}

function disposeProp( prop, parent ) {

	if ( ! prop ) return;
	const geos = new Set();
	const mats = new Set();
	prop.group.traverse( ( obj ) => {

		if ( obj.geometry ) geos.add( obj.geometry );
		if ( obj.material ) {

			if ( Array.isArray( obj.material ) ) {

				for ( const m of obj.material ) if ( m ) mats.add( m );

			} else {

				mats.add( obj.material );

			}

		}

	} );
	for ( const g of geos ) g.dispose?.();
	for ( const m of mats ) m.dispose?.();
	prop.group.clear?.();
	if ( parent && prop.group.parent === parent ) parent.remove( prop.group );
	else if ( prop.group.parent ) prop.group.parent.remove?.( prop.group );

}

export class DiveTreasureManager {

	constructor( { scene = null, terrain = null } = {} ) {

		this.scene = scene;
		this.terrain = terrain;
		this.items = new Map();
		this._time = 0;
		this.group = new Group();
		this.group.name = 'DiveTreasures';
		if ( this.scene ) {

			for ( const tr of DIVE_TREASURES ) {

				const prop = buildTreasureProp( tr );
				const seabed = this.terrain ? this.terrain.heightAt( tr.x, tr.z ) : - 4;
				prop.group.position.set( tr.x, Math.min( - 1.0, seabed + 0.18 ), tr.z );
				this.group.add( prop.group );
				this.items.set( tr.id, prop );

			}

			this.scene.add( this.group );

		}

	}

	syncCollected( collectedMap = {} ) {

		for ( const [ id, prop ] of [ ...this.items.entries() ] ) {

			if ( collectedMap && hasOwn( collectedMap, id ) && collectedMap[ id ] ) {

				disposeProp( prop, this.group );
				this.items.delete( id );

			}

		}

	}

	update( dt ) {

		const step = Number.isFinite( dt ) && dt > 0 ? Math.min( dt, 0.25 ) : 0;
		this._time += step;
		let idx = 0;
		for ( const prop of this.items.values() ) {

			idx ++;
			prop.glowMat.emissiveIntensity = 1.15 + 0.65 * Math.sin( this._time * 2.8 + idx );

		}

	}

	dispose() {

		for ( const prop of this.items.values() ) disposeProp( prop, this.group );
		this.items.clear();
		if ( this.scene && this.group.parent === this.scene ) this.scene.remove( this.group );

	}

}
