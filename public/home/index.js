import state from '../state.js'
import hb from 'hyperbind'
import * as gm from '../gmaps.js'
import aisTTL from '../ais/ttl.js'
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

const STATIONARY_NAV_STATUS = new Set([
	1, // At anchor
	5, // Moored
	6, // Aground
])

function renderShipMeta (ship) {
	const meta = {
		mmsi: ship.mmsi,
		class: ship.class || undefined,
		name: ship.shipname,
		stationType: STATION_TYPE[ship.stationType],
		vesselType: VESSEL_TYPE[ship.cargo],
		aidType: ATON_TYPE[ship.aidtype],
		status: NAV_STATUS[ship.navstatus],
		destination: ship.destination || undefined,
		length: ship.length || undefined,
		width: ship.width || undefined,
		sog: ship.sog,
		cog: ship.cog,
		rot: ship.rot,
		updated: new Date(ship.updated).toLocaleString(),
	}
	for (let key in meta) {
		if (meta[key] === undefined) {
			delete meta[key]
		}
	}
	return meta
}

class Home extends HTMLElement {
	markers = new Map()

	connectedCallback () {
		state.addEventListener('change', this.render)
		state.addEventListener('change.ships', this.renderShips)
		this.renderInterval = setInterval(this.renderShips, 2500)
		this.innerHTML = `<gmp-map-3d mode=satellite></gmp-map-3d>`
		const map = this.map = this.querySelector('gmp-map-3d')
		map.tilt = 67
		map.range = 7015
		map.center = { lat: 40.70875498274823, lng: -74.0064538380301, altitude: 105 }
		map.addEventListener('gmp-click', this.onmapClick)
	}

	disconnectedCallback () {
		state.removeEventListener('change', this.render)
		state.removeEventListener('change.ships', this.renderShips)
		clearInterval(this.renderInterval)
	}

	onmarkerClick = evt => {
		const map = this.map
		const marker = this.selection = evt.target
		let pop = marker.pop
		if (!pop) {
			pop = marker.pop = new gm.PopoverElement({
				positionAnchor: marker,
				autoPanDisabled: true,
			})
		}
		this.renderPopover(pop, marker.ship)
		pop.open = true
		map.append(pop)
		/*
		map.flyCameraTo({
			durationMillis: 2000,
			endCamera: {
				center: marker.position,
				heading: map.heading,
				range: map.range,
				tilt: map.tilt,
			}
		})
		*/
	}

	onmapClick = evt => {
		if (evt.target !== this.map) return
		const marker = this.selection
		delete this.selection
		if (marker) {
			marker.pop.open = false
		}
		this.renderShips()
	}

	renderShips = () => {
		const now = Date.now()
		const activeShips = new Set()
		for (const ship of Object.values(state.ships)) {
			if (!ship.lat || !ship.lon) {
				continue
			}
			const mmsi = ship.mmsi
			activeShips.add(mmsi)
			const title = mmsi
			const position = { lat: ship.lat, lng: ship.lon, altitude: 0 }
			const elapsed = now - ship.updated
			const isOld = elapsed >= (aisTTL[ship.stationType]?.oldAge ?? Infinity)
			const isMoving = ship.stationType !== 1 || ship.sog !== undefined && ship.sog > 0.3
			const isStationary = STATIONARY_NAV_STATUS.has(ship.navstatus) || !isMoving
			const opacity = isOld || isStationary ? '80' : 'ff'
			let color = STATION_COLOR[ship.stationType]
			if (ship.stationType == 4) {
				if (ship.aidtype === 24) color = colors.green
				else if (ship.aidtype === 25) color = colors.red
				else color = colors.yellow
			}
			let marker = this.markers.get(mmsi)
			let pin = marker?.pin
			if (!marker) {
				marker = new gm.Marker3DInteractiveElement({
					altitudeMode: 'CLAMP_TO_GROUND'
				})
				pin = marker.pin = new gm.PinElement()
				marker.append(pin)
				marker.ship = ship
				marker.addEventListener('gmp-click', this.onmarkerClick)
				this.markers.set(mmsi, marker)
				this.map.append(marker)
			}
			marker.position = position
			pin.glyphText = isOld ? '✕' : null
			pin.glyphColor = `#222222${opacity}`
			pin.borderColor = `#222222${opacity}`
			pin.background = `${color}${opacity}`
			if (marker.pop?.open) {
				this.renderPopover(marker.pop, ship)
			}
		}
		for (const [mmsi, marker] of this.markers.entries()) {
			if (!activeShips.has(mmsi)) {
				this.markers.delete(mmsi)
				marker.remove()
			}
		}
	}

	renderPopover (pop, ship) {
		const meta = renderShipMeta(ship)
		const info = JSON.stringify(meta, null, 2)
		pop.innerHTML = `<pre style=font-size:0.8rem>${info}</pre>`
	}

	render = async () => {
		
	}
}

customElements.define('x-home', Home)
