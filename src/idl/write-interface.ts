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
import { filenamePrefix, filename, filenameLocal, hasValueType, typeIDLtoTS, FileType, writeIndent } from "./util"

export function writeTSInterface(specification: Node): void {
    let out = fs.createWriteStream(filenamePrefix + ".ts")
    out.write("// This file is generated by the corba.js IDL compiler from '" + filename + "'.\n\n")

    if (hasValueType(specification)) {
        out.write("import * as valuetype from \"./" + filenameLocal + "_valuetype\"\n\n")
    }
    writeTSInterfaceDefinitions(out, specification)
}

function writeTSInterfaceDefinitions(out: fs.WriteStream, specification: Node, prefix = "", indent = 0): void {
    for (let definition of specification.child) {
        switch (definition!.type) {
            case Type.TKN_MODULE:
                out.write("export namespace " + definition!.text + " {\n\n")
                writeTSInterfaceDefinitions(out, definition!, prefix + definition!.text + ".", indent + 1)
                out.write("} // namespace " + definition!.text + "\n\n")
                break

            case Type.SYN_INTERFACE: {
                let interface_dcl = definition!
                let identifier = interface_dcl.child[0]!.child[1]!.text
                let interface_body = interface_dcl.child[1]!

                out.write(`export interface ${identifier} {\n`)
                for (let _export of interface_body.child) {
                    switch (_export!.type) {
                        case Type.SYN_OPERATION_DECLARATION: {
                            let op_dcl = _export!
                            let attribute = op_dcl.child[0]
                            let type = op_dcl.child[1]!

                            let oneway = false
                            if (attribute !== undefined && attribute.type === Type.TKN_ONEWAY)
                                oneway = true

                            if (oneway && type.type !== Type.TKN_VOID)
                                throw Error("oneway methods must return void")
                            // if (!oneway && type.type === Type.TKN_VOID)
                            //     console.log("WARNING: corba.js currently requires operations returning void to be oneway")

                            let identifier = op_dcl.child[2]!.text
                            let parameter_decls = op_dcl.child[3]!.child
                            out.write("    ")
                            out.write(identifier + "(")
                            let comma = false
                            for (let parameter_dcl of parameter_decls) {
                                let attribute = parameter_dcl!.child[0]!.type
                                let type = parameter_dcl!.child[1]
                                let identifier = parameter_dcl!.child[2]!.text
                                if (attribute !== Type.TKN_IN) {
                                    throw Error("corba.js currently only supports 'in' parameters")
                                }
                                if (!comma) {
                                    comma = true
                                } else {
                                    out.write(", ")
                                }
                                out.write(identifier + ": " + typeIDLtoTS(type, FileType.INTERFACE))
                            }
                            if (oneway) {
                                out.write(`): ${typeIDLtoTS(type, FileType.INTERFACE)}\n`)
                            } else {
                                out.write(`): Promise<${typeIDLtoTS(type, FileType.INTERFACE)}>\n`)
                            }
                        } break
                        case Type.TKN_ATTRIBUTE: {
                        } break
                        default:
                            throw Error("fuck")
                    }
                }
                out.write("}\n\n")
            } break

            case Type.TKN_STRUCT: {
                const identifier = definition!.text!
                writeIndent(out, indent)
                out.write(`export interface ${identifier} {\n`)
                const member_list = definition!.child!
                for (const member of member_list) {
                    const type_spec = member!.child[0]!
                    const declarators = member!.child[1]!
                    for (const declarator of declarators.child) {
                        writeIndent(out, indent + 1)
                        out.write(`${declarator!.text}: ${typeIDLtoTS(type_spec, FileType.INTERFACE)}\n`)
                    }

                }
                writeIndent(out, indent)
                out.write("}\n\n")
            } break
        }
    }
}
