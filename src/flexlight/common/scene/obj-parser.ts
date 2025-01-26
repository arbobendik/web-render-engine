"use strict";

import { cross, normalize, Vector, vector_difference, vector_length, vector_scale } from "../lib/math";
import { Material } from "./material";

export class Parser {
    // Create object from .obj file
    static obj = async (path: string, materials: Map<string, Material>): Promise<Array<number>> => {

        const vertices: Array<Vector<3>> = [];
        const normals: Array<Vector<3>> = [];
        const uvs: Array<Vector<2>> = [];
        // final object variable 
        let triangles: Array<number> = [];
        // track current material
        let curMaterialName: string | undefined = undefined;
        // line interpreter
        let interpreteLine = (line: string) => {
            let words: Array<string> = [];
            // get array of words
            line.split(/[\t \s\s+]/g).forEach(word => { if (word.length) words.push(word) });
            // interpret current line
            switch (words[0]) {
                case "v":
                    // push vertex
                    vertices.push(new Vector(Number(words[1]!), Number(words[2]!), Number(words[3]!)));
                    break;
                case "vt":
                    // push uv
                    uvs.push(new Vector(Number(words[1]), Number(words[2])));
                    break;
                case "vn":
                    // push normal
                    normals.push(new Vector(Number(words[1]), Number(words[2]), Number(words[3])));
                    break;
                case "f":
                    // Discard first word
                    let dataString = words.slice(1, words.length).join(' ');
                    // "-" or space is sperating different vertices while "/" seperates different properties
                    // extract array indecies form string
                    let data = dataString.split(/[ ]/g).filter(vertex => vertex.length).map(vertex => vertex.split(/[/]/g).map(numStr => {
                        let num = Number(numStr);
                        if (num < 0) num = vertices.length + num + 1;
                        return num;
                    }));
                
                    // test if new part should be a triangle or plane
                    if (data.length === 4 && data[0] && data[1] && data[2] && data[3]) {
                        // Quad case
                        const quadVertices: Array<Vector<3> | undefined> = [vertices[data[3]![0]! - 1], vertices[data[2]![0]! - 1], vertices[data[1]![0]! - 1], vertices[data[0]![0]! - 1]];
                        const quadNormals: Array<Vector<3> | undefined> = [normals[data[3]![2]! - 1], normals[data[2]![2]! - 1], normals[data[1]![2]! - 1], normals[data[0]![2]! - 1]];
                        const quadUvs: Array<Vector<2> | undefined> = [uvs[data[3]![1]! - 1], uvs[data[2]![1]! - 1], uvs[data[1]![1]! - 1], uvs[data[0]![1]! - 1]];

                        if(!quadVertices[0] || !quadVertices[1] || !quadVertices[2] || !quadVertices[3]) {
                            console.warn("Invalid quad", quadVertices);
                            break;
                        }

                        // Triangle 3 2 1
                        triangles.push( ...quadVertices[3]!, 0, ...quadVertices[2]!, 0, ...quadVertices[1], 0);

                        // Test if normals are defined, otherwise compute from vertices for triangle 3 2 1
                        if (quadNormals[3] && quadNormals[2] && quadNormals[1]) {
                            triangles.push( ...normalize(quadNormals[3]!), 0, ...normalize(quadNormals[2]!), 0, ...normalize(quadNormals[1]), 0);
                        } else {
                            const normal = normalize(cross(vector_difference(quadVertices[1]!, quadVertices[3]!), vector_difference(quadVertices[1]!, quadVertices[2]!)));
                            triangles.push( ...normal, 0, ...normal, 0, ...normal, 0);
                        }

                        // Test if uvs are defined, otherwise use default uvs for triangle 3 2 1
                        if (quadUvs[3] && quadUvs[2] && quadUvs[1]) {
                            triangles.push( ...quadUvs[3]!, 0, 0, ...quadUvs[2]!, 0, 0, ...quadUvs[1], 0, 0);
                        } else {
                            triangles.push(0,0,0,0, 0,1,0,0, 1,1,0,0);
                        }

                        // Triangle 1 0 3
                        triangles.push( ...quadVertices[1]!, 0, ...quadVertices[0]!, 0, ...quadVertices[3], 0);

                        // Test if normals are defined, otherwise compute from vertices for triangle 1 0 3
                        if (quadNormals[1] && quadNormals[0] && quadNormals[3]){
                            triangles.push( ...normalize(quadNormals[1]!), 0, ...normalize(quadNormals[0]!), 0, ...normalize(quadNormals[3]), 0);
                        } else {
                            const normal = normalize(cross(vector_difference(quadVertices[3]!, quadVertices[1]!), vector_difference(quadVertices[3]!, quadVertices[0]!)));
                            triangles.push( ...normal, 0, ...normal, 0, ...normal, 0);
                        }

                        // Test if uvs are defined, otherwise use default uvs for triangle 1 0 3
                        if (quadUvs[1] && quadUvs[0] && quadUvs[3]) {
                            triangles.push( ...quadUvs[1]!, 0, 0, ...quadUvs[0]!, 0, 0, ...quadUvs[3], 0, 0);
                        } else {
                            triangles.push(1,1,0,0, 1,0,0,0, 0,0,0,0);
                        }
                    } else if (data.length === 3 && data[0] && data[1] && data[2]) {
                        // Triangle case
                        const triangleVertices: Array<Vector<3> | undefined> = [vertices[data[2]![0]! - 1], vertices[data[1]![0]! - 1], vertices[data[0]![0]! - 1]];
                        const triangleNormals: Array<Vector<3> | undefined> = [normals[data[2]![2]! - 1], normals[data[1]![2]! - 1], normals[data[0]![2]! - 1]];
                        const triangleUvs: Array<Vector<2> | undefined> = [uvs[data[2]![1]! - 1], uvs[data[1]![1]! - 1], uvs[data[0]![1]! - 1]];

                        if(!triangleVertices[0] || !triangleVertices[1] || !triangleVertices[2]) {
                            console.warn("Invalid triangle", triangleVertices);
                            break;
                        }

                        // Triangle 2 1 0
                        triangles.push( ...triangleVertices[2]!, 0, ...triangleVertices[1]!, 0, ...triangleVertices[0], 0);

                        // Test if normals are defined, otherwise compute from vertices for triangle 2 1 0
                        if (triangleNormals[2] && triangleNormals[1] && triangleNormals[0]) {
                            triangles.push( ...normalize(triangleNormals[2]!), 0, ...normalize(triangleNormals[1]!), 0, ...normalize(triangleNormals[0]), 0);
                        } else {
                            const normal = normalize(cross(vector_difference(triangleVertices[0]!, triangleVertices[2]!), vector_difference(triangleVertices[0]!, triangleVertices[1]!)));
                            triangles.push( ...normal, 0, ...normal, 0, ...normal, 0);
                        }

                        // Test if uvs are defined, otherwise use default uvs for triangle 2 1 0
                        if (triangleUvs[2] && triangleUvs[1] && triangleUvs[0]) {
                            triangles.push( ...triangleUvs[2]!, 0, 0, ...triangleUvs[1]!, 0, 0, ...triangleUvs[0], 0, 0);
                        } else {
                            triangles.push(0,0,0,0, 0,1,0,0, 1,1,0,0);
                        }
                    } else {
                        console.warn('Invalid face data:', data);
                    }
                    break;
                case 'usemtl':
                    // Use material name for next vertices
                    if (materials[words[1] as keyof typeof materials]) {
                        curMaterialName = words[1];
                    } else {
                        console.warn('Couldn\'t resolve material', curMaterialName);
                    }
                    break;
            }
        };
        // fetch file and iterate over its lines
        let text = await (await fetch(path)).text();
        console.log('Parsing vertices ...');
        text.split(/\r\n|\r|\n/).forEach(line => interpreteLine(line));
        // return built object
        return triangles;
    }

