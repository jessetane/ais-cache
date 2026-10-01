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

const activeTweens = new Set()
let animFrame = null

function startTicker () {
	if (!animFrame && activeTweens.size > 0) {
		animFrame = requestAnimationFrame(tick)
	}
}

function stopTicker () {
	if (animFrame && activeTweens.size === 0) {
		cancelAnimationFrame(animFrame)
		animFrame = null
	}
}

function tick (now) {
	if (activeTweens.size === 0) {
		animFrame = null
		return
	}
	animFrame = requestAnimationFrame(tick)
	for (const tween of activeTweens) {
		const elapsed = now - tween.startTime
		const t = Math.min(1, Math.max(0, elapsed / tween.duration))
		const isFinal = t >= 1
		const progress = tween.easing(t)
		for (const key of Object.keys(tween.target)) {
			const lerpFn = tween.interpolators[key] || lerp
			tween.current[key] = lerpFn(tween.from[key], tween.target[key], progress)
		}
		tween.onUpdate?.(tween.current, isFinal)
		if (isFinal) {
			activeTweens.delete(tween)
		}
	}
	if (activeTweens.size === 0) {
		stopTicker()
	}
}

class Tween {
	constructor ({ duration = 500, easing = easeInOut, onUpdate, interpolators = {} } = {}) {
		this.duration = duration
		this.easing = easing
		this.onUpdate = onUpdate
		this.interpolators = interpolators
		this.current = null
		this.target = null
		this.from = null
		this.startTime = 0
	}

	set (values) {
		this.cancel()
		const hasChange = !this.current || Object.entries(values).some(([k, v]) => this.current[k] !== v)
		this.current = { ...values }
		this.target = { ...values }
		if (hasChange) this.onUpdate?.(this.current, true)
	}

	to (targets) {
		if (!this.current) {
			this.set(targets)
			return
		}
		if (typeof document !== 'undefined' && document.hidden) {
			this.set(targets)
			return
		}
		const hasChange = Object.entries(targets).some(([k, v]) => this.target?.[k] !== v)
		if (!hasChange) {
			if (!activeTweens.has(this)) this.onUpdate?.(this.current, true)
			return
		}
		this.from = { ...this.current }
		this.target = { ...targets }
		this.startTime = performance.now()
		activeTweens.add(this)
		startTicker()
	}

	cancel () {
		activeTweens.delete(this)
		stopTicker()
	}
}
