/*
 ** Copyright 2014 Fulup Ar Foll.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *	  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * References:
 *  Gpsd   : http://catb.org/gpsd/AIVDM.html [best doc]
 *  OpenCPN: https://github.com/OpenCPN/OpenCPN [file: AIS_Bitstring.cpp]
 *  http://fossies.org/linux/misc/gpsd-3.11.tar.gz/gpsd-3.11/test/sample.aivdm
 *  online AIS decoder http://www.maritec.co.za/tools/aisvdmvdodecoding/
 */

import {
	MSG_TYPE,
	NAV_STATUS,
	VESSEL_TYPE,
	STATION_TYPE,
} from './strings.js'

const internalFields = [
	'bitarray',
	'payload',
	'valid',
	'msglen',
	'channel',
	'repeat',
	'immsi',
	'mmsikey',
	'part',
	'utc',
	'smi',
	'dac',
	'fid',
	'siteid',
	'reporttype',
	'utcday',
	'utchour',
	'utcminute',
	'messages'
]

var DEBUG = false;
const defaultSession = {};

// Ais payload is represented in a 6bits encoded string !(
// This method is a direct transcription in nodejs of C++ ais-decoder code
function AisDecoder (input, session = defaultSession) {
	for (let i = 0; i < internalFields.length; i++) {
		Object.defineProperty(this, internalFields[i], {
			enumerable: false,
			writable: true
		})
	}
	this.bitarray = [];
	this.valid = false; // will move to 'true' if parsing succeed

	if (typeof input !== 'string') {
		throw new Error('AisDecoder: Sentence is not of type string.');
	} else {
		input = input.trim();
	}

	if (input.length === 0) {
		throw new Error('AisDecoder: Sentence is empty or spaces.');
	} else if (!this.validateChecksum(input)) {
		throw new Error('AisDecoder: Sentence checksum is invalid.');
	}

	// split nmea message !AIVDM,1,1,,B,B69>7mh0?J<:>05B0`0e;wq2PHI8,0*3D'
	var nmea = input.split(",");

	if (nmea.length !== 7) {
		throw new Error('AisDecoder: Sentence contains invalid number of parts.');
	}
	var command = nmea[0].substring(3,6);
	if (command !== "VDM" &&  // AIVDM: others
		command !== "VDO"	 // AIVDO: own AIS
		) {
		throw new Error('AisDecoder: Invalid message prefix.');
	}

	// the input string is part of a multipart message, make sure we were
	// passed a session object.
	var message_count = Number(nmea[1]);
	var message_id = Number(nmea[2]);
	var sequence_id = nmea[3] || '';
	var channel = nmea[4] || '';

	if(message_count > 1) {
		if(Object.prototype.toString.call(session) !== "[object Object]") {
		   throw new Error('A session object is required to maintain state for decoding multipart AIS messages.');
		}

		// Clean up any stale sessions (> 10 seconds old)
		var now = Date.now();
		for (var k in session) {
			if (session[k] && session[k].timestamp && (now - session[k].timestamp > 10000)) {
				delete session[k];
			}
		}

		// Key sessions by channel and sequence ID to isolate interleaved streams
		var session_key = channel + ':' + sequence_id;
		var subSession = session[session_key];

		if(message_id > 1) {
			if(!subSession) {
				throw new Error('AisDecoder: Session is missing prior message part, cannot parse partial AIS message.');
			}

			if(nmea[0] !== subSession.formatter) {
				throw new Error('AisDecoder: Sentence does not match formatter of current session.');
			}

			if(subSession[message_id - 1] === undefined) {
				throw new Error('AisDecoder: Session is missing prior message part, cannot parse partial AIS message.');
			}
		} else {
			subSession = session[session_key] = {
				formatter: nmea[0],
				message_count: message_count,
				sequence_id: sequence_id,
				messages: [],
				timestamp: now
			};
		}
		subSession.timestamp = now;
		subSession.messages.push(input);
	}

	// extract binary payload and other usefull information from nmea paquet
	this.payload  = Buffer.from(nmea [5]);
	this.msglen   = this.payload.length;

	this.channel = channel;

	var messages = [input];
	if(message_count > 1) {
		subSession[message_id] = {payload: this.payload, length: this.msglen};

		// Not done building the session
		if(message_id < message_count) return;

		var payloads = [];
		var len = 0;

		for(var i = 1; i <= subSession.message_count; ++i) {
			payloads.push(subSession[i].payload);
			len += subSession[i].length;
		}

		this.payload = Buffer.concat(payloads, len);
		this.msglen = this.payload.length;
		messages = subSession.messages;

		// Clean up completed session
		delete session[session_key];
	}


	// decode printable 6bit AIS/IEC binary format
	for(var i = 0; i < this.msglen; i++) {
		var byte = this.payload[i];

		// check byte is not out of range
		if ((byte < 0x30) || (byte > 0x77) || ((0x57 < byte) && (byte < 0x60))) {
			throw new Error('AisDecoder: Payload byte out of valid 6-bit range.');
		}

		// move from printable char to wacky AIS/IEC 6 bit representation
		byte += 0x28;
		if(byte > 0x80)  byte += 0x20;
		else			 byte += 0x28;
		this.bitarray[i]=byte;
	}

	this.aistype   = this.GetInt (0,6);
	this.messages  = { [this.aistype]: messages };
	this.repeat	= this.GetInt (6,2);
	this.immsi	 = this.GetInt (8,30);
	this.mmsi	  = ("000000000" + this.immsi).slice(-9);
	this.mmsikey   = this.mmsi;
	this.stationType = 1 // vessel

	// non-vessel station types
	const mmsi = this.mmsi
	if (mmsi.startsWith('00')) this.stationType = 2 // base_station
	else if (mmsi.startsWith('111')) this.stationType = 3 // sar_aircraft
	else if (mmsi.startsWith('99')) this.stationType = 4 // aton
	else if (mmsi.startsWith('970')) this.stationType = 5 // ais_sart
	else if (mmsi.startsWith('972')) this.stationType = 6 // mob
	else if (mmsi.startsWith('974')) this.stationType = 7 // epirb

	switch (this.aistype) {
		case 1:
		case 2:
		case 3: // class A position report
			this.class	  = 'A';
			this.navstatus  = this.GetInt( 38, 4);

			var lon		 = this.GetInt(61, 28);
			if (lon & 0x08000000 ) lon |= 0xf0000000;
			lon = parseFloat (lon / 600000);

			var lat = this.GetInt(89, 27);
			if( lat & 0x04000000 ) lat |= 0xf8000000;
			lat = parseFloat (lat / 600000);

			if( ( lon <= 180. ) && ( lat <= 90. ) ) {
				this.lon = lon;
				this.lat = lat;
				this.valid = true;
			} else this.valid = false;

			this.rot = this.GetInt( 42, 8, true )				   // Rate of turn
			this.sog = this.GetInt(  50, 10) / 10;				  //speed over ground
			this.cog = this.GetInt( 116, 12) / 10;				  //course over ground
			this.hdg = parseFloat (this.GetInt( 128,  9));		  //magnetic heading
			this.utc = this.GetInt( 137, 6 );
			this.smi = this.GetInt( 143, 2 );


			break;
		case 18: // class B position report
			this.class  = 'B';
			
			var lon = this.GetInt(57, 28 );
			if (lon & 0x08000000 ) lon |= 0xf0000000;
			lon = parseFloat (lon / 600000);

			var lat = this.GetInt(85, 27 );
			if( lat & 0x04000000 ) lat |= 0xf8000000;
			lat = parseFloat (lat / 600000);

			if( ( lon <= 180. ) && ( lat <= 90. ) ) {
				this.lon = lon;
				this.lat = lat;
				this.valid = true;
			} else this.valid = false;

			this.sog = this.GetInt( 46, 10 ) / 10;				//speed over ground
			this.cog = this.GetInt( 112, 12) / 10;				//course over ground
			this.hdg = parseFloat (this.GetInt( 124,  9));		//magnetic heading
			this.utc = this.GetInt( 133, 6 );

			break;
		case 19: // Extended class B position report
			this.class  = 'B';

			var lon = this.GetInt(57, 28 );
			if (lon & 0x08000000 ) lon |= 0xf0000000;
			lon = parseFloat (lon / 600000);

			var lat = this.GetInt(85, 27 );
			if( lat & 0x04000000 ) lat |= 0xf8000000;
			lat = parseFloat (lat / 600000);

			if( ( lon <= 180. ) && ( lat <= 90. ) ) {
				this.lon = lon;
				this.lat = lat;
				this.valid = true;
			} else this.valid = false;

			this.sog = this.GetInt( 46, 10 ) / 10;				//speed over ground
			this.cog = this.GetInt( 112, 12) / 10;				//course over ground
			this.hdg = parseFloat (this.GetInt( 124,  9));		//magnetic heading
			this.utc = this.GetInt( 133, 6 );

			this.shipname	= this.GetStr(143,120).trim();
			this.cargo	   = this.GetInt(263,8);

			this.dimA   = this.GetInt(271, 9 );
			this.dimB   = this.GetInt(280, 9 );
			this.dimC   = this.GetInt(289, 6 );
			this.dimD   = this.GetInt(295, 6 );
			this.length = this.dimA + this.dimB;
			this.width  = this.dimC + this.dimD;

			break;
		case 5:
			this.class  = 'A';
//		  Get the AIS Version indicator
//		  0 = station compliant with Recommendation ITU-R M.1371-1
//		  1 = station compliant with Recommendation ITU-R M.1371-3 (or later)
//		  2 = station compliant with Recommendation ITU-R M.1371-5 (or later)
//		  3 = station compliant with future editions
			var AIS_version_indicator = this.GetInt(38,2);
			if( AIS_version_indicator < 3 )
				{
				this.imo = this.GetInt(40,30);
				this.callsign	= this.GetStr(70,42).trim();
				this.shipname	= this.GetStr(112,120).trim();
				this.cargo	   = this.GetInt(232,8);
				this.dimA		= this.GetInt(240,9);
				this.dimB		= this.GetInt(249,9);
				this.dimC		= this.GetInt(258,6);
				this.dimD		= this.GetInt(264,6);
				this.etaMo	   = this.GetInt(274,4);
				this.etaDay	  = this.GetInt(278,5);
				this.etaHr	   = this.GetInt(283,5);
				this.etaMin	  = this.GetInt(288,6);
				this.draught	 = this.GetInt(294, 8 ) / 10.0;
				this.destination = this.GetStr(302, 120).trim();
				this.length	  = this.dimA + this.dimB;
				this.width	   = this.dimC + this.dimD;
				this.valid	   = true;
			}

			break;
		case 24:  // Vesel static information
			this.class='B';
			this.part = this.GetInt(38, 2 );
			if (0 === this.part ) {
				this.shipname = this.GetStr(40, 120).trim();
				this.valid	= true;
			} else if ( this.part === 1) {
				this.cargo	= this.GetInt(40, 8 );
				this.callsign = this.GetStr(90, 42).trim();

				// 98 = auxiliary craft
				if (parseInt(this.immsi/10000000) === 98) {
					var mothership  = this.GetInt (132, 30);
					this.mothership = ("000000000" + mothership).slice(-9);
				} else {
					this.dimA   = this.GetInt(132, 9 );
					this.dimB   = this.GetInt(141, 9 );
					this.dimC   = this.GetInt(150, 6 );
					this.dimD   = this.GetInt(156, 6 );
					this.length = this.dimA + this.dimB;
					this.width  = this.dimC + this.dimD;
				}
				this.valid  = true;
			}
			break;
		case 4:  // base station
			// this.class	  = '-';
		case 11: // UTC/Date Response
			var lon = this.GetInt(79, 28);
			if (lon & 0x08000000 ) lon |= 0xf0000000;
			lon = parseFloat (lon / 600000);

			var lat = this.GetInt(107, 27);
			if( lat & 0x04000000 ) lat |= 0xf8000000;
			lat = parseFloat (lat / 600000);

			if( ( lon <= 180. ) && ( lat <= 90. ) ) {
				this.lon = lon;
				this.lat = lat;
				this.valid = true;
			} else this.valid = false;
			break;
		case 9: // sar aircraft
			// this.class	  = '-';

			this.alt = this.GetInt(38, 12);

			var lon = this.GetInt(61, 28);
			if (lon & 0x08000000 ) lon |= 0xf0000000;
			lon = parseFloat (lon / 600000);

			var lat = this.GetInt(89, 27);
			if( lat & 0x04000000 ) lat |= 0xf8000000;
			lat = parseFloat (lat / 600000);

			if( ( lon <= 180. ) && ( lat <= 90. ) ) {
				this.lon = lon;
				this.lat = lat;
				this.valid = true;
			} else this.valid = false;

			this.sog = parseFloat (this.GetInt( 50, 10 ));  //speed over ground
			this.cog = this.GetInt( 116, 12) / 10;		  //course over ground

			break;
		case 21: // aid to navigation
			// this.class	  = '-';

			this.aidtype = this.GetInt(38, 5);
			this.shipname = this.GetStr(43, 120).trim();

			var lon = this.GetInt(164, 28);
			if (lon & 0x08000000 ) lon |= 0xf0000000;
			lon = parseFloat (lon / 600000);

			var lat = this.GetInt(192, 27);
			if( lat & 0x04000000 ) lat |= 0xf8000000;
			lat = parseFloat (lat / 600000);

			if( ( lon <= 180. ) && ( lat <= 90. ) ) {
				this.lon = lon;
				this.lat = lat;
				this.valid = true;
			} else this.valid = false;

			this.dimA   = this.GetInt(219, 9 );
			this.dimB   = this.GetInt(228, 9 );
			this.dimC   = this.GetInt(237, 6 );
			this.dimD   = this.GetInt(243, 6 );
			this.length = this.dimA + this.dimB;
			this.width  = this.dimC + this.dimD;

			this.utc = this.GetInt(253, 6);
			this.offpos = this.GetInt(259, 1);
			this.virtual = this.GetInt(269, 1);

			var len = parseInt(( ( this.bitarray.length - 272 /6 ) / 6 ) * 6)*6;
			this.txt = this.GetStr(272 , len).trim();

			break;
		case 14: // text msg
			if (this.bitarray.length > 40/6) {
				var len = parseInt(( ( this.bitarray.length - 40/6 ) / 6 ) * 6)*6;
				this.txt = this.GetStr(40, len).trim();
				this.valid = true;
			}
			break;
		case 8: // Binary Broadcast Message
				this.dac = this.GetInt(40, 10 );
				this.fid = this.GetInt(50, 6 );
				// Inland ship static and voyage related data
				if (this.dac === 200 && this.fid === 10 ) {
					this.ENI		 = this.GetStr(56,48).trim();
					this.length	  = parseFloat(this.GetInt(104, 13 )) /10.;
					this.width	   = parseFloat(this.GetInt(117, 10 )) /10.;
					this.draught	 = parseFloat(this.GetInt(144, 11 )) / 100.0;
					this.shiptypeERI = this.GetInt(127, 14 );
					this.valid	   = true;
				}
				// meteorological and hydrographic data
				else if (this.dac === 1 && this.fid === 31 ) {
					// https://academy.iala-aism.org/asm/meteorological-hydrographic-data/
					var lon = this.GetInt(56, 25);
					if (lon & 0x01000000) lon |= 0xfe000000;
					lon = parseFloat (lon / 60000);

					var lat = this.GetInt(81, 24);
					if (lat & 0x00800000) lat |= 0xff000000;
					lat = parseFloat (lat / 60000);

					this.utcday		= parseInt(this.GetInt(106, 5));
					this.utchour	   = parseInt(this.GetInt(111, 5));
					this.utcminute	 = parseInt(this.GetInt(116, 6));
					var avgwindspd	 = parseInt(this.GetInt(122, 7));
					if (avgwindspd != 127) {
						this.avgwindspd = avgwindspd;
					}
					var windgust	   = parseInt(this.GetInt(129, 7));
					if (windgust != 127) {
						this.windgust = windgust;
					}
					var winddir		= parseInt(this.GetInt(136, 9));
					if (winddir < 360) {
						this.winddir = winddir;
					}
					var windgustdir	= parseInt(this.GetInt(145, 9));
					if (windgustdir < 360) {
						this.windgustdir = windgustdir;
					}
					var airtemp		= parseInt(this.GetInt(154, 11, 1));
					if (airtemp < 601 && airtemp > -601){
						this.airtemp = airtemp / 10.0;
					}
					var relhumid	   = parseInt(this.GetInt(165, 7));
					if (relhumid < 101) {
						this.relhumid = relhumid;
					}
					var dewpoint	   = parseInt(this.GetInt(172, 10, 1));
					if (dewpoint < 501 && dewpoint > -201){
						this.dewpoint = dewpoint / 10.0;
					}
					var airpress	   = parseInt(this.GetInt(182, 9));
					if (airpress < 401) {
						this.airpress = airpress + 799;
					}
					var airpressten	= parseInt(this.GetInt(191, 2));
					if (airpressten < 3) {
						this.airpressten = airpressten;
					}
					var horvisib	   = parseInt(this.GetInt(194, 7));
					if (horvisib < 127) {
						this.horvisib = horvisib / 10.0;
						var horvisibrange  = parseInt(this.GetInt(193, 1));
						this.horvisibrange = horvisibrange === 1;
					}
					var waterlevel	 = parseInt(this.GetInt(201, 12));
					if (waterlevel < 4001) {
						this.waterlevel = (waterlevel - 1000) / 100.0;;
					}
					var waterlevelten  = parseInt(this.GetInt(213, 2));
					if (waterlevelten < 3) {
						this.waterlevelten = waterlevelten;
					}
					var surfcurrspd	= parseInt(this.GetInt(215, 8));
					if (surfcurrspd < 252) {
						this.surfcurrspd = surfcurrspd / 10.0;;
					}
					var surfcurrdir	= parseInt(this.GetInt(223, 9));
					if (surfcurrdir < 360) {
						this.surfcurrdir = surfcurrdir;
					}
					var signwavewhgt   = parseInt(this.GetInt(276, 8));
					if (signwavewhgt < 252) {
						this.signwavewhgt = signwavewhgt / 10.0;
					}
					var waveperiod	 = parseInt(this.GetInt(284, 6));
					if (waveperiod < 61) {
						this.waveperiod = waveperiod;
					}
					var wavedir		= parseInt(this.GetInt(290, 9));
					if (wavedir < 360) {
						this.wavedir = wavedir;
					}
					var swellhgt	   = parseInt(this.GetInt(299, 8));
					if (swellhgt < 252) {
						this.swellhgt = swellhgt / 10.0;
					}
					var swellperiod	= parseInt(this.GetInt(307, 6));
					if (swellperiod < 61) {
						this.swellperiod = swellperiod;
					}
					var swelldir	   = parseInt(this.GetInt(313, 9));
					if (swelldir < 360) {
						this.swelldir = swelldir;
					}
					var seastate	  = parseInt(this.GetInt(322, 4));
					if (seastate < 13) {
						this.seastate = seastate;
					}
					var watertemp	  = parseInt(this.GetInt(326, 10, 1));
					if (watertemp < 501 && watertemp > -101){
						this.watertemp = watertemp / 10.0;
					}
					var precipitation  = parseInt(this.GetInt(336, 3));
					if (precipitation < 7) {
						this.precipitation = precipitation;
					}
					var salinity	   = parseInt(this.GetInt(339, 9));
					if (salinity < 502) {
						this.salinity = salinity / 10.0;
					}
					var ice		   = parseInt(this.GetInt(348, 2));
					if (ice < 2) {
						this.ice = ice;
					}

					if( ( lon <= 180. ) && ( lat <= 90. ) ) {
						this.lon = lon;
						this.lat = lat;
						var latPart = ("000000" + parseInt(("000" + (lat % 1).toFixed(3).slice(-3)).slice(-3), 10)).slice(-3);
						var lonPart = ("000000" + parseInt(("000" + (lon % 1).toFixed(3).slice(-3)).slice(-3), 10)).slice(-3);
						this.mmsikey = this.mmsi + ':' + latPart + lonPart;
						this.valid = true;
					} else this.valid = false;
				}
				// meteorological and hydrographic data (Deprecated)
				else if (this.dac === 1 && this.fid === 11 ) {
					// https://academy.iala-aism.org/asm/metreorological-hydrological-data-2/
					var lon = this.GetInt(80, 25);
					if (lon & 0x01000000) lon |= 0xfe000000;
					lon = parseFloat (lon / 60000);

					var lat = this.GetInt(56, 24);
					if (lat & 0x00800000) lat |= 0xff000000;
					lat = parseFloat (lat / 60000);

					this.utcday		= parseInt(this.GetInt(105, 5));
					this.utchour	   = parseInt(this.GetInt(110, 5));
					this.utcminute	 = parseInt(this.GetInt(115, 6));
					var avgwindspd	 = parseInt(this.GetInt(121, 7));
					if (avgwindspd != 127) {
						this.avgwindspd = avgwindspd;
					}
					var windgust	   = parseInt(this.GetInt(128, 7));
					if (windgust != 127) {
						this.windgust = windgust;
					}
					var winddir		= parseInt(this.GetInt(135, 9));
					if (winddir < 360) {
						this.winddir = winddir;
					}
					var windgustdir	= parseInt(this.GetInt(144, 9));
					if (windgustdir < 360) {
						this.windgustdir = windgustdir;
					}
					var airtemp		= parseInt(this.GetInt(153, 11, 1)) - 600;
					if (airtemp < 601 && airtemp > -601){
						this.airtemp = airtemp / 10.0;
					}
					var relhumid	   = parseInt(this.GetInt(164, 7));
					if (relhumid < 101) {
						this.relhumid = relhumid;
					}
					var dewpoint	   = parseInt(this.GetInt(171, 10, 1)) - 200;
					if (dewpoint < 501 && dewpoint > -201){
						this.dewpoint = dewpoint / 10.0;
					}
					var airpress	   = parseInt(this.GetInt(181, 9));
					if (airpress < 401) {
						this.airpress = airpress + 799;
					}
					var airpressten	= parseInt(this.GetInt(190, 2));
					if (airpressten < 3) {
						this.airpressten = airpressten;
					}
					var horvisib	   = parseInt(this.GetInt(192, 8));
					if (horvisib != 255) {
						this.horvisib = horvisib / 10.0;;
					}
					var waterlevel	 = parseInt(this.GetInt(200, 9));
					if (waterlevel < 4001) {
						this.waterlevel = (waterlevel - 1000) / 100.0;;
					}
					var waterlevelten  = parseInt(this.GetInt(209, 2));
					if (waterlevelten < 3) {
						this.waterlevelten = waterlevelten;
					}
					var surfcurrspd	= parseInt(this.GetInt(211, 8));
					if (surfcurrspd < 252) {
						this.surfcurrspd = surfcurrspd / 10.0;;
					}
					var surfcurrdir	= parseInt(this.GetInt(219, 9));
					if (surfcurrdir < 360) {
						this.surfcurrdir = surfcurrdir;
					}
					var signwavewhgt   = parseInt(this.GetInt(272, 8));
					if (signwavewhgt < 252) {
						this.signwavewhgt = signwavewhgt / 10.0;
					}
					var waveperiod	 = parseInt(this.GetInt(280, 6));
					if (waveperiod < 61) {
						this.waveperiod = waveperiod;
					}
					var wavedir		= parseInt(this.GetInt(286, 9));
					if (wavedir < 360) {
						this.wavedir = wavedir;
					}
					var swellhgt	   = parseInt(this.GetInt(295, 8));
					if (swellhgt < 252) {
						this.swellhgt = swellhgt / 10.0;
					}
					var swellperiod   = parseInt(this.GetInt(303, 6));
					if (swellperiod < 61) {
						this.swellperiod = swellperiod;
					}
					var swelldir	   = parseInt(this.GetInt(309, 9));
					if (swelldir < 360) {
						this.swelldir = swelldir;
					}
					var seastate	   = parseInt(this.GetInt(318, 4));
					if (seastate < 13) {
						this.seastate = seastate;
					}
					var watertemp	  = parseInt(this.GetInt(322, 10, 1));
					if (watertemp < 501 && watertemp > -101){
						this.watertemp = watertemp / 10.0;
					}
					var precipitation  = parseInt(this.GetInt(332, 3));
					if (precipitation < 7) {
						this.precipitation = precipitation;
					}
					var salinity	   = parseInt(this.GetInt(335, 9));
					if (salinity < 502) {
						this.salinity = salinity / 10.0;
					}
					var ice			= parseInt(this.GetInt(344, 2));
					if (ice < 2) {
						this.ice = ice;
					}

					if( ( lon <= 180. ) && ( lat <= 90. ) ) {
						this.lon = lon;
						this.lat = lat;
						var latPart = ("000000" + parseInt(("000" + (lat % 1).toFixed(3).slice(-3)).slice(-3), 10)).slice(-3);
						var lonPart = ("000000" + parseInt(("000" + (lon % 1).toFixed(3).slice(-3)).slice(-3), 10)).slice(-3);
						this.mmsikey = this.mmsi + ':' + latPart + lonPart;
						this.valid = true;
					} else this.valid = false;
				}
				// meteorological and hydrographic data
				else if (this.dac === 367 && this.fid === 33 ) {
					// https://www.e-navigation.nl/sites/default/files/asm_files/em_version_release_3-23mar15_0.pdf
					var len = Math.floor((this.msglen * 6)/112);
					for(var i=0 ; i<len ; i++) {
						this.reporttype	= parseInt(this.GetInt(56 + (112*i), 4));
						this.utcday		= parseInt(this.GetInt(60, 5));
						this.utchour	   = parseInt(this.GetInt(65, 5));
						this.utcminute	 = parseInt(this.GetInt(70, 6));
						this.siteid		= parseInt(this.GetInt(76, 6));
						this.mmsikey	   = this.mmsi + ':' + this.siteid;
						if (this.reporttype === 0) {
							var msgversion = parseInt(this.GetInt(56 + (112*i) + 27, 6));
							if (msgversion === 0 || msgversion > 15) break;
							var lon = this.GetInt(56 + (112*i) + 33, 28);
							if (lon & 0x08000000) lon |= 0xf0000000;
							lon = parseFloat (lon / 600000);
							var lat = this.GetInt(56 + (112*i) + 61, 27);
							if (lat & 0x04000000) lat |= 0xf8000000;
							lat = parseFloat (lat / 600000);

							if( ( lon <= 180. ) && ( lat <= 90. ) ) {
								this.lon = lon;
								this.lat = lat;
								this.valid = true;
							} else this.valid = false;
						}
						else if (this.reporttype === 1) {
							this.shipname = this.GetStr(56 + (112*i) + 27, 84).trim();
							this.valid = true;
						}
						else if (this.reporttype === 2) {
							var avgwindspd	 = parseInt(this.GetInt(56 + (112*i) + 27, 7));
							if (avgwindspd < 122) {
								this.avgwindspd = avgwindspd;
							}
							var windgust	   = parseInt(this.GetInt(56 + (112*i) + 34, 7));
							if (windgust < 122) {
								this.windgust = windgust;
							}
							var winddir		= parseInt(this.GetInt(56 + (112*i) + 41, 9));
							if (winddir < 360) {
								this.winddir = winddir;
							}
							var windgustdir	= parseInt(this.GetInt(56 + (112*i) + 50, 9));
							if (windgustdir < 360) {
								this.windgustdir = windgustdir;
							}
							this.valid = true;
						}
						else if (this.reporttype === 3) {
							var descr = parseInt(this.GetInt(56 + (112*i) + 50, 3));
							if (descr === 1 || descr === 2) {
								var waterlevel	 = parseInt(this.GetInt(56 + (112*i) + 27, 16, 1));
								if (waterlevel > -32768) {
									this.waterlevel = waterlevel / 100.0;;
								}
								var waterlevelten  = parseInt(this.GetInt(56 + (112*i) + 43, 2));
								if (waterlevelten < 3) {
									this.waterlevelten = (waterlevelten === 0 ? 2 : (waterlevelten === 2 ? 0 : 1));
								}
								this.valid = true;
							}
						}
						else if (this.reporttype === 9) {
							var descr = parseInt(this.GetInt(56 + (112*i) + 38, 3));
							if (descr === 1 || descr === 2) {
								var airtemp		= parseInt(this.GetInt(56 + (112*i) + 27, 11, 1));
								if (airtemp < 601 && airtemp > -601){
									this.airtemp = airtemp / 10.0;
								}
							}
							descr = parseInt(this.GetInt(56 + (112*i) + 61, 3));
							if (descr === 1 || descr === 2) {
								var horvisib	   = parseInt(this.GetInt(56 + (112*i) + 43, 8));
								if (horvisib < 242) {
									this.horvisib = horvisib / 10.0;;
									if (horvisib === 241){
										this.horvisibrange = true;
									}
									else {
										this.horvisibrange = false;
									}
								}
								var dewpoint	   = parseInt(this.GetInt(56 + (112*i) + 51, 10, 1));
								if (dewpoint < 501 && dewpoint > -201){
									this.dewpoint = dewpoint / 10.0;
								}
							}
							descr = parseInt(this.GetInt(56 + (112*i) + 75, 3));
							if (descr === 1 || descr === 2) {
								var airpress	   = parseInt(this.GetInt(56 + (112*i) + 64, 9));
								if (airpress < 401) {
									this.airpress = airpress + 799;
								}
								var airpressten	= parseInt(this.GetInt(56 + (112*i) + 73, 2));
								if (airpressten < 3) {
									this.airpressten = airpressten;
								}
							}
							var salinity	   = parseInt(this.GetInt(56 + (112*i) + 78, 9));
							if (salinity < 502) {
								this.salinity = salinity / 10.0;
							}
							this.valid = true;
						}
						else {
							console.log (' -->msg-08 ' + i + ' report not found '+ this.reporttype);
						}
					}

				}
				else {
					if (DEBUG) {
						console.log ('---- type=%d %s dac=%d fid=%d %s', this.aistype, this.mmsi, dac, fid, input);
					}
				}
			break;
		case 27: // Long Range AIS Broadcast message
			this.navstatus  = this.GetInt( 40, 4);

			var lon = this.GetInt(44, 18 );
			lon = parseFloat (lon) / 600;

			var lat = this.GetInt(62, 17 );
			lat = parseFloat (lat) / 600;

			if( ( lon <= 180. ) && ( lat <= 90. ) ) {
				this.lon = lon;
				this.lat = lat;
				this.valid = true;
			} else this.valid = false;

			this.sog = this.GetInt( 79, 6 ) ;				//speed over ground
			this.cog = this.GetInt( 85, 9);				//course over ground
			break;
		default:
			if (DEBUG) {
				console.log ('---- type=%d %s %s -> %s', this.aistype, this.Getaistype(this.aistype), this.mmsi, input);
			}
			break;
	}
}

