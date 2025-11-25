import React, { useRef, useMemo } from 'react';
import { useFrame, ThreeElements, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getTerrainHeight } from '../../utils/math';
import { noise } from '../../utils/math';

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

interface FlockProps {
  onFlockUpdate?: (center: THREE.Vector3, velocity: THREE.Vector3) => void;
  weatherRef: React.MutableRefObject<{
    windSpeed: number;
    rainIntensity: number;
    fogDensity: number;
    lightIntensity: number;
    windDirection: THREE.Vector3;
  }>;
}

const BIRD_COUNT = 100;

export const Flock: React.FC<FlockProps> = ({ onFlockUpdate, weatherRef }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const flockCenterRef = useRef(new THREE.Vector3());
  const flockVelocityRef = useRef(new THREE.Vector3());
  const { camera } = useThree();
  
  // Initialize birds
  const birds = useMemo(() => {
    return new Array(BIRD_COUNT).fill(0).map((_, i) => {
      const x = (Math.random() - 0.5) * 100;
      const z = (Math.random() - 0.5) * 100;
      const y = 40 + Math.random() * 20;
      
      return {
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)
          .normalize()
          .multiplyScalar(0.5),
        acceleration: new THREE.Vector3()
      };
    });
  }, []);

  const tempObject = new THREE.Object3D();
  // Wander target is now relative or continuously moving
  const wanderTarget = useRef(new THREE.Vector3(0, 50, 0));
  const wanderAngle = useRef(0);

  useFrame((state) => {
    if (!meshRef.current) return;

    const t = state.clock.getElapsedTime();
    const weather = weatherRef.current;
    
    // Calculate local camera position for interaction
    // We clone to avoid mutating the actual camera position
    const localCameraPos = camera.position.clone();
    meshRef.current.worldToLocal(localCameraPos);
    
    // ENDLESS WANDER LOGIC
    const currentHeading = flockVelocityRef.current.clone().normalize();
    if (currentHeading.lengthSq() === 0) currentHeading.set(0, 0, 1);

    // Evolve the wander angle smoothly using noise
    const noiseVal = noise.noise2D(t * 0.1, 0); // -1 to 1
    wanderAngle.current += noiseVal * 0.05; // Turn speed

    // Project target forward from center
    const projectionDist = 80;
    const forwardX = Math.sin(wanderAngle.current) * projectionDist;
    const forwardZ = Math.cos(wanderAngle.current) * projectionDist;
    
    // Update target position based on flock center and terrain height
    const targetX = flockCenterRef.current.x + forwardX;
    const targetZ = flockCenterRef.current.z + forwardZ;
    const targetTerrainHeight = getTerrainHeight(targetX, targetZ);
    
    // Fly lower: Target is now much closer to terrain height (approx tree height level)
    // Trees are approx 4-6 units high. We target around 8-15 units.
    // In STORM (high wind), fly lower to avoid wind shear
    const stormDampener = Math.max(0, (weather.windSpeed - 1) * 3); // 0 to ~6
    const flyHeightParams = (Math.sin(t * 0.2) * 5 + 8) - stormDampener; 
    const clampedHeight = Math.max(5, flyHeightParams); // Don't go underground

    wanderTarget.current.set(
        targetX, 
        targetTerrainHeight + clampedHeight, 
        targetZ
    );

    // Simulation Constants
    const perceptionRadius = 15; // Reduced slightly for tighter formations near obstacles
    const separationDistance = 4;
    const maxSpeed = 0.8;
    const minSpeed = 0.4;
    const maxForce = 0.03;

    // Force Weights
    const separationWeight = 3.5;
    const alignmentWeight = 1.0;
    const cohesionWeight = 1.0;
    const seekWeight = 0.6; 
    const avoidanceWeight = 12.0;
    const canopyWeight = 8.0;
    
    // Camera Interaction Constants
    const cameraRepulsionRadius = 25; // Distance at which birds start reacting
    const cameraRepulsionWeight = 10.0; // Strong impulse to scatter

    // Reset flock stats for camera tracking
    flockCenterRef.current.set(0, 0, 0);
    flockVelocityRef.current.set(0, 0, 0);

    // Physics Loop
    for (let i = 0; i < BIRD_COUNT; i++) {
      const bird = birds[i];
      bird.acceleration.set(0, 0, 0);

      // --- WEATHER EFFECT: WIND FORCE ---
      // Apply global wind drift
      if (weather.windSpeed > 1.2) {
          const windForce = weather.windDirection.clone().multiplyScalar((weather.windSpeed - 1) * 0.005);
          bird.acceleration.add(windForce);
      }

      let separation = new THREE.Vector3();
      let alignment = new THREE.Vector3();
      let cohesion = new THREE.Vector3();
      let total = 0;

      for (let j = 0; j < BIRD_COUNT; j++) {
        if (i !== j) {
          const other = birds[j];
          const distSq = bird.position.distanceToSquared(other.position);

          if (distSq < perceptionRadius * perceptionRadius) {
            const dist = Math.sqrt(distSq);
            
            // Separation
            if (dist < separationDistance) {
              const diff = new THREE.Vector3().subVectors(bird.position, other.position);
              diff.normalize().divideScalar(dist);
              separation.add(diff);
            }

            // Alignment
            alignment.add(other.velocity);

            // Cohesion
            cohesion.add(other.position);

            total++;
          }
        }
      }

      if (total > 0) {
        separation.divideScalar(total);
        alignment.divideScalar(total);
        cohesion.divideScalar(total);

        if (separation.lengthSq() > 0) {
            separation.normalize().multiplyScalar(maxSpeed).sub(bird.velocity).clampLength(0, maxForce).multiplyScalar(separationWeight);
        }
        
        alignment.normalize().multiplyScalar(maxSpeed).sub(bird.velocity).clampLength(0, maxForce).multiplyScalar(alignmentWeight);
        
        cohesion.sub(bird.position).normalize().multiplyScalar(maxSpeed).sub(bird.velocity).clampLength(0, maxForce).multiplyScalar(cohesionWeight);
      }

      bird.acceleration.add(separation);
      bird.acceleration.add(alignment);
      bird.acceleration.add(cohesion);

      // Seek Wander Target
      const seekDir = new THREE.Vector3().subVectors(wanderTarget.current, bird.position);
      if (seekDir.lengthSq() > 0) {
        seekDir.normalize().multiplyScalar(maxSpeed).sub(bird.velocity).clampLength(0, maxForce).multiplyScalar(seekWeight);
        bird.acceleration.add(seekDir);
      }
      
      // Camera Avoidance
      const distToCamSq = bird.position.distanceToSquared(localCameraPos);
      if (distToCamSq < cameraRepulsionRadius * cameraRepulsionRadius) {
          const dist = Math.sqrt(distToCamSq);
          const repulsionDir = new THREE.Vector3().subVectors(bird.position, localCameraPos);
          
          const strength = Math.pow(1.0 - dist / cameraRepulsionRadius, 2); 
          
          repulsionDir.normalize().multiplyScalar(strength * cameraRepulsionWeight);
          bird.acceleration.add(repulsionDir);
      }

      // --- ADVANCED TERRAIN & OBSTACLE AVOIDANCE ---

      const currentY = bird.position.y;
      
      // 1. Horizontal Probing (Steering around Mountains)
      const lookAheadDist = 20;
      const velNorm = bird.velocity.clone().normalize();
      
      // Create left and right feelers (rotated +/- 30 degrees)
      const leftFeelerDir = velNorm.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
      const rightFeelerDir = velNorm.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.5);
      
      const probeCenter = bird.position.clone().add(velNorm.multiplyScalar(lookAheadDist));
      const probeLeft = bird.position.clone().add(leftFeelerDir.multiplyScalar(lookAheadDist));
      const probeRight = bird.position.clone().add(rightFeelerDir.multiplyScalar(lookAheadDist));
      
      const hCenter = getTerrainHeight(probeCenter.x, probeCenter.z);
      const hLeft = getTerrainHeight(probeLeft.x, probeLeft.z);
      const hRight = getTerrainHeight(probeRight.x, probeRight.z);
      
      // If the direct path leads into a mountain (terrain higher than us or very close)
      if (hCenter > currentY - 5) {
        const steerForce = new THREE.Vector3();
        
        // Check which side is clearer
        if (hLeft < hRight) {
             // Left is safer, steer left (add force perpendicular to velocity towards left)
             // Cross UP with Velocity = Left direction
             const leftDir = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), bird.velocity).normalize();
             steerForce.add(leftDir);
        } else {
             // Right is safer
             const rightDir = new THREE.Vector3().crossVectors(bird.velocity, new THREE.Vector3(0,1,0)).normalize();
             steerForce.add(rightDir);
        }
        
        // Also add some upward force to climb over if needed
        steerForce.y = 0.5;
        
        bird.acceleration.add(steerForce.normalize().multiplyScalar(avoidanceWeight * 1.5));
      }

      // 2. Vertical Floor Avoidance (Ground Collision)
      const groundHeightBelow = getTerrainHeight(bird.position.x, bird.position.z);
      const clearance = currentY - groundHeightBelow;

      if (clearance < 4) {
         const pushUp = new THREE.Vector3(0, 1, 0);
         const strength = Math.pow((4 - clearance), 2) * 0.5; 
         bird.acceleration.add(pushUp.multiplyScalar(strength * avoidanceWeight));
      }

      // 3. Tree Canopy Weaving
      // Trees generally exist between WATER_LEVEL (1.8) and TREELINE (18.0)
      // They are roughly 4-8 units tall.
      if (groundHeightBelow > 2 && groundHeightBelow < 18 && clearance < 8) {
         // We are in the "Tree Zone". Check if this spot actually has trees (using same noise as NatureChunk)
         const clusterNoise = Math.sin(bird.position.x * 0.05) * Math.cos(bird.position.z * 0.05);
         
         // NatureChunk places trees if clusterNoise > -0.2 (approx)
         if (clusterNoise > -0.2) {
             // We are likely flying through a forest!
             // Add turbulent "dodge" forces to simulate weaving around trunks
             
             // Time-based noise for shifting currents
             const noiseX = noise.noise2D(bird.position.x * 0.15, bird.position.z * 0.15 + t * 0.5);
             const noiseZ = noise.noise2D(bird.position.x * 0.15 + 100, bird.position.z * 0.15 + t * 0.5);
             
             const dodgeForce = new THREE.Vector3(noiseX, 0, noiseZ).normalize();
             bird.acceleration.add(dodgeForce.multiplyScalar(canopyWeight));
         }
      }

      // Ceiling
      if (bird.position.y > 100) {
        bird.acceleration.y -= maxForce * 1.5;
      }
    }

    // Update State
    for (let i = 0; i < BIRD_COUNT; i++) {
      const bird = birds[i];
      
      bird.velocity.add(bird.acceleration);
      bird.velocity.clampLength(minSpeed, maxSpeed);
      bird.position.add(bird.velocity);

      // Accumulate for average
      flockCenterRef.current.add(bird.position);
      flockVelocityRef.current.add(bird.velocity);

      // Update Instance Matrix
      tempObject.position.copy(bird.position);
      
      const lookTarget = bird.position.clone().add(bird.velocity);
      tempObject.lookAt(lookTarget);
      
      // Banking Logic:
      // Approximate banking based on sideways acceleration or turn
      // We calculate the cross product of Up and Velocity to get the "Left" vector.
      // If acceleration aligns with Left, we bank Left.
      const leftDir = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), bird.velocity).normalize();
      const sideAccel = bird.acceleration.dot(leftDir);
      
      // Rotate Z (Roll) based on side acceleration
      // Smoothed slightly by clamping
      const maxBank = Math.PI / 3;
      const bankAngle = Math.max(-maxBank, Math.min(maxBank, sideAccel * 15.0));
      
      tempObject.rotateZ(bankAngle); // Bank into the turn
      tempObject.rotateX(Math.PI / 2); // Correct model orientation

      // Animation
      const speed = bird.velocity.length();
      const flapSpeed = 10 + speed * 10;
      // In high wind, flap faster/more erratically
      const stormFlap = weather.windSpeed > 1.5 ? Math.sin(t * 30 + i) * 0.2 : 0;
      
      const wingFlex = Math.sin(t * flapSpeed + i * 13.5) * 0.3 + stormFlap;
      tempObject.scale.set(1.5 - wingFlex * 0.2, 1.0, 0.2 + Math.abs(wingFlex) * 0.1); 
      
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);
    }

    flockCenterRef.current.divideScalar(BIRD_COUNT);
    flockVelocityRef.current.divideScalar(BIRD_COUNT);

    meshRef.current.instanceMatrix.needsUpdate = true;
    
    if (onFlockUpdate) {
        onFlockUpdate(flockCenterRef.current, flockVelocityRef.current);
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BIRD_COUNT]} castShadow>
      <coneGeometry args={[0.3, 1.2, 5]} />
      <meshStandardMaterial 
        color="#ffeedd" 
        roughness={0.6}
        emissive="#ffeedd"
        emissiveIntensity={0.2}
      />
    </instancedMesh>
  );
};
