
import * as THREE from "three";
import "./style.css";

// ============================================================
// OPEN-WORLD PROTOTYPE
// Procedural humanoid, terrain, mountains, river, trees, rocks,
// third/first-person camera, walk/sprint/crouch/jump.
// ============================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bd9ff);
scene.fog = new THREE.Fog(0x9bd9ff, 90, 330);

const camera = new THREE.PerspectiveCamera(
  65, window.innerWidth / window.innerHeight, 0.1, 650
);
camera.position.set(0, 4, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = "block";
renderer.domElement.style.cursor = "crosshair";

scene.add(new THREE.HemisphereLight(0xdff2ff, 0x59634b, 2.1));

const sunlight = new THREE.DirectionalLight(0xfff1d7, 2.5);
sunlight.position.set(-100, 160, 70);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.left = -115;
sunlight.shadow.camera.right = 115;
sunlight.shadow.camera.top = 115;
sunlight.shadow.camera.bottom = -115;
sunlight.shadow.camera.near = 1;
sunlight.shadow.camera.far = 360;
sunlight.shadow.bias = -0.00015;
sunlight.shadow.normalBias = 0.025;
scene.add(sunlight);

// -------------------- WORLD / TERRAIN ------------------------
const WORLD_HALF = 160;
const WORLD_SIZE = WORLD_HALF * 2;
const TERRAIN_SEGMENTS = 220;

function riverCenterX(z) {
  return Math.sin(z * 0.022) * 22 + Math.sin(z * 0.051) * 7;
}

function baseTerrainHeight(x, z) {
  let h =
    Math.sin(x * 0.025) * 2.1 +
    Math.cos(z * 0.021) * 2.5 +
    Math.sin((x + z) * 0.018) * 1.4 +
    Math.cos(x * 0.061 + z * 0.037) * 0.55;

  const mountains = [
    [-82, -72, 24, 23],
    [-48, -104, 31, 27],
    [68, -86, 34, 28],
    [104, -35, 22, 20],
    [-105, 34, 20, 24],
    [76, 72, 27, 25],
    [-35, 104, 23, 21],
  ];

  for (const [mx, mz, height, spread] of mountains) {
    const dx = x - mx;
    const dz = z - mz;
    h += height * Math.exp(
      -(dx * dx + dz * dz) / (2 * spread * spread)
    );
  }

  return h;
}

function terrainHeight(x, z) {
  const base = baseTerrainHeight(x, z);
  const dx = x - riverCenterX(z);
  const valley = 2.7 * Math.exp(
    -(dx * dx) / (2 * 6.5 * 6.5)
  );
  return base - valley;
}

const terrainGeometry = new THREE.PlaneGeometry(
  WORLD_SIZE, WORLD_SIZE,
  TERRAIN_SEGMENTS, TERRAIN_SEGMENTS
);
terrainGeometry.rotateX(-Math.PI / 2);

const terrainPositions = terrainGeometry.attributes.position;
const terrainColors = [];

const colorGrass = new THREE.Color(0x5d9a4b);
const colorDarkGrass = new THREE.Color(0x477d3c);
const colorDirt = new THREE.Color(0x9b805e);
const colorRock = new THREE.Color(0x858985);
const colorSnow = new THREE.Color(0xe2e8e7);
const color = new THREE.Color();

for (let i = 0; i < terrainPositions.count; i++) {
  const x = terrainPositions.getX(i);
  const z = terrainPositions.getZ(i);
  const y = terrainHeight(x, z);

  terrainPositions.setY(i, y);

  if (y > 25) {
    const t = THREE.MathUtils.clamp((y - 25) / 16, 0, 1);
    color.copy(colorRock).lerp(colorSnow, t);
  } else if (y > 12) {
    const t = THREE.MathUtils.clamp((y - 12) / 13, 0, 1);
    color.copy(colorDarkGrass).lerp(colorRock, t);
  } else if (y < 0) {
    color.copy(colorDirt).lerp(
      colorGrass,
      THREE.MathUtils.clamp((y + 5) / 5, 0, 1)
    );
  } else {
    color.copy(colorGrass).lerp(
      colorDarkGrass,
      Math.max(0, Math.sin(x * 0.04 + z * 0.03)) * 0.22
    );
  }

  terrainColors.push(color.r, color.g, color.b);
}

terrainPositions.needsUpdate = true;
terrainGeometry.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(terrainColors, 3)
);
terrainGeometry.computeVertexNormals();

