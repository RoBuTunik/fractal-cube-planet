import * as THREE from 'three';
import { state } from './state.js';
import { GRID_SIZE, BLOCK_SIZE } from './config.js';
import { isSolidAt } from './noise.js';
import { BLOCK_DATA } from './world.js';

const tempVec = new THREE.Vector3();
const tempMatrix = new THREE.Matrix4();

const PLAYER_HALF = 0.3;

const SOLIDS = [1, 3, 6,];
export function isColliding(pos) {
    // Filter grids to only check the ones near the current depth for performance
    const activeGrids = state.grids.filter(g => Math.abs(g.depth - state.currentLayer) <= 1);

    // Collision radius is fixed because player scale is constant
    const pSize = BLOCK_SIZE * 0.35;

    const checkLocal = (grid) => {
        tempVec.copy(pos).applyMatrix4(tempMatrix.copy(grid.container.matrixWorld).invert());
        const halfSize = (GRID_SIZE * BLOCK_SIZE) / 2;
        const gx = Math.floor((tempVec.x + halfSize) / BLOCK_SIZE);
        const gy = Math.floor((tempVec.y + halfSize) / BLOCK_SIZE);
        const gz = Math.floor((tempVec.z + halfSize) / BLOCK_SIZE);

        if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return false;
        const type = grid.blocks[grid.getIdx(gx, gy, gz)];
        return type === 1 || type === 3;
    };

    // Check 7 points (center + 6 directions)
    // We use a tiny offset to avoid getting stuck in floating point seams
    const margin = 0.01;
    if (activeGrids.some(checkLocal)) return true;

    const offsets = [
        [-pSize + margin, -pSize + margin, -pSize + margin],
        [pSize - margin, -pSize + margin, -pSize + margin],
        [-pSize + margin, pSize - margin, -pSize + margin],
        [pSize - margin, pSize - margin, -pSize + margin],
        [-pSize + margin, -pSize + margin, pSize - margin],
        [pSize - margin, -pSize + margin, pSize - margin],
        [-pSize + margin, pSize - margin, pSize - margin],
        [pSize - margin, pSize - margin, pSize - margin],
    ];

    for (const off of offsets) {
        const testPos = tempVec.set(pos.x + off[0], pos.y + off[1], pos.z + off[2]);
        if (activeGrids.some(grid => {
            const local = testPos.clone().applyMatrix4(tempMatrix.copy(grid.container.matrixWorld).invert());
            const halfSize = (GRID_SIZE * BLOCK_SIZE) / 2;
            const gx = Math.floor((local.x + halfSize) / BLOCK_SIZE);
            const gy = Math.floor((local.y + halfSize) / BLOCK_SIZE);
            const gz = Math.floor((local.z + halfSize) / BLOCK_SIZE);
            if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return false;
            const type = grid.blocks[grid.getIdx(gx, gy, gz)];
            return BLOCK_DATA[type].solid;
        })) return true;
    }

    return false;
}