// Validate message checksum
AisDecoder.prototype.validateChecksum = function(input) {
	if (typeof input === "string") {
		var loc1 = input.indexOf("!");
		var loc2 = input.indexOf("*");

		if (loc1 === 0 && loc2 > 0) {
			var body = input.substring(1, loc2);
			var checksum = input.substring(loc2 + 1).toUpperCase();

			for (var sum = 0, i = 0; i < body.length; i++) {
				sum ^= body.charCodeAt(i);  //xor based checksum
			}
			var hex = sum.toString(16).toUpperCase();
			if (hex.length === 1) hex = '0' + hex;	  //single digit hex needs preceding 0, '0F'

			return (checksum === hex);
		}
	}
	return false;
};

// Extract an integer sign or unsigned from payload
AisDecoder.prototype.GetInt= function (start, len, signed) {
	var acc = 0;
	var cp, cx,c0, cs;

	for(var i=0 ; i<len ; i++)
	{
		acc  = acc << 1;
		cp = parseInt ((start + i) / 6);
		cx = this.bitarray[cp];
		cs = 5 - ((start + i) % 6);
		c0 = (cx >> cs) & 1;

		if (i === 0 && signed && c0) { // if signed value and first bit is 1, pad with 1's
		  acc = ~acc;
		}
		acc |= c0;

		//console.log ('**** bitarray[%d]=cx=%s i=%d cs=%d  co=%s acc=%s'
		//,cp , this.bitarray[cp].toString(2), i, cs,  c0.toString(2),acc.toString(2));
	}
	//console.log ('---- start=%d len=%d acc=%s acc=%d', start, len ,  acc.toString(2), acc);
	return acc;
};

