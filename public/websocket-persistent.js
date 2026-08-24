class WebSocketPersistent extends EventTarget {
	constructor (opts = {}) {
		super(opts)
		for (var key in opts) {
			this[key] = opts[key]
		}
		this.reconnectInterval = this.reconnectInterval || 5000
		this._onclose = this._onclose.bind(this)
		this._onopen = this._onopen.bind(this)
		this.connect = this.connect.bind(this)
	}

	connect () {
		this.socket = new WebSocket(this.url)
		this.socket.addEventListener('close', this._onclose)
		this.socket.addEventListener('error', this._onclose)
		this.socket.addEventListener('open', this._onopen)
	}

	_onopen () {
		clearInterval(this._reconnectInterval)
		this.socket.addEventListener('message', evt => {
			const e = new MessageEvent('message', { data: JSON.parse(evt.data) })
			this.dispatchEvent(e)
		})
		if (this.onopen) this.onopen()
	}

	_onclose () {
		this.socket.removeEventListener('close', this._onclose)
		this.socket.removeEventListener('error', this._onclose)
		this._reconnectInterval = setTimeout(
			this.connect,
			this.reconnectInterval
		)
		if (this.onclose) {
			this.onclose()
		}
	}

	send (message) {
		this.socket.send(message)
	}
}

export default WebSocketPersistent
