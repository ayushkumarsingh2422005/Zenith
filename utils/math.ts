// Simple pseudo-random noise generator to avoid external dependencies for this demo
// Based on a simplified permutation table approach suitable for terrain generation

class PseudoNoise {
  private p: number[] = [];
  private perm: number[] = [];

  constructor(seed = 123) {
    this.p = new Array(256);
    for (let i = 0; i < 256; i++) {
      this.p[i] = Math.floor(Math.abs(Math.sin(seed + i)) * 256);
    }
    this.perm = new Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
    }
  }

  private fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number) {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number, z: number) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // 2D Perlin Noise
  noise2D(x: number, y: number) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const A = this.perm[X] + Y;
    const AA = this.perm[A];
    const AB = this.perm[A + 1];
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B];
    const BB = this.perm[B + 1];

    return this.lerp(
      v,
      this.lerp(u, this.grad(this.perm[AA], x, y, 0), this.grad(this.perm[BA], x - 1, y, 0)),
      this.lerp(u, this.grad(this.perm[AB], x, y - 1, 0), this.grad(this.perm[BB], x - 1, y - 1, 0))
    );
  }
}

export const noise = new PseudoNoise(Math.random() * 1000);

export const mapRange = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
) => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
};

// --- Terrain Constants ---
export const AMPLITUDE = 25; // Taller mountains
export const FREQUENCY = 0.012; // Wider, more majestic features
export const WATER_LEVEL = 1.8;
export const SAND_LEVEL = 3.8;
export const GRASS_LEVEL = 14.0;
export const ROCK_LEVEL = 22.0;
export const TREELINE = 18.0;

// --- Shared Terrain Height Function ---
export const getTerrainHeight = (x: number, z: number) => {
    let y = 0;
    // Layered noise for detail
    y += noise.noise2D(x * FREQUENCY, z * FREQUENCY) * AMPLITUDE;
    y += noise.noise2D(x * FREQUENCY * 2.5, z * FREQUENCY * 2.5) * (AMPLITUDE / 4);
    y += noise.noise2D(x * FREQUENCY * 6, z * FREQUENCY * 6) * (AMPLITUDE / 10);
    // Micro details for realism
    y += noise.noise2D(x * FREQUENCY * 15, z * FREQUENCY * 15) * (AMPLITUDE / 30);
    
    // Make valleys flatter
    if (y < 0) y *= 0.6;
    
    return y;
};