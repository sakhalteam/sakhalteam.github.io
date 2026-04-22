import * as THREE from "three";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Particle, ParticleSystem } from "./ParticleSystem";

var camera, scene, renderer, renderTarget, depthMaterial, clock;

var water,
  waterfall,
  particleSystem,
  emissionTime = 0,
  nextEmissionTime = 0;

init();
animate();

function init() {
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 6, 8);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e485e);

  // lights

  var ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
  scene.add(ambientLight);

  var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0, 5, 5);
  scene.add(dirLight);

  // border

  var boxGeometry = new THREE.BoxBufferGeometry(10, 1, 1);
  var boxMaterial = new THREE.MeshLambertMaterial({ color: 0xea4d10 });

  var box1 = new THREE.Mesh(boxGeometry, boxMaterial);
  box1.position.z = 4.5;
  scene.add(box1);

  var box2 = new THREE.Mesh(boxGeometry, boxMaterial);
  box2.position.z = -4.5;
  scene.add(box2);

  var box3 = new THREE.Mesh(boxGeometry, boxMaterial);
  box3.position.x = -5;
  box3.rotation.y = Math.PI * 0.5;
  scene.add(box3);

  var box4 = new THREE.Mesh(boxGeometry, boxMaterial);
  box4.position.x = 5;
  box4.rotation.y = Math.PI * 0.5;
  scene.add(box4);

  //

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.gammaOutput = true;
  document.body.appendChild(renderer.domElement);

  var supportsDepthTextureExtension = !!renderer.extensions.get(
    "WEBGL_depth_texture",
  );

  //

  var pixelRatio = renderer.getPixelRatio();

  renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth * pixelRatio,
    window.innerHeight * pixelRatio,
  );
  renderTarget.texture.minFilter = THREE.NearestFilter;
  renderTarget.texture.magFilter = THREE.NearestFilter;
  renderTarget.texture.generateMipmaps = false;
  renderTarget.stencilBuffer = false;

  if (supportsDepthTextureExtension === true) {
    renderTarget.depthTexture = new THREE.DepthTexture();
    renderTarget.depthTexture.type = THREE.UnsignedShortType;
    renderTarget.depthTexture.minFilter = THREE.NearestFilter;
    renderTarget.depthTexture.maxFilter = THREE.NearestFilter;
  }

  depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.depthPacking = THREE.RGBADepthPacking;
  depthMaterial.blending = THREE.NoBlending;

  // textures

  var loader = new THREE.TextureLoader();

  var noiseMap = loader.load("https://i.imgur.com/gPz7iPX.jpg");
  var dudvMap = loader.load("https://i.imgur.com/hOIsXiZ.png");

  noiseMap.wrapS = noiseMap.wrapT = THREE.RepeatWrapping;
  noiseMap.minFilter = THREE.NearestFilter;
  noiseMap.magFilter = THREE.NearestFilter;
  dudvMap.wrapS = dudvMap.wrapT = THREE.RepeatWrapping;

  // waterfall

  var waterfallUniforms = {
    time: {
      value: 0,
    },
    tNoise: {
      value: null,
    },
    tDudv: {
      value: null,
    },
    topDarkColor: {
      value: new THREE.Color(0x4e7a71),
    },
    bottomDarkColor: {
      value: new THREE.Color(0x0e7562),
    },
    topLightColor: {
      value: new THREE.Color(0xb0f7e9),
    },
    bottomLightColor: {
      value: new THREE.Color(0x14c6a5),
    },
    foamColor: {
      value: new THREE.Color(0xffffff),
    },
  };

  var waterfallMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib["fog"],
      waterfallUniforms,
    ]),
    vertexShader: document.getElementById("vertexShaderWaterfall").textContent,
    fragmentShader: document.getElementById("fragmentShaderWaterfall")
      .textContent,
    fog: true,
  });

  waterfall = new THREE.Mesh(
    new THREE.CylinderBufferGeometry(1, 1, 8, 16, 1, true),
    waterfallMaterial,
  );
  waterfall.position.y = 3;
  scene.add(waterfall);

  waterfallMaterial.uniforms.tNoise.value = noiseMap;
  waterfallMaterial.uniforms.tDudv.value = dudvMap;

  // water

  var waterUniforms = {
    time: {
      value: 0,
    },
    threshold: {
      value: 0.1,
    },
    tDudv: {
      value: null,
    },
    tDepth: {
      value: null,
    },
    cameraNear: {
      value: 0,
    },
    cameraFar: {
      value: 0,
    },
    resolution: {
      value: new THREE.Vector2(),
    },
    foamColor: {
      value: new THREE.Color(0xffffff),
    },
    waterColor: {
      value: new THREE.Color(0x14c6a5),
    },
  };

  var waterGeometry = new THREE.PlaneBufferGeometry(10, 10);
  var waterMaterial = new THREE.ShaderMaterial({
    defines: {
      DEPTH_PACKING: supportsDepthTextureExtension === true ? 0 : 1,
      ORTHOGRAPHIC_CAMERA: 0,
    },
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib["fog"],
      waterUniforms,
    ]),
    vertexShader: document.getElementById("vertexShaderWater").textContent,
    fragmentShader: document.getElementById("fragmentShaderWater").textContent,
    fog: true,
  });

  waterMaterial.uniforms.cameraNear.value = camera.near;
  waterMaterial.uniforms.cameraFar.value = camera.far;
  waterMaterial.uniforms.resolution.value.set(
    window.innerWidth * pixelRatio,
    window.innerHeight * pixelRatio,
  );
  waterMaterial.uniforms.tDudv.value = dudvMap;
  waterMaterial.uniforms.tDepth.value =
    supportsDepthTextureExtension === true
      ? renderTarget.depthTexture
      : renderTarget.texture;

  water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI * 0.5;
  scene.add(water);

  //

  particleSystem = new ParticleSystem();

  var particleGeometry = new THREE.SphereBufferGeometry(1, 16, 8);
  particleGeometry = particleGeometry.toNonIndexed();
  var particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    alphaMap: noiseMap,
  });

  particleMaterial.onBeforeCompile = function (shader) {
    shader.vertexShader =
      "attribute float t;\nvarying float vT;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      [
        "vec3 transformed = vec3( position );",
        "transformed.y += t * 0.25;",
        "vT = t;",
      ].join("\n"),
    );
    shader.fragmentShader = "varying float vT;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphamap_fragment>",
      [
        "float dissolve = abs( sin( 1.0 - vT ) ) - texture2D( alphaMap, vUv ).g;",
        "if ( dissolve < 0.01 ) discard;",
      ].join("\n"),
    );
  };

  particleSystem.init(particleGeometry, particleMaterial, 250);
  scene.add(particleSystem._instancedMesh);

  //

  var controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 1;
  controls.maxDistance = 50;

  //

  window.addEventListener("resize", onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

  var pixelRatio = renderer.getPixelRatio();

  renderTarget.setSize(
    window.innerWidth * pixelRatio,
    window.innerHeight * pixelRatio,
  );
  water.material.uniforms.resolution.value.set(
    window.innerWidth * pixelRatio,
    window.innerHeight * pixelRatio,
  );
}

function updateParticles(delta) {
  emissionTime += delta;

  if (emissionTime > nextEmissionTime) {
    const particlePerSecond = 25;
    const t = 1 / particlePerSecond;

    nextEmissionTime = emissionTime + t / 2 + (t / 2) * Math.random();

    // emit new particle

    const particle = new Particle();
    particle.position.x = Math.sin(2 * Math.PI * Math.random());
    particle.position.y = 0;
    particle.position.z = Math.cos(2 * Math.PI * Math.random());
    particle.lifetime = Math.random() * 0.2 + 0.5;
    particle.size = Math.random() * 0.25 + 0.5;

    particleSystem.add(particle);
  }

  // update the system itself

  particleSystem.update(delta);
}

function animate() {
  requestAnimationFrame(animate);

  // depth pass

  water.visible = false; // we don't want the depth of the water
  scene.overrideMaterial = depthMaterial;

  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  scene.overrideMaterial = null;
  water.visible = true;

  // beauty pass

  var delta = clock.getDelta();
  var time = clock.getElapsedTime();

  waterfall.material.uniforms.time.value = time;
  water.material.uniforms.time.value = time;

  updateParticles(delta);

  renderer.render(scene, camera);
}