const terrain = new THREE.Mesh(
  terrainGeometry,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1
  })
);
terrain.receiveShadow = true;
scene.add(terrain);

const worldBase = new THREE.Mesh(
  new THREE.BoxGeometry(WORLD_SIZE, 8, WORLD_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x594c3e, roughness: 1 })
);
worldBase.position.y = -5.5;
worldBase.receiveShadow = true;
scene.add(worldBase);

// -------------------------- RIVER -----------------------------
const RIVER_SEGMENTS = 520;
const RIVER_WIDTH = 5.2;
const riverVertices = [];
const riverUvs = [];
const riverIndices = [];
const riverBaseYs = [];

for (let i = 0; i <= RIVER_SEGMENTS; i++) {
  const z = -WORLD_HALF + (WORLD_SIZE * i) / RIVER_SEGMENTS;
  const centerX = riverCenterX(z);
  const waterY = baseTerrainHeight(centerX, z) - 1.75;

  riverVertices.push(centerX - RIVER_WIDTH, waterY, z);
  riverVertices.push(centerX + RIVER_WIDTH, waterY, z);
  riverBaseYs.push(waterY, waterY);
  riverUvs.push(0, i / RIVER_SEGMENTS, 1, i / RIVER_SEGMENTS);

  if (i < RIVER_SEGMENTS) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    riverIndices.push(a, c, b, b, c, d);
  }
}

const riverGeometry = new THREE.BufferGeometry();
riverGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(riverVertices, 3)
);
riverGeometry.setAttribute(
  "uv",
  new THREE.Float32BufferAttribute(riverUvs, 2)
);
riverGeometry.setIndex(riverIndices);
riverGeometry.computeVertexNormals();

const riverMaterial = new THREE.MeshStandardMaterial({
  color: 0x329fc4,
  emissive: 0x073344,
  emissiveIntensity: 0.25,
  roughness: 0.22,
  metalness: 0.12,
  transparent: true,
  opacity: 0.88,
  side: THREE.DoubleSide,
});

const river = new THREE.Mesh(riverGeometry, riverMaterial);
river.receiveShadow = true;
scene.add(river);

// -------------------- PLAYER / HUMANOID -----------------------
const player = new THREE.Group();
scene.add(player);

const skinMaterial = new THREE.MeshStandardMaterial({
  color: 0xc98f69, roughness: 0.82
});
const shirtMaterial = new THREE.MeshStandardMaterial({
  color: 0x285eaa, roughness: 0.9
});
const shirtDarkMaterial = new THREE.MeshStandardMaterial({
  color: 0x1b3e70, roughness: 0.9
});
const pantsMaterial = new THREE.MeshStandardMaterial({
  color: 0x303b49, roughness: 0.95
});
const shoeMaterial = new THREE.MeshStandardMaterial({
  color: 0x24272a, roughness: 0.9
});
const hairMaterial = new THREE.MeshStandardMaterial({
  color: 0x30231e, roughness: 1
});
const eyeMaterial = new THREE.MeshStandardMaterial({
  color: 0x171717, roughness: 0.5
});

