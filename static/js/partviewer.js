// credits to https://github.com/VAST-AI-Research/HoloPart/tree/page/modules/SceneViewer

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

console.log("Three.js loaded:", THREE);
console.log("OrbitControls loaded:", OrbitControls);
console.log("GLTFLoader loaded:", GLTFLoader);

// implementation
class ViewerModule {
  constructor(container, modelBaseNames, modelPath, imagePath) {
    this.container = container;
    this.modelBaseNames = modelBaseNames;
    this.modelPath = modelPath;
    this.imagePath = imagePath;
    this.imageExtension = ".jpg";
    this.modelExtension = "_st.glb";
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.model = null;
    this.controls = null;
    // model stats
    this.model_bbox = null;
    this.model_center = null;
    this.closest_part = null;
    this.closest_part_bbox = null;
    this.closest_part_center = null;
    // for auto-explode
    this.explodeAmount = 0;
    this.explodeDirection = 1;
  }

  init() {
    console.log("Initializing partviewer...");
    console.log("Model base names:", this.modelBaseNames);
    console.log("Model path:", this.modelPath);
    console.log("Image path:", this.imagePath);
    this.setupScene();
    this.createImageSlider();
    
    // Only load model if there are valid model names
    const validModelNames = this.modelBaseNames.filter(name => name && name.trim() !== '');
    if (validModelNames && validModelNames.length > 0) {
      this.loadModel(validModelNames[0]);
    } else {
      console.log("No models to load");
    }
  }

  setupScene() {
    const viewerContainer = document.querySelector(
      `${this.container} #viewer-container`
    );
    console.log("Viewer container found:", viewerContainer);
    if (!viewerContainer) {
      console.error("Viewer container not found!");
      return;
    }
    const width = viewerContainer.clientWidth;
    const height = viewerContainer.clientHeight;
    console.log("Container dimensions:", width, "x", height);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    this.camera.position.set(0, 1, 5);
    
    console.log("Scene created:", this.scene);
    console.log("Camera created:", this.camera);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0xffffff);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.physicallyCorrectLights = true;
    viewerContainer.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(
      this.camera,
      this.renderer.domElement
    );
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.25;

    // auto rotate camera
    // this.controls.autoRotate = true;
    // this.controls.autoRotateSpeed = 5;

    // Default light
    const hemisphereLight = new THREE.HemisphereLight(0xcccccc, 0x333333, 6);
    this.scene.add(hemisphereLight);

    // Increase point light intensity
    // const lightIntensity = 50;
    // const lightDistance = 100;

    // const directions = [
    //   [10, 0, 0], // +x
    //   [-10, 0, 0], // -x
    //   [0, 10, 0], // +y
    //   [0, -10, 0], // -y
    //   [0, 0, 10], // +z
    //   [0, 0, -10], // -z
    // ];

    // directions.forEach((dir, index) => {
    //   const pointLight = new THREE.PointLight(
    //     0xffffff,
    //     lightIntensity,
    //     lightDistance
    //   );
    //   pointLight.position.set(...dir);
    //   pointLight.castShadow = true;
    //   this.scene.add(pointLight);

    //   pointLight.name = `PointLight_${index}`;
    // });

    window.addEventListener("resize", () => {
      const newWidth = viewerContainer.clientWidth;
      const newHeight = viewerContainer.clientHeight;
      this.renderer.setSize(newWidth, newHeight);
      this.camera.aspect = newWidth / newHeight;
      this.camera.updateProjectionMatrix();
    });

