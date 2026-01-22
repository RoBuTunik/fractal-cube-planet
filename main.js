import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { state } from './state.js';
import { GRID_SIZE, BLOCK_SIZE, INTERACT_RANGE_BLOCKS } from './config.js';
import { playSound } from './audio.js';
import { WorldGrid, getSafeSpawnPosition } from './world.js';
import { isColliding } from './physics.js';
import { setupControls } from './controls.js';
import { spawnCollectibles, updateCollectibles } from './collectibles.js';
import { BLOCK_DATA } from './world.js';

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

// The worldGroup will be scaled and shifted instead of the player shrinking
const worldGroup = new THREE.Group();
scene.add(worldGroup);
state.worldGroup = worldGroup;
state.transformStack = [{ pos: new THREE.Vector3(0, 0, 0), scale: 1 }];

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 10000);
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    logarithmicDepthBuffer: true // Helps with precision across massive scale differences
});
// Use sRGB output for correct, slightly brighter color rendering
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMappingExposure = 1.05; // subtle exposure boost
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const pointerControls = new PointerLockControls(camera, document.body);

// UI Elements
const wpBtn = document.getElementById('waypoint-btn');
const wpMenu = document.getElementById('waypoint-menu');
const wpList = document.getElementById('waypoint-list');
const closeWp = document.getElementById('close-wp');
const setWpBtn = document.getElementById('set-wp-btn');

function toggleWaypointMenu() {
    const isVisible = wpMenu.style.display === 'flex';
    wpMenu.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
        if (pointerControls.isLocked) pointerControls.unlock();
        renderWaypointList();
    }
}

function renderWaypointList() {
    wpList.innerHTML = '';
    state.waypoints.forEach((wp, index) => {
        const div = document.createElement('div');
        div.className = 'wp-item';
        div.innerText = `${wp.name} (Depth ${wp.depth})`;
        div.onclick = () => teleportToWaypoint(wp);
        wpList.appendChild(div);
    });
}

function teleportToWaypoint(wp) {
    state.worldGroup.position.copy(wp.worldGroupPos);
    state.worldGroup.scale.setScalar(wp.worldGroupScale);
    camera.position.copy(wp.cameraPos);
    
    state.currentLayer = wp.depth;
    state.activeGrid = wp.activeGrid;
    
    // Deep clone the transform stack
    state.transformStack = wp.transformStack.map(t => ({
        pos: t.pos.clone(),
        scale: t.scale
    }));

    updateCameraPlanes();
    playSound('enter');
    document.getElementById('depth-indicator').innerText = `Depth: ${state.currentLayer}`;
    wpMenu.style.display = 'none';
}

function addCurrentWaypoint() {
    const name = prompt("Waypoint Name:", `Spot ${state.waypoints.length}`);
    if (!name) return;
    
    // Find the player's grid coordinate in the active grid to place a physical block
    const tempV = new THREE.Vector3();
    tempV.copy(camera.position).applyMatrix4(new THREE.Matrix4().copy(state.activeGrid.container.matrixWorld).invert());
    const halfSize = (GRID_SIZE * BLOCK_SIZE) / 2;
    const gx = Math.floor((tempV.x + halfSize) / BLOCK_SIZE);
    const gy = Math.floor((tempV.y + halfSize) / BLOCK_SIZE);
    const gz = Math.floor((tempV.z + halfSize) / BLOCK_SIZE);

    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE && gz >= 0 && gz < GRID_SIZE) {
        const idx = state.activeGrid.getIdx(gx, gy, gz);
        // Only set waypoint block if it's currently air
        if (state.activeGrid.blocks[idx] === 0) {
            state.activeGrid.blocks[idx] = 5;
            state.activeGrid.updateInstance(idx);
            state.activeGrid.instances.waypoint.instanceMatrix.needsUpdate = true;
        }
    }

    state.waypoints.push({
        name: name,
        depth: state.currentLayer,
        worldGroupPos: state.worldGroup.position.clone(),
        worldGroupScale: state.worldGroup.scale.x,
        cameraPos: camera.position.clone(),
        activeGrid: state.activeGrid,
        transformStack: state.transformStack.map(t => ({ pos: t.pos.clone(), scale: t.scale }))
    });
    renderWaypointList();
}

wpBtn.onclick = toggleWaypointMenu;
closeWp.onclick = () => wpMenu.style.display = 'none';
setWpBtn.onclick = addCurrentWaypoint;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(10, 10, 0);
scene.add(sunLight);

// --- Core Logic ---

const raycaster = new THREE.Raycaster();

function updateCameraPlanes() {
    // In the world-growth model, near plane stays constant as the player size is constant.
    camera.near = 0.05;
    camera.far = 20000;
    camera.updateProjectionMatrix();

    // PERFORMANCE: Hide grids that are not part of the active lineage or their immediate visible children
    state.grids.forEach(grid => grid.container.visible = false);

    let curr = state.activeGrid;
    while (curr) {
        curr.container.visible = true;
        // Show immediate split children so we can see "into" the fractal
        curr.splitData.forEach(child => child.container.visible = true);
        curr = curr.parent;
    }

    // Always ensure the root layer is visible for context
    if (state.grids.length > 0) {
        state.grids[0].container.visible = true;
    }
}

