import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree, ThreeElements } from '@react-three/fiber';
import { OrbitControls, Stars, Cloud } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { InfiniteWorld } from './World/Terrain'; // Using the new Infinite World manager
import { Water } from './World/Water';
import { Flock } from './World/Flock';
import { Rain } from './World/Rain';

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

export type WeatherMode = 'DAY' | 'CLOUDY';

interface SceneProps {
  isBirdsEye: boolean;
  weather: WeatherMode;
}

// Component to handle camera logic based on mode
const CameraController: React.FC<{ 
  isBirdsEye: boolean; 
  flockCenterRef: React.MutableRefObject<THREE.Vector3>;
  flockVelocityRef: React.MutableRefObject<THREE.Vector3>;
  activeFocusRef: React.MutableRefObject<THREE.Vector3>; // Tracks what the infinite world should generate around
}> = ({ isBirdsEye, flockCenterRef, flockVelocityRef, activeFocusRef }) => {
  const { camera, controls } = useThree();
  const currentLookAt = useRef(new THREE.Vector3(0, 10, 0));

  useFrame((state, delta) => {
    // @ts-ignore
    if (!controls) return;

    if (isBirdsEye) {
      // FOLLOW MODE: Strict cinematic chase
      
      const flockPos = flockCenterRef.current;
      const flockVel = flockVelocityRef.current;

      // Update generation focus
      activeFocusRef.current.copy(flockPos);

      // Smoothly interpolate the look target to the flock center
      currentLookAt.current.lerp(flockPos, 0.05);
      // @ts-ignore
      controls.target.copy(currentLookAt.current);

      // Calculate ideal camera position: Behind and slightly above the flock
      const normVel = flockVel.clone().normalize();
      if (normVel.lengthSq() < 0.01) normVel.set(0, 0, 1); 

      // Offset: 25 units behind, 15 units up
      const cameraOffset = normVel.clone().multiplyScalar(-25).add(new THREE.Vector3(0, 15, 0));
      const targetCamPos = flockPos.clone().add(cameraOffset);

      // Smoothly move camera
      camera.position.lerp(targetCamPos, 0.05);
      
      // @ts-ignore
      controls.update();

    } else {
      // EXPLORE MODE:
      // Update generation focus to where the camera is looking (or camera position)
      activeFocusRef.current.copy(camera.position);

      // @ts-ignore
      controls.update();
    }
  });

  return null;
};

// --- WEATHER SYSTEM TYPES ---

interface WeatherParams {
  windSpeed: number;
  rainIntensity: number;
  fogDensity: number;
  lightIntensity: number;
  cloudOpacity: number;
  fogColor: string;
  sunColor: string;
  skyColor: string;
  windDirection: THREE.Vector3;
}

const WeatherConfigs: Record<WeatherMode, WeatherParams> = {
  DAY: {
    windSpeed: 1.0,
    rainIntensity: 0.0,
    fogDensity: 0.002, // Very clear view
    lightIntensity: 1.3,
    cloudOpacity: 0.4,
    fogColor: "#87CEEB", // Light Sky Blue
    sunColor: "#FFFACD", // Warm Sunlight
    skyColor: "#87CEEB",
    windDirection: new THREE.Vector3(1, 0, 0.5).normalize()
  },
  CLOUDY: {
    windSpeed: 4.5,
    rainIntensity: 0.2, // Light drizzle
    fogDensity: 0.012, // Thicker fog
    lightIntensity: 0.5,
    cloudOpacity: 0.9,
    fogColor: "#4a5059", // Dark Grey
    sunColor: "#808080", // Dim Grey
    skyColor: "#2c3e50",
    windDirection: new THREE.Vector3(0.5, 0, 0.8).normalize()
  }
};

