import { BufferGeometry, Float32BufferAttribute } from 'three';

export const MARK_SIX = 'MARK SIX';

// Follow the circular wall or tapered pedestal. U goes from the reader's left to right.
export function letteringSurface(width, height, bottomRadius, topRadius, inside = false) {
  const positions = [], uvs = [], indices = [];
  const segments = 64;
  const arc = width / ((bottomRadius + topRadius) / 2);
  for (const row of [0, 1]) {
    const radius = row ? topRadius : bottomRadius;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const theta = (u - 0.5) * arc;
      positions.push(radius * Math.sin(theta), (row - 0.5) * height,
        (inside ? -1 : 1) * radius * Math.cos(theta));
      uvs.push(u, row);
      if (row === 0 && i < segments) {
        const top = segments + 1 + i;
        indices.push(i, i + 1, top, i + 1, top + 1, top);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
