import { Vector3, Color } from '../engine/index.js';
import { WORLD } from '../world/WorldLayout.js';
import { FISH, LURES, LURE_IDS } from './FishTable.js';
import { habitatAt, pickSpecies, rollWeight, biteDelay } from './Bites.js';
import { CatchMinigame } from './CatchMinigame.js';
import { GameState } from './GameState.js';
import { FishingRod } from './FishingRod.js';
import { FishStand } from './FishStand.js';
import { Chandlery } from './Chandlery.js';
import { CatchDisplay } from './CatchDisplay.js';
import { UPGRADES, fuelBurn } from './Gear.js';
import { GameHUD } from './GameHUD.js';
import { Minimap } from './Minimap.js';
import { Guide } from './Guide.js';
import { applyCatchToBounties } from './Bounties.js';
import { checkLandmarkDiscovery } from './Landmarks.js';
import { RallyCourse, RALLY_GATES } from './RallyCourse.js';
import { CrabTrapManager } from './CrabTraps.js';
import { DiveTreasureManager, checkTreasureCollect } from './DiveTreasures.js';
import { evaluateAchievements } from './Achievements.js';
import { getLang, tr, trFish, trUpgradeName, trUpgradeLabel } from '../i18n/i18n.js';

// how long the catch card stays up unless dismissed (ms)
const CATCH_CARD_MS = 9000;

// The fishing game on top of the world:
//   R          take out / put away the rod (on foot, on the pier, on the boat's deck)
//   hold LMB   wind up, release to cast (hold longer = farther)
//   LMB        strike when a fish takes the bobber ("!"); then hold LMB to reel, let go to ease off
//   RMB        reel an empty line back in
//   I / Tab    cooler / hold contents and the fish log
//   E          at the fish stand: sell your catch
export class Game {

	constructor( app ) {

		this.app = app;
		this.state = new GameState();
		this.state.load();
		this.rod = new FishingRod( { scene: app.scene, camera: app.camera, query: app.query, terrain: app.terrainData, audio: app.audio } );
		this.rod.onLand = ( where ) => this.onBobberLanded( where );
		this.stand = new FishStand( { scene: app.scene, terrain: app.terrainData, colliders: app.colliders } );
		this.display = new CatchDisplay( { scene: app.scene, stall: this.stand.iceFish() } );
		this.landing = null; // { species, kg } while the caught fish swings in view
		this.chandlery = new Chandlery( { scene: app.scene, terrain: app.terrainData, colliders: app.colliders, material: this.stand.material } );
		this.vendors = [ this.stand.vendor, this.chandlery.vendor ];
		// boat upgrades: engine (thrust / top speed) and deck floodlights for night fishing
		const b = app.boatCtl;
		this._engineBase = { maxThrust: b.maxThrust, pitchSpeed: b.pitchSpeed };
		this.floods = [];
		if ( app.localLights ) this.addFloodlights( app.localLights, app.boat );
		this._fuelOut = false;
		this._sonarT = 0;
		this._sonar = null;
		this.hud = null;
		this.fight = null; // CatchMinigame while a fish is on
		this.bite = null; // { phase: 'wait' | 'nibble' | 'take', t, nibbles, species, kg }
		this._lmb = false;
		this._rmb = false;
		this._hookedSpecies = null;
		this._pier = WORLD.pier;
		this._tmp = new Vector3();
		this._exploreT = 0;
		this._achCheckT = 0;
		this.rally = new RallyCourse( { scene: app.scene, terrain: app.terrainData } );
		this.crabTraps = new CrabTrapManager( { scene: app.scene, terrain: app.terrainData } );
		this.crabTraps.loadFromState( this.state.crabTraps );
		this.diveTreasures = new DiveTreasureManager( { scene: app.scene, terrain: app.terrainData } );
		this.diveTreasures.syncCollected( this.state.treasures );
		this._unlockedAch = new Set( evaluateAchievements( this.state ).unlockedIds );
		this.applyGear();
		this.state.onChange( () => {

			this.applyGear();
			this.diveTreasures?.syncCollected?.( this.state.treasures );

		} );

	}

	applyGear() {

		const g = this.state.stats;
		this.rod.setGear( { castM: g.castM, reelSpeed: g.reelSpeed } );
		const b = this.app.boatCtl;
		if ( b && this._engineBase ) {

			b.maxThrust = this._engineBase.maxThrust * g.speedMul * g.speedMul;
			b.pitchSpeed = this._engineBase.pitchSpeed * g.speedMul;

		}

		for ( const f of this.floods || [] ) f.scale = g.deckLights ? 1 : 0;
		if ( this.app.vehicleManager ) {

			for ( const vh of this.app.vehicleManager.vehicles ) {

				if ( typeof vh.applyUpgrades === 'function' ) vh.applyUpgrades( g );

			}

		}

	}

