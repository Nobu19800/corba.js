/*
 *  corba.js Object Request Broker (ORB) and Interface Definition Language (IDL) compiler
 *  Copyright (C) 2018, 2020 Mark-André Hopf <mhopf@mark13.org>
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

import * as fs from "fs"
import { Type, Node } from "./idl-node"
import { filenamePrefix, filename, filenameLocal, hasValueType, typeIDLtoTS, typeIDLtoGIOP, FileType } from "./util"

export function writeTSStub(specification: Node): void {
    let out = fs.createWriteStream(filenamePrefix + "_stub.ts")
    out.write("// This file is generated by the corba.js IDL compiler from '" + filename + "'.\n\n")
    out.write("import { ORB, Stub } from 'corba.js'\n")
    if (hasValueType(specification)) {
        out.write("import * as valuetype from \"./" + filenameLocal + "_valuetype\"\n")
    }
    out.write("import * as _interface from \"./" + filenameLocal + "\"\n\n")

    writeTSStubDefinitions(out, specification)
}
function writeTSStubDefinitions(out: fs.WriteStream, specification: Node, prefix = "", indent = 0): void {
    for (let definition of specification.child) {
        switch (definition!.type) {
            case Type.TKN_MODULE:
                out.write("export namespace " + definition!.text + " {\n\n")
                writeTSStubDefinitions(out, definition!, prefix + definition!.text + ".", indent + 1)
                out.write("} // namespace " + definition!.text + "\n\n")
                break

            case Type.SYN_INTERFACE: {
                let interface_dcl = definition!
                let identifier = interface_dcl.child[0]!.child[1]!.text
                let interface_body = interface_dcl.child[1]!

                out.write(`export class ${identifier} extends Stub implements _interface.${prefix}${identifier} {\n`)

                out.write(`    static _idlClassName(): string {\n`)
                out.write(`        return "${prefix}${identifier}"\n`)
                out.write(`    }\n\n`)

                out.write(`    static narrow(object: any): ${prefix}${identifier} {\n`)
                out.write(`        if (object instanceof ${prefix}${identifier})\n`)
                out.write(`            return object as ${prefix}${identifier}\n`)
                out.write(`        throw Error("${prefix}${identifier}.narrow() failed")\n`)
                out.write(`    }\n\n`)

                for (let _export of interface_body.child) {
                    switch (_export!.type) {
                        case Type.SYN_OPERATION_DECLARATION: {
                            let op_dcl = _export!
                            let attribute = op_dcl.child[0]
                            let returnType = op_dcl.child[1]!

                            let oneway = false
                            if (attribute !== undefined && attribute.type === Type.TKN_ONEWAY)
                                oneway = true
                            if (oneway && returnType.type !== Type.TKN_VOID)
                                console.log("WARNING: corba.js currently requires every oneway function to return void")

                            let identifier = op_dcl.child[2]!.text
                            let parameter_decls = op_dcl.child[3]!.child
                            out.write("    async ")
                            out.write(identifier + "(")
                            let comma = false
                            for (let parameter_dcl of parameter_decls) {
                                let attribute = parameter_dcl!.child[0]!.type
                                let type = parameter_dcl!.child[1]
                                let identifier = parameter_dcl!.child[2]!.text
                                // TODO: move this check into the parser or attach file, row & col to the parse tree nodes
                                if (attribute !== Type.TKN_IN) {
                                    throw Error("corba.js currently only supports 'in' parameters")
                                }
                                if (!comma) {
                                    comma = true
                                } else {
                                    out.write(", ")
                                }
                                out.write(`${identifier}: ${typeIDLtoTS(type, FileType.STUB)}`)
                            }
                            // if (oneway) {

                            // } else {
                                out.write(`): Promise<${typeIDLtoTS(returnType, FileType.STUB)}> {\n`)
                            // }
                            out.write("        ")
                            if (returnType.type !== Type.TKN_VOID)
                                out.write("return ")
                            if (!oneway)
                                out.write("await ")
 
                            // out.write(`await this.orb.call(this, ${oneway}, "${identifier}", [`)
                            // comma = false
                            // for (let parameter_dcl of parameter_decls) {
                            //     let identifier = parameter_dcl!.child[2]!.text
                            //     if (!comma) {
                            //         comma = true
                            //     } else {
                            //         out.write(", ")
                            //     }
                            //     out.write(identifier)
                            // }
                            // out.write("])\n")

                            // out.write("/*\n")
                            // out.write("        ")
                            if (returnType.type === Type.TKN_VOID) {
                                out.write(`this.orb.onewayCall(\`\${this.id}\`, "${identifier}", `)
                            } else {
                                out.write(`this.orb.twowayCall(\`\${this.id}\`, "${identifier}", `)
                            }

                            // encode
                            out.write(`(encoder) => {\n`)
                            for (let parameter_dcl of parameter_decls) {
                                let type = parameter_dcl!.child[1]!
                                let identifier = parameter_dcl!.child[2]!.text
                                out.write(`            encoder.`)
                                switch(type.type) {
                                    case Type.TKN_SEQUENCE:
                                        out.write(`sequence(${identifier}, (item) => encoder.${typeIDLtoGIOP(type.child[0])}(item))\n`)
                                        break
                                    default:
                                        out.write(`${typeIDLtoGIOP(type)}(${identifier})\n`)
                                }
                            }
                           
                            if (returnType.type !== Type.TKN_VOID) {
                                out.write(`        },\n`)
                                out.write(`        `)
                                out.write(`(decoder) => decoder.${typeIDLtoGIOP(returnType)}() )\n`)
                            } else {
                                out.write(`        })\n`)
                            }
                            // out.write("*/\n")

                            out.write("    }\n")
                        } break
                        case Type.TKN_ATTRIBUTE: {
                        } break
                        default:
                            throw Error("fuck")
                    }
                }
                out.write("}\n\n")
            } break
        }
    }
}
