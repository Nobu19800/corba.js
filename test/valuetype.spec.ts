/*
 *  corba.js Object Request Broker (ORB) and Interface Definition Language (IDL) compiler
 *  Copyright (C) 2018, 2020 Mark-André Hopf <mhopf@mark13.org>
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

 import { expect } from "chai"

import { ORB } from "../src/orb/orb-nodejs"
import * as value from "./valuetype_value"
import * as valueimpl from "./valuetype_valueimpl"
import * as valuetype from "./valuetype_valuetype"
import * as skel from "./valuetype_skel"
import * as stub from "./valuetype_stub"
import { mockConnection } from "./util"

class Point implements value.testVT.Point
{
    x: number
    y: number
    
    constructor(x?: number, y?: number) {
        this.x = x ? x : 0
        this.y = y ? y : 0
    }
    toString(): string {
        return "Point: x="+this.x+", y="+this.y
    }
}

class Size implements value.testVT.Size {
    width: number
    height: number
    constructor(width?: number, height?: number) {
        this.width = width ? width : 0
        this.height = height ? height : 0
    }
    toString(): string {
        return "Size: width="+this.width+", height="+this.height
    }
}

class Matrix extends valueimpl.testVT.Matrix {
    constructor(matrix?: Partial<Matrix>) {
        super(matrix)
        if (matrix === undefined) {
            this.a = 1.0
            this.d = 1.0
        }
    }
}

abstract class Figure extends valueimpl.testVT.Figure {
    id: number = 0
    matrix: Matrix | undefined
    
    constructor(init?: Partial<Figure>) {
        super(init)
    }

    abstract toString(): string
}

class FigureModel {
    data: Array<Figure>
    constructor() {
        this.data = new Array<Figure>()
    }
}

class Rectangle extends Figure implements valuetype.testVT.Rectangle {
    origin: Point
    size: Size
    constructor(x?: number, y?: number, width?: number, height?: number) {
        super({})
        this.origin = new Point(x, y)
        this.size   = new Size(width, height)
    }
    getHandlePosition(i: number): Point | undefined {
        return undefined
    }
    toString(): string {
        return "Rectangle: ("+this.origin.x+","+this.origin.y+","+this.size.width+","+this.size.height+")"
    }
}

class Server_impl extends skel.testVT.Server {
    static instance?: Server_impl
    static methodAWasCalled = false
    static methodBWasCalled = false

    client?: stub.testVT.Client

    constructor(orb: ORB) {
        super(orb)
//console.log("Server_impl.constructor()")
        Server_impl.instance = this
    }
    
    async setClient(client: stub.testVT.Client) {
        this.client = client
    }
}

class Client_impl extends skel.testVT.Client {
    static instance?: Client_impl
    static methodCWasCalled = false
    static figureModelReceivedFromServer?: FigureModel

    constructor(orb: ORB) {
        super(orb)
//console.log("Client_impl.constructor()")
        Client_impl.instance = this
    }
    
    async setFigureModel(figuremodel: FigureModel) {
//console.log("Client_impl.setFigureModel()")
        Client_impl.figureModelReceivedFromServer = figuremodel
    }
}

describe("corba.js", function() {
    it("valuetype", async function() {

        // ORB.valueTypeByName.clear()
        // ORB.valueTypeByPrototype.clear()

        let serverORB = new ORB()
        serverORB.name = "serverORB"
//serverORB.debug = 1
        let clientORB = new ORB()
        clientORB.name = "clientORB"
//clientORB.debug = 1

        serverORB.bind("Server", new Server_impl(serverORB))
        
        serverORB.registerStubClass(stub.testVT.Client)
        clientORB.registerStubClass(stub.testVT.Server)
        
        // this collides with basics.spec.ts
        ORB.registerValueType("testVT.Point", Point)
        ORB.registerValueType("testVT.Size", Size)
        ORB.registerValueType("testVT.Matrix", Matrix)
        ORB.registerValueType("testVT.Figure", Figure)
        ORB.registerValueType("testVT.Rectangle", Rectangle)
        ORB.registerValueType("testVT.FigureModel", FigureModel)

        mockConnection(serverORB, clientORB).name = "acceptedORB"

        let server = stub.testVT.Server.narrow(await clientORB.resolve("Server"))
        await server.setClient(new Client_impl(clientORB))

        // server sends FigureModel to client
        expect(Client_impl.figureModelReceivedFromServer).to.equal(undefined)

        // figure with matrix === undefined
        let model = new FigureModel()
        let rect0 = new Rectangle(10, 20, 30, 40)
        expect(rect0.matrix).to.be.undefined
        rect0.id = 777
        model.data.push(rect0)

        // figure with matrix !== undefined
        let rect1 = new Rectangle(50, 60, 70, 80)
        rect1.id = 1911
        rect1.matrix = new Matrix({a:0, b:1, c:2, d:3, e:4, f:5})
        model.data.push(rect1)

        // send figure model through the network
        await Server_impl.instance!.client!.setFigureModel(model)
       
        // check that the figure model was received correctly
        expect(Client_impl.figureModelReceivedFromServer!.data.length).to.equal(2)
        expect(Client_impl.figureModelReceivedFromServer!.data[0]).to.be.an.instanceof(Rectangle)
        let rectangle0 = Client_impl.figureModelReceivedFromServer!.data[0] as Rectangle
        expect(rectangle0.toString()).to.equal("Rectangle: (10,20,30,40)")
        expect(rectangle0.id).to.equal(777)
        expect(rectangle0.matrix).to.be.undefined
        expect(rectangle0.origin).to.be.an.instanceof(Point)
        expect(rectangle0.origin.toString()).to.equal("Point: x=10, y=20")
        expect(rectangle0.size).to.be.an.instanceof(Size)
        expect(rectangle0.size.toString()).to.equal("Size: width=30, height=40")

        expect(Client_impl.figureModelReceivedFromServer!.data[1]).to.be.an.instanceof(Rectangle)
        let rectangle1 = Client_impl.figureModelReceivedFromServer!.data[1] as Rectangle
        expect(rectangle1.toString()).to.equal("Rectangle: (50,60,70,80)")
        expect(rectangle1.id).to.equal(1911)
        expect(rectangle1.matrix).to.deep.equal(new Matrix({a:0, b:1, c:2, d:3, e:4, f:5}))
        expect(rectangle1.origin).to.be.an.instanceof(Point)
        expect(rectangle1.origin.toString()).to.equal("Point: x=50, y=60")
        expect(rectangle1.size).to.be.an.instanceof(Size)
        expect(rectangle1.size.toString()).to.equal("Size: width=70, height=80")

        // one can call serialize/deserialize directly
        let str = '{"#T":"testVT.Rectangle","#V":{"id":1138,"origin":{"#T":"testVT.Point","#V":{"x":10,"y":20}},"size":{"#T":"testVT.Size","#V":{"width":30,"height":40}}}}'
        
        let r0 = clientORB.deserialize(str)
        let r1 = new Rectangle(10, 20, 30, 40)
        r1.id = 1138
        expect(r0).to.deep.equal(r1)

        let r2 = clientORB.serialize(r1)
        expect(r2).to.equal(str)

        // another try with matrix?
    })
})
