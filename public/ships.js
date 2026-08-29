import WebSocketPersistent from './websocket-persistent.js'
import aisTTL from './ais/ttl.js'

class Ships extends EventTarget {
	constructor (opts = {}) {
		super()
		this.url = opts.url || '/'
		this.ws = new WebSocketPersistent({ url: this.url })
		this.ws.addEventListener('message', this.onmessage.bind(this))
		this.ws.connect()
	}

	onmessage (m) {
		m.data.forEach(s => {
			const ship = this[s.mmsi]
			if (!ship) {
				this[s.mmsi] = s
			} else {
				Object.assign(ship, s)
			}
		})
		const now = new Date()
		for (let ship of this) {
			const maxAge = aisTTL[ship.stationType]?.maxAge || 1
			if (now - ship.updated >= maxAge) {
				delete this[ship.mmsi]
			}
		}
		this.dispatchEvent(new Event('change'))
	}

	*[Symbol.iterator] () {
		for (let key of Object.keys(this)) {
			const val = this[key]
			if (val && typeof val === 'object' && val.mmsi) {
				yield val
			}
		}
	}
}

export default Ships