	// two floodlights under the back of the wheelhouse roof, lighting the cockpit and the water
	// astern (night only, like every local light; switched by the lights upgrade)
	addFloodlights( lights, boat ) {

		const obj = boat.group;
		for ( const x of [ - 0.8, 0.8 ] ) {

			const local = new Vector3( x, 2.25, - 1.0 );
			const localDir = new Vector3( x * 0.25, - 0.75, - 0.62 ).normalize();
			const src = {
				position: new Vector3(), color: new Color( 1.0, 0.93, 0.8 ), intensity: 3.2, range: 14, kind: 'boatFlood',
				dir: new Vector3(), cosInner: 0.8, cosOuter: 0.45, scale: 0,
				update() {

					obj.updateWorldMatrix( true, false );
					this.position.copy( local ).applyMatrix4( obj.matrixWorld );
					this.dir.copy( localDir ).transformDirection( obj.matrixWorld );

				},
			};
			src.update();
			this.floods.push( src );
			lights.add( src );

		}

	}

	buy( key ) {

		const r = this.state.buy( key );
		if ( r ) this.toast( `${ trUpgradeName( key, UPGRADES[ key ].name ) }: ${ trUpgradeLabel( key, r.index, r.label ) }` );
		return r;

	}

	refuel() {

		const l = this.state.refuel();
		if ( l > 0 ) {

			this._fuelOut = false;
			this.toast( getLang() === 'zh' ? `已加满柴油 · ${ l.toFixed( 0 ) } L` : `Filled up · ${ l.toFixed( 0 ) } L` );

		}

		return l;

	}

	toast( text, ms = 2600 ) {

		if ( this.hud ) this.hud.toast( text, ms );
		else console.log( '[game]', text );

	}

	get canFish() {

		const app = this.app, p = app.player;
		const aboardCoopBoat = p.mode === 'coop' && p.coop?.kind === 'boat';
		return ! app.freeCam && ( p.mode === 'walk' || p.mode === 'deck' || aboardCoopBoat ) && ! ( app.ui && app.ui.ui && app.ui.ui._photo );

	}

