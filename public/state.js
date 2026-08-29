import url from 'url-state'
import Ships from './ships.js'

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

// get env
let env = {}
try {
	const res = await fetch('/env.json')
	env = state.env = await res.json()
} catch (err) {}

// watch ais feed
const aisUrl = url.params.aisUrl || env.aisUrl || '/'
const ships = state.ships = new Ships({ url: aisUrl })
ships.addEventListener('change', function () {
	state.dispatchEvent(new Event('change.ships'))
})