function makePart(geometry, material, parent, position, castShadow = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Player origin is at the feet. Local +Z is the character's front.
const hips = makePart(
  new THREE.BoxGeometry(0.56, 0.34, 0.34),
  pantsMaterial, player, [0, 1.02, 0]
);
const torso = makePart(
  new THREE.CapsuleGeometry(0.34, 0.68, 6, 12),
  shirtMaterial, player, [0, 1.58, 0]
);
const chestAccent = makePart(
  new THREE.BoxGeometry(0.42, 0.07, 0.035),
  shirtDarkMaterial, player, [0, 1.72, 0.322], false
);
const neck = makePart(
  new THREE.CylinderGeometry(0.105, 0.12, 0.2, 12),
  skinMaterial, player, [0, 2.12, 0]
);
const head = makePart(
  new THREE.SphereGeometry(0.255, 20, 16),
  skinMaterial, player, [0, 2.38, 0.015]
);
const hairCap = makePart(
  new THREE.SphereGeometry(
    0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55
  ),
  hairMaterial, player, [0, 2.47, -0.005]
);
const nose = makePart(
  new THREE.SphereGeometry(0.055, 10, 8),
  skinMaterial, player, [0, 2.36, 0.255]
);

makePart(
  new THREE.SphereGeometry(0.027, 8, 8),
  eyeMaterial, player, [-0.09, 2.405, 0.232], false
);
makePart(
  new THREE.SphereGeometry(0.027, 8, 8),
  eyeMaterial, player, [0.09, 2.405, 0.232], false
);

const leftArmPivot = new THREE.Group();
leftArmPivot.position.set(-0.405, 1.88, 0);
player.add(leftArmPivot);
makePart(
  new THREE.CapsuleGeometry(0.115, 0.48, 4, 8),
  shirtMaterial, leftArmPivot, [0, -0.29, 0]
);
makePart(
  new THREE.SphereGeometry(0.105, 10, 8),
  skinMaterial, leftArmPivot, [0, -0.61, 0.015]
);

const rightArmPivot = new THREE.Group();
rightArmPivot.position.set(0.405, 1.88, 0);
player.add(rightArmPivot);
makePart(
  new THREE.CapsuleGeometry(0.115, 0.48, 4, 8),
  shirtMaterial, rightArmPivot, [0, -0.29, 0]
);
makePart(
  new THREE.SphereGeometry(0.105, 10, 8),
  skinMaterial, rightArmPivot, [0, -0.61, 0.015]
);

const leftLegPivot = new THREE.Group();
leftLegPivot.position.set(-0.17, 0.72, 0);
player.add(leftLegPivot);
makePart(
  new THREE.CapsuleGeometry(0.14, 0.48, 4, 8),
  pantsMaterial, leftLegPivot, [0, -0.31, 0]
);
makePart(
  new THREE.BoxGeometry(0.25, 0.13, 0.4),
  shoeMaterial, leftLegPivot, [0, -0.62, 0.09]
);

const rightLegPivot = new THREE.Group();
rightLegPivot.position.set(0.17, 0.72, 0);
player.add(rightLegPivot);
makePart(
  new THREE.CapsuleGeometry(0.14, 0.48, 4, 8),
  pantsMaterial, rightLegPivot, [0, -0.31, 0]
);
makePart(
  new THREE.BoxGeometry(0.25, 0.13, 0.4),
  shoeMaterial, rightLegPivot, [0, -0.62, 0.09]
);

player.position.set(0, terrainHeight(0, 0), 0);

// ----------------------- VEGETATION ---------------------------
const worldColliders = [];
const collidableMeshes = [];
const treeAnimations = [];

const trunkMaterial = new THREE.MeshStandardMaterial({
  color: 0x62452c, roughness: 1
});
const pineMaterial = new THREE.MeshStandardMaterial({
  color: 0x1e6937, roughness: 1
});
const pineLightMaterial = new THREE.MeshStandardMaterial({
  color: 0x347f43, roughness: 1
});
const leafMaterial = new THREE.MeshStandardMaterial({
  color: 0x438747, roughness: 1
});
const leafLightMaterial = new THREE.MeshStandardMaterial({
  color: 0x6caa56, roughness: 1
});
const birchTrunkMaterial = new THREE.MeshStandardMaterial({
  color: 0xd5d0b9, roughness: 1
});
const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x777f80, roughness: 1
});
const rockLightMaterial = new THREE.MeshStandardMaterial({
  color: 0x989e9b, roughness: 1
});

let randomSeed = 91473;
function random() {
  randomSeed = (randomSeed * 16807) % 2147483647;
  return (randomSeed - 1) / 2147483646;
}

function randomWorldPosition(minDistanceFromSpawn = 16) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = (random() * 2 - 1) * (WORLD_HALF - 10);
    const z = (random() * 2 - 1) * (WORLD_HALF - 10);

    if (Math.hypot(x, z) < minDistanceFromSpawn) continue;
    if (Math.abs(x - riverCenterX(z)) < 10) continue;

    return { x, z };
  }

  return { x: 25, z: 25 };
}

