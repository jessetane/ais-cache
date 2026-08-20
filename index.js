#!/usr/bin/node

import tcp from 'net'
import { WebSocketServer } from 'ws'
import { SerialPort } from 'serialport'

var init = true
var buffer = ''
var history = []
var connections = []
var wsConnections = []
var server = new tcp.Server()
var wss = new WebSocketServer({ port: 7000 })

server.on('connection', connection => {
	console.log('got connection:', connection.remoteAddress)
	connection.setNoDelay(true)
	connections.push(connection)
	console.log('total connections:', connections.length)
	connection.on('data', data => {
		console.log('ais socket rx data', data.toString())
		connection.destroy()
	})
	connection.on('end', () => {
		console.log('connection end:', connection.remoteAddress)
		// close()
	})
	connection.on('close', () => {
		close()
	})
	connection.on('error', err => {
		console.log('connection error:', connection.remoteAddress, err)
		close()
	})
	function close () {
		console.log('connection close:', connection.remoteAddress)
		connections = connections.filter(c => c !== connection)
		console.log('total connections:', connections.length)
	}
	// var now = Date.now()
	// history.forEach(line => connection.write(line + '\r\n'))
})

server.listen('9000', '::', err => {
	console.log('tcp server listening at:', server.address())
})

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
	function close () {
		console.log('ws connection close')
		wsConnections = wsConnections.filter(c => c !== ws)
		console.log('total ws connections:', wsConnections.length)
	}
})

wss.on('listening', () => {
	console.log('websocket server listening at:', wss.address())
})

openInput()

async function openInput () {
	const file = '/dev/ttyAMA0'
	const port = new SerialPort({ path: file, baudRate: 115200 })
	port.on('open', () => {
		console.log(`data port open (${file})`)
		// port.write('v\n')
	})
	port.on('data', data => {
		buffer += data.toString()
		var lines = buffer.split('\r\n')
		if (lines.length < 2) return
		if (init) {
			init = false
			lines.shift()
		} 
		var lastLine = lines.pop()
		if (lastLine === '') {
			buffer = ''
		} else {
			buffer = lastLine
		}
		lines.forEach(line => {
			console.log(line)
			connections.forEach(c => c.write(line + '\r\n'))
			wsConnections.forEach(c => c.send(line + '\r\n'))
			// if (history.length > 100) history.shift()
			// history.push(line)
		})
	})
	port.on('close', () => {
		console.log(`data port closed (${file})`)
		buffer = ''
		setTimeout(openInput, 5000)
	})
}
