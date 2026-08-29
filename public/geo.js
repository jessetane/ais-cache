const EARTH_RADIUS_METERS = 6371000
const METERS_PER_NM = 1852
const MS_PER_HOUR = 1000 * 60 * 60

export {
	calculateVectorEndpoint,
	calculateOffset
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
