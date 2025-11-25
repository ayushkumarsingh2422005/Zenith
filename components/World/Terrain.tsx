import React, { useMemo, useState, useRef } from 'react';
import * as THREE from 'three';
import { ThreeElements, useFrame } from '@react-three/fiber';
import { noise, getTerrainHeight, WATER_LEVEL, SAND_LEVEL, ROCK_LEVEL } from '../../utils/math';
import { NatureChunk } from './Nature';

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

interface TerrainChunkProps {
  chunkX: number;
  chunkZ: number;
  size: number;
  weatherRef: React.MutableRefObject<{
    windSpeed: number;
    rainIntensity: number;
    fogDensity: number;
    lightIntensity: number;
    windDirection: THREE.Vector3;
  }>;
}

const TerrainChunk: React.FC<TerrainChunkProps> = React.memo(({ chunkX, chunkZ, size, weatherRef }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const segments = 128; // Increased for hyper-realism (smoother curves)

  const { geometry, colors } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const count = geo.attributes.position.count;
    const positions = geo.attributes.position;
    const colorsArr = new Float32Array(count * 3);

    const colorWater = new THREE.Color('#2a4c5e');
    const colorSand = new THREE.Color('#8a7f6b');
    const colorGrass = new THREE.Color('#3d542d');
    const colorDarkGrass = new THREE.Color('#2a3d20');
    const colorRock = new THREE.Color('#4a4a4d');
    const colorDarkRock = new THREE.Color('#363638');
    const colorSnow = new THREE.Color('#f0f0f5');

    // Calculate world offset
    const offsetX = chunkX * size;
    const offsetZ = chunkZ * size;

    // 1. Set Heights
    for (let i = 0; i < count; i++) {
      const px = positions.getX(i);
      const pz = positions.getZ(i);
      const worldX = px + offsetX;
      const worldZ = pz + offsetZ;
      const y = getTerrainHeight(worldX, worldZ);
      positions.setY(i, y);
    }

    // 2. Compute Normals to detect slope
    geo.computeVertexNormals();
    const normals = geo.attributes.normal;

    // 3. Set Colors based on Height AND Slope
    for (let i = 0; i < count; i++) {
      const px = positions.getX(i);
      const pz = positions.getZ(i);
      const worldX = px + offsetX;
      const worldZ = pz + offsetZ;
      const y = positions.getY(i);
      
      // Normal Y component: 1 = flat up, 0 = vertical cliff
      const ny = normals.getY(i); 

      let finalColor = new THREE.Color();

      // Noise for variation
      const n = noise.noise2D(worldX * 0.15, worldZ * 0.15);
      const microN = noise.noise2D(worldX * 0.8, worldZ * 0.8);

      if (y < WATER_LEVEL - 1) {
        finalColor.copy(colorSand).multiplyScalar(0.7); // Deep underwater
      } else if (y < WATER_LEVEL + 0.5) {
        finalColor.copy(colorSand);
      } else {
        // Slope based logic
        // If normal is too steep, it's rock regardless of height (unless underwater)
        if (ny < 0.65) { 
           finalColor.copy(n > 0 ? colorRock : colorDarkRock);
           // Add some noise to rock color
           finalColor.multiplyScalar(0.9 + microN * 0.2);
        } else {
            // Flat terrain logic
            if (y < SAND_LEVEL) {
                finalColor.copy(colorSand).lerp(colorGrass, 0.3);
            } else if (y < ROCK_LEVEL) {
                // Grass blend
                finalColor.copy(n > 0.2 ? colorGrass : colorDarkGrass);
                // Mix in some dirt/rock on "semi-steep" areas
                if (ny < 0.85) finalColor.lerp(colorRock, 0.4);
            } else {
                // High altitude: Snow
                // Fade snow in based on height and noise
                const snowThreshold = ROCK_LEVEL + n * 5;
                if (y > snowThreshold) {
                    finalColor.copy(colorSnow);
                } else {
                     finalColor.copy(colorDarkRock);
                }
            }
        }
      }

      colorsArr[i * 3] = finalColor.r;
      colorsArr[i * 3 + 1] = finalColor.g;
      colorsArr[i * 3 + 2] = finalColor.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));

    return { geometry: geo, colors: colorsArr };
  }, [chunkX, chunkZ, size]);

  return (
    <group position={[chunkX * size, 0, chunkZ * size]}>
      <mesh ref={meshRef} geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.9} // High roughness for terrain
          metalness={0.05}
          // Flat shading disabled for realistic smooth lighting
        />
      </mesh>
      {/* Attach nature for this chunk */}
      <NatureChunk chunkX={chunkX} chunkZ={chunkZ} size={size} weatherRef={weatherRef} />
    </group>
  );
});

interface InfiniteWorldProps {
  viewerPosition: React.MutableRefObject<THREE.Vector3>;
  weatherRef: React.MutableRefObject<{
    windSpeed: number;
    rainIntensity: number;
    fogDensity: number;
    lightIntensity: number;
    windDirection: THREE.Vector3;
  }>;
}

export const InfiniteWorld: React.FC<InfiniteWorldProps> = ({ viewerPosition, weatherRef }) => {
  const CHUNK_SIZE = 200;
  // Increase render distance to 2 (5x5 grid) to ensure terrain exists beyond fog
  const RENDER_DISTANCE = 2; 

  const [visibleChunks, setVisibleChunks] = useState<{x: number, z: number}[]>([]);

  useFrame(() => {
    // Determine which chunk the viewer is in
    const currentChunkX = Math.round(viewerPosition.current.x / CHUNK_SIZE);
    const currentChunkZ = Math.round(viewerPosition.current.z / CHUNK_SIZE);

    // Check if we need to update
    const needsUpdate = visibleChunks.length === 0 || 
       !visibleChunks.some(c => c.x === currentChunkX && c.z === currentChunkZ);

    if (true) { // Always recalculate range, let React.memo handle the DOM diffing
       const newChunks = [];
       for (let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
         for (let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
           newChunks.push({ x: currentChunkX + x, z: currentChunkZ + z });
         }
       }
       
       // Only set state if the key signature changes to prevent render loop
       const currentKey = visibleChunks.map(c => `${c.x},${c.z}`).join('|');
       const newKey = newChunks.map(c => `${c.x},${c.z}`).join('|');
       
       if (currentKey !== newKey) {
          setVisibleChunks(newChunks);
       }
    }
  });

  return (
    <group>
      {visibleChunks.map(chunk => (
        <TerrainChunk 
          key={`${chunk.x}-${chunk.z}`} 
          chunkX={chunk.x} 
          chunkZ={chunk.z} 
          size={CHUNK_SIZE} 
          weatherRef={weatherRef}
        />
      ))}
    </group>
  );
};
