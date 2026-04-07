uniform float uTime;
uniform float uGlowIntensity;

varying vec3 vNormal;
varying vec3 vPosition;
varying float vGlow;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = vec3(modelViewMatrix * vec4(position, 1.0));

  // Glow based on angle to camera
  vGlow = pow(abs(dot(vNormal, normalize(vPosition))), 1.5);
  vGlow *= uGlowIntensity;

  gl_Position = projectionMatrix * vec4(vPosition, 1.0);
}
