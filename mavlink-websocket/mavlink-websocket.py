#!/usr/bin/env python

import time
import math
import logging
import json
from threading import Thread

from tornado import websocket, web, ioloop
from pymavlink import mavutil
from pymavlink.mavutil import mavlink


logging.basicConfig(level=logging.INFO)
clients = []
mavconn = mavutil.mavlink_connection('udpin:0.0.0.0:14540', source_system=255)


class MAVLinkClient(websocket.WebSocketHandler):
    def __init__(self, *args, **kwargs):
        super(MAVLinkClient, self).__init__(*args, **kwargs)

        # Allowed incoming messages and their intervals
        self.income_messages_intervals = {
            mavlink.MAVLINK_MSG_ID_HEARTBEAT: 0,
            mavlink.MAVLINK_MSG_ID_SYS_STATUS: 0,
            mavlink.MAVLINK_MSG_ID_ALTITUDE: 1.0 / 3,
            mavlink.MAVLINK_MSG_ID_ATTITUDE: 1.0 / 3,
            mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT: 1.0 / 5,
        }

        # Allowed outcoming meessages
        self.outcome_messages = {
            mavlink.MAVLINK_MSG_ID_COMMAND_LONG,
        }

        self.message_stamps = {}
        self.client_description = ''

    def check_origin(self, origin):
        return True

    def open(self):
        self.client_description = self.request.remote_ip + ':' + str(self.stream.socket.getpeername()[1])
        logging.info('Client connected: %s', self.client_description)
        if self not in clients:
            clients.append(self)

    def on_message(self, msg):
        try:
            msg = json.loads(msg)
            msgid = msg.pop('msgid')
            msgidn = getattr(mavlink, 'MAVLINK_MSG_ID_' + msgid)
            if not msgidn in self.outcome_messages:
                logging.warn('%s: outcoming message %s is not allowed', self.client_description, msgid)
                return

            # replace nulls to NaNs
            for key in msg:
                if msg[key] is None:
                    msg[key] = float('nan')

            fn = getattr(mavconn.mav, msgid.lower() + '_send')
            fn(**msg)
        except:
            logging.exception('%s: error passing outcoming message', self.client_description)

    def on_close(self):
        logging.info('Client disconnected: %s', self.client_description)
        if self in clients:
            clients.remove(self)

    def handle_mavlink_message(self, msg):
        stamp = time.time()
        interval = self.income_messages_intervals.get(msg.get_msgId())
        if interval is None:
            # no such message in the whitelist
            return

        stamp_key = '%d.%d' % (msg.get_srcSystem(), msg.get_msgId())
        last_stamp = self.message_stamps.get(stamp_key, 0)
        if stamp - last_stamp < interval:
            # message interval has not passed
            return

        self.message_stamps[stamp_key] = stamp

        msg_dict = msg.to_dict()
        msg_dict['msgid'] = msg.get_msgId()
        msg_dict['sysid'] = msg.get_srcSystem()
        msg_dict['compid'] = msg.get_srcComponent()
        del msg_dict['mavpackettype']

        # replace NaNs to nulls
        for key in msg_dict:
            if  isinstance(msg_dict[key], float) and math.isnan(msg_dict[key]):
                msg_dict[key] = None

        # pass message
        self.write_message(msg_dict)


class MAVLinkReader(Thread):
    def run(self):
        logging.info('Starting MAVLink reader thread')
        while True:
            msg = mavconn.recv_match(blocking=True)
            for client in clients:
                client.handle_mavlink_message(msg)


reader = MAVLinkReader()
reader.daemon = True
reader.start()


app = web.Application([
    (r'/mavlink', MAVLinkClient),
])


if __name__ == '__main__':
    logging.info('Starting web socket server')
    app.listen(17437)
    ioloop.IOLoop.instance().start()