// Inner component that runs INSIDE the Canvas
const SceneContent: React.FC<SceneProps> = ({ isBirdsEye, weather }) => {
  // Refs to store flock state, passed down to Flock component
  const flockCenter = useRef(new THREE.Vector3(0, 50, 0));
  const flockVelocity = useRef(new THREE.Vector3(1, 0, 0));
  
  // Ref to track the "center" of the generated world (either flock or camera)
  const activeFocus = useRef(new THREE.Vector3(0, 0, 0));

  // --- WEATHER STATE ---
  const weatherRef = useRef({ ...WeatherConfigs[weather] });
  
  // Refs for scene elements to update without re-rendering
  const fogRef = useRef<THREE.FogExp2>(null);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const cloudsRef = useRef<THREE.Group>(null);
  const { scene } = useThree();

  const handleFlockUpdate = (center: THREE.Vector3, velocity: THREE.Vector3) => {
    flockCenter.current.copy(center);
    flockVelocity.current.copy(velocity);
  };

  // Weather Transition Logic
  useFrame((state, delta) => {
    // Target parameters based on selected mode
    const targetParams = WeatherConfigs[weather];
    const currentParams = weatherRef.current;
    
    // Lerp Speed - how fast the weather changes
    const lerpSpeed = delta * 1.5; 

    // Lerp Values
    currentParams.windSpeed = THREE.MathUtils.lerp(currentParams.windSpeed, targetParams.windSpeed, lerpSpeed);
    currentParams.rainIntensity = THREE.MathUtils.lerp(currentParams.rainIntensity, targetParams.rainIntensity, lerpSpeed);
    currentParams.fogDensity = THREE.MathUtils.lerp(currentParams.fogDensity, targetParams.fogDensity, lerpSpeed);
    currentParams.lightIntensity = THREE.MathUtils.lerp(currentParams.lightIntensity, targetParams.lightIntensity, lerpSpeed);
    currentParams.cloudOpacity = THREE.MathUtils.lerp(currentParams.cloudOpacity, targetParams.cloudOpacity, lerpSpeed);
    
    // Lerp Colors
    const currentFogColor = new THREE.Color(currentParams.fogColor);
    const targetFogColor = new THREE.Color(targetParams.fogColor);
    currentFogColor.lerp(targetFogColor, lerpSpeed);
    currentParams.fogColor = '#' + currentFogColor.getHexString();

    const currentSunColor = new THREE.Color(currentParams.sunColor);
    const targetSunColor = new THREE.Color(targetParams.sunColor);
    currentSunColor.lerp(targetSunColor, lerpSpeed);
    currentParams.sunColor = '#' + currentSunColor.getHexString();

    const currentSkyColor = new THREE.Color(currentParams.skyColor || "#000000");
    const targetSkyColor = new THREE.Color(targetParams.skyColor);
    currentSkyColor.lerp(targetSkyColor, lerpSpeed);
    currentParams.skyColor = '#' + currentSkyColor.getHexString();

    currentParams.windDirection.lerp(targetParams.windDirection, lerpSpeed);

    // Apply to Scene Objects
    if (fogRef.current) {
        fogRef.current.density = currentParams.fogDensity;
        fogRef.current.color.set(currentParams.fogColor);
        scene.background = new THREE.Color(currentParams.fogColor);
    }
    if (sunLightRef.current) {
        sunLightRef.current.intensity = currentParams.lightIntensity;
        sunLightRef.current.color.set(currentParams.sunColor);
    }
    if (ambientLightRef.current) {
        // Ambient is darker in storm/cloudy
        ambientLightRef.current.intensity = currentParams.lightIntensity * 0.5;
    }
    // Update cloud opacity/color simply by visibility or material uniform if we had one
    // For now, we assume clouds are always there but maybe less visible in bright day? 
    // Actually clouds should be white in day, grey in cloudy.
    
  });

  return (
    <>
      <CameraController 
        isBirdsEye={isBirdsEye} 
        flockCenterRef={flockCenter}
        flockVelocityRef={flockVelocity}
        activeFocusRef={activeFocus}
      />
      
      {/* Atmosphere controlled by WeatherSystem */}
      <fogExp2 ref={fogRef} attach="fog" args={[WeatherConfigs[weather].fogColor, WeatherConfigs[weather].fogDensity]} />
      
      {/* Stars only visible if it's dark enough, simplified here to always be present but faded by fog */}
      <Stars radius={300} depth={100} count={2000} factor={4} saturation={0} fade speed={0.5} />
      
      {/* Clouds */}
      <group ref={cloudsRef} position={[0, 100, 0]}>
        <Cloud opacity={0.5} speed={0.1} bounds={[500, 20, 100]} segments={40} position={[0, 0, -100]} color={weather === 'CLOUDY' ? "#808080" : "#ffffff"} />
        <Cloud opacity={0.5} speed={0.1} bounds={[500, 20, 100]} segments={40} position={[100, 20, 50]} color={weather === 'CLOUDY' ? "#909090" : "#eeeeee"} />
      </group>

      {/* Lighting */}
      <ambientLight ref={ambientLightRef} intensity={0.4} color="#808890" />
      
      <directionalLight 
        ref={sunLightRef}
        position={[-150, 100, -100]} 
        intensity={1.2} 
        color="#ffe8cc" 
        castShadow 
        shadow-bias={-0.0001}
      >
        <orthographicCamera attach="shadow-camera" args={[-300, 300, 300, -300]} far={1000} />
      </directionalLight>
      
      <hemisphereLight groundColor="#2a3038" color="#8fa0b0" intensity={0.6} />

      {/* World Content */}
      <group position={[0, -10, 0]}>
        <InfiniteWorld viewerPosition={activeFocus} weatherRef={weatherRef} />
        <Water trackTarget={activeFocus} />
        <Flock onFlockUpdate={handleFlockUpdate} weatherRef={weatherRef} />
        <Rain weatherRef={weatherRef} />
      </group>
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({ isBirdsEye, weather }) => {
  return (
    <Canvas shadows camera={{ position: [100, 60, 100], fov: 45, far: 600 }}>
      <SceneContent isBirdsEye={isBirdsEye} weather={weather} />
      
      <OrbitControls 
        makeDefault 
        enablePan={!isBirdsEye} 
        enableZoom={!isBirdsEye}
        enableRotate={!isBirdsEye} 
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={10}
        maxDistance={400}
        dampingFactor={0.05}
      />

      {/* Post Processing Effects */}
      <EffectComposer enableNormalPass={false}>
        <Bloom 
          luminanceThreshold={0.55} 
          luminanceSmoothing={0.9} 
          height={300} 
          intensity={0.8} 
        />
        <Vignette eskil={false} offset={0.1} darkness={0.5} />
        <Noise opacity={0.02} />
      </EffectComposer>
    </Canvas>
  );
};