function addTree(x, z, type) {
  const groundY = terrainHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, groundY, z);
  group.rotation.y = random() * Math.PI * 2;
  scene.add(group);

  let height = 4.5;
  let radius = 1.0;
  const trunkHeight =
    type === "pine" ? 2.0 : type === "birch" ? 2.8 : 2.4;
  const trunkRadius = type === "pine" ? 0.22 : 0.3;

  const trunk = makePart(
    new THREE.CylinderGeometry(
      trunkRadius * 0.75, trunkRadius, trunkHeight, 8
    ),
    type === "birch" ? birchTrunkMaterial : trunkMaterial,
    group,
    [0, trunkHeight / 2, 0]
  );

  if (type === "pine") {
    height = 5.2 + random() * 2.0;
    radius = 1.5;

    for (let layer = 0; layer < 3; layer++) {
      const coneHeight = height * 0.48;
      const coneRadius = 1.35 - layer * 0.25;

      makePart(
        new THREE.ConeGeometry(coneRadius, coneHeight, 8),
        layer === 1 ? pineLightMaterial : pineMaterial,
        group,
        [0, trunkHeight + 0.75 + layer * 0.95, 0]
      );
    }
  } else {
    height = type === "birch" ? 5.8 : 5.0 + random() * 1.8;
    radius = type === "birch" ? 1.45 : 2.1;

    const crown = makePart(
      new THREE.IcosahedronGeometry(
        type === "birch" ? 1.45 : 1.8, 1
      ),
      type === "birch" ? leafLightMaterial : leafMaterial,
      group,
      [0, trunkHeight + 1.5, 0]
    );

    crown.scale.set(
      type === "birch" ? 0.9 : 1.15,
      1.0,
      type === "birch" ? 0.9 : 1.05
    );

    makePart(
      new THREE.IcosahedronGeometry(
        type === "birch" ? 0.95 : 1.25, 0
      ),
      type === "birch" ? leafMaterial : leafLightMaterial,
      group,
      [0.65, trunkHeight + 1.2, 0.1]
    );
  }

  worldColliders.push({
    type: "tree",
    x, z,
    radius: 0.72,
    top: groundY + height,
    bottom: groundY
  });

  collidableMeshes.push(trunk);
  treeAnimations.push({
    group,
    phase: random() * Math.PI * 2,
    amount: 0.012 + random() * 0.012
  });
}

for (let i = 0; i < 330; i++) {
  const { x, z } = randomWorldPosition(18);
  const roll = random();
  const type = roll < 0.52 ? "pine" : roll < 0.77 ? "oak" : "birch";
  addTree(x, z, type);
}

// -------------------------- ROCKS -----------------------------
const rocks = [];

for (let i = 0; i < 105; i++) {
  const { x, z } = randomWorldPosition(12);
  const size = 0.45 + random() * 1.9;
  const groundY = terrainHeight(x, z);

  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(size, 0),
    random() > 0.5 ? rockMaterial : rockLightMaterial
  );

  rock.position.set(x, groundY + size * 0.55, z);
  rock.rotation.set(
    random() * 0.5,
    random() * Math.PI,
    random() * 0.5
  );
  rock.scale.set(
    1 + random() * 0.45,
    0.65 + random() * 0.4,
    0.9 + random() * 0.4
  );
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);

  const top = groundY + size * 1.1;
  const radius = size * 0.9;

  worldColliders.push({
    type: "rock", x, z, radius, size, top, bottom: groundY
  });

  collidableMeshes.push(rock);
  rocks.push(rock);
}

const keys = Object.create(null);
let jumpRequested = false;
let isFirstPerson = false;
let cameraModeBlend = 0;
const cameraTransitionSpeed = 5;

const clock = new THREE.Clock();
const cameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const thirdPersonPosition = new THREE.Vector3();
const firstPersonPosition = new THREE.Vector3();
const desiredLookTarget = new THREE.Vector3();
const firstPersonLookDirection = new THREE.Vector3();
const firstPersonLookTarget = new THREE.Vector3();
const moveDirection = new THREE.Vector3();
const forwardDirection = new THREE.Vector3();
const rightDirection = new THREE.Vector3();
const cameraRaycaster = new THREE.Raycaster();
const cameraRayDirection = new THREE.Vector3();

let cameraYaw = 0;
let cameraPitch = 0.32;
let firstPersonPitch = 0;

