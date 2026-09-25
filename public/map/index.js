import state from '../state.js'
import * as gm from '../gmaps.js'
import Ship from './ship.js'

const defaultCamera = {
	lat: 40.708755,
	lng: -74.006454,
	alt: 105,
	range: 7015,
	tilt: 67,
	heading: 0,
	roll: 0
}

const cameraEvents = [
	'gmp-centerchange',
	'gmp-headingchange',
	'gmp-tiltchange',
	'gmp-rangechange',
	'gmp-rollchange',
	'gmp-camerapositionchange',
	'gmp-animationend'
]

function getCameraUrl () {
	const params = state.url.params || {}
	return {
		lat: params.lat ? parseFloat(params.lat) : defaultCamera.lat,
		lng: (params.lng || params.lon) ? parseFloat(params.lng || params.lon) : defaultCamera.lng,
		alt: (params.alt || params.altitude) ? parseFloat(params.alt || params.altitude) : defaultCamera.alt,
		range: params.range ? parseFloat(params.range) : defaultCamera.range,
		tilt: params.tilt ? parseFloat(params.tilt) : defaultCamera.tilt,
		heading: (params.heading || params.hdg) ? parseFloat(params.heading || params.hdg) : defaultCamera.heading,
		roll: params.roll ? parseFloat(params.roll) : defaultCamera.roll
	}
}

function getCameraMap (map) {
	if (!map) return {}
	const center = map.center || {}
	const lat = typeof center.lat === 'function' ? center.lat() : center.lat
	const lng = typeof center.lng === 'function' ? center.lng() : (center.lng ?? center.lon)
	return {
		lat: typeof lat === 'number' && !isNaN(lat) ? Number(lat.toFixed(6)) : defaultCamera.lat,
		lng: typeof lng === 'number' && !isNaN(lng) ? Number(lng.toFixed(6)) : defaultCamera.lng,
		alt: typeof center.altitude === 'number' && !isNaN(center.altitude) ? Math.round(center.altitude) : defaultCamera.alt,
		range: typeof map.range === 'number' && !isNaN(map.range) ? Math.round(map.range) : defaultCamera.range,
		tilt: typeof map.tilt === 'number' && !isNaN(map.tilt) ? Math.round(map.tilt) : defaultCamera.tilt,
		heading: typeof map.heading === 'number' && !isNaN(map.heading) ? Math.round(map.heading) : defaultCamera.heading,
		roll: typeof map.roll === 'number' && !isNaN(map.roll) ? Math.round(map.roll) : defaultCamera.roll
	}
}

function setCameraMap (map, cam) {
	map.center = { lat: cam.lat, lng: cam.lng, altitude: cam.alt }
	map.range = cam.range
	map.tilt = cam.tilt
	map.heading = cam.heading
	map.roll = cam.roll
}

class MapView extends HTMLElement {
	ships = new Map()

	connectedCallback () {
		this.innerHTML = `<gmp-map-3d mode=satellite></gmp-map-3d>`
		const map = this.map = this.querySelector('gmp-map-3d')
		for (const event of cameraEvents) map.addEventListener(event, this.onCameraChange)
		state.addEventListener('change', this.onUrlChange)
		state.addEventListener('change.ships', this.render)
		this.renderInterval = setInterval(this.render, 2500)
		this.updateCamera()
	}

	disconnectedCallback () {
		clearTimeout(this.debounceTimer)
		if (this.map) {
			for (const event of cameraEvents) this.map.removeEventListener(event, this.onCameraChange)
		}
		state.removeEventListener('change', this.onUrlChange)
		state.removeEventListener('change.ships', this.render)
		clearInterval(this.renderInterval)
	}

	onUrlChange = () => {
		if (!this.map) return
		const urlCam = getCameraUrl()
		const mapCam = getCameraMap(this.map)
		const changed = Object.keys(defaultCamera).some(key => urlCam[key] !== mapCam[key])
		if (changed) this.updateCamera()
	}

	onCameraChange = () => {
		if (this.isUpdatingFromUrl) return
		clearTimeout(this.debounceTimer)
		this.debounceTimer = setTimeout(this.updateUrl, 100)
	}

	updateCamera = () => {
		if (!this.map) return
		this.isUpdatingFromUrl = true
		setCameraMap(this.map, getCameraUrl())
		requestAnimationFrame(() => {
			this.isUpdatingFromUrl = false
		})
	}

	updateUrl = () => {
		if (!this.map) return
		const mapCam = getCameraMap(this.map)
		const urlCam = getCameraUrl()
		const changed = Object.keys(defaultCamera).some(key => mapCam[key] !== urlCam[key])
		if (changed) state.url.query(mapCam, true)
	}

	render = () => {
		if (!this.map) return
		const active = new Set()
		for (const ship of state.ships) {
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
