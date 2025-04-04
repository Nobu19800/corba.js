/*
 *  corba.js Object Request Broker (ORB) and Interface Definition Language (IDL) compiler
 *  Copyright (C) 2018, 2021 Mark-André Hopf <mhopf@mark13.org>
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { ORB } from "./orb"
import { Connection } from "./connection"

// Protocol provides an interface to the ORB for various network protocols, eg.
// orb.registerProtocol(new TcpProtocol(orb))
// orb.registerProtocol(new WebSocketProtocol(orb))
export interface Protocol {
    // client/initiator: called by the ORB
    connect(orb: ORB, hostname: string, port: number, pathname?: string): Promise<Connection>
    close(): Promise<void>
}
