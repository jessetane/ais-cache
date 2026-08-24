import state from '../state.js'
import hb from 'hyperbind'
import * as gm from '../gmaps.js'
import {
	MSG_TYPE,
	NAV_STATUS,
	STATION_TYPE,
	VESSEL_TYPE,
} from '../ais/strings.js'

function renderShipMeta (ship) {
	const meta = {
		mmsi: ship.mmsi,
		name: ship.shipname,
		stationType: STATION_TYPE[ship.stationType],
		vesselType: VESSEL_TYPE[ship.cargo],
		destination: ship.destination,
		// messageType: MSG_TYPE[ship.aistype],
		status: NAV_STATUS[ship.navstatus],
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
		this.innerHTML = `<gmp-map-3d mode=satellite></gmp-map-3d>`
		const map = this.map = this.querySelector('gmp-map-3d')
		map.tilt = 70
		map.range = 2000
		map.center = { lat: 40.69108013790377, lng: -74.01033815269783, altitude: 150 }
		map.addEventListener('gmp-click', this.onmapClick)
	}

	disconnectedCallback () {
		state.removeEventListener('change', this.render)
		state.removeEventListener('change.ships', this.renderShips)
	}

	onmarkerClick = evt => {
		const map = this.map
		const marker = this.selection = evt.target
		const ship = marker.ship
		const meta = renderShipMeta(ship)
		const info = JSON.stringify(meta, null, 2)
		let pop = marker.pop
		if (!pop) {
			pop = marker.pop = new gm.PopoverElement({
				positionAnchor: marker,
				autoPanDisabled: true,
			})
		}
		pop.innerHTML = `<pre style=font-size:0.8rem>${info}</pre>`
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
		const activeShips = new Set()
		for (const ship of Object.values(state.ships)) {
			if (!ship.lat || !ship.lon) {
				continue
			}
			const mmsi = ship.mmsi
			activeShips.add(mmsi)
			const title = mmsi
			const position = { lat: ship.lat, lng: ship.lon, altitude: 0 }
			let marker = this.markers.get(mmsi)
			if (!marker) {
				marker = new gm.Marker3DInteractiveElement({
					position,
					title,
					altitudeMode: 'CLAMP_TO_GROUND'
				})
				marker.ship = ship
				marker.addEventListener('gmp-click', this.onmarkerClick)
				this.markers.set(mmsi, marker)
				this.map.append(marker)
			} else {
				marker.position = position
				marker.title = title
				if (marker.pop?.open) {
					const meta = renderShipMeta(ship)
					const info = JSON.stringify(meta, null, 2)
					marker.pop.innerHTML = `<pre style=font-size:0.8rem>${info}</pre>`
				}
			}
		}
		for (const [mmsi, marker] of this.markers.entries()) {
			if (!activeShips.has(mmsi)) {
				this.markers.delete(mmsi)
				marker.remove()
			}
		}
	}

	render = async () => {
		
	}
}

customElements.define('x-home', Home)
