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
import { filenamePrefix, filename, hasNative, hasValueType, writeIndent, classAttributes, typeIDLtoTS, FileType, defaultValueIDLtoTS } from "./util"

let initCalls = ""
export function writeTSValue(specification: Node): void {
    initCalls = ""

    let out = fs.createWriteStream(filenamePrefix + "_value.ts")
    out.write(`// This file is generated by the corba.js IDL compiler from '${filename}'.\n\n`)
    out.write(`import { ORB, GIOPDecoder } from 'corba.js'\n`)
    if (!hasValueType(specification)) {
        out.write("// no valuetype's defined in IDL")
        return
    }
    // out.write("import * as _interface from \"./" + filenameLocal + "\"\n\n")
    if (hasNative(specification)) {
        out.write("declare global {\n")
        for (let definition of specification.child) {
            if (definition!.type === Type.TKN_NATIVE) {
                let native = definition!
                let nativeName = native.text!
                if (nativeName.length <= 4 ||
                    nativeName.substring(nativeName.length - 4) !== "_ptr") {
                    out.write(`    interface ${nativeName} {}\n`)
                }
            }
        }
        out.write("}\n\n")
    }

    writeTSValueDefinitions(out, specification)

    out.write("\nlet initialized = false\n")
    out.write("export function _init() {\n")
    out.write("    if (initialized)\n")
    out.write("        return\n")
    out.write("    initialized = true\n")
    out.write(initCalls)
    out.write("}\n")
    out.write("_init()\n")
}

function writeTSValueDefinitions(out: fs.WriteStream, specification: Node, prefix = "", indent = 0): void {
    for (let definition of specification.child) {
        switch (definition!.type) {
            case Type.TKN_MODULE: {
                writeIndent(out, indent)
                out.write(`export namespace ${definition!.text} {\n\n`)
                writeTSValueDefinitions(out, definition!, prefix + definition!.text + ".", indent + 1)
                writeIndent(out, indent)
                out.write(`} // namespace ${definition!.text}\n\n`)
            } break
            case Type.TKN_NATIVE: {
            } break
            case Type.TKN_VALUETYPE: {
                let value_dcl = definition!
                let value_header = value_dcl.child[0]!
                let custom = value_header.child[0]
                let identifier = value_header.child[1]!.text
                let inheritance_spec = value_header.child[2]

                writeIndent(out, indent)
                out.write(`export interface ${identifier}`)

                let attributes = new Array<string>()
                classAttributes.set(prefix + identifier, attributes)

                if (inheritance_spec !== undefined) {
                    if (inheritance_spec.child.length > 2) // FIXME: for interfaces we can
                        throw Error("multiple inheritance is not supported for TypeScript")
                    out.write(` extends ${inheritance_spec.child[1]!.text}`)

                    let superAttributes = classAttributes.get(prefix + inheritance_spec.child[1]!.text!)
                    if (superAttributes === undefined) {
                        superAttributes = classAttributes.get(inheritance_spec.child[1]!.text!)
                    }
                    if (superAttributes === undefined) {
                        throw Error("failed to find attributes for super class")
                    }
                    for (let attribute of superAttributes) {
                        attributes.push(attribute)
                    }
                }
                out.write(" {\n")

                for (let i = 1; i < value_dcl.child.length; ++i) {
                    let value_element = value_dcl.child[i]!
                    if (value_element.type === Type.SYN_STATE_MEMBER) {
                        let state_member = value_element
                        let attribute = state_member.child[0]!
                        let type = state_member.child[1]!
                        let declarators = state_member.child[2]!
                        for (let declarator of declarators.child) {
                            writeIndent(out, indent + 1)
                            out.write(declarator!.text + ": " + typeIDLtoTS(type, FileType.VALUETYPE) + "\n")
                            attributes.push(declarator!.text!)
                        }
                    }
                }
                writeIndent(out, indent)
                out.write("}\n\n")

                writeIndent(out, indent)
                out.write(`export function init${identifier}(object: ${identifier}, init?: Partial<${identifier}> | GIOPDecoder) {\n`)
                ++indent
                writeIndent(out, indent)
                out.write(`if (init instanceof GIOPDecoder) {\n`)
                writeTSValueInitFromGIOP(value_dcl, out, indent + 1)
                writeIndent(out, indent)
                out.write(`} else {\n`)
                writeTSValueInitFromJSON(value_dcl, out, indent + 1)
                writeIndent(out, indent)
                out.write("}\n")
                --indent
                writeIndent(out, indent)
                out.write("}\n")

                initCalls += `    ORB.valueTypeByName.set("${prefix}${identifier}", {attributes:[`
                let comma = false
                for (let attribute of attributes) {
                    if (comma) {
                        initCalls += ", "
                    } else {
                        comma = true
                    }
                    initCalls += `"${attribute}"`
                }
                initCalls += "]})\n"
            } break
        }
    }
}

