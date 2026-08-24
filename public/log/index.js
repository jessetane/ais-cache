class Log extends HTMLElement {
	alert (html, opts = {}) {
		if (opts.clear) {
			const messages = this.querySelectorAll('.message')
			setTimeout(() => {
				messages.forEach(m => m.clear())
			}, 500)
		}
		var message = document.createElement('DIV')
		const classes = ['message', 'before']
		if (opts.className) classes.push(opts.className)
		message.classList.add(...classes)
		message.innerHTML = html
		message.clear = clear
		message.addEventListener('click', clear)
		this.appendChild(message)
		setTimeout(function () {
			message.classList.remove('before')
		}, 20)
		setTimeout(clear, opts.duration || Math.min(7500, html.length * 150))
		message.addEventListener('click', clear)
		function clear () {
			if (message.classList.contains('after')) return
			message.classList.add('after')
			message.addEventListener('transitionend', () => {
				if (message.classList.contains('after')) {
					message.classList.add('after2')
				}
			}, { once: true })
		}
		if (opts.alerts) {
			opts.alerts.push(message)
		}
		return message
	}

	error (message, opts = {}) {
		opts.className = 'error'
		return this.alert(message, opts)
	}

	show () {
		const els = Array.from(this.children)
		els.forEach(el => {
			el.style.visibility = null
			el.classList.remove('after', 'after2')
		})
	}

	clear () {
		const els = Array.from(this.children)
		els.forEach(el => el.clear())
	}

	get last () {
		return [...this.querySelectorAll('.message')].at(-1)
	}
}

customElements.define('x-log', Log)

export default document.querySelector('x-log')