	// ---- per frame (after the player / camera update)
	update( dt ) {

		const app = this.app, p = app.player, inp = app.input, rod = this.rod;
		this._cardDismissed = false;
		if ( ! this.hud && app.ui && app.ui.ui && typeof document !== 'undefined' && document.head ) {

			const ui = app.ui.ui;
			this.hud = new GameHUD( ui, this );
			// the minimap (lower right) and the first-play guide (intro, one-time tips; replay from F1)
			this.minimap = new Minimap( ui.hud || ui.root, this );
			this.guide = new Guide( ui, this, this.minimap );
			ui.onReplayGuide = () => this.guide.replay();
			ui.onOpenJournal = () => this.hud?.toggleJournal();

		}

		const ui = app.ui && app.ui.ui;
		const photo = !! ( ui && ui._photo );
		const uiBlocked = !! ( ui && ( ui._start || ui._help ) );
		const guideOpen = !! ( this.guide && this.guide.open );
		const panelOpen = ( this.hud && ( this.hud.invOpen || this.hud.standOpen || this.hud.journalOpen ) ) || ( this.minimap && this.minimap.fullOpen );

		const can = this.canFish;
		if ( inp.hit( 'KeyR' ) && can && ! this.fight && ! panelOpen && ! uiBlocked && ! guideOpen ) {

			rod.equip( ! rod.equipped );
			if ( ! rod.equipped ) this.cancelLine();
			this.toast( tr( rod.equipped ? 'Rod out · hold left mouse to cast' : 'Rod away' ), 1600 );

		}

		if ( inp.hit( 'KeyB' ) && can && ! this.fight && ! panelOpen && ! uiBlocked && ! guideOpen ) {

			const idx = LURE_IDS.indexOf( this.state.lure );
			const nextId = LURE_IDS[ ( idx + 1 ) % LURE_IDS.length ];
			this.state.setLure( nextId );
			const spec = LURES[ nextId ];
			this.toast( `${ tr( spec.name ) } · ${ tr( spec.desc ) }`, 2400 );

		}

		if ( inp.hit( 'KeyU' ) && p.mode === 'vehicle' && p.activeVehicle && ! panelOpen && ! uiBlocked && ! guideOpen && ! photo ) {

			this.rally.start( p.activeVehicle.id );
			app.audio?.uiChime?.( 'checkpoint' );
			this.toast( tr( 'Rally started! Follow the glowing gates to the lighthouse' ), 2600 );

		}

		const aboardOwnBoat = p.mode === 'boat' || p.mode === 'deck';
		if ( aboardOwnBoat && ! panelOpen && ! uiBlocked && ! guideOpen && ! photo && this.crabTraps ) {

			const bx = app.boatCtl?.position?.x ?? p.position.x;
			const bz = app.boatCtl?.position?.z ?? p.position.z;
			const nearTrap = this.crabTraps.findNearest( { x: bx, z: bz }, 14 );
			if ( ! p.prompt && ! this.fight && nearTrap?.trap?.ready ) {

				p.prompt = { key: 'K', text: 'Haul crab trap!' };

			}

			if ( inp.hit( 'KeyK' ) ) {

				if ( nearTrap ) this.haulCrabTrap( nearTrap.trap.id );
				else this.deployCrabTrap();

			}

		}

		if ( ! can && rod.equipped ) {

			// swimming, driving, free camera: the line comes in and the rod goes away
			this.cancelLine( true );
			rod.equip( false );

		}

		if ( photo && this.hud ) {

			if ( this.hud.invOpen ) this.hud.toggleInventory( false );
			if ( this.hud.journalOpen ) this.hud.toggleJournal( false );
			if ( this.hud.standOpen ) this.hud.closeStand();

		}

		if ( ! uiBlocked && ! photo && ! guideOpen ) {

			if ( this.hud && ( inp.hit( 'KeyI' ) || inp.hit( 'Tab' ) ) ) this.hud.toggleInventory();
			if ( this.hud && inp.hit( 'KeyJ' ) && ! this.fight ) this.hud.toggleJournal();
			if ( this.minimap && inp.hit( 'KeyN' ) ) this.minimap.toggleFull();

		}

		if ( photo && this.minimap && this.minimap.fullOpen ) this.minimap.toggleFull( false );
		if ( inp.hit( 'Escape' ) ) {

			if ( this.hud ) {

				this.hud.toggleInventory( false );
				this.hud.toggleJournal( false );
				this.hud.closeStand();

			}

			if ( this.minimap ) this.minimap.toggleFull( false );

		}

		// mouse edges (plus gamepad RT to cast/reel and B to cancel line when rod is out)
		const gpCast = rod.equipped && inp.gp && inp.gp.connected && inp.gp.rt > 0.35;
		const gpReelEmpty = rod.equipped && inp.gpDown && inp.gpDown( 1 );
		const lmb = ( inp.mouseDown || gpCast ) && inp.enabled, rmb = ( inp.rightDown || gpReelEmpty ) && inp.enabled;
		const lDown = lmb && ! this._lmb, lUp = ! lmb && this._lmb, rDown = rmb && ! this._rmb;
		this._lmb = lmb;
		this._rmb = rmb;
		const modalNow = ( this.hud && ( this.hud.invOpen || this.hud.standOpen || this.hud.journalOpen ) ) || ( this.minimap && this.minimap.fullOpen ) || uiBlocked || guideOpen || photo;

		if ( rod.equipped && ! modalNow ) {

			if ( rod.state === 'idle' && lDown ) rod.startWindup();
			else if ( rod.state === 'windup' && lUp ) rod.release();
			else if ( rod.state === 'floating' ) {

				if ( lDown ) this.strike();
				else if ( rDown ) {

					rod.retrieve();
					this.bite = null;

				}

			} else if ( rod.state === 'flying' && rDown ) rod.retrieve();

		}

		// bites and the fight
		if ( rod.state === 'floating' ) this.updateBite( dt );
		else if ( ! this.fight ) rod.dip = Math.max( 0, rod.dip - dt * 4 );
		if ( this.fight ) this.updateFight( dt, lmb && ! panelOpen );

		rod.update( dt, { visible: can, fight: this.fight } );
		// the landed fish hangs on the end of the line, turned to face you, then goes in the cooler. With
		// the HUD the catch card comes up once the fish has swung in, and the fish stays (slowly turning)
		// until the card is dismissed (click, E, Esc) or times out.
		const L = this.landing;
		if ( L && rod.state === 'landing' && can ) {

			const c = app.camera.position, m = rod.bobber;
			let yaw = Math.atan2( c.x - m.x, c.z - m.z );
			if ( L.card ) {

				if ( ! L.shown && rod.t > 0.3 ) {

					L.shown = true;
					this.hud.showCatch( L.card, CATCH_CARD_MS );
					this.app.mp?.broadcastCatch?.( L.card );

				}

				if ( L.shown ) {

					// a slow turn so both flanks show
					L.cardT += dt;
					yaw += Math.sin( L.cardT * 0.7 ) * 0.55;
					if ( lDown || inp.hit( 'KeyE' ) || inp.hit( 'Escape' ) || L.cardT > CATCH_CARD_MS / 1000 ) {

						this._cardDismissed = true; // this frame's E / click belong to the card
						this.endLanding();

					}

				}

			}

			if ( this.landing ) {

				// with the HUD the fish is shown on the full-screen catch card (studio portrait), not on
				// the line; without it (headless) it hangs on the line for a moment
				if ( ! L.card ) this.display.show( L.species, L.kg, m, yaw, dt );
				else if ( this.display.shown ) this.display.hide();
				if ( ! L.card && rod.t > 2.8 ) this.endLanding();

			}

		} else if ( this.landing || this.display.shown ) this.endLanding();

		p.busy = rod.lineInWater || rod.state === 'windup' || rod.state === 'landing' || Boolean( this.landing );

		this.updateBoat( dt );
		this.updateExploration( dt );

		// the traders
		for ( const v of this.vendors ) v.update( dt, p.mode === 'walk' ? p.position : null );
		this.updateVendors( inp, p );

		// prompts when the player has nothing to say
		if ( ! p.prompt && can ) p.prompt = this.prompt();

		const aboard = p.mode === 'boat' || p.mode === 'deck';
		// the catch card's live fish portrait (or one queued thumbnail)
		if ( this.hud && this.hud.portrait ) this.hud.portrait.update( dt );
		if ( this.hud ) this.hud.update( {
			fuel: aboard ? { litres: this.state.fuelL, tank: this.state.stats.fuelL } : null,
			sonar: aboard && this.state.stats.finder ? this._sonar : null,
			fight: this.fight,
			casting: rod.state === 'windup',
			power: rod.power,
			bite: this.bite && this.bite.phase === 'take',
			aiming: rod.equipped,
			lure: rod.equipped ? this.state.lure : null,
			rally: this.rally?.active ? { gate: this.rally.gateIndex, total: RALLY_GATES.length, elapsed: this.rally.elapsed } : null,
			oxygen: ( p && p.mode === 'swim' && p.oxygen < 0.995 ) ? p.oxygen : null,
			traps: this.crabTraps ? { deployed: this.crabTraps.traps.length, ready: this.crabTraps.traps.filter( ( t ) => t.ready ).length } : null,
		} );
		if ( this.minimap ) this.minimap.update( dt );
		if ( this.guide ) this.guide.update( dt );

	}

