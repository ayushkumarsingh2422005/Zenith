import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { ThreeElements, useFrame } from '@react-three/fiber';
import { getTerrainHeight, WATER_LEVEL, TREELINE } from '../../utils/math';

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

// Configuration
const TREES_PER_CHUNK = 150; // Density per chunk

interface NatureChunkProps {
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

interface TreeData {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  rotationY: number;
  tiltX: number;
  tiltZ: number;
  leafColor: THREE.Color;
  trunkColor: THREE.Color;
  phase: number; // For wind variation
}

// Helper to manually merge geometries for complex shapes without external libs
const mergeGeometries = (geometries: THREE.BufferGeometry[]) => {
  const mergedGeometry = new THREE.BufferGeometry();
  
  const posArr = [];
  const normArr = [];
  const indexArr = [];
  let indexOffset = 0;

  for (const geo of geometries) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const index = geo.index;

    if (!pos || !norm || !index) continue;

    for (let i = 0; i < pos.count; i++) {
      posArr.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normArr.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }

    for (let i = 0; i < index.count; i++) {
      indexArr.push(index.getX(i) + indexOffset);
    }

    indexOffset += pos.count;
  }

  mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normArr, 3));
  mergedGeometry.setIndex(indexArr);

  return mergedGeometry;
};

