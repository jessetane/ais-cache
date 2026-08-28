const EARTH_RADIUS_METERS = 6371000
const METERS_PER_NM = 1852
const MS_PER_HOUR = 1000 * 60 * 60

function calculateVectorEndpoint (lat, lng, sogKnots, cogDeg, durationMs = 1000 * 60 * 2) {
	const distanceMeters = sogKnots * METERS_PER_NM * durationMs / MS_PER_HOUR
	const dByR = distanceMeters / EARTH_RADIUS_METERS
	const latRad = lat * (Math.PI / 180)
	const lngRad = lng * (Math.PI / 180)
	const cogRad = cogDeg * (Math.PI / 180)
	const endLatRad = Math.asin(
		Math.sin(latRad) * Math.cos(dByR) +
		Math.cos(latRad) * Math.sin(dByR) * Math.cos(cogRad)
	)
	const endLngRad = lngRad + Math.atan2(
		Math.sin(cogRad) * Math.sin(dByR) * Math.cos(latRad),
		Math.cos(dByR) - Math.sin(latRad) * Math.sin(endLatRad)
	)
	return {
		lat: endLatRad * (180 / Math.PI),
		lng: endLngRad * (180 / Math.PI),
		altitude: 0,
	}
}

export {
	calculateVectorEndpoint
}