	prompt() {

		const rod = this.rod, p = this.app.player;
		if ( ! rod.equipped ) {

			// by the water (boat deck, pier, the wet beach, wading): suggest the rod
			const byWater = p.mode === 'deck' || ( p.mode === 'walk' && [ 'wood', 'wetsand', 'water' ].includes( p.surface ) );
			return byWater ? { key: 'R', text: 'Take out the rod' } : null;

		}

		const b = this.bite;
		switch ( rod.state ) {

			case 'idle': return { key: 'LMB', text: 'Hold to wind up, release to cast   ·   R  put the rod away' };
			case 'windup': return { key: 'LMB', text: 'Release to cast (hold longer to cast farther)' };
			case 'flying': return null;
			case 'floating':
				if ( b && b.phase === 'take' ) return { key: 'LMB', text: 'Strike now!' };
				if ( b && b.phase === 'nibble' ) return { key: '…', text: 'Something\'s nibbling · wait until the bobber is pulled under' };
				return { key: 'RMB', text: 'Waiting for a bite · right-click to reel the line in' };
			case 'retrieving': return { key: 'RMB', text: 'Reeling in' };
			case 'fighting': return this.fight && this.fight.tension > this.fight.band[ 1 ]
				? { key: 'LMB', text: 'Too much tension · let go!' }
				: { key: 'LMB', text: 'Hold to reel · let go when the tension goes red' };
			case 'landing': return null;
			default: return null;

		}

	}

	// fuel burn at the helm (the engine stops when the tank is dry) and the fish finder
	updateBoat( dt ) {

		const app = this.app, b = app.boatCtl, p = app.player, s = this.state;
		if ( b.driven ) {

			const left = s.burn( fuelBurn( b.rpm ) * dt );
			if ( left <= 0 ) {

				b.throttle = 0;
				if ( ! this._fuelOut ) this.toast( tr( 'Out of fuel · buy diesel at the chandlery by the boathouse' ), 4000 );
				this._fuelOut = true;

			}

		} else if ( this._wasDriven ) s.save();
		this._wasDriven = b.driven;

		if ( ( p.mode === 'boat' || p.mode === 'deck' ) && s.stats.finder ) {

			this._sonarT -= dt;
			if ( this._sonarT <= 0 ) {

				this._sonarT = 0.5;
				const x = b.position.x, z = b.position.z;
				const depth = Math.max( 0, - app.terrainData.heightAt( x, z ) );
				const h = this.habitatAtPoint( x, z, depth );
				let rich = 0;
				for ( const k in h ) rich += h[ k ];
				this._sonar = { depth, fish: Math.min( 1, rich / 1.4 ) };

			}

		}

	}

