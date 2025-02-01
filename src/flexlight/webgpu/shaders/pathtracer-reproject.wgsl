const POW32U: u32 = 4294967295u;
const POW24F: f32 = 16777216.0f;
const SQRT2: f32 = 1.4142135623730951f;

struct Transform {
    rotation: mat3x3<f32>,
    shift: vec3<f32>,
};

struct UniformFloat {
    view_matrix: mat3x3<f32>,
    view_matrix_jitter: mat3x3<f32>,

    camera_position: vec3<f32>,
    ambient: vec3<f32>,

    min_importancy: f32,
};

struct UniformUint {
    render_size: vec2<u32>,
    temporal_target: u32,
    temporal_max: u32,
    is_temporal: u32,

    samples: u32,
    max_reflections: u32,

    tonemapping_operator: u32,
};

@group(0) @binding(0) var accumulated_float: texture_2d_array<f32>;
@group(0) @binding(1) var accumulated_uint: texture_2d_array<u32>;
@group(0) @binding(2) var canvas_in: texture_storage_2d<rgba32float, write>;
// @group(0) @binding(1) var<storage, read_write> buffer_out: array<atomic<u32>>;

@group(1) @binding(0) var<uniform> uniforms_float: UniformFloat;
@group(1) @binding(1) var<uniform> uniforms_uint: UniformUint;
@group(1) @binding(2) var<storage, read> instance_transform: array<Transform>;
// atomicStore(atomic_ptr: ptr<AS, atomic<T>, read_write>, v: T)

/*

fn store_atomic(pos: vec2<u32>, val: vec4<f32>) {
    let b_pos: u32 = (pos.x + u32(uniforms.render_size.x) * pos.y) * 4u;
    // Spread out the float values over the range of u32.
    let u32vals: vec4<u32> = vec4<u32>(val * POW24F);
    // Store the u32 values.
    atomicStore(&buffer_out[b_pos], u32vals.x);
    atomicStore(&buffer_out[b_pos + 1], u32vals.y);
    atomicStore(&buffer_out[b_pos + 2], u32vals.z);
    atomicStore(&buffer_out[b_pos + 3], u32vals.w);
}

fn add_atomic(pos: vec2<u32>, val: vec4<f32>) {
    let b_pos: u32 = (pos.x + u32(uniforms.render_size.x) * pos.y) * 4u;
    // Spread out the float values over the range of u32.
    let u32vals: vec4<u32> = vec4<u32>(val * POW24F);
    // Store the u32 values.
    atomicAdd(&buffer_out[b_pos], u32vals.x);
    atomicAdd(&buffer_out[b_pos + 1], u32vals.y);
    atomicAdd(&buffer_out[b_pos + 2], u32vals.z);
    atomicAdd(&buffer_out[b_pos + 3], u32vals.w);
}

fn interpolate_store(pos: vec2<f32>, val: vec4<f32>) {
    let pos_fract: vec2<f32> = fract(pos);
    let pos_u32: vec2<u32> = vec2<u32>(pos);

    let offsets = mat4x2<f32>(
        vec2<f32>(0.0f, 0.0f),
        vec2<f32>(1.0f, 0.0f),
        vec2<f32>(0.0f, 1.0f),
        vec2<f32>(1.0f, 1.0f)
    );

    let distances: vec4<f32> = max(1.0f - vec4<f32>(
        length(offsets[0] - pos_fract),
        length(offsets[1] - pos_fract),
        length(offsets[2] - pos_fract),
        length(offsets[3] - pos_fract)
    ), vec4<f32>(0.0f));

    let weights: vec4<f32> = distances / (distances.x + distances.y + distances.z + distances.w);

    // let positions: mat4x2<u32> = pos_u32 + mat4x2<u32>(offsets);

    add_atomic(pos_u32 + vec2<u32>(offsets[0]), val * weights.x);
    add_atomic(pos_u32 + vec2<u32>(offsets[1]), val * weights.y);
    add_atomic(pos_u32 + vec2<u32>(offsets[2]), val * weights.z);
    add_atomic(pos_u32 + vec2<u32>(offsets[3]), val * weights.w);
}
*/

@compute
@workgroup_size(8, 8)
fn compute(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_id) local_invocation_id : vec3<u32>,
    @builtin(global_invocation_id) global_invocation_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
    // Skip if texel is out of bounds
    if (global_invocation_id.x > uniforms_uint.render_size.x || global_invocation_id.y > uniforms_uint.render_size.y) {
        return;
    }
    
    // Get texel position of screen
    let screen_pos: vec2<u32> = global_invocation_id.xy;

    let accumulated_float_0: vec4<f32> = textureLoad(accumulated_float, screen_pos, 0, 0);
    let accumulated_float_1: vec4<f32> = textureLoad(accumulated_float, screen_pos, 1, 0);
    let accumulated_uint_0: vec4<u32> = textureLoad(accumulated_uint, screen_pos, 0, 0);
    let accumulated_uint_2: vec4<u32> = textureLoad(accumulated_uint, screen_pos, 2, 0);
    // Extract color value from old position
    var color: vec4<f32> = vec4<f32>(unpack2x16float(accumulated_uint_0.x), unpack2x16float(accumulated_uint_0.y));
    // Extract 3d position value
    let rel_position_cur: vec3<f32> = accumulated_float_0.xyz;
    let abs_position_cur: vec3<f32> = accumulated_float_1.xyz;
    // let abs_position_cur: vec4<f32> = vec4<f32>(unpack2x16float(accumulated_2.z), unpack2x16float(accumulated_2.w));
    // Extract instance index
    let next_temporal_target: u32 = accumulated_uint_2.x;
    let instance_index: u32 = accumulated_uint_2.y;
    // If data is not from last frame write ambient color
    
    if (next_temporal_target != (uniforms_uint.temporal_target + 1u) % uniforms_uint.temporal_max) {
        textureStore(canvas_in, screen_pos, vec4<f32>(uniforms_float.ambient, 1.0f));
        return;
    }
    
    if (uniforms_uint.is_temporal == 1u) {
        // Reproject position to jitter if temporal is enabled
        // let transform: Transform = instance_transform[instance_index * 2u];
        // let absolute_position: vec3<f32> = transform.rotation * rel_position_cur.xyz + transform.shift;
        let clip_space: vec3<f32> = uniforms_float.view_matrix_jitter * (abs_position_cur - uniforms_float.camera_position);
        let screen_space: vec2<f32> = (clip_space.xy / clip_space.z) * 0.5 + 0.5;

        let canvas_pos: vec2<u32> = vec2<u32>(
            u32(f32(uniforms_uint.render_size.x) * screen_space.x),
            u32(f32(uniforms_uint.render_size.y) * (1.0f - screen_space.y))
        );

        textureStore(canvas_in, canvas_pos, color);
    } else {
        // Write straight to canvas.
        textureStore(canvas_in, screen_pos, color);
    }
}