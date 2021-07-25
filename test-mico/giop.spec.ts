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

import { expect } from "chai"
import * as net from "net"
import * as fs from "fs"
import { IOR } from "../src/orb/ior"
import { GIOPEncoder, GIOPDecoder, MessageType } from "../src/orb/giop"

// demuxing requests'n replies: when we create a promise, register for the connection
// the promise with its resolve and reject callbacks and request id.
// once the required message has arrived, locate this information and act on it.
// design the api to work with node.js net.Socket and websockets.

describe("CDR/GIOP", () => {

    let ior!: IOR

    before( () => {
        const data = fs.readFileSync("IOR.txt").toString().trim()
        ior = new IOR(data)
    })

    it("do something binary", () => {
        const encoder = new GIOPEncoder()

        const pointOut = new Point(3.1415, 2.7182)
        encoder.encodeObject(pointOut)

        // hexdump(encoder.bytes, 0, encoder.offset)

        const decoder = new GIOPDecoder(encoder.buf)
        const pointIn = decode(decoder) as Point

        expect(pointIn.x).to.equal(3.1415)
        expect(pointIn.y).to.equal(2.7182)
    })

    it("get host, port and objectKey from IOR", () => {
        // Spec: CORBA 3.3, 7.6.2 Interoperable Object References: IORs
        const ior = new IOR("IOR:010000000f00000049444c3a5365727665723a312e30000002000000000000002f000000010100000e0000003139322e3136382e312e313035002823130000002f313130312f313632363838383434312f5f30000100000024000000010000000100000001000000140000000100000001000100000000000901010000000000")
        expect(ior.host).to.equal("192.168.1.105")
        expect(ior.port).to.equal(9000)
        expect(ior.objectKey).to.equal("/1101/1626888441/_0")
    })

    describe("MICO ORB interaction", () => {

        it("valuetype Point getPoint()", async () => {
            const client = new Socket()
            await client.connect(ior.host!, ior.port!)
            console.log("connected")

            const encoder = new GIOPEncoder()
            encoder.encodeRequest(ior.objectKey!, "getPoint")
            encoder.setGIOPHeader(MessageType.REQUEST)
            client.write(encoder.bytes.subarray(0, encoder.offset))
            console.log(`wrote ${encoder.offset} bytes`)
            hexdump(encoder.bytes, 0, encoder.offset)

            const data = await client.read()
            console.log("received")
            hexdump(data)

            const decoder = new GIOPDecoder(data.buffer)
            decoder.scanGIOPHeader(MessageType.REPLY)
            expect(decoder.offset).to.equal(0x0c)

            decoder.scanReplyHeader()
            expect(decoder.offset).to.equal(0x18)

            const pointOut = decode(decoder) as Point
            console.log(pointOut)
            console.log(`point out = ${pointOut.x}, ${pointOut.y}`)
            expect(pointOut.x).to.equal(3.1415)
            expect(pointOut.y).to.equal(2.7182)

            expect(data.byteLength).to.equal(decoder.offset)

            client.destroy()
        })

        // send 
        it("void setPoint(valuetype Point)", async () => {
            const client = new Socket()
            await client.connect(ior.host!, ior.port!)
            console.log("connected")

            const encoder = new GIOPEncoder()
            encoder.encodeRequest(ior.objectKey!, "setPoint")
            const point = new Point(3.1415, 2.7182)
            encoder.encodeObject(point)
            encoder.setGIOPHeader(MessageType.REQUEST)
            client.write(encoder.bytes.subarray(0, encoder.offset))

            console.log(`wrote ${encoder.offset} bytes`)
            hexdump(encoder.bytes, 0, encoder.offset)

            // reply
            //      47 49 4f 50 01 00 01 01 0c 00 00 00 00 00 00 00  GIOP............
            //      ^           ^     ^  ^  ^
            //      |           |     |  |  size
            //      |           |     |  type 0: request
            //      |           |     byte order
            //      |           version 1.0
            //      GIOP magic number
            //      02 00 00 00 00 00 00 00                          ........

            const data = await client.read()
            console.log("received")
            hexdump(data)

            const decoder = new GIOPDecoder(data.buffer)
            decoder.scanGIOPHeader(MessageType.REPLY)
            expect(decoder.offset).to.equal(0x0c)

            decoder.scanReplyHeader()
            expect(decoder.offset).to.equal(0x18)
            expect(data.byteLength).to.equal(decoder.offset) // void, no further payload

            client.destroy()
        })

        it("setBox(p0, p1): encode repositoryID 'IDL:Point:1.0' only once", async () => {
            const client = new Socket()
            await client.connect(ior.host!, ior.port!)
            console.log("connected")

            const encoder = new GIOPEncoder()
            encoder.encodeRequest(ior.objectKey!, "setBox")
            const p0 = new Point(1.1, 2.1)
            const p1 = new Point(2.1, 2.2)
            const box = new Box(p0, p1)
            encoder.encodeObject(box)
            
            encoder.setGIOPHeader(MessageType.REQUEST)
            client.write(encoder.bytes.subarray(0, encoder.offset))
            expect(encoder.offset).to.equal(0x00a0) // length when the point's repositoryID is reused

            hexdump(encoder.bytes, 0, encoder.offset)

            const data = await client.read()
            console.log("received")
            hexdump(data)

            const decoder = new GIOPDecoder(data.buffer)
            decoder.scanGIOPHeader(MessageType.REPLY)
            expect(decoder.offset).to.equal(0x0c)

            decoder.scanReplyHeader()
            expect(decoder.offset).to.equal(0x18)
            expect(data.byteLength).to.equal(decoder.offset) // void, no further payload

            client.destroy()
        })

        it("setBox(p0, p0): encode point twice", async () => {
            const client = new Socket()
            await client.connect(ior.host!, ior.port!)
            console.log("connected")

            const encoder = new GIOPEncoder()
            encoder.encodeRequest(ior.objectKey!, "setBox")
            const p0 = new Point(1.1, 2.1)
            const box = new Box(p0, p0)
            encoder.encodeObject(box)

            encoder.setGIOPHeader(MessageType.REQUEST)
            client.write(encoder.bytes.subarray(0, encoder.offset))
            expect(encoder.offset).to.equal(0x0090) // length when the point's repositoryID is reused

            hexdump(encoder.bytes, 0, encoder.offset)

            const data = await client.read()
            console.log("received")
            hexdump(data)

            const decoder = new GIOPDecoder(data.buffer)
            decoder.scanGIOPHeader(MessageType.REPLY)
            expect(decoder.offset).to.equal(0x0c)

            decoder.scanReplyHeader()
            expect(decoder.offset).to.equal(0x18)
            expect(data.byteLength).to.equal(decoder.offset) // void, no further payload

            client.destroy()
        })

        it("getBox(): duplicate repositoryId")
        it("getBox(): duplicate object")
    })
})