	updateVendors( inp, p ) {

		const hud = this.hud;
		let near = null;
		if ( p.mode === 'walk' ) for ( const v of this.vendors ) if ( v.inRange( p.position ) ) near = v;
		for ( const v of this.vendors ) v.talking = !! ( hud && hud.standOpen && hud.vendor === v );
		if ( hud && hud.standOpen && ( ! near || near !== hud.vendor ) ) hud.closeStand();
		if ( ! near || this.fight || this._cardDismissed || ( hud && hud.catchOpen ) ) return;
		if ( ! p.prompt ) p.prompt = { key: 'E', text: hud && hud.standOpen ? 'Leave' : `Talk to ${ near.name.split( ' ·' )[ 0 ] }` };
		if ( inp.hit( 'KeyE' ) ) {

			if ( ! hud ) {

				if ( near.kind === 'buyer' ) this.sellAll(); // headless: straight sale

			} else if ( hud.standOpen ) hud.closeStand();
			else hud.openStand( near );

		}

	}

	sellAll() {

		const r = this.state.sell();
		if ( r.count ) this.toast( getLang() === 'zh' ? `售出 ${ r.count } 条渔获，获得 $${ r.total }` : `Sold ${ r.count } fish for $${ r.total }` );
		if ( this.app.audio && this.app.audio.coin ) this.app.audio.coin();
		return r;

	}

	sell( ids ) {

		const r = this.state.sell( ids );
		if ( r.count ) this.toast( getLang() === 'zh' ? `已售出，获得 $${ r.total }` : `Sold for $${ r.total }` );
		return r;

	}

	// ---- bites
	habitat() {

		return this.habitatAtPoint( this.rod.bobber.x, this.rod.bobber.z, this.rod.depth );

	}

	habitatAtPoint( x, z, depth ) {

		const b = { x, z };
		const reef = WORLD.reef;
		const reefDist = Math.hypot( b.x - reef.center.x, b.z - reef.center.z ) - reef.radius;
		const P = this._pier;
		const rect = ( x0, x1, z0, z1 ) => Math.hypot( Math.max( x0 - b.x, 0, b.x - x1 ), Math.max( z0 - b.z, 0, b.z - z1 ) );
		const walk = rect( P.x - P.width / 2, P.x + P.width / 2, P.zStart, P.zEnd );
		const head = rect( P.x - P.headWidth / 2, P.x + P.headWidth / 2, P.zEnd - P.headDepth, P.zEnd );
		return habitatAt( { depth, reefDist, pierDist: Math.min( walk, head ) } );

	}

	get hour() {

		return this.app.settings.timeOfDay;

	}

	onBobberLanded( where ) {

		if ( where !== 'water' ) {

			this.toast( tr( 'Landed on the sand' ), 1400 );
			return;

		}

		const w = this.app.weather ? this.app.weather.getGameplayState() : null;
		this.bite = { phase: 'wait', t: biteDelay( this.habitat(), this.hour, Math.random, w, this.state.lure ) };

	}

	updateBite( dt ) {

		const rod = this.rod;
		const b = this.bite;
		if ( ! b ) return;
		b.t -= dt;
		// bobber motion for the cues
		if ( b.phase === 'nibble' ) rod.dip = Math.max( 0, Math.sin( Math.min( 1, ( b.pulse || 0 ) ) * Math.PI ) * 0.45 );
		else if ( b.phase === 'take' ) rod.dip += ( 1.4 - rod.dip ) * ( 1 - Math.exp( - dt * 14 ) );
		else rod.dip = Math.max( 0, rod.dip - dt * 3 );
		if ( b.phase === 'nibble' ) b.pulse = ( b.pulse || 0 ) + dt * 3.2;

		if ( b.t > 0 ) return;
		if ( b.phase === 'wait' ) {

			const h = this.habitat();
			const w = this.app.weather ? this.app.weather.getGameplayState() : null;
			const species = pickSpecies( h, this.hour, Math.random, w, this.state.lure );
			if ( ! species ) {

				b.t = 8;
				return;

			}

			b.species = species;
			b.kg = rollWeight( species, Math.random, this.state.lure );
			b.phase = 'nibble';
			b.nibbles = 1 + Math.floor( Math.random() * 3 );
			b.t = 0.7 + Math.random() * 0.8;
			b.pulse = 0;

		} else if ( b.phase === 'nibble' ) {

			b.nibbles --;
			b.pulse = 0;
			if ( b.nibbles > 0 ) b.t = 0.6 + Math.random() * 1.0;
			else {

				b.phase = 'take';
				// big, strong fish give a (slightly) shorter window
				b.t = 2.4 - FISH[ b.species ].fight * 0.5;
				if ( this.app.audio && this.app.audio.fishSplash ) this.app.audio.fishSplash( rod.bobber, 0.35 );

			}

		} else if ( b.phase === 'take' ) {

			this.toast( tr( 'It took the bait and ran' ), 1800 );
			const w = this.app.weather ? this.app.weather.getGameplayState() : null;
			this.bite = { phase: 'wait', t: biteDelay( this.habitat(), this.hour, Math.random, w, this.state.lure ) };

		}

	}

