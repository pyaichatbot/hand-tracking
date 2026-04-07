uniform float uTime;
uniform float uLineCount;
uniform vec3 uColor;

varying vec2 vUv;

void main() {
  // Horizontal scan lines
  float line = mod(vUv.y * uLineCount + uTime * 2.0, 1.0);
  float scanLine = smoothstep(0.0, 0.1, line) * smoothstep(0.3, 0.1, line);

  // Slight wave
  float wave = sin(vUv.x * 3.14 + uTime) * 0.1;
  scanLine += wave;

  vec3 color = uColor * scanLine;

  gl_FragColor = vec4(color, 0.7);
}
