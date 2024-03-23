const POW32U: u32 = 4294967295u;
const INV_255: f32 = 0.00392156862745098;
const INV_1023: f32 = 0.0009775171065493646;
const INV_65535: f32 = 0.000015259021896696422;

struct Uniforms {
    view_matrix: mat3x3<f32>,

    camera_position: vec3<f32>,
    ambient: vec3<f32>,

    texture_size: vec2<f32>,
    render_size: vec2<f32>,

    samples: f32,
    max_reflections: f32,
    min_importancy: f32,
    use_filter: f32,

    is_temporal: f32,
    temporal_target: f32
};

@group(0) @binding(0) var shift_out: texture_storage_2d_array<rgba32float, read>;
@group(0) @binding(1) var canvas_out: texture_storage_2d<rgba32float, write>;

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

@compute
@workgroup_size(8, 8)
fn compute(
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_id) local_invocation_id : vec3<u32>,
    @builtin(global_invocation_id) global_invocation_id : vec3<u32>,
    @builtin(local_invocation_index) local_invocation_index: u32,
    @builtin(num_workgroups) num_workgroups: vec3<u32>
) {
    // Get texel position of screen
    let screen_pos: vec2<u32> = global_invocation_id.xy;
    if (screen_pos.x > u32(uniforms.render_size.x) || screen_pos.y > u32(uniforms.render_size.y)) {
        return;
    }

    let buffer_index: u32 = global_invocation_id.x + num_workgroups.x * 8u * global_invocation_id.y;

    let cur_texel = textureLoad(shift_out, screen_pos, u32(uniforms.temporal_target));
    // The current pixel has the desireable depth
    let cur_depth: f32 = cur_texel.w;
    // Accumulate color values
    var color_sum: vec3<f32> = cur_texel.xyz;
    var counter: i32 = 1;
    // Amount of temporal passes
    let layers: u32 = textureNumLayers(shift_out);

    for (var i: u32 = 0; i < layers; i++) {
        // Skip current layer as it's already accounted for
        if (i == u32(uniforms.temporal_target)) {
            continue;
        }
        // Extract color values
        let texel: vec4<f32> = textureLoad(shift_out, screen_pos, i);
        // Test if depth is close enough to account for non-perfect overlap
        if (abs(cur_depth - texel.w) < cur_depth * INV_1023) {
            // Add color to total and increase counter by one
            color_sum += texel.xyz;
            counter++;
        }
    }

    // Clear textures we render to every frame
    textureStore(canvas_out, screen_pos, vec4<f32>(color_sum / f32(counter), cur_depth));
}