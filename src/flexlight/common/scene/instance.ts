"use strict";

import { Scene } from "./scene";
import { Transform } from "./transform";
import { Material } from "./material";
import { Prototype } from "./prototype";
import { AlbedoTexture, EmissiveTexture, MetallicTexture, NormalTexture, RoughnessTexture } from "./texture";

export class Instance {
    readonly scene: Scene;
    readonly prototype: Prototype;

    transform: Transform;
    material: Material;

    // Texture instances
    normal: NormalTexture | undefined = undefined;
    albedo: AlbedoTexture | undefined = undefined;
    emissive: EmissiveTexture | undefined = undefined;
    roughness: RoughnessTexture | undefined = undefined;
    metallic: MetallicTexture | undefined = undefined;

    constructor(scene: Scene, prototype: Prototype) {
        // Set scene
        this.scene = scene;
        // Set prototype
        this.prototype = prototype;
        // Set transform
        this.transform = new Transform(scene.instanceFloatManager);
        // Set material
        this.material = new Material(scene.instanceFloatManager);
    }

    destroy(): void {
        this.transform?.destroy();
        this.material?.destroy();
    }
}