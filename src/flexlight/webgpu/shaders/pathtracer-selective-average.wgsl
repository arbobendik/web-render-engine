const PI: f32 = 3.141592653589793;
const POW32U: u32 = 4294967295u;
const SQRT3: f32 = 1.7320508075688772;
const BIAS: f32 = 0.0000152587890625;
const INV_1023: f32 = 0.0009775171065493646;

/*
const YUV_MATRIX: mat3x3<f32> = mat3x3<f32>(
    0.299,      0.587,     0.114,
  - 0.14713,  - 0.28886,   0.436,
    0.615,    - 0.51499, - 0.10001
);
*/

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

    tonemapping_operator: u32
};

@group(0) @binding(0) var compute_out: texture_2d_array<f32>;
@group(0) @binding(1) var shift_out_float: texture_2d_array<f32>;
@group(0) @binding(2) var shift_out_uint: texture_2d_array<u32>;
@group(0) @binding(3) var accumulated_float: texture_storage_2d_array<rgba32float, write>;
@group(0) @binding(4) var accumulated_uint: texture_storage_2d_array<rgba32uint, write>;


@group(1) @binding(0) var<uniform> uniforms_float: UniformFloat;
@group(1) @binding(1) var<uniform> uniforms_uint: UniformUint;
@group(1) @binding(2) var<storage, read> instance_transform: array<Transform>;

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
    if (screen_pos.x > uniforms_uint.render_size.x || screen_pos.y > uniforms_uint.render_size.y) {
        return;
    }

    // Get current color and position.
    let color_cur: vec4<f32> = textureLoad(compute_out, screen_pos, 0, 0);
    let geometry_context: vec4<f32> = textureLoad(compute_out, screen_pos, 1, 0);
    // Current instance index is stored in the last channel of position
    let abs_position_cur: vec3<f32> = geometry_context.xyz;  
    let instance_index: u32 = u32(geometry_context.w);

    // Calculate relative position
    let inverse_transform: Transform = instance_transform[instance_index * 2u + 1u];
    let rel_position_cur: vec3<f32> = inverse_transform.rotation * (abs_position_cur.xyz + inverse_transform.shift);
    // Map postion according to current camera positon and view matrix to clip space
    // Reproject position to jitter if temporal is enabled
    let clip_space: vec3<f32> = uniforms_float.view_matrix_jitter * (abs_position_cur - uniforms_float.camera_position);
    // Project onto screen and shift origin to the corner
    let screen_space: vec2<f32> = (clip_space.xy / clip_space.z) * 0.5 + 0.5;
    // Translate to texel value
    let coord: vec2<u32> = vec2<u32>(
        u32((f32(uniforms_uint.render_size.x) * screen_space.x)),
        u32((f32(uniforms_uint.render_size.y) * (1.0f - screen_space.y)))
    );

    let shift_out_float_0: vec4<f32> = textureLoad(shift_out_float, coord, 0, 0);
    let shift_out_float_1: vec4<f32> = textureLoad(shift_out_float, coord, 1, 0);

    let shift_out_uint_0: vec4<u32> = textureLoad(shift_out_uint, coord, 0, 0);
    let shift_out_uint_1: vec4<u32> = textureLoad(shift_out_uint, coord, 1, 0);
    let shift_out_uint_2: vec4<u32> = textureLoad(shift_out_uint, coord, 2, 0);
    // Extract color values
    let fine_color_acc: vec4<f32> = vec4<f32>(unpack2x16float(shift_out_uint_0.x), unpack2x16float(shift_out_uint_0.y));
    let fine_color_low_acc: vec4<f32> = vec4<f32>(unpack2x16float(shift_out_uint_0.z), unpack2x16float(shift_out_uint_0.w));
    let coarse_color_acc: vec4<f32> = vec4<f32>(unpack2x16float(shift_out_uint_0.x), unpack2x16float(shift_out_uint_0.y));
    let coarse_color_low_acc: vec4<f32> = vec4<f32>(unpack2x16float(shift_out_uint_0.z), unpack2x16float(shift_out_uint_0.w));
    // Extract 3d position value
    let rel_position_old: vec3<f32> = shift_out_float_0.xyz;
    let abs_position_old: vec3<f32> = shift_out_float_1.xyz;

    let old_temporal_target: u32 = shift_out_uint_2.x;
    let old_instance_index: u32 = shift_out_uint_2.y;
    let old_fine_count: u32 = shift_out_uint_2.z;
    let old_coarse_count: u32 = shift_out_uint_2.w;
    
    // If absolute position is all zeros then there is nothing to do
    let dist: f32 = distance(rel_position_cur, rel_position_old);
    let cur_depth: f32 = distance(abs_position_cur, uniforms_float.camera_position.xyz + inverse_transform.shift);
    // let norm_color_diff = dot(normalize(current_color.xyz), normalize(accumulated_color.xyz));

    let croped_cur_color: vec4<f32> = min(color_cur, vec4<f32>(1.0f));

    var fine_color: vec4<f32> = color_cur;
    var fine_color_low: vec4<f32> = croped_cur_color;
    var fine_count: u32 = 0u;

    var coarse_color: vec4<f32> = color_cur;
    var coarse_color_low: vec4<f32> = croped_cur_color;
    var coarse_count: u32 = 0u;


    let is_pos = rel_position_cur.x != 0.0f || rel_position_cur.y != 0.0f || rel_position_cur.z != 0.0f;

    
    if (
        // Still on the same instance
        old_instance_index == instance_index
        // Pixel are close enough to each other
        && dist <= cur_depth * 8.0f / f32(uniforms_uint.render_size.x)
        // Pixel is from last frame
        && old_temporal_target == uniforms_uint.temporal_target
        // Pixel is valid and not in void
        && is_pos 
    ) {
        // Add color to total and increase counter by one
        fine_count = min(old_fine_count + 1u, 32u);
        fine_color = mix(fine_color_acc, color_cur, 1.0f / f32(fine_count));
        fine_color_low = mix(fine_color_low_acc, croped_cur_color, 1.0f / f32(fine_count));

        coarse_count = min(old_coarse_count + 1u, 4u);
        coarse_color = mix(coarse_color_acc, color_cur, 1.0f / f32(coarse_count));
        coarse_color_low = mix(coarse_color_low_acc, croped_cur_color, 1.0f / f32(coarse_count));


        let low_variance_color_length: f32 = (length(fine_color_low) + length(coarse_color_low)) * 0.5f;

        // If the color is not stable enough, use the coarse color
        if (
            dot(normalize(fine_color_low + BIAS), normalize(coarse_color_low + BIAS)) < cos(PI * 0.125)
            || abs(length(fine_color_low) - length(coarse_color_low)) > low_variance_color_length
        ) {
            // If the color is not stable enough, use the coarse color
            fine_color = coarse_color;
            fine_color_low = coarse_color_low;
            fine_count = coarse_count;
        }
    }
    

    // Write to accumulate buffer
    textureStore(accumulated_float, coord, 0, vec4<f32>(rel_position_cur, 1.0f));
    textureStore(accumulated_float, coord, 1, vec4<f32>(abs_position_cur, 1.0f));

    textureStore(accumulated_uint, coord, 0, vec4<u32>(
        pack2x16float(fine_color.xy), pack2x16float(fine_color.zw),
        pack2x16float(fine_color_low.xy), pack2x16float(fine_color_low.zw)
    ));

    textureStore(accumulated_uint, coord, 1, vec4<u32>(
        pack2x16float(coarse_color.xy), pack2x16float(coarse_color.zw),
        pack2x16float(coarse_color_low.xy), pack2x16float(coarse_color_low.zw)
    ));

    textureStore(accumulated_uint, coord, 2, vec4<u32>(
        (uniforms_uint.temporal_target + 1u) % uniforms_uint.temporal_max, instance_index,
        fine_count, coarse_count
    ));
}