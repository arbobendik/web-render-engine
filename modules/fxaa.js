'use strict';

import { GLLib } from './gllib.js';

export class FXAA {
    textureIn;
    #shader = `#version 300 es
    // Define FXAA constants
    #define FXAA_EDGE_THRESHOLD_MIN 1.0 / 32.0
    #define FXAA_EDGE_THRESHOLD 1.0 / 2.0
    #define FXAA_SUBPIX_TRIM 0.0
    #define FXAA_SUBPIX_TRIM_SCALE 1.0
    #define FXAA_SUBPIX_CAP 7.0 / 8.0
    #define FXAA_SEARCH_STEPS 6
    precision highp float;
    in vec2 clipSpace;
    uniform sampler2D preRender;
    out vec4 out_color;
    vec2 texel;

    vec4 fetch(int x, int y) {
      return texelFetch(preRender, ivec2(texel) + ivec2(x, y), 0);
    }

    // Color to luminance conversion from NVIDIA FXAA white paper
    float fxaa_luma(vec4 rgba) {
      return (rgba.y * (0.587/0.299) + rgba.x) * rgba.w;
    }

    float tex_luma(int x, int y) {
      // Devide length through square root of 3 to have a maximum length of 1
      return fxaa_luma(fetch(x, y));
    }

    // Local contrast checker from NVIDIA FXAA white paper
    vec2 fxaa_contrast(int x, int y) {
      return vec2(
        min(tex_luma(x, y), min(min(tex_luma(x, y-1), tex_luma(x-1, y)), min(tex_luma(x, y+1), tex_luma(x+1, y)))),
        max(tex_luma(x, y), max(max(tex_luma(x, y-1), tex_luma(x-1, y)), max(tex_luma(x, y+1), tex_luma(x+1, y))))
      );
    }

    // Local low contrast checker from NVIDIA FXAA white paper
    bool fxaa_is_low_contrast(int x, int y) {
      vec2 range_min_max = fxaa_contrast(x, y);
      float range = range_min_max.y - range_min_max.x;
      return (range < max(FXAA_EDGE_THRESHOLD_MIN, range_min_max.y * FXAA_EDGE_THRESHOLD));
    }

    vec4 blur_3x3(int x, int y) {
      return 1.0 / 9.0 * (
          fetch(x-1,y-1) + fetch(  x,y-1) + fetch(x+1,y-1)
        + fetch(x-1,  y) + fetch(  x,  y) + fetch(x+1,  y)
        + fetch(x-1,y+1) + fetch(  x,y+1) + fetch(x+1,y+1)
      );
    }

    float fxaa_sub_pixel_aliasing(int x, int y) {
      float luma_l = 0.25 * (tex_luma(x,y-1) + tex_luma(x-1,y) + tex_luma(x+1,y) + tex_luma(x,y+1));
      float range_l = abs(luma_l - tex_luma(x, y));
      // Get contrast range
      vec2 range_min_max = fxaa_contrast(x, y);
      float range = range_min_max.y - range_min_max.x;
      float blend_l = max(0.0,
      (range_l / range) - FXAA_SUBPIX_TRIM) * FXAA_SUBPIX_TRIM_SCALE;
      blend_l = min(FXAA_SUBPIX_CAP, blend_l);
      return blend_l;
    }

