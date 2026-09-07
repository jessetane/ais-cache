const EARTH_RADIUS_METERS = 6371000
const METERS_PER_NM = 1852
const MS_PER_HOUR = 1000 * 60 * 60

export {
	calculateVectorEndpoint,
	calculateOffset,
	calculateShipShape
}

function calculateVectorEndpoint (lat, lng, sogKnots, cogDeg, durationMs = 1000 * 60 * 2) {
	const distanceMeters = sogKnots * METERS_PER_NM * durationMs / MS_PER_HOUR
	return destinationPoint(lat, lng, distanceMeters, cogDeg)
}

function calculateOffset (lat, lng, headingDeg, dFore = 0, dPort = 0) {
	if (lat === undefined || lng === undefined || headingDeg === undefined || (dFore === 0 && dPort === 0)) {
		return { lat, lng }
	}
	const thetaRad = headingDeg * (Math.PI / 180)
	const dNorth = dFore * Math.cos(thetaRad) + dPort * Math.sin(thetaRad)
	const dEast = dFore * Math.sin(thetaRad) - dPort * Math.cos(thetaRad)
	const distance = Math.hypot(dNorth, dEast)
	if (distance === 0) {
		return { lat, lng }
	}
	const bearingDeg = (Math.atan2(dEast, dNorth) * (180 / Math.PI) + 360) % 360
	const dest = destinationPoint(lat, lng, distance, bearingDeg)
	return {
		lat: dest.lat,
		lng: dest.lng
	}
}

function destinationPoint (lat, lng, distanceMeters, bearingDeg) {
	const dByR = distanceMeters / EARTH_RADIUS_METERS
	const latRad = lat * (Math.PI / 180)
	const lngRad = lng * (Math.PI / 180)
	const bearingRad = bearingDeg * (Math.PI / 180)
	const endLatRad = Math.asin(
		Math.sin(latRad) * Math.cos(dByR) +
		Math.cos(latRad) * Math.sin(dByR) * Math.cos(bearingRad)
	)
	const endLngRad = lngRad + Math.atan2(
		Math.sin(bearingRad) * Math.sin(dByR) * Math.cos(latRad),
		Math.cos(dByR) - Math.sin(latRad) * Math.sin(endLatRad)
	)
	return {
		lat: endLatRad * (180 / Math.PI),
		lng: endLngRad * (180 / Math.PI),
		altitude: 0
	}
}

function calculateShipShape ({ lat, lon, lng, hdg, cog, dimA = 0, dimB = 0, dimC = 0, dimD = 0, length = 0, width = 0 }) {
	const longitude = lon ?? lng
	const heading = (hdg === 0 || hdg && hdg !== 511 ? hdg : (cog < 360 ? cog : 0)) ?? 0
	let a = dimA
	let b = dimB
	let c = dimC
	let d = dimD
	let l = (a + b) || length || 25
	let w = (c + d) || width || Math.max(5, l / 5)
	if (!a && !b) {
		a = Math.round(l * 0.66)
		b = l - a
	}
	if (!c && !d) {
		c = w / 2
		d = w / 2
	}
	const height = Math.max(2, w / 2)
	const chamferLen = l * 0.1
	const chamferFore = a - chamferLen
	const centerPort = (c - d) / 2
	const points = [
		{ fore: -b, port: c },
		{ fore: -b, port: -d },
		{ fore: chamferFore, port: -d },
		{ fore: a, port: centerPort },
		{ fore: chamferFore, port: c }
	]
	return points.map(function (pt) {
		const coord = calculateOffset(lat, longitude, heading, pt.fore, pt.port)
		return {
			lat: coord.lat,
			lng: coord.lng,
			altitude: height
		}
	})
}
