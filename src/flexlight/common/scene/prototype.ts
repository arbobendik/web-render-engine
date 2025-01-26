"use strict";

import { Parser } from "./obj-parser";
import { BufferManager } from "../buffer/buffer-manager";
import { TypedArrayView } from "../buffer/typed-array-view";
import { Bounding, BVHArrays } from "./bvh";
import { TriangleBVH } from "./triangle-bvh";
import { Material } from "./material";
import { Vector } from "../lib/math";

export const TRIANGLE_LENGTH = (3 + 3 + 3) * 4;

export class Prototype {
    // Buffer managers

    // Triangle data: V V V N N N UV UV UV
    private static _triangleManager = new BufferManager(Float32Array);
    static get triangleManager () { return this._triangleManager; }
    // BVH structure: 0|1 B|T B|T B|T
    private static _BVHManager = new BufferManager(Uint32Array)
    static get BVHManager () { return this._BVHManager; }
    // Bounding vertices: Bx By Bz
    private static _boundingVertexManager = new BufferManager(Float32Array);
    static get boundingVertexManager () { return this._boundingVertexManager; }


    // Buffers
    readonly triangles: TypedArrayView<Float32Array>;
    readonly bvh: TypedArrayView<Uint32Array>;
    readonly boundingVertices: TypedArrayView<Float32Array>;
    readonly bounding: Bounding;

    // Construct using arrays
    constructor(
        triangles: Float32Array | Array<number>,
        bvh: Uint32Array | Array<number>,
        boundingVertices: Float32Array | Array<number>,
        bounding: Bounding,
    ) {
        this.triangles = Prototype._triangleManager.allocateArray(triangles);
        this.bvh = Prototype._BVHManager.allocateArray(bvh);
        this.boundingVertices = Prototype._boundingVertexManager.allocateArray(boundingVertices);
        this.bounding = bounding;
    }

    // Construct from OBJ file
    static async fromObj(objPath: string, mtlPath: string | undefined = undefined) {
        let materials: Map<string, Material> = new Map();
        if (mtlPath) materials = await Parser.mtl(mtlPath);
        const prototypeArray: Array<number> = await Parser.obj(objPath, materials);
        // TODO: Add bounding vertices and BVH structure
        const bvh: TriangleBVH = TriangleBVH.fromPrototypeArray(prototypeArray);

        const bounding = { min: new Vector<3>(bvh.root.bounding.min.x, bvh.root.bounding.min.y, bvh.root.bounding.min.z), max: new Vector<3>(bvh.root.bounding.max.x, bvh.root.bounding.max.y, bvh.root.bounding.max.z) };
        console.log("BVH", objPath, bvh);
        const bvhArrays: BVHArrays = bvh.toArrays();
        console.log("BVH Arrays", objPath, bvhArrays);
        return new Prototype(prototypeArray, bvhArrays.bvh, bvhArrays.boundingVertices, bounding);
    }

    destroy() {
        // Free all buffers
        Prototype._triangleManager.freeArray(this.triangles);
        Prototype._BVHManager.freeArray(this.bvh);
        Prototype._boundingVertexManager.freeArray(this.boundingVertices);
    }
}