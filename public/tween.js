export {
	lerp,
	lerpAngle,
	easeInOut,
	Tween
}

function lerp (a, b, t) {
	if (a === undefined) return b
	if (b === undefined) return a
	return a + (b - a) * t
}

function lerpAngle (a, b, t) {
	if (a === undefined) return b
	if (b === undefined) return a
	let diff = (b - a) % 360
	if (diff > 180) diff -= 360
	if (diff < -180) diff += 360
	return (a + diff * t + 360) % 360
}

function easeInOut (t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

class Tween {
	constructor ({ duration = 500, easing = easeInOut, onUpdate, interpolators = {} } = {}) {
		this.duration = duration
		this.easing = easing
		this.onUpdate = onUpdate
		this.interpolators = interpolators
		this.current = null
		this.target = null
		this.animFrame = null
	}

	set (values) {
		this.cancel()
		this.current = { ...values }
		this.target = { ...values }
		this.onUpdate?.(this.current)
	}

	to (targets) {
		if (!this.current) {
			this.set(targets)
			return
		}
		const hasChange = Object.entries(targets).some(([k, v]) => this.target?.[k] !== v)
		if (!hasChange) {
			if (!this.animFrame) this.onUpdate?.(this.current)
			return
		}
		this.cancel()
		const from = { ...this.current }
		this.target = { ...targets }
		const startTime = performance.now()
		const step = (now) => {
			const elapsed = now - startTime
			const t = Math.min(1, Math.max(0, elapsed / this.duration))
			const progress = this.easing(t)
			for (const key of Object.keys(targets)) {
				const lerpFn = this.interpolators[key] || lerp
				this.current[key] = lerpFn(from[key], targets[key], progress)
			}
			this.onUpdate?.(this.current)
			if (t < 1) {
				this.animFrame = requestAnimationFrame(step)
			} else {
				this.animFrame = null
			}
		}
		this.animFrame = requestAnimationFrame(step)
	}

	cancel () {
		if (this.animFrame) {
			cancelAnimationFrame(this.animFrame)
			this.animFrame = null
		}
	}
}
