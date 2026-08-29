import * as gm from '../gmaps.js'
import aisTTL from '../ais/ttl.js'
import {
	calculateOffset,
	calculateVectorEndpoint
} from '../geo.js'
import {
	NAV_STATUS,
	STATION_TYPE,
	VESSEL_TYPE,
	ATON_TYPE,
} from '../ais/strings.js'

const colors = {
	red: '#dc2626',
	yellow: '#ca8a04',
	blue: '#2563eb',
	orange: '#ea580c',
	green: '#16a34a',
	purple: '#9333ea',
	pink: '#db2777',
}

const STATION_COLOR = {
	1: colors.blue,		// Vessel
	2: colors.purple,	// Base Station
	3: colors.orange,	// SAR Aircraft
	4: colors.red,		// Aid-to-Navigation
	5: colors.pink,		// AIS-SART
	6: colors.pink,		// AIS-MOB
	7: colors.pink,		// EPIRB
}

class Ship {
	constructor (map, ship) {
		this.map = map
		this.ship = ship
		this.marker = new gm.Marker3DInteractiveElement({
			altitudeMode: 'CLAMP_TO_GROUND'
		})
		this.pin = new gm.PinElement()
		this.marker.append(this.pin)
		this.marker.ship = ship
		this.marker.addEventListener('gmp-click', this.showPopover)
		this.map.append(this.marker)
		this.pop = null
		this.pre = null
		this.vector = null
		this.render()
	}

	get mmsi () {
		return this.ship.mmsi
	}

	get color () {
		const ship = this.ship
		if (ship.stationType == 4) {
			if (ship.aidtype === 24) return colors.green
			if (ship.aidtype === 25) return colors.red
			return colors.yellow
		}
		return STATION_COLOR[ship.stationType] || colors.blue
	}

	get heading () {
		const ship = this.ship
		if (ship.hdg === 0 || ship.hdg && ship.hdg !== 511) {
			return ship.hdg
		}
		if (ship.cog === 0 || ship.cog && ship.cog < 360) {
			return ship.cog
		}
	}

	get center () {
		const ship = this.ship
		const heading = this.heading
		const dimA = ship.dimA || 0
		const dimB = ship.dimB || 0
		const dimC = ship.dimC || 0
		const dimD = ship.dimD || 0
		const dFore = (dimA - dimB) / 2
		const dPort = (dimC - dimD) / 2
		return calculateOffset(ship.lat, ship.lon, heading, dFore, dPort)
	}

	get meta () {
		const ship = this.ship
		return {
			mmsi: ship.mmsi,
			class: ship.class || undefined,
			name: ship.shipname || undefined,
			callSign: ship.callsign || undefined,
			stationType: STATION_TYPE[ship.stationType],
			vesselType: VESSEL_TYPE[ship.cargo],
			aidType: ATON_TYPE[ship.aidtype],
			status: NAV_STATUS[ship.navstatus],
			destination: ship.destination || undefined,
			length: ship.length || undefined,
			width: ship.width || undefined,
			heading: this.heading,
			sog: ship.sog,
			cog: ship.cog,
			rot: ship.rot,
			repeat: ship.repeat || undefined,
			virtual: ship.virtual || undefined,
			updated: new Date(ship.updated).toLocaleString(),
		}
	}

	render () {
		const ship = this.ship
		const now = Date.now()
		let position = { lat: ship.lat, lng: ship.lon, altitude: 0 }
		if (!this.skipOffset) {
			const center = this.center
			position.lat = center?.lat ?? ship.lat
			position.lng = center?.lng ?? ship.lon
		}
		const age = now - ship.updated
		const isVessel = ship.stationType === 1
		const isOld = age >= aisTTL[ship.stationType].oldAge || 0
		const isMoving = ship.sog !== undefined && ship.sog > 0.3
		const opacity = isOld || (isVessel && !isMoving) ? '80' : 'ff'
		const color = this.color
		this.marker.position = position
		this.pin.glyphText = isOld ? '✕' : null
		this.pin.glyphColor = `#222222${opacity}`
		this.pin.borderColor = `#222222${opacity}`
		this.pin.background = `${color}${opacity}`
		const hasVector = ship.cog !== undefined && ship.cog < 360 && ship.sog !== undefined && ship.sog > 0.3
		if (hasVector && !isOld) {
			const endPosition = calculateVectorEndpoint(position.lat, position.lng, ship.sog, ship.cog, 1000 * 60)
			if (!this.vector) {
				this.vector = new gm.Polyline3DElement({
					altitudeMode: 'CLAMP_TO_GROUND',
					strokeWidth: 1,
				})
				this.map.append(this.vector)
			}
			this.vector.strokeColor = `#000000${opacity}`
			this.vector.path = [position, endPosition]
		} else if (this.vector) {
			this.vector.remove()
			this.vector = null
		}
		if (this.pop?.open) {
			this.renderPopover()
		}
	}

	renderPopover () {
		if (!this.pre) return
		const meta = this.meta
		const info = JSON.stringify(meta, null, 2)
		if (this.pre.textContent !== info) {
			this.pre.textContent = info
		}
	}

	showPopover = () => {
		if (!this.pop) {
			this.pop = new gm.PopoverElement({
				positionAnchor: this.marker,
				autoPanDisabled: true,
			})
			this.pre = document.createElement('pre')
			this.pre.style.fontSize = '0.8rem'
			this.pop.appendChild(this.pre)
		}
		this.renderPopover()
		this.pop.open = true
		this.map.append(this.pop)
	}

	destroy () {
		if (this.pop) {
			this.pop.open = false
		}
		this.marker.remove()
		if (this.vector) {
			this.vector.remove()
			this.vector = null
		}
	}
}

export default Ship