const cameraDistance = 8.5;
const mouseSensitivity = 0.0025;

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 9.2;
const CROUCH_SPEED = 2.5;
const JUMP_STRENGTH = 10.8;
const GRAVITY = 26;
const PLAYER_RADIUS = 0.42;
const PLAYER_HEIGHT = 2.55;
const CROUCH_HEIGHT = 1.55;

let verticalVelocity = 0;
let isGrounded = true;
let isCrouching = false;
let walkCycle = 0;
let playerGroundY = terrainHeight(0, 0);

function isTypingTarget(target) {
  return target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

window.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) return;

  if ([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "Space", "Tab", "ControlLeft", "ControlRight"
  ].includes(event.code)) {
    event.preventDefault();
  }

  keys[event.code] = true;

  if (event.code === "Space" && !event.repeat) {
    jumpRequested = true;
  }

  if (event.code === "Tab" && !event.repeat) {
    isFirstPerson = !isFirstPerson;
  }
});

window.addEventListener("keyup", (event) => {
  keys[event.code] = false;
});

window.addEventListener("blur", () => {
  for (const key of Object.keys(keys)) {
    keys[key] = false;
  }
  jumpRequested = false;
});

renderer.domElement.addEventListener("click", () => {
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
  }
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;

  cameraYaw -= event.movementX * mouseSensitivity;
  const pitchChange = event.movementY * mouseSensitivity;

  if (isFirstPerson) {
    firstPersonPitch = THREE.MathUtils.clamp(
      firstPersonPitch + pitchChange, -1.15, 1.15
    );
  } else {
    cameraPitch = THREE.MathUtils.clamp(
      cameraPitch + pitchChange, 0.08, 1.15
    );
  }
});

function resolveHorizontalCollisions(previousX, previousZ) {
  const feetY = player.position.y;
  const headY = feetY + (isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT);

  for (const obstacle of worldColliders) {
    const dx = player.position.x - obstacle.x;
    const dz = player.position.z - obstacle.z;
    const distance = Math.hypot(dx, dz) || 0.0001;
    const minimum = PLAYER_RADIUS + obstacle.radius;

    if (distance >= minimum) continue;

    if (obstacle.type === "rock" && feetY > obstacle.top - 0.15) {
      continue;
    }

    if (obstacle.type === "rock" && !isGrounded && verticalVelocity > -1) {
      continue;
    }

    if (headY < obstacle.bottom || feetY > obstacle.top + 0.2) {
      continue;
    }

    const pushX = (dx / distance) * (minimum - distance);
    const pushZ = (dz / distance) * (minimum - distance);

    player.position.x += pushX;
    player.position.z += pushZ;
  }

  if (
    !Number.isFinite(player.position.x) ||
    !Number.isFinite(player.position.z)
  ) {
    player.position.x = previousX;
    player.position.z = previousZ;
  }
}

function findGroundHeight(x, z, feetY) {
  let bestY = terrainHeight(x, z);
  let bestType = "terrain";

  for (const obstacle of worldColliders) {
    if (obstacle.type !== "rock") continue;

    const distance = Math.hypot(x - obstacle.x, z - obstacle.z);

    if (
      distance < obstacle.radius * 0.72 &&
      obstacle.top <= feetY + 1.25 &&
      obstacle.top > bestY
    ) {
      bestY = obstacle.top;
      bestType = "rock";
    }
  }

  return { height: bestY, type: bestType };
}

