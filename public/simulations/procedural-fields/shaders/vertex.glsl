uniform float uTime;
uniform float uSpeed;
attribute vec3 instanceOffset;
void main() {
  vec3 transformed = position + instanceOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
