/*
 *  glue.js Object Request Broker (ORB) and Interface Definition Language (IDL) compiler
 *  Copyright (C) 2018 Mark-André Hopf <mhopf@mark13.org>
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

import * as fs from "fs"
import { Type, Node } from "./idl-node"
import { Lexer } from "./idl-lexer"
import { specification } from "./idl-parser"

type GeneratorDescription = Map<Type, Function>

let generatorTSStub = new Map<Type, Function>([
    [ Type.SYN_SPECIFICATION, function(this: Generator) {
        for(let definition of this.node.child) {
            this.generate(definition!)
        }
    }],
    [ Type.SYN_INTERFACE, function(this: Generator) {
        let identifier = this.node.child[0]!.child[1]!.text
        this.out.write("class "+identifier+" extends Stub {\n")
        this.out.write("    constructor(orb: ORB) {\n")
        this.out.write("        super(orb)\n")
        this.out.write("        this.orb.create(this, \""+identifier+"\")\n")
        this.out.write("    }\n")
        
        for(let op_decl of this.node.child[1]!.child) {
            let attribute = op_decl!.child[0]
            let type = op_decl!.child[1]
            
            let oneway = false
            if (attribute !== undefined && attribute.type === Type.TKN_ONEWAY)
                oneway = true

            if (oneway && type!.type !== Type.TKN_VOID)
                throw Error("glue.js currently requires every oneway function to return void")
            
            let identifier = op_decl!.child[2]!.text
            let parameter_decls = op_decl!.child[3]!.child
            this.out.write("\n")
            this.out.write("    "+identifier+"(")
            let comma = false
            for(let parameter_dcl of parameter_decls) {
                let attribute = parameter_dcl!.child[0]!.type
                let type = parameter_dcl!.child[1]
                let identifier = parameter_dcl!.child[2]!.text
                if (attribute !== Type.TKN_IN) {
                    throw Error("only 'in' is supported for parameters")
                }
                if (!comma) {
                    comma = true
                } else {
                    this.out.write(", ")
                }
                this.out.write(identifier)
                this.out.write(": ")
                switch(type!.type) {
                    case Type.TKN_STRING:
                        this.out.write("string")
                        break
                    case Type.TKN_SHORT:
                    case Type.TKN_LONG:
                    case Type.SYN_LONGLONG:
                    case Type.SYN_UNSIGNED_SHORT:
                    case Type.SYN_UNSIGNED_LONG:
                    case Type.SYN_UNSIGNED_LONGLONG:
                        this.out.write("number")
                        break
                    default:
                        throw Error("no parameter mapping for type "+type!.toString())
                }
            }
            this.out.write("): ")
            switch(type!.type) {
                case Type.TKN_VOID:
                    this.out.write("void")
                    break
                default:
                    throw Error("no result mapping for type "+type!.toString())
            }
            this.out.write(" {\n")
            this.out.write("        this.orb.call(this.id, \""+identifier+"\", [")
            comma = false
            for(let parameter_dcl of parameter_decls) {
                let identifier = parameter_dcl!.child[2]!.text
                if (!comma) {
                    comma = true
                } else {
                    this.out.write(", ")
                }
                this.out.write(identifier)
            }
            this.out.write("])\n")
            this.out.write("    }\n")
        }
        this.out.write("}\n")
    }]
])

class Generator {
    description: GeneratorDescription
    out: fs.WriteStream
    node: Node

    constructor(description: GeneratorDescription, out: fs.WriteStream) {
        this.description = description
        this.out = out
        this.node = new Node(Type.NONE) // dummy for typescript
    }
    
    generate(node: Node): void {
        let f = this.description.get(node.type)
        if (f === undefined) {
            throw Error("Generator: no way to handle node "+node.toString())
        }
        this.node = node
        f.call(this)
    }
}

let file = fs.readFileSync("test.idl", "utf8")
let lexer = new Lexer(file)
let tree
try {
    tree = specification(lexer)
}
catch(error) {
    console.log(error.message+" at line "+lexer.line+", column "+lexer.column)
    console.log(error.stack)
    process.exit(1)
}
if (tree) {
    let out = fs.createWriteStream("ServerStub.ts")
    let generator = new Generator(generatorTSStub, out)
    generator.generate(tree)
}