export function typeIDLtoGIOP(prefix: string, type: Node | undefined): string {
    if (type === undefined)
        throw Error("internal error: parser delivered no type information")
    switch (type!.type) {
        case Type.TKN_IDENTIFIER:
            let identifierType = type.child[type.child.length - 1]!
            let relativeName = ""
            for (let x of type.child) {
                relativeName = `${relativeName}.${x!.text!}`
            }
            relativeName = relativeName.substring(1)

            let absolutePrefix = ""
            for (let x: Node | undefined = type.child[0]?.typeParent; x; x = x.typeParent) {
                absolutePrefix = `.${x!.text}${absolutePrefix}`
            }

            if (type.child.length > 0 &&
                type.child[0]!.type === Type.TKN_NATIVE &&
                type.text!.length > 4 &&
                type.text!.substring(type.text!.length - 4) === "_ptr") {
                // FIXME: enforce type check instead of using just 'as'
                return `${prefix}object() as ${absolutePrefix.substring(1)}`
            }

            // let name: string
            // switch (identifierType.type) {
            //     case Type.TKN_VALUETYPE:
            //         name = relativeName
            //         break
            //     case Type.SYN_INTERFACE:
            //         name = relativeName
            //         break
            //     case Type.TKN_NATIVE:
            //         name = relativeName
            //         break
            //     default:
            //         throw Error(`Internal Error in typeIDLtoTS(): not implemented identifierType ${identifierType.toString()}`)
            // }

            return `${prefix}object() as ${relativeName}` // FIXME: enforce type check instead of using just 'as'

        //     return name

        // } break
        case Type.TKN_VOID:
            return `${prefix}void()`
        case Type.TKN_BOOLEAN:
            return `${prefix}boolean()`
        case Type.TKN_STRING:
            return `${prefix}string()`
        case Type.TKN_SHORT:
            return `${prefix}short()`
        case Type.TKN_LONG:
            return `${prefix}long()`
        case Type.SYN_LONGLONG:
            return `${prefix}longlong()`
        case Type.SYN_UNSIGNED_SHORT:
            return `${prefix}ushort()`
        case Type.SYN_UNSIGNED_LONG:
            return `${prefix}ulong()`
        case Type.SYN_UNSIGNED_LONGLONG:
            return `${prefix}ulonglong()`
        case Type.TKN_FLOAT:
            return `${prefix}float()`
        case Type.TKN_DOUBLE:
            return `${prefix}double()`
        case Type.SYN_LONG_DOUBLE:
            return `${prefix}longdouble()`
        case Type.TKN_SEQUENCE: {
            // FIXME: enforce type check
            return `(function(){ const l = init.ulong(); const a = new Array(l); for (let i=0 ; i<l; ++i) a[i] = ${typeIDLtoGIOP(prefix, type!.child[0])}; return a })()`
        }
        default:
            throw Error(`no mapping from IDL type to TS type for ${type.toString()}`)
    }
}

