import * as THREE from 'three';
import { state } from './state.js';
import { GRID_SIZE, BLOCK_SIZE } from './config.js';

const sphereGeom = new THREE.SphereGeometry(BLOCK_SIZE * 0.45, 12, 12);
const sphereMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

export function spawnCollectibles(grid) {
    if (!grid) return;

    let spawned = 0;
    let attempts = 0;

    const maxSpawn = 12
    const maxAttempts = 2000;

    while (spawned < maxSpawn && attempts < maxAttempts) {
        attempts++;
        const rx = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
        const ry = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;
        const rz = Math.floor(Math.random() * (GRID_SIZE - 2)) + 1;

        if (grid.blocks[grid.getIdx(rx, ry, rz)] === 0) {
            const mesh = new THREE.Mesh(sphereGeom, sphereMat);
            
            // Position in local grid space
            const localPos = new THREE.Vector3(
                rx * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5,
                ry * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5,
                rz * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5
            );
            
            mesh.position.copy(localPos);
            grid.container.add(mesh);
            state.collectibles.push({ mesh, grid });
            spawned++;
        }
    }
}

export function updateCollectibles(time) {
    state.collectibles.forEach(c => {
        c.mesh.rotation.x += 0.01;
        c.mesh.rotation.y += 0.02;
        c.mesh.visible = state.currentLayer == c.grid.depth;
    });
}