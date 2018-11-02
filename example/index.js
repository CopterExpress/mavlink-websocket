const MAVLINK_MSG_GLOBAL_POSITION_INT = 33;
const MAVLINK_MSG_ALTITUDE = 141;

var sock = new WebSocket('ws://127.0.0.1:17437/mavlink');
var map;
var placemarks = {};
var telemetry = {};

sock.onmessage = function(e) {
	// console.log(e.data);

	var msg = JSON.parse(e.data);
	var sysid = msg.sysid;

	if (msg.msgid == MAVLINK_MSG_GLOBAL_POSITION_INT && map) {
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
		console.log('alt!')
		if (placemarks[sysid]) {
			placemarks[sysid].properties.set('iconCaption',
				'Vehicle ' + sysid + ' (alt: ' + Math.round(msg.altitude_relative) + ')');
		}
	}
}

$(function() {
	ymaps.ready(init);
});

function init() {
	map = new ymaps.Map($('.map').get(0), {
		center: [55.76, 37.64],
		height: 300,
		zoom: 7,
		controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
	});
}