// Extract a string from payload [1st bits is index 0]
AisDecoder.prototype.GetStr= function(start, len) {

	// extended message are not supported
	if (this.bitarray.length < (start + len) /6) {
		//console.log ("AisDecoder: ext msg not implemented GetStr(%d,%d)", start, len);
		len = parseInt(( ( this.bitarray.length - start/6 ) / 6 ) * 6)*6;
	}
	// messages in the wild sometimes produce a negative len which will cause a buffer range error
	// exception, stating size argument must not be negative. This occurs in the new Buffer() below.
	if (len < 0) {
		return '';
	}

	//char temp_str[85];
	var buffer = Buffer.alloc(len/6);
	var cp, cx, cs,c0;
	var acc = 0;
	var k   = 0;
	var i   = 0;
	while(i < len)
	{
		 acc=0;
		 for(var j=0 ; j<6 ; j++)
		 {
			acc  = acc << 1;
			cp =  parseInt ((start + i) / 6);
			cx = this.bitarray[cp];
			cs = 5 - ((start + i) % 6);
			c0 = (cx >> (5 - ((start + i) % 6))) & 1;
			acc |= c0;
			i++;
		 }
		 buffer[k] = acc; // opencpn
		 if(acc < 0x20)  buffer[k] += 0x40;
		 else		  buffer[k] = acc;  // opencpn enfoce (acc & 0x3f) ???
		 if ( buffer[k] === 0x40) break; // name end with '@'
		 k++;
	}
	return (buffer.toString ('utf8',0, k));
};

