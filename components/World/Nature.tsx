import React, { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { getTerrainHeight, WATER_LEVEL, TREELINE } from '../../utils/math';

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
  phase: number; // For wind variation
}

export const NatureChunk: React.FC<NatureChunkProps> = React.memo(({ chunkX, chunkZ, size, weatherRef }) => {
  const treeMeshRef = useRef<THREE.InstancedMesh>(null);
  
  // Load the GLTF tree model
  const { scene: treeScene } = useGLTF('/tree/scene.gltf');
  
  // Extract geometry and materials from the GLTF model for instancing
  const { treeGeometry, treeMaterials } = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    
    // Traverse the tree scene to find all meshes
    treeScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Clone geometry and apply world transform
        const geo = child.geometry.clone();
        if (child.matrixWorld.determinant() !== 0) {
          geo.applyMatrix4(child.matrixWorld);
        }
        geometries.push(geo);
        
        // Collect materials
        if (child.material) {
          if (Array.isArray(child.material)) {
            materials.push(...child.material.map(m => m.clone()));
          } else {
            materials.push(child.material.clone());
          }
        }
      }
    });
    
    // Merge all geometries into one
    let finalGeometry: THREE.BufferGeometry;
    if (geometries.length === 0) {
      // Fallback if no geometry found
      finalGeometry = new THREE.BoxGeometry(1, 2, 1);
    } else if (geometries.length === 1) {
      finalGeometry = geometries[0];
    } else {
      // Merge multiple geometries
      const merged = new THREE.BufferGeometry();
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      let vertexOffset = 0;
      
      geometries.forEach((geo) => {
        geo.computeVertexNormals(); // Ensure normals exist
        const pos = geo.attributes.position;
        const norm = geo.attributes.normal;
        const uv = geo.attributes.uv;
        const index = geo.index;
        
        if (pos) {
          for (let i = 0; i < pos.count; i++) {
            positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
            if (norm && i < norm.count) {
              normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
            }
            if (uv && uv.count > 0 && i < uv.count) {
              uvs.push(uv.getX(i), uv.getY(i));
            } else if (uvs.length < positions.length / 3 * 2) {
              // Fill missing UVs with 0
              uvs.push(0, 0);
            }
          }
        }
        
        if (index) {
          for (let i = 0; i < index.count; i++) {
            indices.push(index.getX(i) + vertexOffset);
          }
          vertexOffset += pos ? pos.count : 0;
        } else if (pos) {
          // No index, create triangles
          for (let i = 0; i < pos.count - 2; i++) {
            indices.push(vertexOffset + i, vertexOffset + i + 1, vertexOffset + i + 2);
          }
          vertexOffset += pos.count;
        }
      });
      
      merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      if (normals.length === positions.length) {
        merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      } else {
        merged.computeVertexNormals();
      }
      if (uvs.length === positions.length / 3 * 2) {
        merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      }
      if (indices.length > 0) {
        merged.setIndex(indices);
      }
      
      finalGeometry = merged;
    }
    
    // Use the first material or create a default one
    const finalMaterial = materials.length > 0 ? materials[0] : new THREE.MeshStandardMaterial({ color: 0x4a5d2f });
    
    return { treeGeometry: finalGeometry, treeMaterials: finalMaterial };
  }, [treeScene]);

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
            
            // Scale - Much smaller to fit with the terrain (reduced by 5-10x)
            // Original scale was 0.7-1.7, now 0.07-0.17 (10x smaller) or 0.14-0.34 (5x smaller)
            // Using ~7x reduction for a good balance
            const baseScale = (0.7 + random() * 1.0) / 7;
            const heightMult = 0.8 + random() * 0.4;
            const scale = new THREE.Vector3(baseScale, baseScale * heightMult, baseScale);
            
            // Rotation
            const rotationY = random() * Math.PI * 2;
            const tiltX = (random() - 0.5) * 0.15; // Slightly more tilt for uneven ground
            const tiltZ = (random() - 0.5) * 0.15;

            data.push({
                position,
                scale,
                rotationY,
                tiltX,
                tiltZ,
                phase: random() * Math.PI * 2
            });
            
            count++;
        }
    }
    return data;
  }, [chunkX, chunkZ, size]);

  // Animate: Wind Sway
  useFrame((state) => {
    if (!treeMeshRef.current) return;

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

        // Update matrix for the tree instance
        treeMeshRef.current!.setMatrixAt(i, tempObject.matrix);
    });

    treeMeshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={treeMeshRef}
      args={[treeGeometry, treeMaterials, treeData.length]}
      castShadow
      receiveShadow
    />
  );
});