    this.animate();
  }

  loadModel(baseName, index) {
    console.log("=== LOAD MODEL CALLED ===");
    console.log("Base name:", baseName);
    console.log("Index:", index);
    
    if (this.model) this.scene.remove(this.model);

    const overlay = document.querySelector(
      `${this.container} #loading-overlay`
    );
    overlay.style.display = "flex";

    const loader = new GLTFLoader();
    // Configure DRACO decoder for compressed GLB
    try {
      const dracoLoader = new DRACOLoader();
      // Use Three.js CDN decoder path matching the importmap version
      dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
      loader.setDRACOLoader(dracoLoader);
    } catch (e) {
      console.warn('DRACO loader setup failed (continuing without it):', e);
    }
    const modelUrl = `${this.modelPath}/${baseName}${this.modelExtension}`;
    console.log("Loading model:", modelUrl);
    console.log("Model path:", this.modelPath);
    console.log("Model extension:", this.modelExtension);
    
    loader.load(
      modelUrl,
      (gltf) => {
        console.log("Model loaded successfully:", gltf);
        this.model = gltf.scene;
        this.scene.add(this.model);

        this.model.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
            console.log("Mesh found:", child.name);
          }
        });

        this.adjustModelMaterial();

        // model stats
        this.model_bbox = new THREE.Box3().setFromObject(this.model);
        this.model_center = this.model_bbox.getCenter(new THREE.Vector3());
        let closest_distance = Infinity;
        let closest_part = null;
        this.model.traverse((child) => {
          if (child.isMesh) {
            const bbox = new THREE.Box3().setFromObject(child);
            const part_center = bbox.getCenter(new THREE.Vector3());
            const distance = part_center.distanceTo(this.model_center);
            if (distance < closest_distance) {
              closest_distance = distance;
              closest_part = child;
            }
          }
        });
        this.closest_part = closest_part;
        this.closest_part_bbox = new THREE.Box3().setFromObject(this.closest_part);
        this.closest_part_center = this.closest_part_bbox.getCenter(new THREE.Vector3());

        // Reset camera based on model size
        this.camera.position.set(0, 1 + this.model_center.y, 8 + this.model_center.z);

        // Replace buttons with explode slider
        this.createExplodeSlider();

        overlay.style.display = "none";
      },
      (xhr) => {
        // progress
        // console.log(`Loading ${baseName}.glb: ${(xhr.loaded / (xhr.total || 1)) * 100}%`);
      },
      (error) => {
        overlay.style.display = "none";
        console.error("Failed to load GLB", {
          file: `${this.modelPath}/${baseName}${this.modelExtension}`,
          error
        });
        // Show a minimal inline message
        const viewerContainer = document.querySelector(`${this.container} #viewer-container`);
        if (viewerContainer && !viewerContainer.querySelector('.load-error')) {
          const msg = document.createElement('div');
          msg.className = 'load-error';
          msg.style.position = 'absolute';
          msg.style.top = '10px';
          msg.style.left = '10px';
          msg.style.padding = '6px 10px';
          msg.style.background = 'rgba(255,0,0,0.1)';
          msg.style.color = '#b00';
          msg.style.fontSize = '12px';
          msg.style.border = '1px solid #b00';
          msg.textContent = `加载失败: ${baseName}${this.modelExtension}`;
          viewerContainer.appendChild(msg);
        }
      }
    );
  }

  adjustModelMaterial() {
    if (this.model) {
      this.model.traverse((child) => {
        if (child.isMesh) {
          // adjust material to make it look better.
          child.material.metalness = 0.2;
          child.material.roughness = 1.0;
        }
      });
    }
  }

  createImageSlider() {
    const sliderContainer = document.querySelector(
      `${this.container} #image-slider`
    );
    // Clear existing slides to avoid duplicates/stale static items
    if (sliderContainer) sliderContainer.innerHTML = "";
    
    // Filter out commented models (those that are undefined or null)
    const validModelNames = this.modelBaseNames.filter(name => name && name.trim() !== '');
    console.log("Valid model names for slider:", validModelNames);
    
    validModelNames.forEach((baseName, index) => {
      const slide = document.createElement("div");
      slide.classList.add("swiper-slide");
      
      const img = document.createElement("img");
      img.src = `${this.imagePath}/${baseName}${this.imageExtension}`;
      img.alt = `Model ${index + 1}`;
      img.onclick = () => this.loadModel(baseName, index);
      img.onerror = () => {
        console.error("Preview image failed to load:", img.src);
        img.style.border = '2px solid #c00';
        img.title = `Failed to load: ${img.src}`;
      };

      slide.appendChild(img);
      sliderContainer.appendChild(slide);
    });

    this.swiper = new Swiper(`${this.container} .swiper`, {
      slidesPerView: "auto",
      slidesPerGroup: 2,
      spaceBetween: 5,
      rewind: true,
      navigation: {
        nextEl: `${this.container} .swiper-button-next`,
        prevEl: `${this.container} .swiper-button-prev`,
      },
    });
  }

  createExplodeSlider() {
    const controlsDiv = document.querySelector(
      `${this.container} #button-block`
    );
    controlsDiv.innerHTML = ""; // Clear existing buttons

    const sliderContainer = document.createElement("div");
    sliderContainer.style.display = "flex";
    sliderContainer.style.alignItems = "center";
    sliderContainer.style.justifyContent = "center";
    sliderContainer.style.margin = "10px";

    const label = document.createElement("span");
    label.textContent = "Explode: ";
    label.style.marginRight = "10px";
    label.style.fontWeight = "bold"; // Make the label bold

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1";
    slider.step = "0.01";
    slider.value = "0";
    slider.style.width = "300px";

    slider.oninput = (event) => {
      const explodeAmount = parseFloat(event.target.value);
      this.applyExplodeEffect(explodeAmount);
    };

    sliderContainer.appendChild(label);
    sliderContainer.appendChild(slider);
    controlsDiv.appendChild(sliderContainer);
  }

  applyExplodeEffect(explodeAmount) {
    if (!this.model) return;

    

    this.model.traverse((part) => {
      if (part.isMesh) {
        if (part === this.closest_part) return;
        const bbox = new THREE.Box3().setFromObject(part);
        const part_center = bbox.getCenter(new THREE.Vector3());
        const direction = part_center.clone().sub(this.closest_part_center).normalize();

        // Calculate the new position based on the explode amount
        const originalPosition = new THREE.Vector3().copy(part.userData.originalPosition || part.position);
        const offset = direction.multiplyScalar(explodeAmount * 2);
        const newPosition = originalPosition.clone().add(offset);

        // Store the original position if not already stored
        if (!part.userData.originalPosition) {
          part.userData.originalPosition = originalPosition.clone();
        }

        part.position.copy(newPosition);
      }
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // auto-explode
    // if (this.model) {
    //   this.explodeAmount += 0.002 * this.explodeDirection;
    //   if (this.explodeAmount >= 0.3) {
    //     this.explodeDirection = -1;
    //   } else if (this.explodeAmount <= 0) {
    //     this.explodeDirection = 1;
    //   }
    //   this.applyExplodeEffect(this.explodeAmount);
    // }
  }
}

// Comparison viewer class for the three comparison methods
class ComparisonViewer {
  constructor(containerId, modelPath, modelExtension) {
    this.containerId = containerId;
    this.modelPath = modelPath;
    this.modelExtension = modelExtension;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.model = null;
    this.controls = null;
    // for explode functionality
    this.model_bbox = null;
    this.model_center = null;
    this.closest_part = null;
    this.closest_part_bbox = null;
    this.closest_part_center = null;
    this.explodeAmount = 0;
  }

  init() {
    this.setupScene();
  }

  setupScene() {
    const viewerContainer = document.getElementById(this.containerId);
    if (!viewerContainer) {
      console.error(`Container ${this.containerId} not found!`);
      return;
    }

    const width = viewerContainer.clientWidth;
    const height = viewerContainer.clientHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    this.camera.position.set(0, 1, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0xffffff);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.physicallyCorrectLights = true;
    viewerContainer.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.25;

    // Default light
    const hemisphereLight = new THREE.HemisphereLight(0xcccccc, 0x333333, 6);
    this.scene.add(hemisphereLight);

    window.addEventListener("resize", () => {
      const newWidth = viewerContainer.clientWidth;
      const newHeight = viewerContainer.clientHeight;
      this.renderer.setSize(newWidth, newHeight);
      this.camera.aspect = newWidth / newHeight;
      this.camera.updateProjectionMatrix();
    });

    this.animate();
  }

  loadModel(baseName) {
    if (this.model) this.scene.remove(this.model);

    const loader = new GLTFLoader();
    // Configure DRACO decoder for compressed GLB
    try {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
      loader.setDRACOLoader(dracoLoader);
    } catch (e) {
      console.warn('DRACO loader setup failed (continuing without it):', e);
    }
    const modelUrl = `${this.modelPath}/${baseName}${this.modelExtension}`;
    console.log(`Loading comparison model: ${modelUrl}`);

    loader.load(
      modelUrl,
      (gltf) => {
        console.log(`Comparison model loaded successfully: ${baseName}`);
        this.model = gltf.scene;
        this.scene.add(this.model);

        this.model.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
            child.material.metalness = 0.2;
            child.material.roughness = 1.0;
          }
        });

        // Calculate model stats for explode functionality
        this.model_bbox = new THREE.Box3().setFromObject(this.model);
        this.model_center = this.model_bbox.getCenter(new THREE.Vector3());
        let closest_distance = Infinity;
        let closest_part = null;
        this.model.traverse((child) => {
          if (child.isMesh) {
            const bbox = new THREE.Box3().setFromObject(child);
            const part_center = bbox.getCenter(new THREE.Vector3());
            const distance = part_center.distanceTo(this.model_center);
            if (distance < closest_distance) {
              closest_distance = distance;
              closest_part = child;
            }
          }
        });
        this.closest_part = closest_part;
        this.closest_part_bbox = new THREE.Box3().setFromObject(this.closest_part);
        this.closest_part_center = this.closest_part_bbox.getCenter(new THREE.Vector3());

        // Reset camera based on model size
        this.camera.position.set(0, 1 + this.model_center.y, 8 + this.model_center.z);
      },
      (xhr) => {
        // progress
      },
      (error) => {
        console.error(`Failed to load comparison model ${baseName}:`, error);
      }
    );
  }

  applyExplodeEffect(explodeAmount) {
    if (!this.model) return;

    this.model.traverse((part) => {
      if (part.isMesh) {
        if (part === this.closest_part) return;
        const bbox = new THREE.Box3().setFromObject(part);
        const part_center = bbox.getCenter(new THREE.Vector3());
        const direction = part_center.clone().sub(this.closest_part_center).normalize();

        // Calculate the new position based on the explode amount
        const originalPosition = new THREE.Vector3().copy(part.userData.originalPosition || part.position);
        const offset = direction.multiplyScalar(explodeAmount * 2);
        const newPosition = originalPosition.clone().add(offset);

        // Store the original position if not already stored
        if (!part.userData.originalPosition) {
          part.userData.originalPosition = originalPosition.clone();
        }

        part.position.copy(newPosition);
      }
    });
  }

  setExplodeAmount(amount) {
    this.explodeAmount = amount;
    this.applyExplodeEffect(amount);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// initialize the main viewer
// need to manully fill in the model and image paths...
console.log("=== PARTVIEWER INITIALIZATION ===");
const modelNames = [
  "024",
  "028", 
  "45",
  "58",
  "153",

];
console.log("Model names array:", modelNames);

const viewer = new ViewerModule(
  ".partviewer",
  modelNames,
  "./static/meshes3",
  "./static/meshes3"
);
viewer.init();

// Initialize comparison viewers
const midiViewer = new ComparisonViewer("midi-viewer-container", "./static/meshes3", "_md.glb");
const partcrafterViewer = new ComparisonViewer("partcrafter-viewer-container", "./static/meshes3", "_pc.glb");
const partpackerViewer = new ComparisonViewer("partpacker-viewer-container", "./static/meshes3", "_pp.glb");

midiViewer.init();
partcrafterViewer.init();
partpackerViewer.init();

// Store comparison viewers globally for synchronization
window.comparisonViewers = {
  midi: midiViewer,
  partcrafter: partcrafterViewer,
  partpacker: partpackerViewer
};

// Load the first model for comparison viewers
if (modelNames.length > 0) {
  const firstModel = modelNames[0];
  midiViewer.loadModel(firstModel);
  partcrafterViewer.loadModel(firstModel);
  partpackerViewer.loadModel(firstModel);
}

// Override the original loadModel to sync with comparison viewers
const originalLoadModel = viewer.loadModel.bind(viewer);
viewer.loadModel = function(baseName, index) {
  // Call the original loadModel
  originalLoadModel(baseName, index);
  
  // Sync with comparison viewers
  if (window.comparisonViewers) {
    window.comparisonViewers.midi.loadModel(baseName);
    window.comparisonViewers.partcrafter.loadModel(baseName);
    window.comparisonViewers.partpacker.loadModel(baseName);
  }
};

// Setup explode slider event listeners for comparison viewers
function setupComparisonExplodeSliders() {
  const midiSlider = document.getElementById('midi-explode-slider');
  const partcrafterSlider = document.getElementById('partcrafter-explode-slider');
  const partpackerSlider = document.getElementById('partpacker-explode-slider');

  if (midiSlider && window.comparisonViewers) {
    midiSlider.addEventListener('input', (event) => {
      const explodeAmount = parseFloat(event.target.value);
      window.comparisonViewers.midi.setExplodeAmount(explodeAmount);
    });
  }

  if (partcrafterSlider && window.comparisonViewers) {
    partcrafterSlider.addEventListener('input', (event) => {
      const explodeAmount = parseFloat(event.target.value);
      window.comparisonViewers.partcrafter.setExplodeAmount(explodeAmount);
    });
  }

  if (partpackerSlider && window.comparisonViewers) {
    partpackerSlider.addEventListener('input', (event) => {
      const explodeAmount = parseFloat(event.target.value);
      window.comparisonViewers.partpacker.setExplodeAmount(explodeAmount);
    });
  }
}

// Setup sliders when DOM is ready
document.addEventListener('DOMContentLoaded', setupComparisonExplodeSliders);
