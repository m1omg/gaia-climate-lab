"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

type PlanetRendererProps = {
  state: string;
  ariaLabel?: string;
  temperature: number;
  mass: number;
  oceanCoverage: number;
  liquidWater: number;
  iceCoverage: number;
  cloudCover: number;
  steamPressure: number;
  atmosphericPressure: number;
  haze: number;
  albedo: number;
  landFraction: number;
  geology: number;
  rotationPeriod: number;
  stellarFlux: number;
};

type VisualSettings = {
  mode: number;
  water: number;
  ice: number;
  cloud: number;
  steam: number;
  atmosphere: number;
  haze: number;
  albedo: number;
  land: number;
  geology: number;
  temperature: number;
  spin: number;
  flux: number;
};

type TextureMaps = {
  width: number;
  height: number;
  terrain: Float32Array;
  detail: Float32Array;
  clouds: Float32Array;
};

type SphereMap = {
  width: number;
  height: number;
  radius: number;
  longitude: Float32Array;
  latitude: Float32Array;
  depth: Float32Array;
  light: Float32Array;
  specular: Float32Array;
  radial: Float32Array;
};

const MODE_BY_STATE: Record<string, number> = {
  Habitable: 0,
  Waterworld: 1,
  Icehouse: 2,
  Snowball: 3,
  "Desert planet": 4,
  "Mars-like": 5,
  "Anti-greenhouse": 6,
  Hothouse: 7,
  "Moist greenhouse": 8,
  "Wet runaway": 9,
  "Steam atmosphere": 10,
  "Dry runaway": 11,
  "Venus-like": 12,
  "Supercritical H₂O": 13,
  "Magma ocean": 14,
};

const TAU = Math.PI * 2;
const TEXTURE_WIDTH = 320;
const TEXTURE_HEIGHT = 160;
let textureCache: TextureMaps | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const smoothstep = (low: number, high: number, value: number) => {
  const x = clamp((value - low) / Math.max(high - low, 0.00001), 0, 1);
  return x * x * (3 - 2 * x);
};

const hash3 = (x: number, y: number, z: number) => {
  let hash = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
};

const valueNoise3 = (x: number, y: number, z: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const sz = zf * zf * (3 - 2 * zf);

  const x00 = mix(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), sx);
  const x10 = mix(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), sx);
  const x01 = mix(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), sx);
  const x11 = mix(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), sx);
  return mix(mix(x00, x10, sy), mix(x01, x11, sy), sz);
};

const fbm = (x: number, y: number, z: number, octaves = 4) => {
  let value = 0;
  let amplitude = 0.54;
  let scale = 1;
  let normalizer = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += valueNoise3(x * scale + octave * 7.3, y * scale - octave * 3.7, z * scale + octave * 5.1) * amplitude;
    normalizer += amplitude;
    scale *= 2.03;
    amplitude *= 0.49;
  }
  return value / normalizer;
};

const createTextureMaps = (): TextureMaps => {
  if (textureCache) return textureCache;

  const length = TEXTURE_WIDTH * TEXTURE_HEIGHT;
  const terrain = new Float32Array(length);
  const detail = new Float32Array(length);
  const clouds = new Float32Array(length);

  for (let y = 0; y < TEXTURE_HEIGHT; y += 1) {
    const latitude = (y / (TEXTURE_HEIGHT - 1) - 0.5) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    const sphereY = Math.sin(latitude);
    for (let x = 0; x < TEXTURE_WIDTH; x += 1) {
      const longitude = (x / TEXTURE_WIDTH - 0.5) * TAU;
      const sphereX = cosLatitude * Math.sin(longitude);
      const sphereZ = cosLatitude * Math.cos(longitude);
      const index = y * TEXTURE_WIDTH + x;
      const large = fbm(sphereX * 2.7 + 1.4, sphereY * 2.7 - 0.6, sphereZ * 2.7 + 2.2, 5);
      const ridges = fbm(sphereX * 7.8 - 4.1, sphereY * 7.8 + 2.7, sphereZ * 7.8 - 1.3, 3);
      terrain[index] = clamp(large * 0.82 + ridges * 0.18, 0, 1);
      detail[index] = fbm(sphereX * 12.5 + 8.2, sphereY * 12.5 - 1.7, sphereZ * 12.5 + 4.5, 3);
      clouds[index] = clamp(
        fbm(sphereX * 5.4 - 2.7, sphereY * 5.4 + 6.1, sphereZ * 5.4 + 1.2, 4) * 0.72
          + fbm(sphereX * 13.7 + 3.8, sphereY * 13.7 - 4.4, sphereZ * 13.7 + 7.6, 2) * 0.28,
        0,
        1,
      );
    }
  }

  textureCache = { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT, terrain, detail, clouds };
  return textureCache;
};

const createSphereMap = (width: number, height: number): SphereMap => {
  const length = width * height;
  const longitude = new Float32Array(length);
  const latitude = new Float32Array(length);
  const depth = new Float32Array(length);
  const light = new Float32Array(length);
  const specular = new Float32Array(length);
  const radial = new Float32Array(length);
  const radius = Math.min(width, height) * 0.392;
  const centerX = width / 2;
  const centerY = height / 2;
  const tilt = -0.19;
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const lightX = -0.76;
  const lightY = -0.18;
  const lightZ = 0.625;
  const halfX = -0.455;
  const halfY = -0.108;
  const halfZ = 0.884;

  for (let y = 0; y < height; y += 1) {
    const normalY = (centerY - (y + 0.5)) / radius;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const normalX = (x + 0.5 - centerX) / radius;
      const radiusSquared = normalX * normalX + normalY * normalY;
      const radiusValue = Math.sqrt(radiusSquared);
      radial[index] = radiusValue;
      if (radiusSquared > 1) continue;

      const normalZ = Math.sqrt(1 - radiusSquared);
      const tiltedX = normalX * cosTilt - normalY * sinTilt;
      const tiltedY = normalX * sinTilt + normalY * cosTilt;
      longitude[index] = Math.atan2(tiltedX, normalZ);
      latitude[index] = Math.asin(clamp(tiltedY, -1, 1));
      depth[index] = normalZ;
      light[index] = Math.max(0, normalX * lightX + normalY * lightY + normalZ * lightZ);
      const halfDot = Math.max(0, normalX * halfX + normalY * halfY + normalZ * halfZ);
      specular[index] = Math.pow(halfDot, 46);
    }
  }

  return { width, height, radius, longitude, latitude, depth, light, specular, radial };
};

