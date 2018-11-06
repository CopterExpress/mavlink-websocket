const MAVLINK_MSG_HEARTBEAT = 0;
const MAVLINK_MSG_GLOBAL_POSITION_INT = 33;
const MAVLINK_MSG_ID_COMMAND_LONG = 76;
const MAVLINK_MSG_ALTITUDE = 141;
const MAV_CMD_DO_SET_MODE = 176;
const MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1;
const MAV_MODE_FLAG_MANUAL_INPUT_ENABLED = 64;
const MAV_MODE_FLAG_SAFETY_ARMED = 128;
const PX4_CUSTOM_MAIN_MODE_AUTO = 4;
const PX4_CUSTOM_SUB_MODE_AUTO_LAND = 6;

var sock = new WebSocket('ws://127.0.0.1:17437/mavlink');
var map;
var placemarks = {};
var vehicles = $('.vehicles');

function parsePX4Mode(baseMode, customMode) {
	// Convert encoded PX4 mode to string
	// Simplified algorithm from https://github.com/ArduPilot/pymavlink/blob/935a2c8/mavutil.py#L1785
	var customMainMode = (customMode & 0xFF0000) >> 16;
	var customSubMode = (customMode & 0xFF000000) >> 24;

	if (baseMode & MAV_MODE_FLAG_MANUAL_INPUT_ENABLED) {
		switch(customMainMode) {
			case 1: return 'MANUAL';
			case 5: return 'ACRO';
			case 8: return 'RATTITUDE';
			case 7: return 'STABILIZED';
			case 2: return 'ALTITUDE';
			case 3: return 'POSITION';
		}
	} else {
		switch(customSubMode) {
			case 0: return 'OFFBOARD';
			case 2: return 'TAKEOFF';
			case 3: return 'HOLD';
			case 4: return 'MISSION';
			case 5: return 'RTL';
			case 6: return 'LAND';
			case 7: return 'RTGS';
			case 8: return 'FOLLOWME';
		}
	}
}

sock.onmessage = function(e) {
	// console.log(e.data);

	var msg = JSON.parse(e.data);
	var sysid = msg.sysid;

	if (msg.msgid == MAVLINK_MSG_HEARTBEAT) {
		// https://mavlink.io/en/messages/common.html#HEARTBEAT
		var vehicle = vehicles.find('.vehicle[data-id=' + sysid + ']');
		if (!vehicle.length) {
			// new vehicle
			vehicle = $($('template.vehicle').html())
			vehicle.attr('data-id', sysid);
			vehicle.find('.id').html(sysid);
			vehicle.appendTo(vehicles);
		}
		vehicle.find('.mode').html(parsePX4Mode(msg.base_mode, msg.custom_mode) || 'UNKNOWN');
		vehicle.toggleClass('armed', Boolean(msg.base_mode & MAV_MODE_FLAG_SAFETY_ARMED));

	} else if (msg.msgid == MAVLINK_MSG_GLOBAL_POSITION_INT && map) {
		// https://mavlink.io/en/messages/common.html#GLOBAL_POSITION_INT
		var pos = [msg.lat / 1e7, msg.lon / 1e7];

		if (!placemarks[sysid]) {
			placemarks[sysid] = new ymaps.Placemark(pos, {
				iconCaption: 'Vehicle ' + sysid
			}, {
				preset: 'islands#blueCircleDotIconWithCaption'
			});
			map.geoObjects.add(placemarks[sysid]);

			// Set the center on first show
			map.setCenter(pos, 18);
		} else {
			placemarks[sysid].geometry.setCoordinates(pos);
		}

	} else if (msg.msgid == MAVLINK_MSG_ALTITUDE) {
		// https://mavlink.io/en/messages/common.html#ALTITUDE
		if (placemarks[sysid]) {
			placemarks[sysid].properties.set('iconCaption',
				'Vehicle ' + sysid + ' (alt: ' + Math.round(msg.altitude_relative) + ')');
		}
	}
}

$('body').on('click', '.land', function(e) {
	var sysid = Number($(e.target).closest('.vehicle').attr('data-id'));
	// Change mode to land.
	// See https://mavlink.io/en/messages/common.html#COMMAND_LONG and
	// https://mavlink.io/en/messages/common.html#MAV_CMD_DO_SET_MODE
	sock.send(JSON.stringify({
		msgid: MAVLINK_MSG_ID_COMMAND_LONG,
		target_system: sysid,
		target_component: 0,
		command: MAV_CMD_DO_SET_MODE,
		confirmation: 0,
		param1: MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
		param2: PX4_CUSTOM_MAIN_MODE_AUTO,
		param3: PX4_CUSTOM_SUB_MODE_AUTO_LAND,
		param4: 0,
		param5: 0,
		param6: 0,
		param7: 0
	}));
})

ymaps.ready(function() {
	map = new ymaps.Map($('.map').get(0), {
		center: [55.76, 37.64],
		height: 300,
		zoom: 7,
		controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
	});
});
