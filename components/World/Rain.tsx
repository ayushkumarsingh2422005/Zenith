import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame, useThree, ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

interface RainProps {
  weatherRef: React.MutableRefObject<{
    windSpeed: number;
    rainIntensity: number;
    fogDensity: number;
    lightIntensity: number;
    windDirection: THREE.Vector3;
  }>;
}

const DROP_COUNT = 8000;

export const Rain: React.FC<RainProps> = ({ weatherRef }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  
  // Static rain drop geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    // A simple line segment for each drop
    const positions = new Float32Array([
      0, 0, 0,
      0, -0.8, 0
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  // Material
  const material = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
  }, []);

  // Initial random positions
  const drops = useMemo(() => {
    return new Array(DROP_COUNT).fill(0).map(() => ({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * 200,
        Math.random() * 120,
        (Math.random() - 0.5) * 200
      ),
      speed: 1.5 + Math.random() * 1.5
    }));
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Visibility Check
    // If rain intensity is near zero, hide the mesh to save draw calls
    if (weatherRef.current.rainIntensity < 0.01) {
       meshRef.current.visible = false;
       return;
    }
    meshRef.current.visible = true;

    // Update opacity based on intensity
    // We can't easily update material opacity per frame without cloning, 
    // so we'll just let it be constant or check if we want to animate it.
    // For now, let's keep it simple. The density of visible drops creates the effect.
    
    // Animate Drops
    const wind = weatherRef.current.windDirection.clone().multiplyScalar(weatherRef.current.windSpeed * 0.5);
    const rainSpeedGlobal = 60 * delta; // Falling speed

    drops.forEach((drop, i) => {
      // Move drop
      drop.pos.y -= drop.speed * rainSpeedGlobal;
      drop.pos.addScaledVector(wind, delta * 10);

      // Wrap around logic relative to CAMERA to create infinite rain field
      // We calculate relative position to camera
      const relX = drop.pos.x - camera.position.x;
      const relZ = drop.pos.z - camera.position.z;

      // Wrap X
      if (relX > 100) drop.pos.x -= 200;
      if (relX < -100) drop.pos.x += 200;
      
      // Wrap Z
      if (relZ > 100) drop.pos.z -= 200;
      if (relZ < -100) drop.pos.z += 200;

      // Reset Y
      if (drop.pos.y < 0) {
        drop.pos.y = 100 + Math.random() * 20;
        // Re-randomize x/z slightly to break patterns
        drop.pos.x = camera.position.x + (Math.random() - 0.5) * 200;
        drop.pos.z = camera.position.z + (Math.random() - 0.5) * 200;
      }
      
      // Update Matrix
      dummy.position.copy(drop.pos);
      
      // Rotate to match wind direction (slant)
      // Basic approach: point down, tilt by wind
      const target = drop.pos.clone().add(new THREE.Vector3(wind.x, -10, wind.z));
      dummy.lookAt(target);
      
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    
    // Scale the count of drawn instances based on intensity to control density
    meshRef.current.count = Math.floor(DROP_COUNT * weatherRef.current.rainIntensity);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, DROP_COUNT]}
    />
  );
};
