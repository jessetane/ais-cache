import state from '../state.js'
import '../map/index.js'

class Home extends HTMLElement {
	connectedCallback () {
		this.innerHTML = `<x-map></x-map>`
		state.addEventListener('change', this.render)
	}

	disconnectedCallback () {
		state.removeEventListener('change', this.render)
	}

	render = () => {
		//
	}
}

customElements.define('x-home', Home)