const textureIndex = (maps: TextureMaps, longitude: number, latitude: number, shift: number) => {
  const wrapped = ((longitude / TAU + 0.5 + shift) % 1 + 1) % 1;
  const x = Math.floor(wrapped * maps.width);
  const y = clamp(Math.floor((latitude / Math.PI + 0.5) * maps.height), 0, maps.height - 1);
  return y * maps.width + x;
};

const atmosphereColor = (mode: number): [number, number, number] => {
  if (mode === 2 || mode === 3) return [125, 206, 233];
  if (mode === 4 || mode === 5) return [211, 92, 42];
  if (mode === 6) return [201, 110, 52];
  if (mode === 7) return [115, 183, 198];
  if (mode === 8) return [148, 207, 220];
  if (mode === 9) return [181, 218, 226];
  if (mode === 10) return [226, 220, 207];
  if (mode === 11) return [181, 91, 52];
  if (mode === 12) return [255, 188, 67];
  if (mode === 13) return [158, 210, 225];
  if (mode === 14) return [255, 118, 48];
  return [62, 191, 207];
};

const WEBGL_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const WEBGL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_mode;
uniform float u_water;
uniform float u_ice;
uniform float u_cloud;
uniform float u_steam;
uniform float u_atmosphere;
uniform float u_haze;
uniform float u_albedo;
uniform float u_land;
uniform float u_geology;
uniform float u_temperature;
uniform float u_spin;
uniform float u_flux;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.55;
  for (int octave = 0; octave < 4; octave++) {
    value += noise3(p) * amplitude;
    p = p * 2.03 + vec3(5.7, 1.3, 8.9);
    amplitude *= 0.48;
  }
  return value;
}

vec3 rotateY(vec3 point, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(cosine * point.x + sine * point.z, point.y, -sine * point.x + cosine * point.z);
}

vec3 rotateZ(vec3 point, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec3(cosine * point.x - sine * point.y, sine * point.x + cosine * point.y, point.z);
}

bool modeIs(float mode) {
  return abs(u_mode - mode) < 0.5;
}

vec3 atmosphereTint() {
  if (modeIs(2.0) || modeIs(3.0)) return vec3(0.49, 0.81, 0.91);
  if (modeIs(4.0) || modeIs(5.0)) return vec3(0.75, 0.33, 0.16);
  if (modeIs(6.0)) return vec3(0.72, 0.40, 0.20);
  if (modeIs(7.0)) return vec3(0.45, 0.72, 0.78);
  if (modeIs(8.0)) return vec3(0.58, 0.81, 0.86);
  if (modeIs(9.0)) return vec3(0.71, 0.86, 0.89);
  if (modeIs(10.0)) return vec3(0.89, 0.86, 0.81);
  if (modeIs(11.0)) return vec3(0.71, 0.36, 0.20);
  if (modeIs(12.0)) return vec3(1.0, 0.74, 0.27);
  if (modeIs(13.0)) return vec3(0.62, 0.82, 0.88);
  if (modeIs(14.0)) return vec3(1.0, 0.37, 0.10);
  return vec3(0.24, 0.75, 0.81);
}

