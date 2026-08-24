import state from './state.js'
import './nav/index.js'
import './home/index.js'
import './not-found/index.js'
import './log/index.js'

class App extends HTMLElement {
	connectedCallback () {
		state.addEventListener('change', this.render)
		this.render()
	}

	render = () => {
		let pathname = state.url.pathname
		if (pathname.length > 1 && pathname.at(-1) === '/') {
			pathname = pathname.slice(0, -1)
		}
		let view = null
		if (pathname === '/') {
			view = 'x-home'
		} else {
			view = 'x-not-found'
		}
		view = view.toUpperCase()
		if (!this.view || this.view.nodeName !== view) {
			if (this.view) {
				this.view.remove()
			}
			this.view = document.createElement(view)
			this.appendChild(this.view)
			if (!state.url.back) {
				window.scrollTo(0, 0)
			}
		}
	}
}

customElements.define('x-app', App)
