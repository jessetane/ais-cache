import state from '../state.js'
import hb from 'hyperbind'

class Nav extends HTMLElement {
	connectedCallback () {
		state.addEventListener('change', this.render)
		this.innerHTML = `<h1 id=title><a href=/>AIS Map</a></h1>`
		this.render()
	}

	render = async () => {
	}
}

customElements.define('x-nav', Nav)