function onGrow() {
    if (state.isTransitioning || state.currentLayer === 0) return;
    
    const lastTransform = state.transformStack.pop();
    if (lastTransform) {
        // Save relative position in current (zoomed) space
        const relPos = camera.position.clone();

        worldGroup.position.copy(lastTransform.pos);
        worldGroup.scale.setScalar(lastTransform.scale);
        
        // Find where the child grid was in the parent's local space
        const childLocalPos = state.activeGrid.container.position;
        
        // Restore camera to that position, adjusted by the relative offset
        camera.position.copy(childLocalPos).add(relPos.divideScalar(GRID_SIZE));

        state.currentLayer--;
        state.activeGrid = state.activeGrid.parent;
        
        updateCameraPlanes();
        playSound('enter');
        document.getElementById('depth-indicator').innerText = `Depth: ${state.currentLayer}`;
    }

    autoSplitting();
}

function enterGrid(childGrid) {
    if (!childGrid || state.isTransitioning) return;

    state.isTransitioning = true;
    
    state.transformStack.push({
        pos: worldGroup.position.clone(),
        scale: worldGroup.scale.x
    });

    const targetWorldPos = new THREE.Vector3();
    childGrid.container.getWorldPosition(targetWorldPos);

    // Calculate relative position before scaling
    const relPos = camera.position.clone().sub(targetWorldPos);

    // Scale the world around the child center
    worldGroup.position.sub(targetWorldPos).multiplyScalar(GRID_SIZE);
    worldGroup.scale.multiplyScalar(GRID_SIZE);

    // Update state
    state.currentLayer++;
    state.activeGrid = childGrid;

    // Maintain relative camera position at the new scale
    camera.position.copy(relPos.multiplyScalar(GRID_SIZE));
    state.velocity.set(0, 0, 0);

    updateCameraPlanes();
    playSound('enter');
    document.getElementById('depth-indicator').innerText = `Depth: ${state.currentLayer}`;

    setTimeout(() => { state.isTransitioning = false; }, 200);

    autoSplitting();
}

function onInteract() {
    if (state.isTransitioning) return;
    if (!pointerControls.isLocked) {
        pointerControls.lock();
        return;
    }

    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    
    const visibleBalls = state.collectibles.filter(c => c.grid.container.visible);
    const ballMeshes = visibleBalls.map(c => c.mesh);
    const ballIntersects = raycaster.intersectObjects(ballMeshes);

    const maxDist = INTERACT_RANGE_BLOCKS * BLOCK_SIZE;

    if (ballIntersects.length > 0) {
        const hitBall = ballIntersects[0].object;
        const colIdx = state.collectibles.findIndex(c => c.mesh === hitBall);
        
        if (colIdx !== -1) {
            const ballData = state.collectibles[colIdx];
            // Return to parent via onGrow logic until we reach target depth
            while (state.currentLayer == ballData.grid.depth) {
                enterGrid(ballData.grid);
            }

            return;
        }
    }
}

// Initial Boot
const rootGrid = new WorldGrid(worldGroup, 0, state.seed, { x: 0, y: 0, z: 0, s: 1 }, new THREE.Vector3(), 1.0, null);
state.activeGrid = rootGrid;

// Spawn Waypoint (Depth 0, bottom)
const spawnPos = getSafeSpawnPosition(rootGrid);
camera.position.copy(spawnPos);
camera.lookAt(0, 0, 0);

// Find the grid coordinate for the spawn position to place the initial waypoint block
const halfSize = (GRID_SIZE * BLOCK_SIZE) / 2;
const sgx = Math.floor((spawnPos.x + halfSize) / BLOCK_SIZE);
const sgy = Math.floor((spawnPos.y + halfSize) / BLOCK_SIZE);
const sgz = Math.floor((spawnPos.z + halfSize) / BLOCK_SIZE);
const spawnIdx = rootGrid.getIdx(sgx, sgy, sgz);
rootGrid.blocks[spawnIdx] = 5;
rootGrid.updateInstance(spawnIdx);
rootGrid.instances.waypoint.instanceMatrix.needsUpdate = true;

state.waypoints.push({
    name: "Spawn (Bottom)",
    depth: 0,
    worldGroupPos: new THREE.Vector3(0, 0, 0),
    worldGroupScale: 1,
    cameraPos: spawnPos.clone(),
    activeGrid: rootGrid,
    transformStack: [{ pos: new THREE.Vector3(0, 0, 0), scale: 1 }]
});

updateCameraPlanes();

setupControls(camera, renderer, pointerControls, onInteract, onGrow);

// --- Game Loop ---
let prevTime = performance.now();
let lastPos = new THREE.Vector3();

// Reuse temp objects (module-level or closure-level)
const _tempMatrix = new THREE.Matrix4();
const _worldPos = new THREE.Vector3();
const _camPos = camera.position;

