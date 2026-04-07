uniform vec3 uColor;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vGlow;

void main() {
  vec3 color = uColor;

  // Emission
  vec3 emissive = uColor * vGlow;

  // Fresnel effect
  vec3 viewDir = normalize(-vPosition);
  float fresnel = pow(1.0 - dot(vNormal, viewDir), 2.0);

  vec3 finalColor = color + emissive * fresnel;

  gl_FragColor = vec4(finalColor, 0.85);
}
