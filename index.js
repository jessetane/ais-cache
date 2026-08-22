#!/bin/env node

import fs from 'fs/promises'
import tcp from 'net'
import { exec } from 'child_process'

const env = process.env
const serialPort = env.SERIAL_PORT || '/dev/ttyAMA0'
const serialPortBaudRate = env.SERIAL_BUAD_RATE || '115200'
const serialPortReopenInterval = parseInt(env.SERIAL_PORT_RECONNECT || '5000')
const tcpHost = env.TCP_HOST || '::'
const tcpPort = env.TCP_PORT || '9000'

let buffer = ''
let tcpConnections = []
const tcpServer = new tcp.Server()
const stats = { messages: 0, visitors: {}, strange: [] }
const statsInterval = 1000 * 5
const renderRate = 100
let renderTimeout = null
let firstRender = true

openSerialPort()
openTcpServer()
setInterval(renderStats, statsInterval)

async function openSerialPort () {
	try {
		await exec(`stty -F ${serialPort} ispeed ${serialPortBaudRate}`)
		const fd = await fs.open(serialPort)
		const s = fd.createReadStream(fd)
		buffer = ''
		s.on('data', data => {
			// console.log(`got new data: ${data.length}`, data.toString())
			buffer += data.toString()
			requestRender()
		})
		fd.on('close', () => {
			console.error(`${serialPort} closed unexpectedly, retrying in ${reconnectInterval}`)
			setTimeout(openSerialPort, reconnectInterval)
		})
	} catch (err) {
		console.error(err)
		console.error(`failed to open ${serialPort}, retrying in ${serialPortReopenInterval}`)
		setTimeout(openSerialPort, serialPortReopenInterval)
	}
}

function openTcpServer () {
	tcpServer.on('connection', c => {
		const id = c.remoteAddress
		console.log('connection.open:', id)
		if (!stats.visitors[id]) {
			stats.visitors[id] = 0
		}
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
		function close () {
			console.log('connection.close:', id)
			tcpConnections = tcpConnections.filter(_c => _c !== c)
		}
	})
	tcpServer.listen(tcpPort, tcpHost, err => {
		console.log('tcp server listening at:', tcpServer.address())
	})
}

function requestRender () {
	if (renderTimeout) return
	renderTimeout = setTimeout(render, renderRate)
}

function render () {
	const lines = buffer.split('\r\n')
	buffer = lines.at(-1)
	if (lines[0][0] !== '!') {
		stats.strange.push(lines.shift())
	}
	stats.connections = tcpConnections.length
	stats.messages += lines.length
	const chunk = lines.join('\r\n') + '\r\n'
	tcpConnections.forEach(c => {
		stats.visitors[c.remoteAddress] += chunk.length
		c.write(chunk)
	})
	renderTimeout = null
	if (firstRender) {
		firstRender = false
		renderStats()
	}
}

function renderStats () {
	console.log(`stats (${statsInterval / 1000}s):`, stats)
}