	strike() {

		const b = this.bite;
		if ( ! b || b.phase === 'wait' || b.phase === 'nibble' ) {

			// too early: a nibbling fish isn't hooked yet; it keeps nibbling (a hint, no penalty)
			if ( b && b.phase === 'nibble' ) this.toast( tr( 'Not yet · wait for it to pull under' ), 1500 );
			return;

		}

		const g = this.state.stats;
		this.fight = new CatchMinigame( { species: b.species, kg: b.kg, lineKg: g.lineKg, reelSpeed: g.reelSpeed, distance: Math.max( 3, this.rod.lineOut ) } );
		this.bite = null;
		this.rod.hook();
		this.toast( tr( 'Fish on!' ), 1200 );

	}

	updateFight( dt, reeling ) {

		const f = this.fight;
		const st = f.update( dt, reeling );
		// the fish thrashes at the surface as each run starts
		const au = this.app.audio;
		if ( f.surge > 0.6 && ! f._splashed && au && au.fishSplash ) au.fishSplash( this.rod.bobber, 0.3 + 0.5 * Math.min( 1, f.kg / 8 ) );
		f._splashed = f.surge > 0.6 ? true : f.surge < 0.3 ? false : f._splashed;
		if ( st === 'fighting' ) return;
		this.fight = null;
		this.rod.dip = 0;
		const name = trFish( f.species, FISH[ f.species ].name );
		if ( st === 'caught' ) {

			const entry = this.state.addFish( f.species, f.kg, this.hour );
			const info = this.state.lastCatch;
			if ( au && au.fishSplash ) au.fishSplash( this.rod.bobber, 0.8 );
			if ( au && au.fishFlop ) au.fishFlop();

			// Check active bounties & tournament score
			const hab = this.habitat();
			const w = this.app.weather ? this.app.weather.getGameplayState() : null;
			const bRes = applyCatchToBounties( this.state.bounties, { species: f.species, kg: f.kg }, { hour: this.hour, rainIntensity: w?.rainIntensity || 0, stormIntensity: w?.stormIntensity || 0, habitat: hab } );
			if ( bRes.completed.length ) {

				this.state.bountiesDone += bRes.completed.length;
				this.state.addMoney( bRes.totalReward );
				if ( au && au.uiChime ) au.uiChime( 'reward' );
				const zh = getLang() === 'zh';
				this.toast( zh ? `悬赏订单完成！获得奖金 $${ bRes.totalReward }` : `Bounty completed! +$${ bRes.totalReward }`, 4000 );

			} else {

				this.state.save();
				this.state.emit();

			}

			this.app.mp?.recordTournamentCatch?.( info );

			// the catch card (with a HUD) while the fish hangs on the line; a toast otherwise
			if ( this.hud ) this.landing = { species: f.species, kg: f.kg, card: info, cardT: 0 };
			else {

				if ( entry ) this.toast( `${ info.record ? ( getLang() === 'zh' ? '新纪录！' : 'New record! ' ) : '' }${ name } · ${ entry.kg.toFixed( 2 ) } kg · $${ entry.value }`, 3600 );
				else {

					const fullMsg = getLang() === 'zh'
						? `${ name } · ${ f.kg.toFixed( 1 ) } kg · ${ this.state.upgrades.hold > 0 ? '鱼舱' : '冰桶' }已满，只好放生`
						: `${ name } · ${ f.kg.toFixed( 1 ) } kg · no room in the ${ this.state.upgrades.hold > 0 ? 'hold' : 'cooler' }, let it go`;
					this.toast( fullMsg, 3600 );

				}
				this.landing = { species: f.species, kg: f.kg };

			}

			this.rod.land();

		} else if ( st === 'snapped' ) {

			this.toast( tr( 'Snap! The line broke' ), 2400 );
			if ( au && au.lineSnap ) au.lineSnap();
			this.rod.setState( 'idle' );

		} else {

			this.toast( tr( 'It threw the hook' ), 2000 );
			this.rod.endFight();

		}

	}

