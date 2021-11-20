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

import forEach from "mocha-each"
import { expect, use } from "chai"
import * as chaiAsPromised from "chai-as-promised"
use(chaiAsPromised.default)

import { AuthenticationStatus, EstablishContext, GSSUPInitialContextToken, NO_PERMISSION, ORB } from "corba.js"
import { TlsConnection, TlsProtocol } from "corba.js/net/tls"
import { Connection } from "corba.js/orb/connection"
import { readFileSync } from "fs"

import * as skel from "../generated/access_skel"
import * as stub from "../generated/access_stub"

describe("net", async function () {
    describe("tls", function () {
        forEach([
            ["only", 0],
            ["with valid CSIv2 GSSUP client authentication", 1],
            ["with CSIv2 GSSUP client authentication and unknown user", 2]
        ]).
            it("TLS %s", async function (name, id) {
                const validCredentials = new GSSUPInitialContextToken("bob", "No RISC No Fun", "")
                const wrongUser = new GSSUPInitialContextToken("mallory", "No RISC No Fun", "")
                let sendInitialContext: GSSUPInitialContextToken | undefined
                let rcvdInitialContext: GSSUPInitialContextToken | undefined

                const serverORB = new ORB()

                const serverImpl = new Server_impl(serverORB)
                serverORB.bind("Server", serverImpl)
                if (id !== 0) {
                    serverORB.setIncomingAuthenticator((connection: Connection, context: EstablishContext) => {
                        if (context.clientAuthenticationToken instanceof GSSUPInitialContextToken) {
                            if (context.clientAuthenticationToken.user === "mallory") {
                                return AuthenticationStatus.ERROR_NOUSER
                            }
                            if (context.clientAuthenticationToken.user === "bob" &&
                                context.clientAuthenticationToken.password === "No RISC No Fun" &&
                                context.clientAuthenticationToken.target_name === "") {
                                rcvdInitialContext = context.clientAuthenticationToken
                                return AuthenticationStatus.SUCCESS
                            }
                        }
                        return AuthenticationStatus.ERROR_UNSPECIFIED
                    })
                }

                const tls = new TlsProtocol({
                    passphrase: "alice",
                    key: readFileSync('test/x509/intermediate/private/server.key.pem'),
                    cert: readFileSync('test/x509/intermediate/certs/server.cert.pem'),
                    ca: [
                        readFileSync('test/x509/intermediate/certs/ca-chain.cert.pem'),
                    ]
                })
                serverORB.addProtocol(tls)
                await tls.listen(serverORB, "localhost", 2809)

                const clientORB = new ORB()
                clientORB.registerStubClass(stub.Server)
                clientORB.addProtocol(new TlsProtocol())
                if (id !== 0) {
                    clientORB.setOutgoingAuthenticator((connection: Connection) => {
                        if (connection instanceof TlsConnection) {
                            if (connection.peerCertificate.subject.CN === "localhost") {
                                switch (id) {
                                    case 1:
                                        sendInitialContext = validCredentials
                                        break
                                    case 2:
                                        sendInitialContext = wrongUser
                                        break
                                }
                                return sendInitialContext
                            }
                            return undefined
                        }
                    })
                }

                const server = stub.Server.narrow(await clientORB.stringToObject("corbaname::localhost:2809#Server"))

                switch (id) {
                    case 0:
                        await server.call()
                        expect(serverImpl.wasCalled).to.be.true
                        break
                    case 1:
                        await server.call()
                        expect(sendInitialContext).to.deep.equal(validCredentials)
                        expect(rcvdInitialContext).to.deep.equal(validCredentials)
                        break
                    case 2:
                        await expect(server.call()).to.be.rejectedWith(NO_PERMISSION)
                        break
                }

                await serverORB.shutdown()
            })
    })
})

class Server_impl extends skel.Server {
    wasCalled: boolean

    constructor(orb: ORB) {
        super(orb)
        this.wasCalled = false
    }

    async call() {
        this.wasCalled = true
        return 0
    }

    async set(listener: skel.Listener): Promise<number> {
        throw Error()
    }

    async get(name: string): Promise<skel.Listener> {
        throw Error()
    }
}

