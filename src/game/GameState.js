import { FISH, LURES, fishValue, fishLengthCm } from './FishTable.js';
import { defaultUpgrades, gearStats, nextLevel, UPGRADES, FUEL_PRICE } from './Gear.js';
import { generateBounties, sanitizeBounties } from './Bounties.js';

const SAVE_KEY = 'tidewater.save.v1';

// Everything the player owns: wallet, the fish in the cooler / hold, the fish log and the gear
// levels. Saved to localStorage (per browser) after every change; storage can be missing or throw
// (private windows, blocked site data), so every access is guarded and the game runs without it.
export class GameState {

	constructor( storage = safeStorage() ) {

		this.storage = storage;
		this.money = 0;
		this.inventory = []; // { id, species, kg, cm, value, caughtAt (game hours), record }
		this.log = {}; // species -> { count, bestKg, bestCm }
		// the last addFish: { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept } (the catch card)
		this.lastCatch = null;
		this.upgrades = defaultUpgrades();
		this.fuel = null; // litres left (null = full tank)
		this.lure = 'standard';
		this.bounties = generateBounties( 101 );
		this.bountiesDone = 0;
		this.landmarks = {}; // id -> { visited: true, photo: boolean }
		this.rallyBest = { motorcycle: null, buggy: null };
		this._nextId = 1;
		this.listeners = new Set();

	}

	get stats() {

		return gearStats( this.upgrades );

	}

	get holdKg() {

		let kg = 0;
		for ( const f of this.inventory ) kg += f.kg;
		return kg;

	}

	get holdValue() {

		let v = 0;
		for ( const f of this.inventory ) v += f.value;
		return v;

	}

	// room in the cooler / hold for a fish of `kg`?
	fits( kg ) {

		return this.holdKg + kg <= this.stats.holdKg + 1e-6;

	}

	// store a caught fish; returns the entry, or null when the hold is full (it is logged either way).
	// A record beats an earlier catch of the species; the first one of a species is a new species.
	addFish( species, kg, timeOfDay = 12 ) {

		kg = Math.round( kg * 100 ) / 100;
		const cm = Math.round( fishLengthCm( species, kg ) );
		const logEntry = this.log[ species ] || ( this.log[ species ] = { count: 0, bestKg: 0 } );
		const newSpecies = logEntry.count === 0;
		const prevBestKg = logEntry.bestKg, prevBestCm = logEntry.bestCm ?? ( prevBestKg > 0 ? Math.round( fishLengthCm( species, prevBestKg ) ) : 0 );
		const record = ! newSpecies && kg > prevBestKg;
		logEntry.count ++;
		if ( kg > prevBestKg ) {

			logEntry.bestKg = kg;
			logEntry.bestCm = cm;

		}

		const value = fishValue( species, kg );
		const kept = this.fits( kg );
		this.lastCatch = { species, kg, cm, value, newSpecies, record, prevBestKg, prevBestCm, kept };
		if ( ! kept ) {

			this.save();
			this.emit();
			return null;

		}

		const f = { id: this._nextId ++, species, kg, cm, value, caughtAt: timeOfDay, record };
		this.inventory.push( f );
		this.save();
		this.emit();
		return f;

	}

	// sell the given fish ids (all when omitted); returns the money made
	sell( ids = null ) {

		const keep = [], sold = [];
		for ( const f of this.inventory ) ( ids === null || ids.includes( f.id ) ? sold : keep ).push( f );
		let total = 0;
		for ( const f of sold ) total += f.value;
		this.inventory = keep;
		this.money += total;
		this.save();
		this.emit();
		return { total, count: sold.length };

	}

	release( id ) {

		this.inventory = this.inventory.filter( ( f ) => f.id !== id );
		this.save();
		this.emit();

	}

	// spend money (upgrade shop); false when it can't be afforded
	spend( amount ) {

		if ( amount > this.money ) return false;
		this.money -= amount;
		this.save();
		this.emit();
		return true;

	}

	// buy the next level of an upgrade track; returns the new level entry or null
	buy( key ) {

		if ( ! UPGRADES[ key ] ) return null;
		const next = nextLevel( this.upgrades, key );
		if ( ! next || next.cost > this.money ) return null;
		this.money -= next.cost;
		this.upgrades[ key ] = next.index;
		if ( key === 'fuel' ) this.fuel = null; // a new tank comes full
		this.save();
		this.emit();
		return next;

	}

	get fuelL() {

		return this.fuel === null ? this.stats.fuelL : Math.min( this.fuel, this.stats.fuelL );

	}

	// burn litres (no save: that happens when the boat stops or at the next sale / purchase)
	burn( litres ) {

		this.fuel = Math.max( 0, this.fuelL - litres );
		return this.fuel;

	}

	refuelCost() {

		return Math.ceil( ( this.stats.fuelL - this.fuelL ) * FUEL_PRICE );

	}

	// fill up as far as the money goes; returns litres bought
	refuel() {

		const missing = this.stats.fuelL - this.fuelL;
		const litres = Math.min( missing, Math.floor( this.money / FUEL_PRICE ) );
		if ( litres <= 0 ) return 0;
		this.money -= Math.ceil( litres * FUEL_PRICE );
		this.fuel = this.fuelL + litres;
		if ( this.fuel >= this.stats.fuelL - 1e-3 ) this.fuel = null;
		this.save();
		this.emit();
		return litres;

	}

	onChange( fn ) {

		this.listeners.add( fn );
		return () => this.listeners.delete( fn );

	}