	// the landed fish goes in the cooler: card, fish and line away
	endLanding() {

		this.landing = null;
		this.display.hide();
		if ( this.hud && this.hud.catchOpen ) this.hud.hideCatch();
		if ( this.rod.state === 'landing' ) this.rod.setState( 'idle' );

	}

	deployCrabTrap() {

		const app = this.app;
		const b = app.boatCtl;
		if ( ! b || ! this.crabTraps ) return false;
		const x = b.position.x, z = b.position.z;
		const depth = app.terrainData ? Math.max( 0, - app.terrainData.heightAt( x, z ) ) : 5;
		const reef = WORLD.reef;
		const reefDist = Math.hypot( x - reef.center.x, z - reef.center.z ) - reef.radius;
		const chk = this.crabTraps.canDeploy( x, z, depth );
		const zh = getLang() === 'zh';
		if ( ! chk.ok ) {

			if ( chk.reason === 'max_traps' ) this.toast( zh ? '最多同时下放 4 只捕蟹笼（先起笼再放）' : 'Max 4 crab traps active (haul one first)', 2800 );
			else if ( chk.reason === 'too_close' ) this.toast( zh ? '离已有蟹笼太近，再开出 10 米下笼' : 'Too close to another trap (move 10m away)', 2400 );
			else this.toast( zh ? '此处水深太浅（需 ≥ 2.2 米）' : 'Too shallow for a crab trap (need ≥ 2.2 m)', 2400 );
			return false;

		}

		const trap = this.crabTraps.deploy( x, z, depth, reefDist );
		if ( ! trap ) return false;
		this.state.setCrabTraps( this.crabTraps.serialize() );
		app.audio?.fishSplash?.( b.position, 0.45 );
		this.toast( zh ? `已下放捕蟹笼 #${ trap.id }（约 75 秒后浮标亮金即可起笼）` : `Crab trap #${ trap.id } deployed! Returns ready in ~75s`, 3000 );
		return true;

	}

	haulCrabTrap( trapId ) {

		if ( ! this.crabTraps ) return null;
		const res = this.crabTraps.haul( trapId );
		if ( ! res ) return null;
		const { haul } = res;
		const zh = getLang() === 'zh';
		this.state.crabTraps = this.crabTraps.serialize();
		this.app.audio?.uiChime?.( 'winch' );
		if ( haul.items.length ) {

			this.state.recordTrapHaul( haul.totalValue );
			const summary = haul.items.map( ( it ) => `${ zh ? it.nameZh : it.nameEn } ${ it.kg.toFixed( 1 ) }kg` ).join( ' + ' );
			this.toast( zh ? `起笼丰收！${ summary } · +$${ haul.totalValue }` : `Trap hauled! ${ summary } · +$${ haul.totalValue }`, 4200 );

		} else {

			this.state.recordTrapHaul( 5 );
			this.toast( zh ? '蟹笼刚浸泡不久只有少许小蟹苗（+$5）' : 'Too early — just small bait crabs (+$5)', 2800 );

		}

		return res;

	}

