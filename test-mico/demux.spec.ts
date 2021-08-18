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

import { ORB, IOR, GIOPEncoder, GIOPDecoder, MessageType } from "corba.js"
import * as http from "http"
// import WebSocket, { Server as WebSocketServer } from "ws"
// import * as ws from 'ws'
import { 
    server as WebSocketServer,
    client as WebSocketClient,
    request as WebSocketRequest,
    connection as Connection,
    Message
} from "websocket"
import * as ws from "websocket"
// var x = require("websocket")

// WebSocket close codes
enum CloseCode {
    CLOSE_NORMAL = 1000,
    CLOSE_GOING_AWAY,
    CLOSE_PROTOCOL_ERROR,
    CLOSE_UNSUPPORTED,
    CLOSE_1004,
    CLOSED_NO_STATUS,
    CLOSE_ABNORMAL,
    CLOSE_UNSUPPORTED_PAYLOAD,
    CLOSE_POLICY_VIOLATION,
    CLOSE_TOO_LARGE,
    CLOSE_MANDATORY_EXTENSION,
    CLOSE_SERVER_ERROR,
    CLOSE_SERVICE_RESTART,
    CLOSE_TRY_AGAIN_LATER,
    CLOSE_BAD_GATEWAY,
    CLOSE_TLS_HANDSHAKE_FAIL,
    CLOSE_EXTENSION = 2000,
    CLOSE_IANA = 3000,
    CLOSE_CUSTOM = 4000
}


function createServer(port: number): Promise<WebSocketServer> {
    return new Promise<WebSocketServer>((resolve, reject) => {
        const httpServer = http.createServer()
        const wss = new (ws as any).default.server({httpServer, autoAcceptConnections: true}) as WebSocketServer
        wss.on("request", (request: WebSocketRequest) => {
            console.log('server: request')
            request.accept()
        })
        wss.on("connect", (connection: Connection) => {
            console.log("server: connection")
            const orb = new ServerORB()
            connection.on("message", (m: Message) => {
                console.log("server: message")
                switch(m.type) {
                    case "binary":
                        const b = m.binaryData
                        const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
                        orb.message(ab)
                        break
                    case "utf8":
                        console.log(m.utf8Data)
                        break
                }
            })
        })
        wss.on("close", (connection: Connection, reason: number, desc: string) => {
            const reasonText = CloseCode[reason] || `${reason}`
            console.log(`server: close ${reasonText} '${desc}'`)
        })
        httpServer.listen(port, () => {
            console.log(`server is listening on port ${port}`)
            resolve(wss)
        })
    })
}

function createClient(url: string): Promise<Connection> {
    return new Promise<Connection>((resolve, reject) => {
        const client = new (ws as any).default.client() as WebSocketClient
        client.once("connect", (conn: Connection) => resolve(conn) )
        client.once("connectFailed", (error: Error) => reject(error))
        client.connect(url)
    })
}

class ServerORB {
    constructor() {
        this.message = this.message.bind(this)
        this.error = this.error.bind(this)
        this.close = this.close.bind(this)
    }
    message(buffer: ArrayBuffer) {
        const decoder = new GIOPDecoder(buffer)
        decoder.scanGIOPHeader(MessageType.REQUEST)
        decoder.scanRequestHeader()
    }
    error(error: Error) {
        console.log(`ORB: error ${error}`)
    }
    close(code: number, reason: string) {
        console.log(`ORB client closed. code ${code}, reason '${reason}'`)
    }
}

describe("multiplexer/demultiplexer", function () {
    it.only("", async function () {
        const server = await createServer(8080)

        // const client = new WebSocketClient()
        // client.connect('ws://localhost:8080')

        const client = await createClient('ws://localhost:8080/')
        console.log("client: open")

        client.on("message", (m: Message) => {
            console.log("client: message")
            switch(m.type) {
                case "binary":
                    const b = m.binaryData
                    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
                    // orb.message(ab)
                    break
                case "utf8":
                    console.log(m.utf8Data)
                    break
            }
        })

        const encoder0 = new GIOPEncoder()
        encoder0.encodeRequest("DUMMY", "callA", 1, MessageType.REPLY)
        encoder0.setGIOPHeader(MessageType.REQUEST)
        client.sendBytes(Buffer.from(encoder0.bytes.subarray(0, encoder0.offset)))

        const encoder1 = new GIOPEncoder()
        encoder1.encodeRequest("DUMMY", "callB", 2, MessageType.REPLY)
        encoder1.setGIOPHeader(MessageType.REQUEST)
        client.sendBytes(Buffer.from(encoder1.bytes.subarray(0, encoder1.offset)))

        // client.sendUTF("Hello again!")
        // client.close(CloseCode.CLOSE_CUSTOM + 711, "Cologne")
        // server.close()
        // server.closeAllConnections()
/*
        const serverORB = new ORB()
        serverORB.name = "serverORB"
        //serverORB.debug = 1
        serverORB.bind("Server", new Server_impl(serverORB))     

        const clientORB = new ORB()
        clientORB.name = "clientORB"
        //clientORB.debug = 1
        clientORB.registerStubClass(stub.Server)
        
        mockConnection(serverORB, clientORB).name = "acceptedORB"

        const server = stub.Server.narrow(await clientORB.resolve("Server"))

        // the idea is that the server has delays and we'll get the reponses in a different order
        // eg. C, A, B
        client.callA().then ...
        client.callB().then ...
        client.callC().then ...
*/

    })

})