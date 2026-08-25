#!/usr/bin/env node

import fs from 'fs/promises'
import tcp from 'net'
import AisDecoder from './ais/decoder.js'
import aisTTL from './ais/ttl.js'
import { WebSocketServer } from 'ws'

const env = process.env
const stateFile = env.STATE_FILE || './state.json'
const stateSaveRate = parseInt(env.STATE_SAVE_RATE || 30000)
const aisHost = env.AIS_HOST || '::1'
const aisPort = env.AIS_PORT || 9000
const aisReconnectInterval = parseInt(env.AIS_RECONNECT || 5000)
const aisSession = {}
const tcpHost = env.TCP_HOST || '::'
const tcpPort = env.TCP_PORT || '9001'
const tcpServer = new tcp.Server()
let tcpConnections = []
const wsHost = env.WS_HOST || '::'
const wsPort = env.WS_PORT || 9002
let wsServer = null
let wsConnections = []
const renderRate = 250
let renderTimeout = null
const renderShipStatusRate = 2500
const ships = new Map()
let buffer = ''

await loadState()
openAisSocket()
openTcpServer()
openWsServer()
setInterval(renderShipStatus, renderShipStatusRate)
setInterval(saveState, stateSaveRate)

function openAisSocket () {
	const socket = tcp.connect(aisPort, aisHost)
	socket.on('connect', () => {
		console.log('ais.connect: success')
	})
	socket.on('data', d => {
		// console.log(`got ${d.length} bytes`, d.toString())
		buffer += d.toString()
		requestRender()
	})
	socket.on('error', err => {
		console.error('ais.error:', err)
	})
	socket.on('close', () => {
		console.error(`ais.close: retrying in ${aisReconnectInterval}`)
		setTimeout(openAisSocket, aisReconnectInterval)
	})
}

function openTcpServer () {
	tcpServer.on('connection', c => {
		const id = c.remoteAddress
		console.log('connection.open:', id)
		tcpConnections.push(c)
		c.on('data', data => {
			console.log('connection.data:', data.toString())
			c.destroy()
		})
		c.on('end', () => {
			console.log('connection.end:', id)
		})
		c.on('close', () => {
			close()
		})
		c.on('error', err => {
			console.log('connection.error:', id, err)
			close()
		})
		c.setNoDelay(true)
		const messages = []
		for (const [mmsi, ship] of ships.entries()) {
			for (let t in ship.messages) {
				messages.push(...ship.messages[t])
			}
		}
		if (messages.length) {
			c.write(messages.join('\r\n') + '\r\n')
		}
		function close () {
			console.log('connection.close:', id)
			tcpConnections = tcpConnections.filter(_c => _c !== c)
		}
	})
	tcpServer.listen(tcpPort, tcpHost, err => {
		console.log('tcp server listening at:', tcpServer.address())
	})
}

function openWsServer () {
	wsServer = new WebSocketServer({ port: wsPort, host: wsHost })
	wsServer.on('connection', ws => {
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
	wsServer.on('listening', () => {
		console.log('websocket server listening at:', wsServer.address())
	})
}

function requestRender () {
	if (renderTimeout) return
	renderTimeout = setTimeout(render, renderRate)
}

function render () {
	const lines = buffer.split('\r\n')
	buffer = lines.pop()
	const firstLine = lines[0]
	const firstChar = firstLine?.[0]
	if (firstChar !== '!') {
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
		const messages = lines.join('\r\n') + '\r\n'
		tcpConnections.forEach(c => {
			c.write(messages)
		})
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
		const maxAge = aisTTL[ship.stationType]?.maxAge || 1
		if (elapsed >= maxAge) {
			// console.log(`ship dead: ${mmsi}`)
			ships.delete(mmsi)
		}
	}
}

function getOrCreateShip (mmsi) {
	let ship = ships.get(mmsi)
	if (!ship) {
		ship = { mmsi, created: Date.now() }
		Object.defineProperty(ship, 'messages', {
			value: {},
			enumerable: false,
			writable: true
		})
		ships.set(mmsi, ship)
	}
	return ship
}

function updateShip (m) {
	let ship
	try {
		ship = new AisDecoder(m, aisSession)
	} catch (err) {
		// console.error('updateShip: bad message', err, ship, m)
		return
	}
	if (!ship?.valid || !ship.mmsi) return
	const currentShip = getOrCreateShip(ship.mmsi)
	Object.assign(currentShip, ship)
	Object.assign(currentShip.messages, ship.messages)
	currentShip.updated = Date.now()
	return currentShip
}

async function loadState () {
	try {
		const raw = await fs.readFile(stateFile, 'utf8')
		const data = JSON.parse(raw)
		for (const item of data) {
			const ship = getOrCreateShip(item.mmsi)
			const messages = item.messages || {}
			for (let t in messages) {
				if (!Array.isArray(messages[t])) {
					messages[t] = [messages[t]]
				}
			}
			delete item.messages
			Object.assign(ship, item)
			Object.assign(ship.messages, messages)
		}
		console.log(`loaded ${ships.size} ships from ${stateFile}`)
	} catch (err) {
		if (err.code !== 'ENOENT') {
			console.error('failed to load state:', err)
		}
	}
}

async function saveState () {
	try {
		const data = []
		for (const [mmsi, ship] of ships.entries()) {
			data.push({ ...ship, messages: ship.messages })
		}
		await fs.writeFile(stateFile, JSON.stringify(data, null, '\t'))
	} catch (err) {
		console.error('failed to save state:', err)
	}
}
