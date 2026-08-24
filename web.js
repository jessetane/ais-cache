#!/usr/bin/node

import tcp from 'net'
import AisDecoder from './ais/decoder.js'
import aisTTL from './ais/ttl.js'
import { WebSocketServer } from 'ws'

const env = process.env
const aisHost = env.AIS_HOST || '::1'
const aisPort = env.AIS_PORT || 9000
const aisReconnectInterval = parseInt(env.AIS_RECONNECT || 5000)
const aisSession = {}
let wss = null
let wsConnections = []
const wsHost = env.WS_HOST || '::'
const wsPort = env.WS_PORT || 9001
const renderRate = 250
let renderTimeout = null
const renderShipStatusRate = 2500
const ships = new Map()
let buffer = ''

openAisSocket()
openWsServer()
setInterval(renderShipStatus, renderShipStatusRate)

function openAisSocket () {
	const socket = tcp.connect(aisPort, aisHost)
	socket.on('data', d => {
		// console.log(`got ${d.length} bytes`, d.toString())
		buffer += d.toString()
		requestRender()
	})
	socket.on('close', () => {
		setTimeout(openAisSocket, aisReconnectInterval)		
	})
}

function openWsServer () {
	wss = new WebSocketServer({ port: wsPort, host: wsHost })
	wss.on('connection', ws => {
		console.log('got ws connection')
		wsConnections.push(ws)
		console.log('total ws connections:', wsConnections.length)
		ws.on('close', () => {
			close()
		})
		ws.on('error', err => {
			console.log('ws connection error:', err)
			close()
		})
		const s = [...ships.values()]
		ws.send(JSON.stringify(s))
		function close () {
			console.log('ws connection close')
			wsConnections = wsConnections.filter(c => c !== ws)
			console.log('total ws connections:', wsConnections.length)
		}
	})
	wss.on('listening', () => {
		console.log('websocket server listening at:', wss.address())
	})
}

function requestRender () {
	if (renderTimeout) return
	renderTimeout = setTimeout(render, renderRate)
}

function render () {
	const lines = buffer.split('\r\n')
	buffer = lines.pop()
	if (lines[0]?.[0] !== '!') {
		lines.shift()
	}
	const changes = []
	for (let m of lines) {
		const ship = updateShip(m)
		if (ship) {
			changes.push(ship)
		}
	}
	if (changes.length) {
		wsConnections.forEach(c => {
			c.send(JSON.stringify(changes))
		})
	}
	renderTimeout = null
	// console.log(ships)
}

function renderShipStatus () {
	const now = new Date()
	for (const [mmsi, ship] of ships.entries()) {
		const elapsed = now - ship.updated
		if (elapsed >= aisTTL[ship.stationType]) {
			ships.delete(mmsi)
			console.log(`ship dead: ${mmsi}`)
		}
	}
}

function updateShip (m) {
	let ship;
	try {
		ship = new AisDecoder(m, aisSession)
	} catch (err) {
		// console.error('updateShip: bad message', err)
		return
	}
	if (!ship || !ship.valid || !ship.mmsi) {
		// console.error('updateShip: invalid ship:', ship)
		return
	}
	delete ship.bitarray
	delete ship.payload
	const now = Date.now()
	const mmsi = ship.mmsi
	const currentShip = ships.get(mmsi) || { mmsi, created: now }
	ship = {
		...currentShip,
		...ship,
		updated: now,
	}
	ships.set(mmsi, ship)
	return ship
}
