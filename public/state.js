import url from 'url-state'
import WebSocketPersistent from './websocket-persistent.js'
import aisTTL from './ais/ttl.js'

// state object setup
const state = window.state = new EventTarget()
export default state

// central app api
state.change = function () {
	state.dispatchEvent(new Event('change'))
}

// init
url.addEventListener('change', state.change)
state.url = url
state.app = document.querySelector('x-app')
state.log = document.querySelector('x-log')

// watch ais feed
const ships = state.ships = {}
const ws = new WebSocketPersistent({
	url: 'ws://[::1]:9002'
})
ws.addEventListener('message', m => {
	m.data.forEach(s => {
		const ship = ships[s.mmsi]
		if (!ship) {
			ships[s.mmsi] = s
		} else {
			Object.assign(ship, s)
		}
	})
	const now = new Date()
	for (let ship of Object.values(ships)) {
		const maxAge = aisTTL[ship.stationType]?.maxAge || 1
		if (now - ship.updated >= maxAge) {
			console.log('removing stale ship:', ship.mmsi)
			delete ships[ship.mmsi]
		}
	}
	state.dispatchEvent(new Event('change.ships'))
})
ws.connect()