	emit() {

		for ( const fn of this.listeners ) fn( this );

	}

	setLure( id ) {

		if ( ! LURES[ id ] ) return false;
		this.lure = id;
		this.save();
		this.emit();
		return true;

	}

	addMoney( amount ) {

		const delta = Math.round( Number( amount ) || 0 );
		if ( delta <= 0 ) return 0;
		this.money += delta;
		this.save();
		this.emit();
		return delta;

	}

	refreshBounties( seed = Date.now() ) {

		this.bounties = generateBounties( seed );
		this.save();
		this.emit();
		return this.bounties;

	}

	recordLandmark( id, isPhoto = false, reward = 0 ) {

		if ( ! id ) return { isNew: false, isNewPhoto: false };
		const prev = this.landmarks[ id ] && typeof this.landmarks[ id ] === 'object'
			? this.landmarks[ id ]
			: { visited: !! this.landmarks[ id ], photo: false };
		const isNew = ! prev.visited;
		const isNewPhoto = !! ( isPhoto && ! prev.photo );
		if ( ! isNew && ! isNewPhoto ) return { isNew: false, isNewPhoto: false };

		this.landmarks[ id ] = { visited: true, photo: prev.photo || !! isPhoto };
		if ( reward > 0 ) this.money += Math.round( reward );
		this.save();
		this.emit();
		return { isNew, isNewPhoto };

	}

	recordRallyTime( vehicleId, sec ) {

		const key = vehicleId === 'buggy' ? 'buggy' : 'motorcycle';
		const t = Math.round( Number( sec ) * 100 ) / 100;
		if ( ! Number.isFinite( t ) || t <= 0 ) return { isRecord: false, prevBest: null };
		const prevBest = this.rallyBest[ key ];
		const isRecord = prevBest === null || t < prevBest;
		if ( isRecord ) this.rallyBest[ key ] = t;
		this.save();
		this.emit();
		return { isRecord, prevBest };

	}

	toJSON() {

		return {
			v: 1,
			money: this.money,
			inventory: this.inventory,
			log: this.log,
			upgrades: this.upgrades,
			fuel: this.fuel,
			lure: this.lure,
			bounties: this.bounties,
			bountiesDone: this.bountiesDone,
			landmarks: this.landmarks,
			rallyBest: this.rallyBest,
			nextId: this._nextId,
		};

	}

	fromJSON( d ) {

		if ( ! d || d.v !== 1 ) return false;
		this.money = Number.isFinite( d.money ) ? d.money : 0;
		this.inventory = Array.isArray( d.inventory ) ? d.inventory.filter( ( f ) => f && FISH[ f.species ] && Number.isFinite( f.kg ) ) : [];
		// saves from before lengths were recorded
		for ( const f of this.inventory ) if ( ! Number.isFinite( f.cm ) ) f.cm = Math.round( fishLengthCm( f.species, f.kg ) );
		this.log = d.log && typeof d.log === 'object' ? d.log : {};
		for ( const [ k, v ] of Object.entries( this.log ) ) if ( FISH[ k ] && v && v.bestKg > 0 && ! Number.isFinite( v.bestCm ) ) v.bestCm = Math.round( fishLengthCm( k, v.bestKg ) );
		this.upgrades = { ...defaultUpgrades(), ...( d.upgrades || {} ) };
		this.fuel = Number.isFinite( d.fuel ) ? d.fuel : null;
		this.lure = LURES[ d.lure ] ? d.lure : 'standard';
		this.bounties = sanitizeBounties( d.bounties );
		this.bountiesDone = Math.max( 0, Number( d.bountiesDone ) | 0 );
		this.landmarks = {};
		if ( d.landmarks && typeof d.landmarks === 'object' ) {

			for ( const [ lk, lv ] of Object.entries( d.landmarks ) ) {

				if ( lv ) this.landmarks[ lk ] = { visited: true, photo: !! ( lv && lv.photo ) };

			}

		}

		const rb = d.rallyBest && typeof d.rallyBest === 'object' ? d.rallyBest : {};
		this.rallyBest = {
			motorcycle: Number.isFinite( rb.motorcycle ) && rb.motorcycle > 0 ? rb.motorcycle : null,
			buggy: Number.isFinite( rb.buggy ) && rb.buggy > 0 ? rb.buggy : null,
		};
		this._nextId = Math.max( d.nextId | 0, ...this.inventory.map( ( f ) => f.id + 1 ), 1 );
		return true;

	}

	save() {

		if ( ! this.storage ) return;
		try {

			this.storage.setItem( SAVE_KEY, JSON.stringify( this.toJSON() ) );

		} catch ( e ) { /* storage full or blocked: keep playing */ }

	}

	load() {

		if ( ! this.storage ) return false;
		try {

			const raw = this.storage.getItem( SAVE_KEY );
			return raw ? this.fromJSON( JSON.parse( raw ) ) : false;

		} catch ( e ) {

			return false;

		}

	}

	reset() {

		this.money = 0;
		this.inventory = [];
		this.log = {};
		this.upgrades = defaultUpgrades();
		this.fuel = null;
		this.lure = 'standard';
		this.bounties = generateBounties( 101 );
		this.bountiesDone = 0;
		this.landmarks = {};
		this.rallyBest = { motorcycle: null, buggy: null };
		this.save();
		this.emit();

	}

}

function safeStorage() {

	try {

		return typeof localStorage !== 'undefined' ? localStorage : null;

	} catch ( e ) {

		return null;

	}

}