    static mtl = async (path: string): Promise<Map<string, Material>> => {
        // Accumulate information
        let materials = new Map<string, Material>();
        let currentMaterialName: string = "";
        // line interpreter
        let interpreteLine = (line: string) => {
          let words: Array<string> = [];
          // get array of words
          line.split(/[\t \s\s+]/g).forEach(word => { if (word.length) words.push(word) });
    
          // interpret current line
          switch (words[0]) {
            case 'newmtl':
              currentMaterialName = words[1] ?? "";
              materials.set(currentMaterialName, new Material());
              break;
            case 'Ka':
              materials.get(currentMaterialName)!.color = vector_scale(new Vector(Number(words[1]), Number(words[2]), Number(words[3])), 255);
              break;
            case 'Ke':
              let emissiveness: Vector<3> = new Vector(Number(words[1]), Number(words[2]), Number(words[3]));
              materials.get(currentMaterialName)!.emissive = emissiveness;
              // Replace color if emissiveness is not 0
              break;
            case 'Ns':
              materials.get(currentMaterialName)!.metallic = Number(words[1]) / 1000;
              break;
            case 'd':
              // materials[currentMaterialName].translucency = Number(words[1]);
              // materials[currentMaterialName].roughness = 0;
              break;
            case 'Ni':
              materials.get(currentMaterialName)!.ior = Number(words[1]);
              break;
          }
        };
        // fetch file and iterate over its lines
        let text = await (await fetch(path)).text();
        console.log('Parsing materials ...');
        text.split(/\r\n|\r|\n/).forEach(line => interpreteLine(line));
        // Log materials
        console.log(materials);
        // return filled materials array
        return materials;
    }
}