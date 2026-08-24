import state from '../state.js'
import hb from 'hyperbind'

class NotFound extends HTMLElement {
	connectedCallback () {
		this.classList.add('center')
		this.innerHTML = `<h1>Not found</h1>`
		state.addEventListener('change', this.render)
		this.render()
	}

	disconnectedCallback () {
		state.removeEventListener('change', this.render)
	}

	render = async () => {

	}
}

customElements.define('x-not-found', NotFound)
