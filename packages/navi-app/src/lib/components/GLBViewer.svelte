<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three";
  import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
  import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";

  interface Props {
    src: string;
    backgroundColor?: string;
  }

  let { src, backgroundColor = "#1f2937" }: Props = $props();

  let container: HTMLDivElement;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let controls: OrbitControls;
  let model: THREE.Group | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let animations: THREE.AnimationClip[] = [];
  let animationId: number;
  let clock = new THREE.Clock();
  let loading = $state(true);
  let error = $state("");
  let currentAnimation = $state<string | null>(null);
  let isPlaying = $state(true);

  function initScene() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
    camera.position.set(5, 3, 5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.5;
    controls.maxDistance = 500;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-5, 5, -5);
    scene.add(directionalLight2);

    // Hemisphere light for natural lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x333333);
    scene.add(gridHelper);
  }

  function loadGLB() {
    loading = true;
    error = "";
    currentAnimation = null;

    const loader = new GLTFLoader();

    // Optional: Add Draco decoder for compressed meshes
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      src,
      (gltf) => {
        // Remove old model if exists
        if (model) {
          scene.remove(model);
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
        }

        model = gltf.scene;

        // Enable shadows on all meshes
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(model);

        // Handle animations
        animations = gltf.animations;
        if (animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          playAnimation(animations[0].name);
        }

        // Fit camera to model
        fitCameraToModel();

        loading = false;
      },
      (progress) => {
        const percent = progress.lengthComputable
          ? Math.round((progress.loaded / progress.total) * 100)
          : 0;
      },
      (err) => {
        console.error("[GLBViewer] Error loading GLB:", err);
        console.error("[GLBViewer] URL was:", src);
        error = `Failed to load 3D model: ${(err as Error)?.message || String(err)}`;
        loading = false;
      }
    );
  }

  function playAnimation(name: string) {
    if (!mixer || !model) return;

    // Stop all current actions
    mixer.stopAllAction();

    const clip = animations.find((a) => a.name === name);
    if (clip) {
      const action = mixer.clipAction(clip);
      action.reset();
      action.play();
      currentAnimation = name;
      isPlaying = true;
    }
  }

  function togglePlayPause() {
    if (!mixer) return;

    if (isPlaying) {
      mixer.timeScale = 0;
    } else {
      mixer.timeScale = 1;
    }
    isPlaying = !isPlaying;
  }

  function fitCameraToModel() {
    if (!model) return;

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / (2 * Math.tan(fov / 2)));
    cameraZ *= 2; // Add padding

    camera.position.set(cameraZ, cameraZ * 0.6, cameraZ);
    camera.lookAt(center);

    controls.target.copy(center);
    controls.update();

    // Update near/far planes
    camera.near = cameraZ / 100;
    camera.far = cameraZ * 100;
    camera.updateProjectionMatrix();
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    const delta = clock.getDelta();
    if (mixer) {
      mixer.update(delta);
    }

    controls.update();
    renderer.render(scene, camera);
  }

  function handleResize() {
    if (!container || !camera || !renderer) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function resetView() {
    fitCameraToModel();
  }

  onMount(() => {
    initScene();
    loadGLB();
    animate();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);

    if (model) {
      scene.remove(model);
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    if (mixer) {
      mixer.stopAllAction();
    }

    if (renderer) {
      renderer.dispose();
      container?.removeChild(renderer.domElement);
    }

    if (controls) {
      controls.dispose();
    }
  });

  // Reload when src changes
  $effect(() => {
    if (src && renderer) {
      loadGLB();
    }
  });
</script>

<div class="glb-viewer" bind:this={container}>
  {#if loading}
    <div class="loading-overlay">
      <div class="loading-spinner">
        <svg class="w-8 h-8 animate-spin text-white" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="ml-2 text-white text-sm">Loading 3D model...</span>
      </div>
    </div>
  {/if}

  {#if error}
    <div class="error-overlay">
      <div class="error-content">
        <svg class="w-12 h-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p class="text-white text-sm">{error}</p>
      </div>
    </div>
  {/if}

  <!-- Controls overlay -->
  <div class="controls-overlay">
    <button onclick={resetView} title="Reset view" class="control-btn">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
      </svg>
    </button>
  </div>

  <!-- Animation controls -->
  {#if animations.length > 0}
    <div class="animation-controls">
      <button onclick={togglePlayPause} title={isPlaying ? "Pause" : "Play"} class="control-btn">
        {#if isPlaying}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
          </svg>
        {/if}
      </button>
      {#if animations.length > 1}
        <select
          class="animation-select"
          value={currentAnimation}
          onchange={(e) => playAnimation((e.target as HTMLSelectElement).value)}
        >
          {#each animations as anim}
            <option value={anim.name}>{anim.name || "Animation"}</option>
          {/each}
        </select>
      {/if}
    </div>
  {/if}

  <!-- Instructions -->
  <div class="instructions">
    <span>Drag to rotate • Scroll to zoom • Shift+drag to pan</span>
  </div>
</div>

<style>
  .glb-viewer {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 300px;
    overflow: hidden;
  }

  .loading-overlay,
  .error-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(31, 41, 55, 0.9);
    z-index: 10;
  }

  .loading-spinner {
    display: flex;
    align-items: center;
  }

  .error-content {
    text-align: center;
  }

  .controls-overlay {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 8px;
    z-index: 5;
  }

  .animation-controls {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    gap: 8px;
    z-index: 5;
  }

  .control-btn {
    padding: 8px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: white;
    cursor: pointer;
    transition: all 0.15s;
  }

  .control-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .animation-select {
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    color: white;
    font-size: 12px;
    cursor: pointer;
  }

  .animation-select option {
    background: #1f2937;
    color: white;
  }

  .instructions {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 11px;
    z-index: 5;
  }
</style>