AisDecoder.prototype.GetNavStatus = function () {
	return (NAV_STATUS[this.navstatus]);
};

AisDecoder.prototype.Getaistype = function () {
	return (MSG_TYPE[this.aistype]);
};

AisDecoder.prototype.GetVesselType = function () {
	return (VESSEL_TYPE[this.cargo]);
};

AisDecoder.prototype.GetStationType = function () {
	return (STATION_TYPE[this.stationType]);
};

// map ERI Classification to other vessel types
AisDecoder.prototype.GetERIShiptype = function( shiptypeERI ) {
	switch (shiptypeERI) {
		case 8000: return 99; // Vessel, type unknown
		case 8010: return 79; // Motor freighter
		case 8020: return 89; // Motor tanker
		case 8021: return 80; // Motor tanker, liquid cargo, type N

		case 8022: return 80; // Motor tanker, liquid cargo, type C

		case 8023: return 89; // Motor tanker, dry cargo as if liquid (e.g. cement)

		case 8030: return 79; // Container vessel

		case 8040: return 80; // Gas tanker

		case 8050: return 79; // Motor freighter, tug

		case 8060: return 89; // Motor tanker, tug

		case 8070: return 79; // Motor freighter with one or more ships alongside

		case 8080: return 89; // Motor freighter with tanker

		case 8090: return 79; // Motor freighter pushing one or more freighters

		case 8100: return 89; // Motor freighter pushing at least one tank-ship

		case 8110: return 79; // Tug, freighter

		case 8120: return 89; // Tug, tanker

		case 8130: return 31; // Tug freighter, coupled

		case 8140: return 31; // Tug, freighter/tanker, coupled

		case 8150: return 99; // Freightbarge

		case 8160: return 99; // Tankbarge

		case 8161: return 90; // Tankbarge, liquid cargo, type N

		case 8162: return 90; // Tankbarge, liquid cargo, type C

		case 8163: return 99; // Tankbarge, dry cargo as if liquid (e.g. cement)

		case 8170: return 99; // Freightbarge with containers

		case 8180: return 90; // Tankbarge, gas

		case 8210: return 79; // Pushtow, one cargo barge

		case 8220: return 79; // Pushtow, two cargo barges

		case 8230: return 79; // Pushtow, three cargo barges

		case 8240: return 79; // Pushtow, four cargo barges

		case 8250: return 79; // Pushtow, five cargo barges

		case 8260: return 79; // Pushtow, six cargo barges

		case 8270: return 79; // Pushtow, seven cargo barges

		case 8280: return 79; // Pushtow, eight cargo barges

		case 8290: return 79; // Pushtow, nine or more barges

		case 8310: return 80; // Pushtow, one tank/gas barge

		case 8320: return 80; // Pushtow, two barges at least one tanker or gas barge

		case 8330: return 80; // Pushtow, three barges at least one tanker or gas barge

		case 8340: return 80; // Pushtow, four barges at least one tanker or gas barge

		case 8350: return 80; // Pushtow, five barges at least one tanker or gas barge

		case 8360: return 80; // Pushtow, six barges at least one tanker or gas barge

		case 8370: return 80; // Pushtow, seven barges at least one tanker or gas barge
	}
	return shiptypeERI;
};

AisDecoder.internalFields = internalFields

export default AisDecoder
