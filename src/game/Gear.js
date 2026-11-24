// Gear and upgrade data. The upgrade shop (a vendor by the boathouse) is not built yet; everything
// the game reads goes through gearStats( state.upgrades ), so buying a level is just
// state.upgrades[ key ]++ and the stats follow.
//
// Each track: levels[ 0 ] is what you start with; cost is the price of that level (0 for the first).
export const UPGRADES = {
	// rod and reel
	line: { name: 'Fishing line', levels: [
		{ cost: 0, label: '8 lb mono', lineKg: 7 },
		{ cost: 60, label: '15 lb mono', lineKg: 13 },
		{ cost: 180, label: '30 lb braid', lineKg: 26 },
		{ cost: 450, label: '60 lb braid', lineKg: 50 },
	] },
	reel: { name: 'Reel', levels: [
		{ cost: 0, label: 'Old spinning reel', reelSpeed: 1.1 },
		{ cost: 90, label: 'Smooth spinning reel', reelSpeed: 1.6 },
		{ cost: 320, label: 'Conventional reel', reelSpeed: 2.2 },
	] },
	rod: { name: 'Rod', levels: [
		{ cost: 0, label: 'Hand-me-down rod', castM: 22 },
		{ cost: 75, label: '7 ft graphite rod', castM: 32 },
		{ cost: 260, label: '9 ft surf rod', castM: 45 },
	] },
	// boat
	hold: { name: 'Fish hold', levels: [
		{ cost: 0, label: 'Cooler', holdKg: 30 },
		{ cost: 120, label: 'Ice chest', holdKg: 70 },
		{ cost: 400, label: 'Insulated fish hold', holdKg: 160 },
	] },
	fuel: { name: 'Fuel tank', levels: [
		{ cost: 0, label: '40 L tank', fuelL: 40 },
		{ cost: 150, label: '80 L tank', fuelL: 80 },
		{ cost: 380, label: '150 L tank', fuelL: 150 },
	] },
	engine: { name: 'Engine', levels: [
		{ cost: 0, label: 'Tired diesel', speedMul: 1 },
		{ cost: 300, label: 'Rebuilt diesel', speedMul: 1.15 },
		{ cost: 700, label: 'Turbo diesel', speedMul: 1.3 },
	] },
	fishFinder: { name: 'Fish finder', levels: [
		{ cost: 0, label: 'None', finder: false },
		{ cost: 250, label: 'Fish finder (depth and fish on the HUD)', finder: true },
	] },
	lights: { name: 'Boat lights', levels: [
		{ cost: 0, label: 'Nav lights only', deckLights: false },
		{ cost: 140, label: 'Deck floodlights for night fishing', deckLights: true },
	] },
	// land vehicles (Motorcycle & Coastal Buggy)
	vehTires: { name: 'Off-road tires', levels: [
		{ cost: 0, label: 'Stock coastal tires', vehGripMul: 1.0, vehSandDragMul: 1.0, vehWetGripBonus: 0 },
		{ cost: 110, label: 'Knobby dune tires', vehGripMul: 1.12, vehSandDragMul: 0.72, vehWetGripBonus: 0.08 },
		{ cost: 290, label: 'Pro Baja mud-terrain tires', vehGripMul: 1.24, vehSandDragMul: 0.45, vehWetGripBonus: 0.16 },
	] },
	vehEngine: { name: 'Land powertrain', levels: [
		{ cost: 0, label: 'Factory engine', vehPowerMul: 1.0, vehSpeedBonusKmh: 0 },
		{ cost: 180, label: 'High-flow intake & exhaust', vehPowerMul: 1.18, vehSpeedBonusKmh: 12 },
		{ cost: 420, label: 'Turbocharged coastal tune', vehPowerMul: 1.38, vehSpeedBonusKmh: 26 },
	] },
	vehSuspension: { name: 'Suspension & snorkel', levels: [
		{ cost: 0, label: 'Factory springs', vehClimbMul: 1.0, vehWadeDepthBonus: 0 },
		{ cost: 150, label: 'Long-travel coilovers', vehClimbMul: 1.25, vehWadeDepthBonus: 0.25 },
		{ cost: 360, label: 'Rally bypass shocks + snorkel', vehClimbMul: 1.50, vehWadeDepthBonus: 0.55 },
	] },
	vehLights: { name: 'LED light bar', levels: [
		{ cost: 0, label: 'Standard halogen beam', vehLightMul: 1.0, vehLightRangeMul: 1.0 },
		{ cost: 130, label: 'Dual Rally LED light bar', vehLightMul: 1.65, vehLightRangeMul: 1.55 },
	] },
};

export const BOAT_PAINTS = Object.freeze( {
	classic: { label: 'Classic Cream', topside: 0xf2efe6, stripe: 0x0f1a30 },
	navy: { label: 'Deep Navy', topside: 0x1e3554, stripe: 0xf2efe6 },
	coral: { label: 'Coral Sunset', topside: 0xc8553d, stripe: 0xf7e7ce },
	emerald: { label: 'Lagoon Green', topside: 0x265c4b, stripe: 0xebd9b4 },
	sunburst: { label: 'Harbor Yellow', topside: 0xd9a83c, stripe: 0x182538 },
	midnight: { label: 'Midnight Slate', topside: 0x252c36, stripe: 0x5ce0d2 },
} );

export const BOAT_PAINT_IDS = Object.keys( BOAT_PAINTS );

export const FUEL_PRICE = 1.5; // $ per litre of diesel at the chandlery
// litres per second at the helm: idle plus a lot more at full rpm (40 L lasts ~25 min flat out)
export function fuelBurn( rpm ) {

	return 0.0025 + 0.024 * rpm * rpm;

}

const hasOwn = ( obj, k ) => typeof k === 'string' && Object.prototype.hasOwnProperty.call( obj, k );

// next level of a track, or null when maxed
export function nextLevel( upgrades, key ) {

	if ( ! hasOwn( UPGRADES, key ) ) return null;
	const lv = UPGRADES[ key ].levels;
	const cur = Math.max( 0, Math.min( lv.length - 1, upgrades?.[ key ] | 0 ) );
	const i = cur + 1;
	return i < lv.length ? { index: i, ...lv[ i ] } : null;

}

export function defaultUpgrades() {

	const u = {};
	for ( const k in UPGRADES ) u[ k ] = 0;
	return u;

}

// merged stats of the current levels
export function gearStats( upgrades ) {

	const s = {};
	for ( const k in UPGRADES ) {

		const lv = UPGRADES[ k ].levels;
		const i = Math.max( 0, Math.min( lv.length - 1, upgrades?.[ k ] | 0 ) );
		for ( const [ key, v ] of Object.entries( lv[ i ] ) ) if ( key !== 'cost' && key !== 'label' ) s[ key ] = v;

	}

	return s;

}