function writeTSValueInitFromGIOP(value_dcl: Node, out: fs.WriteStream, indent: number) {
    for (let i = 1; i < value_dcl.child.length; ++i) {
        let value_element = value_dcl.child[i]!
        if (value_element.type === Type.SYN_STATE_MEMBER) {
            let state_member = value_element
            let attribute = state_member.child[0]!
            let type = state_member.child[1]!
            let declarators = state_member.child[2]!
            for (let declarator of declarators.child) {
                let decl_identifier = declarator!.text
                writeIndent(out, indent + 1)
                out.write(`object.${decl_identifier} = ${typeIDLtoGIOP("init.", type)}\n`)
                
                // switch (type.type) {
                //     case Type.TKN_IDENTIFIER:
                //         // custom types
                //         // FIXME: doesn't work for Array<Layer>()
                //         // FIXME: in this case workflow doesn't require a copy, maybe just copy when the prototypes are wrong or a deep copy flag had been set?
                //         //                                out.write(") ? new "+type.text+"() : new "+type.text+"(init."+decl_identifier+")\n")
                //         // console.log(`writeTSValueDefinitions`, type, typeIDLtoTS(type))
                //         if (type.child[0]?.type == Type.TKN_NATIVE &&
                //             type.text!.length > 4 &&
                //             type.text!.substring(type.text!.length - 4) === "_ptr") {
                //             let name = typeIDLtoTS(type)
                //             out.write(`if (init !== undefined && init.${decl_identifier} !== undefined) object.${decl_identifier} = new (ORB.lookupValueType("${name}"))(init.${decl_identifier})\n`)
                //         } else {
                //             out.write(`object.${decl_identifier} = ${typeIDLtoTS(type)}.narrow(init.readObject())\n`) // enforce type check
                //         }
                //         break
                //     case Type.TKN_SEQUENCE:
                //         // make the loop code a utility function
                //         out.write(`const length = init.ulong()\n`)
                //         writeIndent(out, indent + 1)
                //         out.write(`for(let i<length; ++i) {}\n`)
                //         break
                //     default:
                //         // doesn't work for 'unsigned long' yet
                //         out.write(`object.${decl_identifier} = init.${type.toString()}()\n`)
                // }
            }
        }
    }
}

function writeTSValueInitFromJSON(value_dcl: Node, out: fs.WriteStream, indent: number) {
    for (let i = 1; i < value_dcl.child.length; ++i) {
        let value_element = value_dcl.child[i]!
        if (value_element.type === Type.SYN_STATE_MEMBER) {
            let state_member = value_element
            let attribute = state_member.child[0]!
            let type = state_member.child[1]!
            let declarators = state_member.child[2]!
            for (let declarator of declarators.child) {
                let decl_identifier = declarator!.text
                writeIndent(out, indent + 1)
                if (type.type === Type.TKN_IDENTIFIER) {
                    // FIXME: doesn't work for Array<Layer>()
                    // FIXME: in this case workflow doesn't require a copy, maybe just copy when the prototypes are wrong or a deep copy flag had been set?
                    //                                out.write(") ? new "+type.text+"() : new "+type.text+"(init."+decl_identifier+")\n")
                    // console.log(`writeTSValueDefinitions`, type, typeIDLtoTS(type))
                    if (type.child[0]?.type == Type.TKN_NATIVE &&
                        type.text!.length > 4 &&
                        type.text!.substring(type.text!.length - 4) === "_ptr") {
                        let name = typeIDLtoTS(type)
                        out.write(`if (init !== undefined && init.${decl_identifier} !== undefined) object.${decl_identifier} = new (ORB.lookupValueType("${name}"))(init.${decl_identifier})\n`)
                    } else {
                        let name = typeIDLtoTS(type).substring(10) // hack: strip "valuetype."
                        out.write(`object.${decl_identifier} = new (ORB.lookupValueType("${name}"))(init === undefined ? undefined : init.${decl_identifier})\n`)
                    }
                } else {
                    out.write(`object.${decl_identifier} = (init === undefined || init.${decl_identifier} === undefined) ? `)
                    out.write(defaultValueIDLtoTS(type, FileType.VALUETYPE))
                    out.write(` : init.${decl_identifier}\n`)
                }
            }
        }
    }
}