function animateHumanoid(delta, moving, sprinting, crouching, airborne) {
  const speedMultiplier = sprinting ? 1.45 : 1;

  if (moving && isGrounded) {
    walkCycle += delta * (sprinting ? 13 : 8);
  }

  const swing = moving && isGrounded
    ? Math.sin(walkCycle) * 0.62 * speedMultiplier
    : 0;

  leftLegPivot.rotation.x = THREE.MathUtils.damp(
    leftLegPivot.rotation.x, swing, 12, delta
  );
  rightLegPivot.rotation.x = THREE.MathUtils.damp(
    rightLegPivot.rotation.x, -swing, 12, delta
  );

  leftArmPivot.rotation.x = THREE.MathUtils.damp(
    leftArmPivot.rotation.x, -swing * 0.8, 12, delta
  );
  rightArmPivot.rotation.x = THREE.MathUtils.damp(
    rightArmPivot.rotation.x, swing * 0.8, 12, delta
  );

  const crouchBlend = crouching ? 1 : 0;

  torso.position.y = THREE.MathUtils.damp(
    torso.position.y, 1.58 - 0.42 * crouchBlend, 10, delta
  );

  chestAccent.position.y = torso.position.y + 0.14;

  neck.position.y = THREE.MathUtils.damp(
    neck.position.y, 2.12 - 0.36 * crouchBlend, 10, delta
  );

  head.position.y = THREE.MathUtils.damp(
    head.position.y, 2.38 - 0.42 * crouchBlend, 10, delta
  );

  hairCap.position.y = head.position.y + 0.09;
  nose.position.y = head.position.y - 0.02;

  leftArmPivot.rotation.x = THREE.MathUtils.damp(
    leftArmPivot.rotation.x,
    -swing * 0.8 + crouchBlend * 0.45,
    10, delta
  );

  rightArmPivot.rotation.x = THREE.MathUtils.damp(
    rightArmPivot.rotation.x,
    swing * 0.8 + crouchBlend * 0.45,
    10, delta
  );

  leftLegPivot.rotation.x = THREE.MathUtils.damp(
    leftLegPivot.rotation.x,
    swing + crouchBlend * 0.35,
    10, delta
  );

  rightLegPivot.rotation.x = THREE.MathUtils.damp(
    rightLegPivot.rotation.x,
    -swing + crouchBlend * 0.35,
    10, delta
  );

  if (airborne) {
    leftArmPivot.rotation.x = THREE.MathUtils.damp(
      leftArmPivot.rotation.x, -0.8, 8, delta
    );
    rightArmPivot.rotation.x = THREE.MathUtils.damp(
      rightArmPivot.rotation.x, -0.8, 8, delta
    );
  }
}