function autoSplitNearbyBlocks() {
    let step = 0;
    for (const grid of state.grids) {
        if (!grid.container.visible) continue;
        if (grid.depth >= state.currentLayer) continue;

        // Precompute distance ONCE per grid
        const splitDist = BLOCK_SIZE * GRID_SIZE * 3 * Math.pow(16, state.currentLayer - grid.depth - 1);
        const splitDistSq = splitDist * splitDist;

        const instances = grid.instances;
        for (const key in instances) {
            const inst = instances[key];

            for (let i = 0, l = inst.count; i < l; i++) {
                if (grid.splitData.has(i)) continue;

                const type = grid.blocks[i];
                if (!BLOCK_DATA[type].splits) continue;

                inst.getMatrixAt(i, _tempMatrix);
                _worldPos.setFromMatrixPosition(_tempMatrix);
                _worldPos.applyMatrix4(inst.matrixWorld);

                // Skip origin junk
                if (_worldPos.x === 0 && _worldPos.y === 0 && _worldPos.z === 0) continue;

                if (_worldPos.distanceToSquared(_camPos) <= splitDistSq) {
                    grid.splitBlock(i);
                    step++;
                    if (step > 100) return;
                }
            }
        }
    }
}

const _tempMatrix2 = new THREE.Matrix4();
const _worldPos2 = new THREE.Vector3();

function autoUnsplitFarBlocks() {
    let step = 0;
    for (const grid of state.grids) {

        // Collapse everything immediately if too small
        if (grid.depth >= state.currentLayer) {
            for (const idx of grid.splitData.keys()) {
                grid.unsplitBlock(idx);
            }
            continue;
        }

        if (!grid.container.visible) continue;

        const unsplitDist = BLOCK_SIZE * GRID_SIZE * 3 * Math.pow(16, state.currentLayer - grid.depth - 1);
        const unsplitDistSq = unsplitDist * unsplitDist;

        const instances = grid.instances;
        for (const key in instances) {
            const inst = instances[key];

            for (const [idx, childGrid] of grid.splitData) {
                if (childGrid === state.activeGrid) continue;

                inst.getMatrixAt(idx, _tempMatrix2);
                _worldPos2.setFromMatrixPosition(_tempMatrix2);
                _worldPos2.applyMatrix4(inst.matrixWorld);

                //Skip the garbage haha (origin issues)
                if (_worldPos2.x === 0 && _worldPos2.y === 0 && _worldPos2.z === 0) continue;

                if (_worldPos2.distanceToSquared(_camPos) > unsplitDistSq) {
                    grid.unsplitBlock(idx);
                    step++;
                    if (step > 100) return;
                }
            }
        }
    }
}

function autoSplitting() {
    autoSplitNearbyBlocks();
    autoUnsplitFarBlocks();
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    let delta = (time - prevTime) / 1000;
    if (delta > 0.05) delta = 0.05; // Cap delta to prevent physics tunneling

    if ((pointerControls.isLocked) && !state.isTransitioning) {
        state.direction.z = Number(state.moveForward) - Number(state.moveBackward);
        state.direction.x = Number(state.moveRight) - Number(state.moveLeft);
        state.direction.y = Number(state.moveUp) - Number(state.moveDown);
        state.direction.normalize();

        // Movement speed is now constant because the world scales up instead of the player shrinking
        const speed = 60.0;
        const friction = 6.0;

        state.velocity.x -= state.velocity.x * friction * delta;
        state.velocity.z -= state.velocity.z * friction * delta;
        state.velocity.y -= state.velocity.y * friction * delta;

        if (state.moveForward || state.moveBackward) state.velocity.z -= state.direction.z * speed * delta;
        if (state.moveLeft || state.moveRight) state.velocity.x -= state.direction.x * speed * delta;
        if (state.moveUp || state.moveDown) state.velocity.y += state.direction.y * speed * delta;

        // Combined movement vector for multi-axis sliding
        const rightVec = new THREE.Vector3();
        rightVec.setFromMatrixColumn(camera.matrix, 0);
        const forwardVec = new THREE.Vector3();
        camera.getWorldDirection(forwardVec);

        // Keep horizontal movement separate from vertical to avoid "climbing" walls or sticking
        const moveVector = new THREE.Vector3();
        moveVector.add(rightVec.multiplyScalar(-state.velocity.x * delta));
        moveVector.add(forwardVec.multiplyScalar(-state.velocity.z * delta));
        moveVector.y += state.velocity.y * delta;

        // Apply movement axis-by-axis to allow sliding off walls
        const axes = ['x', 'y', 'z'];
        for (const axis of axes) {
            const originalValue = camera.position[axis];
            camera.position[axis] += moveVector[axis];
            if (isColliding(camera.position)) {
                camera.position[axis] = originalValue;
                // Zero velocity for vertical collision (floor/ceiling)
                if (axis === 'y') state.velocity.y = 0;
            }
        }
    }
    
    if (lastPos.distanceToSquared(camera.position) > GRID_SIZE * BLOCK_SIZE / 8) {
        lastPos = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
        autoSplitting();
    }

    updateCollectibles(time);
    renderer.render(scene, camera);
    prevTime = time;
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});