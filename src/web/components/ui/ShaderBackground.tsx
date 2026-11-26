// ShaderBackground — exact port of swkpropertiesuae.com ("Mesh drift")
// Zero dependencies: lightweight WebGL canvas that renders the luminous sky-ice
// architectural atmosphere behind SWK OS. Automatically pauses when hidden/offscreen,
// respects prefers-reduced-motion, and never renders in print media.

import { useEffect, useRef } from 'react'

const VERT = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[8];
uniform vec4 u_scene;
uniform vec4 u_shape;
uniform vec4 u_surface;
uniform vec4 u_finish;
uniform vec4 u_transform;
uniform vec4 u_space;
uniform vec4 u_cursor;

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_warp u_shape.w
#define u_detail u_surface.x
#define u_contrast u_surface.y
#define u_brightness u_surface.z
#define u_saturation u_surface.w
#define u_hue u_finish.x
#define u_vignette u_finish.y
#define u_blur u_finish.z
#define u_grain u_finish.w
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define u_seed u_transform.x
#else
#define u_seed mod(u_transform.x, 31.0)
#endif
#define u_rotate u_transform.y
#define u_drift u_transform.z
#define u_oklab u_transform.w
#define u_offset u_space.xy
#define u_mouse u_space.zw
#define u_cursorPresence u_cursor.x
#define u_cursorEffect u_cursor.y
#define u_cursorStrength u_cursor.z
#define u_cursorRadius u_cursor.w

float hash21(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(15731.743, 7892.321) * n);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float cbrtSigned(float x) { return sign(x) * pow(abs(x), 1.0 / 3.0); }
vec3 rgbToOklab(vec3 c) {
  vec3 l = srgbToLinear(c);
  float L = cbrtSigned(0.4122214708 * l.r + 0.5363325363 * l.g + 0.0514459929 * l.b);
  float M = cbrtSigned(0.2119034982 * l.r + 0.6806995451 * l.g + 0.1073969566 * l.b);
  float S = cbrtSigned(0.0883024619 * l.r + 0.2817188376 * l.g + 0.6299787005 * l.b);
  return vec3(
    0.2104542553 * L + 0.7936177850 * M - 0.0040720468 * S,
    1.9779984951 * L - 2.4285922050 * M + 0.4505937099 * S,
    0.0259040371 * L + 0.7827717662 * M - 0.8086757660 * S);
}
vec3 oklabToRgb(vec3 lab) {
  float L = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float M = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float S = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  L = L * L * L; M = M * M * M; S = S * S * S;
  vec3 l = vec3(
     4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.7076147010 * S);
  return linearToSrgb(clamp(l, 0.0, 1.0));
}
vec3 mixColor(vec3 a, vec3 b, float t) {
  if (u_oklab > 0.5) return oklabToRgb(mix(rgbToOklab(a), rgbToOklab(b), t));
  return mix(a, b, t);
}

vec3 hueRotate(vec3 col, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  vec3 k = vec3(0.57735027);
  return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
}

vec2 warpDomain(vec2 p, float t) {
  if (u_warp <= 0.0001) return p;
  vec2 q = vec2(
    fbm(p * 1.1 + vec2(0.0, t * 0.18) + u_seed * 0.37),
    fbm(p * 1.1 + vec2(5.2, -t * 0.14) + u_seed * 0.71));
  return p + (q - 0.5) * u_warp * 1.6;
}

vec3 shade(vec2 uv, vec2 p, float t) {
  p = warpDomain(p, t);
  float soft = mix(0.9, 3.2, clamp(u_intensity, 0.0, 1.0));
  float drift = 0.22 + 0.22 * u_paramA;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= u_colorCount) break;
    vec2 h = hash22(vec2(fi * 3.17 + u_seed * 1.31, fi * 7.91 + 0.5));
    vec2 c = (h - 0.5) * 1.4;
    float a = t * (0.28 + 0.09 * fi) + h.x * 6.28318;
    c += vec2(cos(a), sin(a * 0.83 + h.y * 3.0)) * drift;
    float d = length(p - c);
    float w = exp(-d * d * soft) + 0.001;
    vec3 col = u_colors[i];
    if (u_oklab > 0.5) col = rgbToOklab(col);
    acc += col * w;
    wsum += w;
  }
  vec3 col = acc / max(wsum, 0.0001);
  if (u_oklab > 0.5) col = oklabToRgb(col);
  float ridge = fbm(p * (0.8 + u_detail * 0.7) + vec2(t * 0.12, -t * 0.09));
  col = mix(col, col * (0.85 + 0.3 * ridge), 0.35 * clamp(u_detail * 0.5, 0.0, 1.0));
  return col;
}

