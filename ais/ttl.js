const factor = 3

export default {
	1: { // Vessel (3m nominal)
		oldAge: 1000 * 60 * 3 * factor,
		maxAge: 1000 * 60 * 20,
	},
	2: { // Base Station (10s nominal)
		// oldAge: 1000 * 10 * factor,
		oldAge: 1000 * 60 * 60 * 1,
		maxAge: 1000 * 60 * 60 * 24,
	},
	3: { // SAR Aircraft (10s nominal)
		oldAge: 1000 * 10 * factor,
		maxAge: 1000 * 60 * 5,
	},
	4: { // Aid-to-Navigation (3m nominal)
		// oldAge: 1000 * 60 * 3 * factor,
		oldAge: 1000 * 60 * 60 * 1,
		maxAge: 1000 * 60 * 60 * 24,
	},
	5: { // AIS-SART (1m nominal)
		oldAge: 1000 * 60 * factor,
		maxAge: 1000 * 60 * 60 * 24,
	},
	6: { // AIS-MOB (1m nominal)
		oldAge: 1000 * 60 * factor,
		maxAge: 1000 * 60 * 60 * 24,
	},
	7: { // EPIRB (1m nominal)
		oldAge: 1000 * 60 * factor,
		maxAge: 1000 * 60 * 60 * 24,
	},
}
