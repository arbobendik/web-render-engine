const POW32U: u32 = 4294967295u;

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

@group(0) @binding(0) var compute_out: texture_storage_2d<rgba32float, read>;
@group(0) @binding(1) var canvas_out: texture_storage_2d<rgba8unorm, write>;

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

    let compute_color: vec4<f32> = textureLoad(compute_out, screen_pos);
    // Clear textures we render to every frame
    textureStore(canvas_out, screen_pos, compute_color);
}