void main() {
  vec2 screenUv = gl_FragCoord.xy / u_resolution.xy;
  vec2 uv = screenUv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  p *= u_scale;
  float ca = cos(u_rotate), sa = sin(u_rotate);
  p = mat2(ca, -sa, sa, ca) * p;
  p += u_offset;
  p += vec2(u_time * u_drift * 0.15, 0.0);

  vec3 col;
  if (u_blur > 0.0) {
    float e = u_blur;
    float pe = e * u_scale;
    vec2 uvE = vec2(e) * min(u_resolution.x, u_resolution.y) / u_resolution.xy;
    col  = shade(uv, p, u_time) * 0.36;
    col += shade(uv + vec2(uvE.x, 0.0), p + vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv - vec2(uvE.x, 0.0), p - vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv + vec2(0.0, uvE.y), p + vec2(0.0, pe), u_time) * 0.16;
    col += shade(uv - vec2(0.0, uvE.y), p - vec2(0.0, pe), u_time) * 0.16;
  } else {
    col = shade(uv, p, u_time);
  }

  if (abs(u_contrast - 1.0) > 0.0001) col = (col - 0.5) * u_contrast + 0.5;
  if (abs(u_saturation - 1.0) > 0.0001) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, u_saturation);
  }
  if (abs(u_hue) > 0.0001) col = hueRotate(col, u_hue);
  if (abs(u_brightness) > 0.0001) col += u_brightness;
  if (u_vignette > 0.0001) {
    float vd = length(screenUv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  }
  if (u_grain > 0.0001) {
    col += (grainHash(gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

const UNIFORMS = {
  colors: [
    [1, 1, 1],
    [0.9607843137254902, 0.9607843137254902, 0.9607843137254902],
    [0.10588235294117647, 0.41568627450980394, 0.6549019607843137],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
    [0.3411764705882353, 0.8235294117647058, 0.9568627450980393],
  ] as [number, number, number][],
  colorCount: 4,
  scale: 1.3,
  intensity: 0.56,
  paramA: 0.67,
  warp: 0.192,
  detail: 2.016,
  contrast: 1.12,
  brightness: 0.03,
  saturation: 0.88,
  hue: 0.0,
  vignette: 0.1,
  blur: 0.0072,
  grain: 0.06,
  seed: 5069.0,
  rotate: 2.7227,
  offsetX: 0.09,
  offsetY: 0.15,
  drift: 0.148,
  oklab: 0.0,
  timeScale: -0.95,
}

const pendingContextReleases = new WeakMap<HTMLCanvasElement, number>()

export function ShaderBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pendingRelease = pendingContextReleases.get(canvas)
    if (pendingRelease !== undefined) window.clearTimeout(pendingRelease)
    pendingContextReleases.delete(canvas)

    const gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'low-power' })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s)
        return null
      }
      return s
    }
    const program = gl.createProgram()
    if (!program) return
    const vertexShader = compile(gl.VERTEX_SHADER, VERT)
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader)
      if (fragmentShader) gl.deleteShader(fragmentShader)
      gl.deleteProgram(program)
      return
    }
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return
    }
    gl.useProgram(program)

    const buf = gl.createBuffer()
    if (!buf) {
      gl.deleteProgram(program)
      return
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(program, 'a_position')
    if (loc < 0) {
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      return
    }
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uni = {
      colors: gl.getUniformLocation(program, 'u_colors'),
      scene: gl.getUniformLocation(program, 'u_scene'),
      shape: gl.getUniformLocation(program, 'u_shape'),
      surface: gl.getUniformLocation(program, 'u_surface'),
      finish: gl.getUniformLocation(program, 'u_finish'),
      transform: gl.getUniformLocation(program, 'u_transform'),
      space: gl.getUniformLocation(program, 'u_space'),
      cursor: gl.getUniformLocation(program, 'u_cursor'),
    }
    gl.uniform3fv(uni.colors, new Float32Array(UNIFORMS.colors.flat()))
    gl.uniform4f(uni.shape, UNIFORMS.scale, UNIFORMS.intensity, UNIFORMS.paramA, UNIFORMS.warp)
    gl.uniform4f(uni.surface, UNIFORMS.detail, UNIFORMS.contrast, UNIFORMS.brightness, UNIFORMS.saturation)
    gl.uniform4f(uni.finish, UNIFORMS.hue, UNIFORMS.vignette, UNIFORMS.blur, UNIFORMS.grain)
    gl.uniform4f(uni.transform, UNIFORMS.seed, UNIFORMS.rotate, UNIFORMS.drift, UNIFORMS.oklab)
    gl.uniform4f(uni.cursor, 0, 0, 0, 0)

    let bounds = canvas.getBoundingClientRect()
    let raf = 0
    let visible = document.visibilityState === 'visible'
    let inView = true
    let disposed = false
    let contextLost = false
    let lastDraw = 0
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const start = performance.now()
    const timeAnimated = !reducedMotion && Math.abs(UNIFORMS.timeScale) > 0.0001

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const rawWidth = Math.max(1, Math.round(bounds.width * dpr))
      const rawHeight = Math.max(1, Math.round(bounds.height * dpr))
      const pixelScale = Math.min(1, Math.sqrt(1_200_000 / Math.max(1, rawWidth * rawHeight)))
      const w = Math.max(1, Math.round(rawWidth * pixelScale))
      const h = Math.max(1, Math.round(rawHeight * pixelScale))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
    }

    const requestRender = () => {
      if (raf !== 0 || disposed || contextLost || !visible || !inView) return
      raf = requestAnimationFrame(render)
    }

    const onContextLost = (e: Event) => {
      e.preventDefault()
      contextLost = true
      if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
    const onContextRestored = () => {
      contextLost = false
      requestRender()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)

    const updateLayout = () => {
      bounds = canvas.getBoundingClientRect()
      resizeCanvas()
      requestRender()
    }
    window.addEventListener('resize', updateLayout)
    const resizeObserver = new ResizeObserver(updateLayout)
    resizeObserver.observe(canvas)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true
      if (inView) requestRender()
      else if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    })
    intersectionObserver.observe(canvas)
    const onVisibilityChange = () => {
      visible = document.visibilityState === 'visible'
      if (visible) requestRender()
      else if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    function render(now: number) {
      raf = 0
      if (disposed || contextLost || !visible || !inView || !canvas || !gl) return
      // Cap at ~30fps so background shader stays silky-smooth with minimal GPU footprint
      if (lastDraw && now - lastDraw < 32) {
        if (timeAnimated) requestRender()
        return
      }
      lastDraw = now
      resizeCanvas()
      gl.uniform4f(uni.scene, canvas.width, canvas.height, ((now - start) / 1000) * UNIFORMS.timeScale, UNIFORMS.colorCount)
      gl.uniform4f(uni.space, UNIFORMS.offsetX, UNIFORMS.offsetY, 0, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (timeAnimated) requestRender()
    }
    requestRender()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('resize', updateLayout)
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      const releaseTimer = window.setTimeout(() => {
        if (pendingContextReleases.get(canvas) !== releaseTimer) return
        pendingContextReleases.delete(canvas)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        canvas.width = 1
        canvas.height = 1
      }, 0)
      pendingContextReleases.set(canvas, releaseTimer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  )
}

/** Fixed luminous sky-ice WebGL shader (desktop) / zero-GPU CSS mesh (Android/iOS/mobile) + Swiss vertical hairline grid */
export function SwissAtmosphereBackdrop() {
  const isDesktopWebGl =
    typeof window !== 'undefined' &&
    !(window as any).Capacitor?.isNativePlatform?.() &&
    !(window as any).__SWK_CONFIG__?.MOBILE_SHELL &&
    window.innerWidth >= 1024 &&
    !(window.matchMedia?.('(pointer: coarse)').matches ?? false) &&
    !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden no-print swk-atmosphere"
      style={{
        background: isDesktopWebGl
          ? 'linear-gradient(135deg, #eef8fd 0%, #d4effc 48%, #f5fbff 100%)'
          : 'radial-gradient(900px 540px at 14% 8%, rgba(255,255,255,0.88), transparent 62%), radial-gradient(760px 520px at 88% 18%, rgba(87,210,244,0.34), transparent 60%), radial-gradient(680px 460px at 78% 92%, rgba(27,106,167,0.16), transparent 64%), linear-gradient(135deg, #eef8fd 0%, #d4effc 48%, #f5fbff 100%)',
      }}
    >
      {isDesktopWebGl && <ShaderBackground className="absolute inset-0 h-full w-full opacity-[0.68]" />}
      {isDesktopWebGl && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(1200px 680px at 14% 0%, rgba(255,255,255,0.72), transparent 62%), radial-gradient(960px 560px at 88% 100%, rgba(238,248,253,0.78), transparent 64%)',
          }}
        />
      )}
      <div className="bg-arch-grid absolute inset-0 opacity-70" />
    </div>
  )
}
