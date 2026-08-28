import state from '../state.js'
import * as gm from '../gmaps.js'
import Ship from './ship.js'

class MapView extends HTMLElement {
	ships = new Map()

	connectedCallback () {
		this.innerHTML = `<gmp-map-3d mode=satellite></gmp-map-3d>`
		const map = this.map = this.querySelector('gmp-map-3d')
		map.tilt = 67
		map.range = 7015
		map.center = { lat: 40.70875498274823, lng: -74.0064538380301, altitude: 105 }
		state.addEventListener('change.ships', this.render)
		this.renderInterval = setInterval(this.render, 2500)
	}

	disconnectedCallback () {
		state.removeEventListener('change.ships', this.render)
		clearInterval(this.renderInterval)
	}

	render = () => {
		if (!this.map) return
		const active = new Set()
		for (const ship of Object.values(state.ships)) {
			if (!ship.lat || !ship.lon) continue
			const mmsi = ship.mmsi
			active.add(mmsi)
			let item = this.ships.get(mmsi)
			if (!item) {
				item = new Ship(this.map, ship)
				this.ships.set(mmsi, item)
			} else {
				item.render()
			}
		}
		for (const [mmsi, ship] of this.ships.entries()) {
			if (!active.has(mmsi)) {
				this.ships.delete(mmsi)
				ship.destroy()
			}
		}
	}
}

customElements.define('x-map', MapView)