export const NatureChunk: React.FC<NatureChunkProps> = React.memo(({ chunkX, chunkZ, size, weatherRef }) => {
  const leavesRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  
  // Geometry Construction - REALISTIC PINE TREE
  const { leavesGeometry, trunkGeometry } = useMemo(() => {
    // 1. Trunk: Tapered cylinder, slightly rougher
    const trunk = new THREE.CylinderGeometry(0.15, 0.4, 2.5, 7); 
    trunk.translate(0, 1.25, 0); 

    // 2. Leaves: 3 Stacked Cones for a Fir/Pine look
    const segments = 9; // Low-ish poly but smooth enough
    
    // Bottom Layer (Wide)
    const bottomGeo = new THREE.ConeGeometry(1.6, 2.5, segments);
    bottomGeo.translate(0, 2.5, 0); // Sit on top of trunk base

    // Middle Layer
    const midGeo = new THREE.ConeGeometry(1.2, 2.2, segments);
    midGeo.translate(0, 3.8, 0); // Overlap

    // Top Layer (Narrow)
    const topGeo = new THREE.ConeGeometry(0.8, 1.8, segments);
    topGeo.translate(0, 5.0, 0); // Peak

    const leaves = mergeGeometries([bottomGeo, midGeo, topGeo]);

    return { leavesGeometry: leaves, trunkGeometry: trunk };
  }, []);

  // Reusable object for matrix calculations
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  // Generate Static Tree Data
  const treeData = useMemo(() => {
    const data: TreeData[] = [];
    
    // Seed randomness based on chunk coordinates
    let seed = chunkX * 43758.5453 + chunkZ * 23421.6543;
    const random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    let count = 0;
    // Try to place trees
    for (let i = 0; i < TREES_PER_CHUNK * 2.5; i++) {
        if (count >= TREES_PER_CHUNK) break;

        const lx = (random() - 0.5) * size;
        const lz = (random() - 0.5) * size;
        const absX = (chunkX * size) + lx;
        const absZ = (chunkZ * size) + lz;

        const y = getTerrainHeight(absX, absZ);

        // Placement Rules
        if (y > WATER_LEVEL + 0.5 && y < TREELINE) {
            // Randomly skip for clearings (noise based for natural clustering)
            // Using coordinate based hash for clustering consistency
            const clusterNoise = Math.sin(absX * 0.05) * Math.cos(absZ * 0.05);
            if (clusterNoise < -0.2) continue; // Clearings
            if (random() > 0.75) continue; // Random sparsity

            const position = new THREE.Vector3(lx, y - 0.3, lz);
            
            // Scale - More variation for realism
            const baseScale = 0.7 + random() * 1.0;
            const heightMult = 0.8 + random() * 0.4;
            const scale = new THREE.Vector3(baseScale, baseScale * heightMult, baseScale);
            
            // Rotation
            const rotationY = random() * Math.PI * 2;
            const tiltX = (random() - 0.5) * 0.15; // Slightly more tilt for uneven ground
            const tiltZ = (random() - 0.5) * 0.15;

            // Colors - Deep Forest Greens
            const leafColor = new THREE.Color();
            // Darker, bluish-green (Pine/Fir)
            leafColor.setHSL(0.35 + random() * 0.08, 0.4 + random() * 0.2, 0.1 + random() * 0.15);
            
            const trunkColor = new THREE.Color();
            trunkColor.setHSL(0.07 + random() * 0.03, 0.2, 0.12 + random() * 0.05);

            data.push({
                position,
                scale,
                rotationY,
                tiltX,
                tiltZ,
                leafColor,
                trunkColor,
                phase: random() * Math.PI * 2
            });
            
            count++;
        }
    }
    return data;
  }, [chunkX, chunkZ, size]);

  // Apply colors once (they don't animate)
  useLayoutEffect(() => {
    if (!leavesRef.current || !trunkRef.current) return;

    treeData.forEach((d, i) => {
        leavesRef.current!.setColorAt(i, d.leafColor);
        trunkRef.current!.setColorAt(i, d.trunkColor);
    });
    
    if (leavesRef.current.instanceColor) leavesRef.current.instanceColor.needsUpdate = true;
    if (trunkRef.current.instanceColor) trunkRef.current.instanceColor.needsUpdate = true;
  }, [treeData]);

  // Animate: Wind Sway
  useFrame((state) => {
    if (!leavesRef.current || !trunkRef.current) return;

    const t = state.clock.elapsedTime;
    const windStrength = weatherRef.current.windSpeed;
    const windDir = weatherRef.current.windDirection;

    // Use windSpeed to determine frequency and amplitude
    const globalWindTime = t * (0.8 + windStrength * 0.5); 
    const baseAmp = 0.05 + windStrength * 0.1; // More bend in storm

    treeData.forEach((d, i) => {
        // Wind Simulation
        // Combine a global direction wave with local noise and individual phase
        // Using windDir for general direction bias
        const windX = Math.sin(globalWindTime + d.position.x * 0.05 + d.phase) * baseAmp * windDir.x;
        const windZ = Math.cos(globalWindTime * 0.7 + d.position.z * 0.05) * baseAmp * windDir.z;
        
        // Add gust turbulence
        const turbulence = Math.sin(globalWindTime * 2.5 + d.phase) * (0.01 + windStrength * 0.02);

        tempObject.position.copy(d.position);
        tempObject.scale.copy(d.scale);

        // Apply Base Rotation + Wind Sway
        // We rotate the entire object (trunk + leaves) slightly around the base
        tempObject.rotation.set(
            d.tiltX + (windZ + turbulence) * 0.5, // Lean into Z
            d.rotationY,
            d.tiltZ + (windX + turbulence) * 0.5  // Lean into X
        );

        tempObject.updateMatrix();

        // Update matrices
        leavesRef.current!.setMatrixAt(i, tempObject.matrix);
        trunkRef.current!.setMatrixAt(i, tempObject.matrix);
    });

    leavesRef.current.instanceMatrix.needsUpdate = true;
    trunkRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
        {/* Render Trunks */}
        <instancedMesh
            ref={trunkRef}
            args={[trunkGeometry, undefined, treeData.length]}
            castShadow
            receiveShadow
        >
            <meshStandardMaterial roughness={1.0} color="#3e3025" />
        </instancedMesh>

        {/* Render Leaves - Use flat shading for low-poly stylized realism */}
        <instancedMesh
            ref={leavesRef}
            args={[leavesGeometry, undefined, treeData.length]}
            castShadow
            receiveShadow
        >
            <meshStandardMaterial 
              roughness={0.9} 
              color="#2d3a25" 
              flatShading 
            />
        </instancedMesh>
    </group>
  );
});