// -------------------------- GAME LOOP -------------------------
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;

  // Animate the river surface.
  const riverPosition = riverGeometry.attributes.position;

  for (let i = 0; i < riverPosition.count; i++) {
    const baseY = riverBaseYs[i];
    const z = riverPosition.getZ(i);
    const x = riverPosition.getX(i);

    riverPosition.setY(
      i,
      baseY + Math.sin(z * 0.22 + elapsed * 2.2 + x * 0.12) * 0.045
    );
  }

  riverPosition.needsUpdate = true;
  riverGeometry.computeVertexNormals();

  // Gentle wind animation.
  for (const tree of treeAnimations) {
    tree.group.rotation.z =
      Math.sin(elapsed * 1.1 + tree.phase) * tree.amount;
  }

  // Input and movement.
  isCrouching = Boolean(keys.ControlLeft || keys.ControlRight);

  const inputX =
    Number(keys.KeyD || keys.ArrowRight) -
    Number(keys.KeyA || keys.ArrowLeft);

  const inputZ =
    Number(keys.KeyS || keys.ArrowDown) -
    Number(keys.KeyW || keys.ArrowUp);

  const moving = inputX !== 0 || inputZ !== 0;
  const sprinting =
    !isCrouching && Boolean(keys.ShiftLeft || keys.ShiftRight);

  forwardDirection.set(
    -Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)
  );

  rightDirection.set(
    Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)
  );

  moveDirection.set(0, 0, 0)
    .addScaledVector(rightDirection, inputX)
    .addScaledVector(forwardDirection, -inputZ);

  const previousX = player.position.x;
  const previousZ = player.position.z;

  if (moving) {
    moveDirection.normalize();

    const speed = isCrouching
      ? CROUCH_SPEED
      : sprinting
        ? SPRINT_SPEED
        : WALK_SPEED;

    player.position.addScaledVector(moveDirection, speed * delta);

    player.rotation.y = Math.atan2(
      moveDirection.x, moveDirection.z
    );
  }

  if (isFirstPerson) {
    player.rotation.y = cameraYaw + Math.PI;
  }

  // Horizontal collision checks.
  resolveHorizontalCollisions(previousX, previousZ);

  // Jumping and gravity.
  if (jumpRequested && isGrounded) {
    verticalVelocity = JUMP_STRENGTH;
    isGrounded = false;
  }

  jumpRequested = false;

  const previousFeetY = player.position.y;

  if (!isGrounded) {
    verticalVelocity -= GRAVITY * delta;
    player.position.y += verticalVelocity * delta;
  }

  const ground = findGroundHeight(
    player.position.x,
    player.position.z,
    previousFeetY
  );

  playerGroundY = ground.height;

  if (verticalVelocity <= 0 && player.position.y <= ground.height) {
    player.position.y = ground.height;
    verticalVelocity = 0;
    isGrounded = true;
  } else if (isGrounded) {
    player.position.y = ground.height;
  }

  // Keep the player inside the world.
  player.position.x = THREE.MathUtils.clamp(
    player.position.x, -WORLD_HALF + 3, WORLD_HALF - 3
  );
  player.position.z = THREE.MathUtils.clamp(
    player.position.z, -WORLD_HALF + 3, WORLD_HALF - 3
  );

  animateHumanoid(
    delta, moving, sprinting, isCrouching, !isGrounded
  );

  // Camera transition.
  const targetBlend = isFirstPerson ? 1 : 0;

  cameraModeBlend = THREE.MathUtils.damp(
    cameraModeBlend,
    targetBlend,
    cameraTransitionSpeed,
    delta
  );

  cameraTarget.copy(player.position);
  cameraTarget.y += isCrouching ? 0.9 : 1.45;

  const horizontalDistance =
    cameraDistance * Math.cos(cameraPitch);

  thirdPersonPosition.set(
    player.position.x +
    Math.sin(cameraYaw) * horizontalDistance,
    player.position.y +
    cameraDistance * Math.sin(cameraPitch) + 1.1,
    player.position.z +
    Math.cos(cameraYaw) * horizontalDistance
  );

  // Avoid placing the third-person camera inside trees or rocks.
  cameraRayDirection
    .subVectors(thirdPersonPosition, cameraTarget)
    .normalize();

  cameraRaycaster.set(cameraTarget, cameraRayDirection);
  cameraRaycaster.far =
    thirdPersonPosition.distanceTo(cameraTarget);

  const cameraHits = cameraRaycaster.intersectObjects(
    collidableMeshes, false
  );

  if (cameraHits.length > 0) {
    thirdPersonPosition.copy(cameraHits[0].point)
      .addScaledVector(cameraRayDirection, -0.5);
  }

  const cameraGround =
    terrainHeight(thirdPersonPosition.x, thirdPersonPosition.z) + 0.65;

  thirdPersonPosition.y = Math.max(
    thirdPersonPosition.y, cameraGround
  );

  firstPersonPosition.set(
    player.position.x,
    player.position.y + (isCrouching ? 1.18 : 2.15),
    player.position.z
  );

  desiredCameraPosition.lerpVectors(
    thirdPersonPosition,
    firstPersonPosition,
    cameraModeBlend
  );

  camera.position.lerp(
    desiredCameraPosition,
    1 - Math.exp(-cameraTransitionSpeed * delta)
  );

  firstPersonLookDirection.set(
    -Math.sin(cameraYaw) * Math.cos(firstPersonPitch),
    Math.sin(firstPersonPitch),
    -Math.cos(cameraYaw) * Math.cos(firstPersonPitch)
  );

  firstPersonLookTarget
    .copy(firstPersonPosition)
    .addScaledVector(firstPersonLookDirection, 10);

  desiredLookTarget.lerpVectors(
    cameraTarget,
    firstPersonLookTarget,
    cameraModeBlend
  );

  camera.lookAt(desiredLookTarget);

  // Zoom animation between perspectives.
  const targetFov = isFirstPerson ? 76 : 65;

  camera.fov = THREE.MathUtils.damp(
    camera.fov,
    targetFov,
    cameraTransitionSpeed,
    delta
  );

  camera.updateProjectionMatrix();

  // Hide the character model near first-person view.
  const showBody = cameraModeBlend < 0.92;

  torso.visible = showBody;
  hips.visible = showBody;
  chestAccent.visible = showBody;
  neck.visible = showBody;
  head.visible = showBody;
  hairCap.visible = showBody;
  nose.visible = showBody;
  leftArmPivot.visible = showBody;
  rightArmPivot.visible = showBody;
  leftLegPivot.visible = showBody;
  rightLegPivot.visible = showBody;

  renderer.render(scene, camera);
}

animate();

// ---------------------- RESIZE HANDLER ------------------------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
});
