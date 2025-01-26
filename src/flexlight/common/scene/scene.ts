"use strict";

import { BVHArrays } from "./bvh.js";
import { IndexedInstanceBVH } from "./instance-bvh.js";
import { BufferManager } from "../buffer/buffer-manager.js";
import { Instance } from "./instance.js";
import { PointLight } from "./point-light.js";
import { POW32M1, Vector } from "../lib/math.js";
import { Prototype } from "./prototype.js";

// 36 (3 vertices per triangle * 4, 3 normals per triangle * 4, 3 UVs per triangle * 4)
const TRIANGLE_SIZE = 36;

export class Scene {
    // Triangle Offset, Vertex Offset, BVH Offset, Bounding Vertex Offset, Normal Offset, UV Offset, Transform Offset, Material Offset,
    // Normal Texture Offset, Albedo Texture Offset, Emissive Texture Offset, Roughness Texture Offset, Metallic Texture Offset
    // Global Triangle Offset
    private _instanceUintManager: BufferManager<Uint32Array>;
    get instanceUintManager () { return this._instanceUintManager; }
    // Transform, Material
    private _instanceFloatManager: BufferManager<Float32Array>;
    get instanceFloatManager () { return this._instanceFloatManager; }
    // BVH structure: 0|1 BV BV B|I B|I B|I B|I
    private _instanceBVHManager: BufferManager<Uint32Array>;
    get instanceBVHManager () { return this._instanceBVHManager; }
    // Bounding vertices: Bx By Bz
    private _instanceBoundingVertexManager: BufferManager<Float32Array>;
    get instanceBoundingVertexManager () { return this._instanceBoundingVertexManager; }
    // Px Py Pz, intensity, variance
    private _pointLightManager: BufferManager<Float32Array>;
    get pointLightManager () { return this._pointLightManager; }

    get triangleCount () {
        let count = 0;
        for (let instance of this.instances) count += instance.prototype.triangles.length / TRIANGLE_SIZE;
        return count;
    }
    
    private readonly instances: Set<Instance> = new Set();

    ambientLight: Vector<3> = new Vector(0.01, 0.01, 0.01);
    private readonly pointLights: Set<PointLight> = new Set();

    constructor(instances: Array<Instance> = []) {
        for (const instance of instances) this.instances.add(instance);
        this._instanceUintManager = new BufferManager(Uint32Array);
        this._instanceFloatManager = new BufferManager(Float32Array);
        this._instanceBVHManager = new BufferManager(Uint32Array);
        this._instanceBoundingVertexManager = new BufferManager(Float32Array);
        this._pointLightManager = new BufferManager(Float32Array);
    }

    updateBuffers = (): number => {
        const instanceUintArray: Array<number> = [];
        let globalTriangleIndexOffset: number = 0;

        // Construct instance uint array
        for (let instance of this.instances) {
            const triangleCount = instance.prototype.triangles.length / TRIANGLE_SIZE;
            instanceUintArray.push(
                instance.prototype.triangles.offset / 4,
                instance.prototype.bvh.offset / 4,
                instance.prototype.boundingVertices.offset / 4,
                instance.normal?.textureInstanceBuffer?.offset ?? POW32M1,
                instance.albedo?.textureInstanceBuffer?.offset ?? POW32M1,
                instance.emissive?.textureInstanceBuffer?.offset ?? POW32M1,
                instance.roughness?.textureInstanceBuffer?.offset ?? POW32M1,
                instance.metallic?.textureInstanceBuffer?.offset ?? POW32M1,
                globalTriangleIndexOffset  // Store first triangle index
            );
            globalTriangleIndexOffset += triangleCount;
        }

        // Allocate instance buffer
        this._instanceUintManager.overwriteAll(instanceUintArray);

        // Generate BVH
        const bvh: IndexedInstanceBVH = IndexedInstanceBVH.fromInstances(this.instances);

        //console.log("BVH", bvh);
        // Generate bounding vertices and BVH structure
        const bvhArrays: BVHArrays = bvh.toArrays();
        // console.log(bvhArrays);
        // console.log("BVHArray", bvhArrays.bvh);
        // console.log("Bounding Vertices", bvhArrays.boundingVertices);
        // console.log("Instance Uint Array", instanceUintArray);
        // Allocate BVH buffers
        this._instanceBVHManager.overwriteAll(bvhArrays.bvh);
        this._instanceBoundingVertexManager.overwriteAll(bvhArrays.boundingVertices);

        // Construct point light buffer
        const pointLightArray: Array<number> = [];
        for (let pointLight of this.pointLights) pointLightArray.push(
            pointLight.position.x, pointLight.position.y, pointLight.position.z,
            pointLight.color.x, pointLight.color.y, pointLight.color.z,
            pointLight.intensity, pointLight.variance
        );
        // Allocate point light buffer
        this._pointLightManager.overwriteAll(pointLightArray);

        // Return total triangle count to dispatch renderer with right amount of triangles.
        // console.log(globalTriangleIndexOffset);
        return globalTriangleIndexOffset;
    }

    // Add instance to scene
    instance(prototype: Prototype): Instance {
        const instance = new Instance(this, prototype);
        this.instances.add(instance);
        return instance;
    }

    // Remove instance from scene
    remove(instance: Instance): boolean {
        if (this.instances.has(instance)) {
            instance.destroy();
            return this.instances.delete(instance);
        }
        return false;
    }

    // Add point light to scene
    addPointLight(pointLight: PointLight) {
        this.pointLights.add(pointLight);
    }

    // Remove point light from scene
    removePointLight(pointLight: PointLight) {
        this.pointLights.delete(pointLight);
    }
}