function hexdump(bytes: Uint8Array, addr = 0, length = bytes.byteLength) {
    while (addr < length) {
        let line = addr.toString(16).padStart(4, "0")
        for (let i = 0, j = addr; i < 16 && j < bytes.byteLength; ++i, ++j)
            line += " " + bytes[j].toString(16).padStart(2, "0")
        line = line.padEnd(4 + 16 * 3 + 1, " ")
        for (let i = 0, j = addr; i < 16 && j < bytes.byteLength; ++i, ++j) {
            const b = bytes[j]
            if (b >= 32 && b <= 127)
                line += String.fromCharCode(b)
            else
                line += "."
        }
        addr += 16
        console.log(line)
    }
}

class Socket {
    socket = new net.Socket()
    async connect(host: string, port: number) {
        return new Promise<void>((resolve, reject) => {
            this.socket.on("error", reject)
            this.socket.connect(port, host, resolve)
        })
    }
    write(data: string | Uint8Array) {
        this.socket.write(data)
    }
    async read() {
        return new Promise<Buffer>((resolve, reject) => {
            this.socket.on("error", reject)
            this.socket.on("data", resolve)
        })
    }
    destroy() {
        this.socket.destroy()
    }
}

export class Point {
    x: number
    y: number

    constructor(x?: number, y?: number) {
        this.x = x !== undefined ? x : 0
        this.y = y !== undefined ? y : 0
    }

    // something like these would later be generated by the IDL compiler
    // try to keep initializing objects from JSON as this also served nicely to serialize from/to databases.
    encode(encoder: GIOPEncoder) {
        encoder.repositoryId("Point")
        encoder.double(this.x)
        encoder.double(this.y)
    }

    decode(decoder: GIOPDecoder) {
        this.x = decoder.double()
        this.y = decoder.double()
    }
}

export class Box {
    p0: Point
    p1: Point

    constructor(p0?: Point, p1?: Point) {
        this.p0 = p0 !== undefined ? p0 : new Point()
        this.p1 = p1 !== undefined ? p1 : new Point()
    }

    // something like these would later be generated by the IDL compiler
    // try to keep initializing objects from JSON as this also served nicely to serialize from/to databases.
    encode(encoder: GIOPEncoder) {
        encoder.repositoryId("space/Box")
        encoder.encodeObject(this.p0)
        encoder.encodeObject(this.p1)
    }

    decode(decoder: GIOPDecoder) {
        this.p0 = decode(decoder)
        this.p1 = decode(decoder)
    }
}

function decode(decoder: GIOPDecoder): any {
    const code = decoder.dword()
    if (code === 0x7fffff02) {
        const len = decoder.dword()
        // if len === 0xffffffff we have an indirection
        let name = decoder.string(len)
        if (name.length < 8 || name.substr(0, 4) !== "IDL:" || name.substr(name.length - 4) !== ":1.0")
            throw Error(`Unsupported CORBA GIOP Repository ID '${name}'`)

        name = name.substr(4, name.length - 8)
        switch(name) {
            case "Point": {
                const obj = new Point()
                obj.decode(decoder)
                return obj
            }
            case "space/Box": {
                const obj = new Box()
                obj.decode(decoder)
                return obj
            }
        }
        throw Error(`Unregistered CORBA Value Type 'IDL:${name}:1.0'`)
    }
}