	updateExploration( dt ) {

		const app = this.app;
		const p = app.player;
		const zh = getLang() === 'zh';

		if ( this.crabTraps ) {

			const readyList = this.crabTraps.update( dt, app.cameraWaterHeight ?? 0 );
			if ( readyList.length ) {

				this.state.setCrabTraps( this.crabTraps.serialize() );
				this.toast( zh ? `捕蟹笼 #${ readyList[ 0 ].id } 浮标闪金光！开船靠近按 K 收笼` : `Crab trap #${ readyList[ 0 ].id } is ready! Sail close & press K`, 3800 );

			}

		}

		if ( this.diveTreasures ) {

			this.diveTreasures.update( dt );
			if ( p && p.mode === 'swim' && p.wasUnder ) {

				const found = checkTreasureCollect( p.position, this.state.treasures, 3.6 );
				if ( found ) {

					const isNew = this.state.recordTreasure( found.id, found.reward );
					if ( isNew ) {

						this.diveTreasures.syncCollected( this.state.treasures );
						app.audio?.uiChime?.( 'treasure' );
						const title = zh ? found.nameZh : found.nameEn;
						this.toast( zh ? `潜水发现海底秘宝「${ title }」！奖励 $${ found.reward }` : `Recovered sunken ${ title }! +$${ found.reward }`, 4200 );

					}

				}

			}

		}

		this._exploreT += dt;
		if ( this._exploreT >= 0.45 && p ) {

			this._exploreT = 0;
			const disc = checkLandmarkDiscovery( p.position, this.state.landmarks, false );
			if ( disc ) {

				const lm = disc.landmark;
				this.state.recordLandmark( lm.id, false, lm.reward );
				app.audio?.uiChime?.( 'reward' );
				const title = zh ? lm.nameZh : lm.nameEn;
				this.toast( zh ? `发现风景打卡点「${ title }」· 奖励 $${ lm.reward }` : `Discovered ${ title } · +$${ lm.reward }`, 3600 );

			}

		}

		this._achCheckT += dt;
		if ( this._achCheckT >= 1.2 ) {

			this._achCheckT = 0;
			const res = evaluateAchievements( this.state );
			for ( const ach of res.list ) {

				if ( ach.done && ! this._unlockedAch.has( ach.id ) ) {

					this._unlockedAch.add( ach.id );
					app.audio?.uiChime?.( 'reward' );
					const an = zh ? ach.nameZh : ach.nameEn;
					const tn = zh ? ach.titleZh : ach.titleEn;
					this.toast( zh ? `解锁成就「${ an }」！获得联机称号「${ tn }」` : `Achievement unlocked: ${ an }! Title: ${ tn }`, 4400 );

				}

			}

		}

		if ( this.rally ) {

			const vh = p?.mode === 'vehicle' ? p.activeVehicle : null;
			const ev = this.rally.update( dt, p, vh );
			if ( ev ) {

				if ( ev.started ) {

					app.audio?.uiChime?.( 'checkpoint' );
					this.toast( zh ? '东岬越野计时赛开始！冲向灯塔终点！' : 'East Headland Rally started!', 2400 );

				} else if ( ev.gateHit ) {

					app.audio?.uiChime?.( 'checkpoint' );
					app.mp?.reportRallyProgress?.( ev.gateIndex, this.rally.elapsed );

				} else if ( ev.finished ) {

					const { elapsed, medal, vehicleId } = ev;
					const rec = this.state.recordRallyTime( vehicleId, elapsed );
					this.state.addMoney( medal.reward );
					app.audio?.uiChime?.( 'tourney' );
					app.mp?.reportRallyFinish?.( elapsed, vehicleId );
					const tierZh = { gold: '金牌', silver: '银牌', bronze: '铜牌', finish: '完赛' }[ medal.tier ] || '完赛';
					const tierEn = medal.tier.toUpperCase();
					const msg = zh
						? `越野赛冲线 ${ elapsed.toFixed( 2 ) } 秒（${ tierZh }）· 奖励 $${ medal.reward }${ rec.isRecord ? ' ★新个人纪录' : '' }`
						: `Rally finish ${ elapsed.toFixed( 2 ) }s (${ tierEn }) · +$${ medal.reward }${ rec.isRecord ? ' ★PB!' : '' }`;
					this.toast( msg, 4500 );
					if ( app.mp?.status === 'connected' ) {

						app.mp.sendChat( zh ? `完成了东岬越野计时赛：${ elapsed.toFixed( 2 ) } 秒（${ tierZh }）` : `Finished East Headland Rally in ${ elapsed.toFixed( 2 ) }s!` );

					}

				} else if ( ev.cancelled ) {

					this.toast( tr( 'Rally cancelled (left vehicle)' ), 2000 );

				}

			}

		}

	}

	onPhotoTaken() {

		const p = this.app?.player;
		const pos = this.app?.camera?.position || p?.position;
		const disc = checkLandmarkDiscovery( pos, this.state.landmarks, true );
		if ( ! disc ) return;
		const lm = disc.landmark;
		const bonus = disc.isNewVisit ? lm.reward + 40 : 40;
		const res = this.state.recordLandmark( lm.id, true, bonus );
		if ( res.isNew || res.isNewPhoto ) {

			this.app?.audio?.uiChime?.( 'reward' );
			const zh = getLang() === 'zh';
			const title = zh ? lm.nameZh : lm.nameEn;
			this.toast( zh ? `明信片打卡「${ title }」成功！奖励 $${ bonus }` : `Postcard photo at ${ title }! +$${ bonus }`, 3800 );

		}

	}

	// line in at once (mode change)
	cancelLine( silent = false ) {

		if ( this.fight && ! silent ) this.toast( tr( 'Lost it' ), 1400 );
		this.fight = null;
		this.bite = null;
		if ( this.rod.state !== 'stowed' ) this.rod.setState( this.rod.equipped ? 'idle' : 'stowed' );

	}

}
