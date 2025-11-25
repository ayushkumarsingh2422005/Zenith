import React, { useRef, useMemo } from 'react';
import { useFrame, ThreeElements, useThree } from '@react-three/fiber';
import { useDepthBuffer } from '@react-three/drei';
import * as THREE from 'three';

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

// Define a local type for the shader object passed to onBeforeCompile
type ThreeShader = {
  uniforms: { [key: string]: { value: any } };
  vertexShader: string;
  fragmentShader: string;
};

interface WaterProps {
  trackTarget?: React.MutableRefObject<THREE.Vector3>;
}

export const Water: React.FC<WaterProps> = ({ trackTarget }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, gl, size } = useThree();
  
  // Capture depth buffer for soft shoreline effects
  // CRITICAL: frames: Infinity ensures the depth texture updates as the camera moves.
  const depthTexture = useDepthBuffer({ frames: Infinity });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDepthTexture: { value: null },
    uCameraNear: { value: 0 },
    uCameraFar: { value: 0 },
    uResolution: { value: new THREE.Vector2() },
    uInteractPos: { value: new THREE.Vector3() },
    uInteractStrength: { value: 0 }
  }), []);

  const onBeforeCompile = (shader: ThreeShader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uDepthTexture = uniforms.uDepthTexture;
    shader.uniforms.uCameraNear = uniforms.uCameraNear;
    shader.uniforms.uCameraFar = uniforms.uCameraFar;
    shader.uniforms.uResolution = uniforms.uResolution;
    shader.uniforms.uInteractPos = uniforms.uInteractPos;
    shader.uniforms.uInteractStrength = uniforms.uInteractStrength;

    // --- VERTEX SHADER ---
    shader.vertexShader = `
      uniform float uTime;
      uniform vec3 uInteractPos;
      uniform float uInteractStrength;
      varying vec3 vWorldPos; // Pass to fragment
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      
      // Calculate World Position for consistent noise
      vec3 worldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWorldPos = worldPos; // Assign varying
      
      // --- Wave Parameters ---
      float bigWaveFreq = 0.02;
      float bigWaveAmp = 1.2;
      float bigWaveSpeed = 0.6;
      
      float midWaveFreq = 0.08;
      float midWaveAmp = 0.25;
      float midWaveSpeed = 0.9;
      
      float smallWaveFreq = 0.25;
      float smallWaveAmp = 0.08;
      float smallWaveSpeed = 2.0;

      // --- Interaction Ripple Parameters ---
      float rippleFreq = 0.8;
      float rippleSpeed = 3.5;
      float rippleDecay = 0.08;

      // --- Elevation Calculation ---
      float elevation = 0.0;
      
      // Swell (Big)
      elevation += sin(worldPos.x * bigWaveFreq + uTime * bigWaveSpeed) * bigWaveAmp;
      elevation += sin(worldPos.z * bigWaveFreq * 0.8 + uTime * bigWaveSpeed * 0.85) * bigWaveAmp;
      
      // Chop (Mid)
      elevation += sin(worldPos.x * midWaveFreq + uTime * midWaveSpeed) * midWaveAmp;
      elevation += cos(worldPos.z * midWaveFreq * 0.9 + uTime * midWaveSpeed * 1.1) * midWaveAmp;

      // Detail (Small)
      elevation += sin(worldPos.x * smallWaveFreq + uTime * smallWaveSpeed) * smallWaveAmp;
      
      // Interaction Ripples
      float dist = distance(worldPos.xz, uInteractPos.xz);
      float rippleAmp = uInteractStrength * 1.5 / (1.0 + dist * rippleDecay);
      
      // Radial sine wave
      float rippleSine = sin(dist * rippleFreq - uTime * rippleSpeed);
      elevation += rippleSine * rippleAmp;

      // Apply displacement
      transformed.y += elevation;

      // --- Analytic Normal Calculation ---
      // dH/dx
      float dx = bigWaveFreq * bigWaveAmp * cos(worldPos.x * bigWaveFreq + uTime * bigWaveSpeed)
               + midWaveFreq * midWaveAmp * cos(worldPos.x * midWaveFreq + uTime * midWaveSpeed)
               + smallWaveFreq * smallWaveAmp * cos(worldPos.x * smallWaveFreq + uTime * smallWaveSpeed);
               
      // dH/dz
      float dz = bigWaveFreq * 0.8 * bigWaveAmp * cos(worldPos.z * bigWaveFreq * 0.8 + uTime * bigWaveSpeed * 0.85)
               + midWaveFreq * 0.9 * midWaveAmp * -sin(worldPos.z * midWaveFreq * 0.9 + uTime * midWaveSpeed * 1.1);

      // Ripple Derivatives
      // d(ripple)/ddist approx = rippleAmp * rippleFreq * cos(...)
      float dRipple = rippleAmp * rippleFreq * cos(dist * rippleFreq - uTime * rippleSpeed);
      float dirX = (worldPos.x - uInteractPos.x) / (dist + 0.001);
      float dirZ = (worldPos.z - uInteractPos.z) / (dist + 0.001);
      
      dx += dRipple * dirX;
      dz += dRipple * dirZ;

      vec3 tangentX = vec3(1.0, dx, 0.0);
      vec3 tangentZ = vec3(0.0, dz, 1.0);
      
      objectNormal = normalize(cross(tangentZ, tangentX));
      vNormal = normalize(normalMatrix * objectNormal);
      `
    );

    // --- FRAGMENT SHADER ---
    
    // Declarations and Helper Functions
    // We inject these AFTER <packing> to avoid redefinition errors
    const myFragmentPars = `
      uniform sampler2D uDepthTexture;
      uniform float uCameraNear;
      uniform float uCameraFar;
      uniform vec2 uResolution;
      uniform float uTime;
      varying vec3 vWorldPos;
      
      float getLinearDepth(float fragCoordZ) {
        float viewZ = perspectiveDepthToViewZ(fragCoordZ, uCameraNear, uCameraFar);
        return viewZToOrthographicDepth(viewZ, uCameraNear, uCameraFar);
      }
      
      // Procedural Caustics Function
      float caustics(vec2 uv) {
        float v = 0.0;
        v += sin(uv.x * 40.0 + uTime * 1.5);
        v += sin(uv.y * 40.0 + uTime * 1.2);
        v += sin((uv.x + uv.y) * 35.0 + uTime * 1.7);
        v += cos((uv.x - uv.y) * 35.0 + uTime * 1.4);
        return pow(0.5 + 0.5 * v / 4.0, 8.0); 
      }
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <packing>',
      `#include <packing>
      ${myFragmentPars}`
    );

    // Main Logic Injection
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      
      // --- DEPTH LOGIC ---
      vec2 screenUV = gl_FragCoord.xy / uResolution;
      float sceneDepthPacked = texture2D(uDepthTexture, screenUV).x;
      float sceneDepth = getLinearDepth(sceneDepthPacked);
      float surfaceDepth = getLinearDepth(gl_FragCoord.z);
      
      // Calculate depth difference
      float bias = 0.0001; 
      float depthDiff = sceneDepth - surfaceDepth;
      
      // Clamp depthDiff to be non-negative
      depthDiff = max(0.0, depthDiff);

      // 1. FOAM on Shoreline
      float foamThreshold = 0.0025; 
      float foam = 1.0 - smoothstep(0.0, foamThreshold, depthDiff);
      
      // Add noise to foam edge
      float foamNoise = sin(vWorldPos.x * 5.0 + uTime) * cos(vWorldPos.z * 5.0 + uTime);
      float noisyThreshold = foamThreshold + foamNoise * 0.001;
      float noisyFoam = 1.0 - smoothstep(0.0, noisyThreshold, depthDiff);
      
      // Mix white foam into color
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.98, 1.0), noisyFoam * 0.4);
      
      // 2. CAUSTICS in Shallow Water
      float causticDepthStart = 0.003;
      float causticDepthEnd = 0.02;
      float causticMask = smoothstep(causticDepthEnd, causticDepthStart, depthDiff);
      
      if (depthDiff > 0.0 && causticMask > 0.01) {
          float causticPattern = caustics(vWorldPos.xz * 0.05); 
          vec3 causticColor = vec3(0.8, 0.9, 1.0) * causticPattern * 2.0;
          gl_FragColor.rgb += causticColor * causticMask * 0.5;
      }
      
      // Optional: Darken deep water
      float deepMask = smoothstep(0.02, 0.1, depthDiff);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.6, deepMask * 0.5);
      `
    );
  };

  useFrame((state) => {
    if (uniforms.uTime) {
        uniforms.uTime.value = state.clock.elapsedTime;
    }
    if (uniforms.uDepthTexture && depthTexture) {
        uniforms.uDepthTexture.value = depthTexture;
    }
    if (uniforms.uCameraNear) {
        uniforms.uCameraNear.value = camera.near;
    }
    if (uniforms.uCameraFar) {
        uniforms.uCameraFar.value = camera.far;
    }
    if (uniforms.uResolution) {
        uniforms.uResolution.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio());
    }

    // Interactive Ripple Updates
    if (trackTarget && trackTarget.current) {
        uniforms.uInteractPos.value.copy(trackTarget.current);
        
        // Calculate strength based on proximity to water surface
        const waterHeight = 1.5;
        const altitude = Math.max(0, trackTarget.current.y - waterHeight);
        const maxEffectDist = 25.0;
        
        let strength = 1.0 - (altitude / maxEffectDist);
        strength = Math.max(0, strength * strength); // Square falloff for sharper boundary
        
        uniforms.uInteractStrength.value = strength;
    }

    if (meshRef.current) {
      const targetX = trackTarget?.current ? trackTarget.current.x : camera.position.x;
      const targetZ = trackTarget?.current ? trackTarget.current.z : camera.position.z;
      meshRef.current.position.set(targetX, 1.5, targetZ);
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[2000, 2000, 196, 196]} /> 
      <meshPhysicalMaterial
        onBeforeCompile={onBeforeCompile}
        color="#0a1a26"     
        metalness={0.9}     
        roughness={0.15}    
        envMapIntensity={1.5}
        transmission={0.0}
        transparent={true}
        depthWrite={false}
        clearcoat={1.0}     
        clearcoatRoughness={0.1}
      />
    </mesh>
  );
};