void main() {
  vec2 screen = v_uv * 2.0 - 1.0;
  screen.x *= u_resolution.x / max(u_resolution.y, 1.0);
  screen /= 0.80;
  float radial = length(screen);
  vec3 atmosphereColor = atmosphereTint();
  float atmosphereStrength = clamp(
    0.05 + u_atmosphere * 0.70 + u_steam * 0.68 + u_haze * 0.46,
    0.025,
    1.0
  );

  if (radial > 1.0) {
    float halo = exp(-(radial - 1.0) * 18.0) * atmosphereStrength;
    halo *= 1.0 - smoothstep(1.08, 1.19, radial);
    if (halo < 0.003) discard;
    outColor = vec4(atmosphereColor, halo * 0.66);
    return;
  }

  float depth = sqrt(max(0.0, 1.0 - radial * radial));
  vec3 normal = normalize(vec3(screen.x, screen.y, depth));
  vec3 tilted = rotateZ(normal, -0.19);
  vec3 globe = rotateY(tilted, 0.38 + u_time * 0.011 * u_spin);
  float terrainLarge = fbm(globe * 2.8 + vec3(0.8, 1.7, -2.1));
  float terrainDetail = fbm(globe * 9.2 + vec3(-3.0, 0.4, 2.7));
  float elevation = terrainLarge * 0.79 + terrainDetail * 0.21;
  float landThreshold = clamp(0.72 - u_land * 0.43 + u_water * 0.08, 0.38, 0.78);
  float landMask = smoothstep(landThreshold - 0.035, landThreshold + 0.035, elevation);
  float dryness = clamp((1.0 - u_water) * 0.76 + smoothstep(315.0, 440.0, u_temperature) * 0.58, 0.0, 1.0);

  float coast = smoothstep(landThreshold - 0.10, landThreshold + 0.005, elevation) * (1.0 - landMask);
  vec3 ocean = mix(vec3(0.018, 0.12, 0.25), vec3(0.035, 0.42, 0.48), coast + terrainDetail * 0.08);
  vec3 wetLand = mix(vec3(0.13, 0.35, 0.15), vec3(0.39, 0.44, 0.20), terrainDetail);
  vec3 dryLand = mix(vec3(0.36, 0.20, 0.08), vec3(0.66, 0.43, 0.18), terrainDetail);
  vec3 surface = mix(ocean, mix(wetLand, dryLand, dryness), landMask);

  if (modeIs(1.0)) {
    landMask *= 0.14;
    surface = mix(vec3(0.006, 0.13, 0.38), vec3(0.018, 0.52, 0.64), terrainDetail);
    surface = mix(surface, vec3(0.24, 0.42, 0.19), landMask);
  }

  if (modeIs(3.0)) {
    float cracks = pow(1.0 - abs(terrainDetail * 2.0 - 1.0), 13.0);
    surface = mix(vec3(0.48, 0.69, 0.78), vec3(0.93, 0.98, 0.99), elevation);
    surface -= vec3(0.13, 0.07, 0.03) * cracks;
    landMask = 1.0;
  }

  if (modeIs(4.0) || modeIs(5.0)) {
    bool mars = modeIs(5.0);
    vec3 lowColor = mars ? vec3(0.36, 0.13, 0.08) : vec3(0.40, 0.23, 0.10);
    vec3 highColor = mars ? vec3(0.76, 0.31, 0.14) : vec3(0.79, 0.51, 0.19);
    surface = mix(lowColor, highColor, elevation) * (0.82 + terrainDetail * 0.26);
    float crater = smoothstep(0.78, 0.92, terrainDetail) * (1.0 - smoothstep(0.55, 0.82, elevation));
    surface *= 1.0 - crater * 0.32;
    if (mars) {
      float polarCap = smoothstep(0.84, 0.96, abs(globe.y) + (terrainDetail - 0.5) * 0.12);
      surface = mix(surface, vec3(0.84, 0.80, 0.71), polarCap);
    }
    landMask = 1.0;
  }

  if (modeIs(6.0)) {
    surface = mix(vec3(0.16, 0.11, 0.13), vec3(0.42, 0.23, 0.11), elevation);
    landMask = 1.0;
  }

  if (modeIs(7.0) || modeIs(8.0) || modeIs(9.0)) {
    vec3 hotOcean = mix(vec3(0.015, 0.09, 0.14), vec3(0.035, 0.31, 0.34), terrainDetail);
    vec3 hotLand = mix(vec3(0.34, 0.19, 0.08), vec3(0.62, 0.35, 0.13), elevation);
    surface = mix(hotOcean, hotLand, landMask);
  }

  if (modeIs(10.0)) {
    float bands = 0.50 + 0.50 * sin(globe.y * 18.0 + terrainLarge * 5.2 + sin(globe.x * 5.0) * 1.3 + u_time * 0.075);
    float tone = clamp(0.48 + (bands - 0.5) * 0.48 + terrainDetail * 0.28, 0.0, 1.0);
    surface = mix(vec3(0.72, 0.49, 0.34), vec3(0.98, 0.86, 0.65), tone);
    landMask = 1.0;
  }

  if (modeIs(11.0)) {
    surface = mix(vec3(0.075, 0.055, 0.05), vec3(0.38, 0.16, 0.075), elevation);
    float crack = pow(1.0 - abs(terrainDetail * 2.0 - 1.0), 14.0);
    float lavaHeat = smoothstep(690.0, 1120.0, u_temperature) * mix(0.66, 1.0, u_geology);
    surface += vec3(1.35, 0.22, 0.015) * crack * lavaHeat * 1.8;
    landMask = 1.0;
  }

  if (modeIs(12.0)) {
    float bands = 0.5 + 0.5 * sin(globe.y * 19.0 + terrainLarge * 5.4 + sin(globe.x * 4.4 + u_time * 0.018) * 1.55 - u_time * 0.055);
    float tone = clamp(0.39 + (bands - 0.5) * 0.38 + terrainDetail * 0.36, 0.0, 1.0);
    surface = mix(vec3(0.72, 0.47, 0.16), vec3(0.99, 0.85, 0.42), tone);
    landMask = 1.0;
  }

  if (modeIs(13.0)) {
    float bands = 0.5 + 0.5 * sin(globe.y * 14.0 + terrainLarge * 5.0 + sin(globe.x * 4.0 - u_time * 0.02) * 1.2 + u_time * 0.045);
    float tone = clamp(0.50 + (bands - 0.5) * 0.32 + terrainDetail * 0.30, 0.0, 1.0);
    surface = mix(vec3(0.50, 0.66, 0.74), vec3(0.87, 0.91, 0.94), tone);
    landMask = 1.0;
  }

  if (modeIs(14.0)) {
    float plates = smoothstep(0.46, 0.62, elevation + (terrainDetail - 0.5) * 0.28);
    float fissures = pow(1.0 - abs(terrainDetail * 2.0 - 1.0), 9.0);
    float moltenFlow = 0.5 + 0.5 * sin(globe.x * 18.0 + globe.y * 11.0 + terrainLarge * 7.0 - u_time * 0.08);
    vec3 lava = mix(vec3(0.72, 0.035, 0.004), vec3(1.55, 0.48, 0.025), clamp(fissures * 0.72 + moltenFlow * 0.32, 0.0, 1.0));
    vec3 crust = mix(vec3(0.025, 0.018, 0.017), vec3(0.15, 0.045, 0.025), terrainDetail);
    surface = mix(lava, crust, plates * (0.46 + 0.32 * smoothstep(1500.0, 2400.0, u_temperature)));
    surface += vec3(1.2, 0.16, 0.008) * fissures * (1.0 - plates) * 0.8;
    landMask = 1.0;
  }

  if (modeIs(2.0)) {
    float polar = smoothstep(0.42, 0.89, abs(globe.y) + (terrainDetail - 0.5) * 0.26) * u_ice * 1.55;
    float spreading = smoothstep(0.89 - u_ice * 0.65, 0.98 - u_ice * 0.24, elevation) * u_ice;
    float iceMask = clamp(max(polar, spreading), 0.0, 1.0);
    surface = mix(surface, mix(vec3(0.53, 0.76, 0.83), vec3(0.91, 0.97, 0.98), terrainDetail), iceMask);
  }

  vec3 cloudGlobe = rotateY(tilted, 1.18 + u_time * (0.016 * u_spin + 0.003));
  float cloudLarge = fbm(cloudGlobe * 5.1 + vec3(0.0, u_time * 0.006, 3.0));
  float cloudFine = fbm(cloudGlobe * 12.0 + vec3(5.0, -u_time * 0.008, 1.0));
  float cloudField = cloudLarge * 0.74 + cloudFine * 0.26;
  float cloudThreshold = mix(0.76, 0.45, clamp(u_cloud, 0.0, 1.0));
  float cloudMask = smoothstep(cloudThreshold, cloudThreshold + 0.12, cloudField);
  float cloudOpacity = clamp(0.10 + u_cloud * 0.72, 0.0, 0.86);
  vec3 cloudColor = vec3(0.81, 0.91, 0.90);

  if (modeIs(4.0) || modeIs(5.0)) {
    cloudOpacity *= modeIs(5.0) ? 0.17 : 0.29;
    cloudColor = vec3(0.83, 0.50, 0.30);
  }
  if (modeIs(6.0)) {
    cloudMask = max(cloudMask, 0.58 + cloudField * 0.30);
    cloudOpacity = 0.42 + u_haze * 0.38;
    cloudColor = vec3(0.69, 0.39, 0.19);
  }
  if (modeIs(7.0)) {
    cloudOpacity = clamp(0.36 + u_cloud * 0.58, 0.0, 0.93);
    cloudColor = vec3(0.89, 0.82, 0.71);
  }
  if (modeIs(8.0)) {
    cloudOpacity = clamp(0.42 + u_cloud * 0.52, 0.0, 0.94);
    cloudColor = vec3(0.86, 0.92, 0.93);
  }
  if (modeIs(9.0)) {
    float steamSwirl = smoothstep(0.40, 0.76, cloudField + u_steam * 0.18);
    cloudMask = max(cloudMask, steamSwirl * (0.68 + u_steam * 0.28));
    cloudOpacity = clamp(0.60 + u_steam * 0.34, 0.0, 0.96);
    cloudColor = mix(vec3(0.90, 0.93, 0.93), vec3(0.90, 0.86, 0.82), u_steam);
  }
  if (modeIs(10.0) || modeIs(13.0)) {
    cloudMask = 1.0;
    cloudOpacity = modeIs(13.0) ? 0.96 : 0.88 + u_steam * 0.10;
    cloudColor = surface;
  }
  if (modeIs(11.0)) {
    cloudOpacity *= 0.08 + u_steam * 0.16;
    cloudColor = vec3(0.59, 0.29, 0.18);
  }
  if (modeIs(12.0)) {
    cloudMask = 1.0;
    cloudOpacity = 0.985;
    cloudColor = surface;
  }
  if (modeIs(14.0)) {
    cloudOpacity *= 0.14 + u_steam * 0.34;
    cloudColor = mix(vec3(0.36, 0.12, 0.06), vec3(0.78, 0.52, 0.33), u_steam);
  }

  vec3 lightDirection = normalize(vec3(-0.76, -0.18, 0.625));
  float light = max(dot(normal, lightDirection), 0.0);
  float ambient = 0.12 + atmosphereStrength * 0.19;
  float illumination = ambient + light * (0.84 + u_flux * 0.12);
  surface *= illumination * (0.90 + terrainDetail * 0.18) * mix(0.90, 1.10, u_albedo);

  vec3 halfVector = normalize(lightDirection + vec3(0.0, 0.0, 1.0));
  float oceanSpecular = pow(max(dot(normal, halfVector), 0.0), 46.0);
  if (modeIs(0.0) || modeIs(1.0) || modeIs(2.0) || modeIs(7.0) || modeIs(8.0) || modeIs(9.0)) {
    surface += vec3(0.50, 0.81, 0.96) * oceanSpecular * (1.0 - landMask) * u_water * (1.0 - cloudMask * cloudOpacity);
  }

  float cloudLight = 0.43 + light * 0.65 + atmosphereStrength * 0.11;
  surface = mix(surface, cloudColor * cloudLight, cloudMask * cloudOpacity);
  float fresnel = pow(1.0 - depth, 2.25);
  float atmosphereBlend = clamp(fresnel * atmosphereStrength * 0.82 + u_haze * (0.12 + fresnel * 0.38), 0.0, 0.82);
  surface = mix(surface, atmosphereColor * (0.40 + light * 0.46), atmosphereBlend);

  if (modeIs(8.0) || modeIs(9.0) || modeIs(10.0) || modeIs(13.0) || modeIs(14.0)) {
    float steamRim = fresnel * clamp(u_steam * 0.75 + atmosphereStrength * 0.20, 0.0, 1.0);
    surface += vec3(0.08, 0.13, 0.16) * steamRim;
  }

  outColor = vec4(pow(max(surface, vec3(0.0)), vec3(0.94)), 1.0);
}
`;

const createWebGLShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create a WebGL2 shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown WebGL2 shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
};

const createWebGLProgram = (gl: WebGL2RenderingContext) => {
  const vertexShader = createWebGLShader(gl, gl.VERTEX_SHADER, WEBGL_VERTEX_SHADER);
  const fragmentShader = createWebGLShader(gl, gl.FRAGMENT_SHADER, WEBGL_FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create the WebGL2 planet program.");
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown WebGL2 link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
};

const renderPlanet = (
  context: CanvasRenderingContext2D,
  sphere: SphereMap,
  maps: TextureMaps,
  settings: VisualSettings,
  elapsed: number,
) => {
  const image = context.createImageData(sphere.width, sphere.height);
  const pixels = image.data;
  const mode = settings.mode;
  const [atmosphereR, atmosphereG, atmosphereB] = atmosphereColor(mode);
  const atmosphereStrength = clamp(0.05 + settings.atmosphere * 0.7 + settings.steam * 0.68 + settings.haze * 0.46, 0.025, 1);
  const rotation = elapsed * 0.011 * settings.spin;
  const cloudRotation = elapsed * (0.016 * settings.spin + 0.003);
  const landThreshold = clamp(0.72 - settings.land * 0.43 + settings.water * 0.08, 0.38, 0.78);
  const dryness = clamp((1 - settings.water) * 0.76 + smoothstep(315, 440, settings.temperature) * 0.58, 0, 1);
  const cloudThreshold = mix(0.75, 0.46, settings.cloud);
  const ambient = 0.12 + atmosphereStrength * 0.19;
  const fluxLight = 0.84 + settings.flux * 0.12;
  const albedoLift = mix(0.9, 1.1, settings.albedo);
  const lavaHeat = smoothstep(690, 1120, settings.temperature) * mix(0.66, 1, settings.geology);

  for (let index = 0; index < sphere.radial.length; index += 1) {
    const radial = sphere.radial[index];
    const pixel = index * 4;

    if (radial > 1) {
      if (radial < 1.18) {
        const halo = Math.exp(-(radial - 1) * 17) * atmosphereStrength * (1 - smoothstep(1.08, 1.18, radial));
        pixels[pixel] = atmosphereR;
        pixels[pixel + 1] = atmosphereG;
        pixels[pixel + 2] = atmosphereB;
        pixels[pixel + 3] = Math.round(clamp(halo * 195, 0, 170));
      }
      continue;
    }

    const longitude = sphere.longitude[index];
    const latitude = sphere.latitude[index];
    const surfaceIndex = textureIndex(maps, longitude, latitude, rotation);
    const cloudIndex = textureIndex(maps, longitude, latitude, cloudRotation + 0.17);
    const terrain = maps.terrain[surfaceIndex];
    const detail = maps.detail[surfaceIndex];
    const cloudField = maps.clouds[cloudIndex];
    const polar = Math.abs(Math.sin(latitude));
    const illumination = ambient + sphere.light[index] * fluxLight;
    let landMask = smoothstep(landThreshold - 0.035, landThreshold + 0.035, terrain);
    let red = 0;
    let green = 0;
    let blue = 0;

    if (mode === 0 || mode === 2) {
      const coast = smoothstep(landThreshold - 0.1, landThreshold + 0.005, terrain) * (1 - landMask);
      red = mix(5, 20, coast + detail * 0.08);
      green = mix(35, 112, coast + detail * 0.08);
      blue = mix(74, 127, coast + detail * 0.08);
      const wetRed = mix(37, 98, detail);
      const wetGreen = mix(91, 111, detail);
      const wetBlue = mix(39, 49, detail);
      const dryRed = mix(102, 163, detail);
      const dryGreen = mix(65, 115, detail);
      const dryBlue = mix(28, 53, detail);
      red = mix(red, mix(wetRed, dryRed, dryness), landMask);
      green = mix(green, mix(wetGreen, dryGreen, dryness), landMask);
      blue = mix(blue, mix(wetBlue, dryBlue, dryness), landMask);
    } else if (mode === 1) {
      landMask *= 0.16;
      red = mix(2, 13, detail);
      green = mix(37, 140, detail);
      blue = mix(94, 174, detail);
      red = mix(red, 83, landMask);
      green = mix(green, 120, landMask);
      blue = mix(blue, 61, landMask);
    } else if (mode === 3) {
      const crack = Math.pow(1 - Math.abs(detail * 2 - 1), 13);
      red = mix(121, 235, terrain) - crack * 33;
      green = mix(176, 247, terrain) - crack * 18;
      blue = mix(199, 250, terrain) - crack * 5;
      landMask = 1;
    } else if (mode === 4 || mode === 5) {
      const mars = mode === 5;
      const crater = smoothstep(0.77, 0.91, detail) * (1 - smoothstep(0.55, 0.83, terrain));
      red = mix(mars ? 92 : 104, mars ? 194 : 201, terrain) * (1 - crater * 0.38);
      green = mix(mars ? 34 : 58, mars ? 78 : 129, terrain) * (1 - crater * 0.32);
      blue = mix(mars ? 22 : 26, mars ? 35 : 49, terrain) * (1 - crater * 0.19);
      const polarCap = mars ? smoothstep(0.84, 0.96, polar + (detail - 0.5) * 0.12) : 0;
      red = mix(red, 218, polarCap);
      green = mix(green, 207, polarCap);
      blue = mix(blue, 184, polarCap);
      landMask = 1;
    } else if (mode === 6) {
      red = mix(42, 105, terrain);
      green = mix(27, 58, terrain);
      blue = mix(31, 35, terrain);
      landMask = 1;
    } else if (mode >= 7 && mode <= 9) {
      const oceanRed = mix(5, 23, detail);
      const oceanGreen = mix(28, 68, detail);
      const oceanBlue = mix(39, 63, detail);
      const landRed = mix(94, 178, terrain);
      const landGreen = mix(43, 91, terrain);
      const landBlue = mix(21, 31, terrain);
      red = mix(oceanRed, landRed, landMask);
      green = mix(oceanGreen, landGreen, landMask);
      blue = mix(oceanBlue, landBlue, landMask);
    } else if (mode === 10) {
      const bandWave = Math.sin(
        latitude * 18
          + cloudField * 5.2
          + detail * 1.8
          + Math.sin(longitude * 2.3 - elapsed * 0.025) * 1.35
          + elapsed * 0.075,
      );
      const bands = clamp(0.48 + bandWave * 0.24 + cloudField * 0.28, 0, 1);
      red = mix(184, 249, bands);
      green = mix(126, 219, bands);
      blue = mix(88, 164, bands);
      landMask = 1;
    } else if (mode === 11) {
      const crack = Math.pow(1 - Math.abs(detail * 2 - 1), 14) * lavaHeat;
      red = mix(25, 103, terrain) + crack * 255;
      green = mix(18, 44, terrain) + crack * 53;
      blue = mix(17, 25, terrain) + crack * 3;
      landMask = 1;
    } else if (mode === 13) {
      const bandWave = Math.sin(
        latitude * 14
          + cloudField * 5
          + Math.sin(longitude * 1.8 - elapsed * 0.02) * 1.2
          + elapsed * 0.045,
      );
      const cloudTone = clamp(0.5 + bandWave * 0.16 + cloudField * 0.3, 0, 1);
      red = mix(128, 222, cloudTone);
      green = mix(169, 232, cloudTone);
      blue = mix(189, 239, cloudTone);
      landMask = 1;
    } else if (mode === 14) {
      const plates = smoothstep(0.46, 0.63, terrain + (detail - 0.5) * 0.28);
      const fissures = Math.pow(1 - Math.abs(detail * 2 - 1), 9);
      const moltenFlow = 0.5 + 0.5 * Math.sin(longitude * 18 + latitude * 11 + terrain * 7 - elapsed * 0.08);
      const glow = clamp(fissures * 0.72 + moltenFlow * 0.32, 0, 1);
      red = mix(mix(184, 255, glow), mix(7, 39, detail), plates * 0.68) + fissures * (1 - plates) * 120;
      green = mix(mix(9, 122, glow), mix(5, 12, detail), plates * 0.68) + fissures * (1 - plates) * 22;
      blue = mix(mix(1, 6, glow), mix(4, 7, detail), plates * 0.68);
      landMask = 1;
    } else {
      const bandWave = Math.sin(
        latitude * 19
          + cloudField * 5.4
          + Math.sin(longitude * 2.1 + elapsed * 0.018) * 1.55
          - elapsed * 0.055,
      );
      const swirl = clamp(cloudField * 0.68 + detail * 0.32, 0, 1);
      const cloudTone = clamp(0.39 + bandWave * 0.19 + swirl * 0.36, 0, 1);
      red = mix(184, 253, cloudTone);
      green = mix(119, 218, cloudTone);
      blue = mix(42, 108, cloudTone);
      landMask = 1;
    }

    if (mode === 2) {
      const iceMask = clamp(
        Math.max(
          smoothstep(0.42, 0.89, polar + (detail - 0.5) * 0.26) * settings.ice * 1.55,
          smoothstep(0.89 - settings.ice * 0.65, 0.98 - settings.ice * 0.24, terrain) * settings.ice,
        ),
        0,
        1,
      );
      red = mix(red, mix(135, 231, detail), iceMask);
      green = mix(green, mix(193, 245, detail), iceMask);
      blue = mix(blue, mix(211, 249, detail), iceMask);
    }

    let cloudMask = smoothstep(cloudThreshold, cloudThreshold + 0.12, cloudField);
    let cloudOpacity = clamp(0.1 + settings.cloud * 0.72, 0, 0.86);
    let cloudRed = 205;
    let cloudGreen = 230;
    let cloudBlue = 229;

    if (mode === 4 || mode === 5) {
      cloudOpacity *= mode === 5 ? 0.17 : 0.29;
      cloudRed = 211;
      cloudGreen = 128;
      cloudBlue = 77;
    } else if (mode === 6) {
      cloudMask = Math.max(cloudMask, 0.58 + cloudField * 0.3);
      cloudOpacity = 0.42 + settings.haze * 0.38;
      cloudRed = 177;
      cloudGreen = 99;
      cloudBlue = 48;
    } else if (mode === 7) {
      cloudOpacity = clamp(0.36 + settings.cloud * 0.58, 0, 0.93);
      cloudRed = 226;
      cloudGreen = 210;
      cloudBlue = 181;
    } else if (mode === 8) {
      cloudOpacity = clamp(0.42 + settings.cloud * 0.52, 0, 0.94);
      cloudRed = 218;
      cloudGreen = 235;
      cloudBlue = 237;
    } else if (mode === 9) {
      const steamSwirl = smoothstep(0.4, 0.76, cloudField + settings.steam * 0.18);
      cloudMask = Math.max(cloudMask, steamSwirl * (0.68 + settings.steam * 0.28));
      cloudOpacity = clamp(0.6 + settings.steam * 0.34, 0, 0.96);
      cloudRed = 230;
      cloudGreen = mix(235, 220, settings.steam);
      cloudBlue = mix(235, 222, settings.steam);
    } else if (mode === 10) {
      cloudMask = 1;
      cloudOpacity = 0.76 + settings.steam * 0.22;
      cloudRed = red;
      cloudGreen = green;
      cloudBlue = blue;
    } else if (mode === 11) {
      cloudOpacity *= 0.08 + settings.steam * 0.16;
      cloudRed = 150;
      cloudGreen = 75;
      cloudBlue = 46;
    } else if (mode === 12) {
      cloudMask = 1;
      cloudOpacity = 0.985;
      cloudRed = red;
      cloudGreen = green;
      cloudBlue = blue;
    } else if (mode === 13) {
      cloudMask = 1;
      cloudOpacity = 0.96;
      cloudRed = red;
      cloudGreen = green;
      cloudBlue = blue;
    } else if (mode === 14) {
      cloudOpacity *= 0.14 + settings.steam * 0.34;
      cloudRed = mix(92, 199, settings.steam);
      cloudGreen = mix(31, 132, settings.steam);
      cloudBlue = mix(15, 84, settings.steam);
    }

    const lit = illumination * (0.9 + detail * 0.18) * albedoLift;
    red *= lit;
    green *= lit;
    blue *= lit;

    if ((mode === 0 || mode === 1 || mode === 2 || (mode >= 7 && mode <= 9)) && settings.water > 0.01) {
      const glint = sphere.specular[index] * (1 - landMask) * settings.water * (1 - cloudMask * cloudOpacity);
      red += 128 * glint;
      green += 207 * glint;
      blue += 244 * glint;
    }

    const cloudLight = 0.43 + sphere.light[index] * 0.65 + atmosphereStrength * 0.11;
    const cloudBlend = cloudMask * cloudOpacity;
    red = mix(red, cloudRed * cloudLight, cloudBlend);
    green = mix(green, cloudGreen * cloudLight, cloudBlend);
    blue = mix(blue, cloudBlue * cloudLight, cloudBlend);

    const fresnel = Math.pow(1 - sphere.depth[index], 2.25);
    const atmosphereBlend = clamp(fresnel * atmosphereStrength * 0.82 + settings.haze * (0.12 + fresnel * 0.38), 0, 0.82);
    red = mix(red, atmosphereR * (0.4 + sphere.light[index] * 0.46), atmosphereBlend);
    green = mix(green, atmosphereG * (0.4 + sphere.light[index] * 0.46), atmosphereBlend);
    blue = mix(blue, atmosphereB * (0.4 + sphere.light[index] * 0.46), atmosphereBlend);

    if ((mode >= 8 && mode <= 10) || mode === 13 || mode === 14) {
      const steamRim = fresnel * clamp(settings.steam * 0.75 + atmosphereStrength * 0.2, 0, 1);
      red += 20 * steamRim;
      green += 34 * steamRim;
      blue += 40 * steamRim;
    }

    const edgeAlpha = 1 - smoothstep(0.99, 1.006, radial);
    pixels[pixel] = Math.round(clamp(red, 0, 255));
    pixels[pixel + 1] = Math.round(clamp(green, 0, 255));
    pixels[pixel + 2] = Math.round(clamp(blue, 0, 255));
    pixels[pixel + 3] = Math.round(edgeAlpha * 255);
  }

  context.clearRect(0, 0, sphere.width, sphere.height);
  context.putImageData(image, 0, 0);
};

export default function PlanetRenderer({
  state,
  ariaLabel,
  temperature,
  mass,
  oceanCoverage,
  liquidWater,
  iceCoverage,
  cloudCover,
  steamPressure,
  atmosphericPressure,
  haze,
  albedo,
  landFraction,
  geology,
  rotationPeriod,
  stellarFlux,
}: PlanetRendererProps) {
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const softwareCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const settings = useMemo<VisualSettings>(() => {
    const liquidPresence = clamp(liquidWater / (liquidWater + 0.12), 0, 1);
    return {
      mode: MODE_BY_STATE[state] ?? 0,
      water: clamp(oceanCoverage * liquidPresence, 0, 1),
      ice: clamp(iceCoverage, 0, 1),
      cloud: clamp(cloudCover, 0, 1),
      steam: clamp(Math.log1p(Math.max(0, steamPressure)) / Math.log(274), 0, 1),
      atmosphere: clamp(Math.log1p(Math.max(0, atmosphericPressure)) / Math.log(101), 0.01, 1),
      haze: clamp(haze, 0, 1),
      albedo: clamp(albedo, 0, 1),
      land: clamp(landFraction, 0, 1),
      geology: clamp(geology / 300, 0, 1),
      temperature,
      spin: clamp(1 / Math.sqrt(Math.max(rotationPeriod, 0.25)), 0.028, 1.8),
      flux: clamp(stellarFlux / 100, 0.3, 2.3),
    };
  }, [albedo, atmosphericPressure, cloudCover, geology, haze, iceCoverage, landFraction, liquidWater, oceanCoverage, rotationPeriod, state, steamPressure, stellarFlux, temperature]);

  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const webglCanvas = webglCanvasRef.current;
    const softwareCanvas = softwareCanvasRef.current;
    const wrapper = wrapperRef.current;
    if (!webglCanvas || !softwareCanvas || !wrapper) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let webglFrame = 0;
    let softwareFrame = 0;
    let webglResizeObserver: ResizeObserver | null = null;
    let softwareResizeObserver: ResizeObserver | null = null;
    let softwareStarted = false;
    const startTime = performance.now();

    const startSoftwareRenderer = () => {
      if (disposed || softwareStarted) return;
      softwareStarted = true;
      wrapper.dataset.renderer = "software";

      const context = softwareCanvas.getContext("2d", { alpha: true });
      if (!context) {
        wrapper.dataset.renderer = "fallback";
        return;
      }

      const maps = createTextureMaps();
      let sphereMap: SphereMap | null = null;
      let lastFrame = -Infinity;
      const frameInterval = reducedMotion ? 250 : 1000 / 18;

      const resizeSoftware = () => {
        const rect = softwareCanvas.getBoundingClientRect();
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
        const target = clamp(Math.round(Math.min(rect.width, rect.height) * pixelRatio), 220, 420);
        if (softwareCanvas.width !== target || softwareCanvas.height !== target) {
          softwareCanvas.width = target;
          softwareCanvas.height = target;
          sphereMap = createSphereMap(target, target);
        }
      };

      const renderSoftware = (now: number) => {
        if (disposed) return;
        resizeSoftware();
        if (sphereMap && now - lastFrame >= frameInterval) {
          const elapsed = reducedMotion ? 4.2 : (now - startTime) / 1000;
          renderPlanet(context, sphereMap, maps, settingsRef.current, elapsed);
          lastFrame = now;
        }
        softwareFrame = requestAnimationFrame(renderSoftware);
      };

      softwareResizeObserver = new ResizeObserver(resizeSoftware);
      softwareResizeObserver.observe(softwareCanvas);
      softwareFrame = requestAnimationFrame(renderSoftware);
    };

    let gl: WebGL2RenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let positionBuffer: WebGLBuffer | null = null;
    let vertexArray: WebGLVertexArrayObject | null = null;
    let webglAvailable = true;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      webglAvailable = false;
      cancelAnimationFrame(webglFrame);
      startSoftwareRenderer();
    };
    webglCanvas.addEventListener("webglcontextlost", handleContextLost);

    try {
      gl = webglCanvas.getContext("webgl2", {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      });
      if (!gl) throw new Error("WebGL2 is unavailable.");

      program = createWebGLProgram(gl);
      positionBuffer = gl.createBuffer();
      vertexArray = gl.createVertexArray();
      if (!positionBuffer || !vertexArray) throw new Error("Unable to allocate WebGL2 geometry.");

      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const positionLocation = gl.getAttribLocation(program, "a_position");
      if (positionLocation < 0) throw new Error("WebGL2 position attribute is unavailable.");
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.useProgram(program);

      const uniform = (name: string) => {
        const location = gl?.getUniformLocation(program, name);
        if (!location) throw new Error(`WebGL2 uniform ${name} is unavailable.`);
        return location;
      };
      const uniforms = {
        resolution: uniform("u_resolution"),
        time: uniform("u_time"),
        mode: uniform("u_mode"),
        water: uniform("u_water"),
        ice: uniform("u_ice"),
        cloud: uniform("u_cloud"),
        steam: uniform("u_steam"),
        atmosphere: uniform("u_atmosphere"),
        haze: uniform("u_haze"),
        albedo: uniform("u_albedo"),
        land: uniform("u_land"),
        geology: uniform("u_geology"),
        temperature: uniform("u_temperature"),
        spin: uniform("u_spin"),
        flux: uniform("u_flux"),
      };

      const resizeWebGL = () => {
        if (!gl) return;
        const rect = webglCanvas.getBoundingClientRect();
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
        const width = clamp(Math.round(rect.width * pixelRatio), 280, 900);
        const height = clamp(Math.round(rect.height * pixelRatio), 280, 900);
        if (webglCanvas.width !== width || webglCanvas.height !== height) {
          webglCanvas.width = width;
          webglCanvas.height = height;
        }
        gl.viewport(0, 0, webglCanvas.width, webglCanvas.height);
      };

      let lastFrame = -Infinity;
      const frameInterval = reducedMotion ? 250 : 1000 / 45;
      const renderWebGL = (now: number) => {
        if (disposed || !webglAvailable || !gl || !program || !vertexArray) return;
        resizeWebGL();
        if (now - lastFrame >= frameInterval) {
          const current = settingsRef.current;
          const elapsed = reducedMotion ? 4.2 : (now - startTime) / 1000;
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(program);
          gl.bindVertexArray(vertexArray);
          gl.uniform2f(uniforms.resolution, webglCanvas.width, webglCanvas.height);
          gl.uniform1f(uniforms.time, elapsed);
          gl.uniform1f(uniforms.mode, current.mode);
          gl.uniform1f(uniforms.water, current.water);
          gl.uniform1f(uniforms.ice, current.ice);
          gl.uniform1f(uniforms.cloud, current.cloud);
          gl.uniform1f(uniforms.steam, current.steam);
          gl.uniform1f(uniforms.atmosphere, current.atmosphere);
          gl.uniform1f(uniforms.haze, current.haze);
          gl.uniform1f(uniforms.albedo, current.albedo);
          gl.uniform1f(uniforms.land, current.land);
          gl.uniform1f(uniforms.geology, current.geology);
          gl.uniform1f(uniforms.temperature, current.temperature);
          gl.uniform1f(uniforms.spin, current.spin);
          gl.uniform1f(uniforms.flux, current.flux);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          lastFrame = now;
        }
        webglFrame = requestAnimationFrame(renderWebGL);
      };

      webglResizeObserver = new ResizeObserver(resizeWebGL);
      webglResizeObserver.observe(webglCanvas);
      wrapper.dataset.renderer = "webgl2";
      webglFrame = requestAnimationFrame(renderWebGL);
    } catch {
      webglAvailable = false;
      startSoftwareRenderer();
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(webglFrame);
      cancelAnimationFrame(softwareFrame);
      webglResizeObserver?.disconnect();
      softwareResizeObserver?.disconnect();
      webglCanvas.removeEventListener("webglcontextlost", handleContextLost);
      if (gl && !gl.isContextLost()) {
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
        if (vertexArray) gl.deleteVertexArray(vertexArray);
        if (program) gl.deleteProgram(program);
      }
    };
  }, []);

  const modeSlug = state.toLowerCase().replace(/₂/g, "2").replace(/[^a-z0-9]+/g, "-");
  const radiusScale = clamp(Math.pow(Math.max(mass, 0.1), 0.12), 0.82, 1.13);
  const style = { "--planet-scale": radiusScale } as CSSProperties;
  const label = ariaLabel ?? `Procedural 3D rendering of a ${state} planet at ${Math.round(temperature)} kelvin`;

  return (
    <div ref={wrapperRef} className={`planet-renderer mode-${modeSlug}`} style={style} role="img" aria-label={label}>
      <span className="planet-fallback" aria-hidden="true" />
      <canvas ref={webglCanvasRef} className="planet-canvas planet-webgl-canvas" aria-hidden="true" />
      <canvas ref={softwareCanvasRef} className="planet-canvas planet-software-canvas" aria-hidden="true" />
    </div>
  );
}