    void main() {
      // Get texture size
      texel = vec2(textureSize(preRender, 0)) * clipSpace;
      vec4 original_color = fetch(0, 0);
      float original_luma = tex_luma(0, 0);

      mat3 luma = mat3(
        vec3(tex_luma(-1,-1),tex_luma(0,-1),tex_luma(1,-1)),
        vec3(tex_luma(-1, 0),tex_luma(0, 0),tex_luma(1, 0)),
        vec3(tex_luma(-1, 1),tex_luma(0, 1),tex_luma(1, 1))
      );

      // Edge detection from NVIDIA FXAA white paper
      float edge_vert =
        abs((0.25 * luma[0].x) + (-0.5 * luma[0].y) + (0.25 * luma[0].z)) +
        abs((0.50 * luma[1].x) + (-1.0 * luma[1].y) + (0.50 * luma[1].z)) +
        abs((0.25 * luma[2].x) + (-0.5 * luma[2].y) + (0.25 * luma[2].z));

      float edge_horz =
        abs((0.25 * luma[0].x) + (-0.5 * luma[1].x) + (0.25 * luma[2].x)) +
        abs((0.50 * luma[0].y) + (-1.0 * luma[1].y) + (0.50 * luma[2].y)) +
        abs((0.25 * luma[0].z) + (-0.5 * luma[1].z) + (0.25 * luma[2].z));

      bool horz_span = edge_horz >= edge_vert;
      ivec2 step = ivec2(0, 1);
      if (horz_span) step = ivec2(1, 0);

      if (fxaa_is_low_contrast(0, 0)) {
        out_color = original_color;
        return;
      }

      ivec2 pos_n = - step;
      ivec2 pos_p = step;
      vec4 color = original_color;
      float pixel_count = 1.0;
      bool done_n = false;
      bool done_p = false;

      // Luma of neighbour with highest contrast
      float luma_mcn = max(
        max(abs(luma[0].y - luma[1].y), abs(luma[1].z - luma[1].y)),
        max(abs(luma[2].y - luma[1].y), abs(luma[1].x - luma[1].y))
      );

      float gradient = abs(luma_mcn - luma[1].y);

      for (int i = 0; i < FXAA_SEARCH_STEPS; i++) {
        // Blend pixel with 3x3 box filter to preserve sub pixel detail
        if (!done_n) {
          vec4 local_blur_n = blur_3x3(pos_n.x, pos_n.y);
          done_n = (abs(fxaa_luma(local_blur_n) - luma_mcn) >= gradient);
          color += mix(fetch(pos_n.x, pos_n.y), local_blur_n, fxaa_sub_pixel_aliasing(pos_n.x, pos_n.y));
          pixel_count++;
          pos_n -= step;
        } else if (!done_p) {
          vec4 local_blur_p = blur_3x3(pos_p.x, pos_p.y);
          done_p = (abs(fxaa_luma(local_blur_p) - luma_mcn) >= gradient);
          color += mix(fetch(pos_p.x, pos_p.y), local_blur_p, fxaa_sub_pixel_aliasing(pos_p.x, pos_p.y));
          pixel_count++;
          pos_p += step;
        } else {
          break;
        }
      }
      out_color = color / pixel_count;
    }
    `;
    #program;
    #tex;
    #vao;
    #vertexBuffer;
    #gl;

    constructor (gl) {
        this.#gl = gl;
        // Compile shaders and link them into program
        this.#program = GLLib.compile (gl, GLLib.postVertex, this.#shader);

        // Create post program buffers and uniforms
        this.#vao = gl.createVertexArray();
        this.textureIn = gl.createTexture();
        gl.bindVertexArray(this.#vao);
        gl.useProgram(this.#program);

        this.#tex = gl.getUniformLocation(this.#program, 'preRender');
        this.#vertexBuffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertexBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        // Fill buffer with data for two verices
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from([0,0,1,0,0,1,1,1,0,1,1,0]), gl.DYNAMIC_DRAW);

        this.buildTexture();
    }

    buildTexture = () => {
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.textureIn);
        this.#gl.texImage2D(this.#gl.TEXTURE_2D, 0, this.#gl.RGBA, this.#gl.canvas.width, this.#gl.canvas.height, 0, this.#gl.RGBA, this.#gl.UNSIGNED_BYTE, null);
        GLLib.setTexParams(this.#gl);
    };

    renderFrame = () => {
        // Render to canvas now
        this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
        // Make pre rendered texture TEXTURE0
        this.#gl.activeTexture(this.#gl.TEXTURE0);
        this.#gl.bindTexture(this.#gl.TEXTURE_2D, this.textureIn);
        // Switch program and vao
        this.#gl.useProgram(this.#program);
        this.#gl.bindVertexArray(this.#vao);
        // Pass pre rendered texture to shader
        this.#gl.uniform1i(this.#tex, 0);
        // Post processing drawcall
        this.#gl.drawArrays(this.#gl.TRIANGLES, 0, 6);
    }
}