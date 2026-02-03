import * as THREE from 'three';
import { state } from './state.js';
import { GRID_SIZE, BLOCK_SIZE } from './config.js';
import { isSolidAt } from './noise.js';
import { playSound } from './audio.js';
import { spawnCollectibles } from './collectibles.js';

const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
const textureLoader = new THREE.TextureLoader();

function createTexture(texture) {
    var returnT = textureLoader.load(texture);
    returnT.magFilter = THREE.NearestFilter;
    returnT.minFilter = THREE.NearestFilter;
    returnT.colorSpace = THREE.SRGBColorSpace;
    returnT = new THREE.MeshStandardMaterial({ map: returnT, color: new THREE.Color(0xffffff)});
    return returnT;
}

function newBlock(material, th) {
    var inst = new THREE.InstancedMesh(geometry, material, GRID_SIZE * GRID_SIZE * GRID_SIZE);
    inst.userData.grid = th;
    return inst;
}

export const materials = {
    default: createTexture('blockDefault.png'),
    green: createTexture('blockGreen.png'),
    bamboo: createTexture('blockBamboo.png'),
    vines: createTexture('blockVines.png'),
    rubble: createTexture('blockRubble.png'),
    sponge: createTexture('blockSponge.png'),
    yellow: createTexture('blockYellow.png'),
    waypoint: createTexture('waypoint.png'),
};

export const hitboxMaterial = new THREE.MeshBasicMaterial({ 
    transparent: true, 
    opacity: 0, 
    depthWrite: false, 
    colorWrite: false 
});

export const BLOCK_DATA = [
    {}, //0 - Air

    { //1 - Default
        solid: true,
        splits: true,
        hitbox: 2,
    },

    { //2 - Default hitbox
        isHitbox: true,
        splitFrom: 1,
    },

    { //3 - Bamboo
        solid: true,
        splits: true,
        hitbox: 4,
    },

    { //4 - Bamboo hitbox
        isHitbox: true,
        splitFrom: 3,
    },

    {}, //5 - Waypoint

    { //6 - Vines
        solid: true,
        splits: true,
        hitbox: 7,
    },

    { //7 - Vines hitbox
        isHitbox: true,
        splitFrom: 6,
    },

    { //8 - Sponge
        solid: true,
        splits: true,
        hitbox: 9,
    },

    { //9 - Sponge hitbox
        isHitbox: true,
        splitFrom: 8,
    },

    { //10 - Rubble
        solid: true,
        splits: true,
        hitbox: 11,
    },

    { //11 - Rubble hitbox
        isHitbox: true,
        splitFrom: 10,
    },

    { //12 - Solid
        solid: true,
        splits: true,
        hitbox: 13,
    },

    { //13 - Solid hitbox
        isHitbox: true,
        splitFrom: 12,
    },

    { //14 - Blocky Air
        solid: false,
        splits: true,
        hitbox: 15,
    },

    { //15 - Blocky Air hitbox
        isHitbox: true,
        splitFrom: 14,
    },

    { //16 - Cluster
        solid: true,
        splits: true,
        hitbox: 17,
    },

    { //17 - Cluster hitbox
        isHitbox: true,
        splitFrom: 16,
    },
];

export class WorldGrid {
    constructor(parentContainer, depth, seed, offset, position = new THREE.Vector3(), scale = 1.0, parent = null, type) {
        this.parentContainer = parentContainer;
        this.depth = depth;
        this.seed = seed;
        this.offset = offset;
        this.parent = parent;
        this.type = type;
        this.container = new THREE.Group();
        this.container.position.copy(position);
        this.container.scale.setScalar(scale);

        this.instances = {
            default: newBlock(materials.default, this),
            forest: newBlock(materials.green, this),
            bamboo: newBlock(materials.bamboo, this),
            vines: newBlock(materials.vines, this),
            sponge: newBlock(materials.sponge, this),
            waypoint: newBlock(materials.waypoint, this),
            rubble: newBlock(materials.rubble, this),
            hitbox: newBlock(hitboxMaterial, this),
        };

        this.matrixToUpdate = [
            null, //0
            this.instances.default, //1
            this.instances.hitbox, //2
            this.instances.bamboo, //3
            this.instances.waypoint, //4
            this.instances.hitbox, //5
            this.instances.vines, //6
            this.instances.hitbox, //7
            this.instances.sponge, //8
            this.instances.hitbox, //9
            this.instances.rubble, //10
            this.instances.hitbox, //11
            this.instances.default, //12
            this.instances.hitbox, //13
            this.instances.hitbox, //14
            this.instances.hitbox, //15
        ];
        
        this.matrix = new THREE.Matrix4();
        this.blocks = new Uint8Array(GRID_SIZE * GRID_SIZE * GRID_SIZE); 
        this.splitData = new Map();
        
        this.initGrid();
        Object.values(this.instances).forEach(inst => {
            this.container.add(inst);
        });
        this.parentContainer.add(this.container);
        state.grids.push(this);

        spawnCollectibles(this);
    }

    initGrid() {
        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                for (let z = 0; z < GRID_SIZE; z++) {
                    const idx = this.getIdx(x, y, z);
                    this.blocks[idx] = isSolidAt(x, y, z, this.depth, this.seed, this.offset, this.type);
                    this.updateInstance(idx);
                }
            }
        }
        Object.values(this.instances).forEach(inst => {
            inst.instanceMatrix.needsUpdate = true;
        });
    }

    getIdx(x, y, z) {
        return x + y * GRID_SIZE + z * GRID_SIZE * GRID_SIZE;
    }

    getCoords(idx) {
        const x = idx % GRID_SIZE;
        const y = Math.floor((idx / GRID_SIZE) % GRID_SIZE);
        const z = Math.floor(idx / (GRID_SIZE * GRID_SIZE));
        return { x, y, z };
    }

    updateInstance(idx) {
        const { x, y, z } = this.getCoords(idx);
        const type = this.blocks[idx];
        
        // Reset all
        this.matrix.makeScale(0, 0, 0);
        Object.values(this.instances).forEach(inst => {
            inst.setMatrixAt(idx, this.matrix);
        });

        const posMatrix = new THREE.Matrix4().makeTranslation(
            x * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5,
            y * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5,
            z * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5
        );

        if (this.matrixToUpdate[type]) {
            this.matrixToUpdate[type].setMatrixAt(idx, posMatrix);
        }
    }

    splitBlock(idx) {
        const type = this.blocks[idx];
        if (BLOCK_DATA[type].splits && !state.isTransitioning) {
            // playSound('split');
            
            // 1. Mark as split and hide parent visually
            this.blocks[idx] = BLOCK_DATA[type].hitbox;
            this.updateInstance(idx);
            Object.values(this.instances).forEach(inst => {
                if (inst != this.instances.waypoint) inst.instanceMatrix.needsUpdate = true;
            });

            // 2. Setup child grid data
            const { x, y, z } = this.getCoords(idx);
            const childSeed = this.seed + idx;
            const childOffset = {
                x: this.offset.x + x * this.offset.s,
                y: this.offset.y + y * this.offset.s,
                z: this.offset.z + z * this.offset.s,
                s: this.offset.s / GRID_SIZE
            };

            // Local position relative to parent grid center
            const localPos = new THREE.Vector3(
                x * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5,
                y * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5,
                z * BLOCK_SIZE - (GRID_SIZE * BLOCK_SIZE) / 2 + 0.5
            );
            
            const childScale = 1.0 / GRID_SIZE;

            // 3. Create actual child grid. We pass our container as the parent so it nests correctly.
            const childGrid = new WorldGrid(this.container, this.depth + 1, childSeed, childOffset, localPos, childScale, this, type);
            this.splitData.set(idx, childGrid);
            return childGrid;
        }
        return null;
    }

    unsplitBlock(idx) {
        const type = this.blocks[idx];
        if (BLOCK_DATA[type].splitFrom && !state.isTransitioning) {
            const childGrid = this.splitData.get(idx);
            if (!childGrid) return;

            // 1. Destroy child grid cleanly
            childGrid.destroy();
            this.splitData.delete(idx);

            // 2. Restore original block type
            this.blocks[idx] = BLOCK_DATA[type].splitFrom;

            // 3. Restore parent block visuals
            this.updateInstance(idx);

            // 4. Ensure instanced meshes update
            Object.values(this.instances).forEach(inst => {
                if (inst != this.instances.waypoint) inst.instanceMatrix.needsUpdate = true;
            });
        }
    }

    destroy() {
        this.parentContainer.remove(this.container);
        for (const inst of Object.values(this.instances)) {
            inst.dispose();
        }
        this.instances.default.geometry.dispose(); // Shared geometry, but disposing instances' reference is safe
        const gridIdx = state.grids.indexOf(this);
        if (gridIdx > -1) state.grids.splice(gridIdx, 1);
    }
}

export function gridIndexToWorld(x, y, z) {
    const half = (GRID_SIZE * BLOCK_SIZE) / 2;
    return new THREE.Vector3(
        x * BLOCK_SIZE - half + BLOCK_SIZE / 2,
        y * BLOCK_SIZE - half + BLOCK_SIZE / 2,
        z * BLOCK_SIZE - half + BLOCK_SIZE / 2
    );
}

export function getSafeSpawnPosition(grid) {
    const cx = Math.floor(GRID_SIZE / 2);
    const cy = Math.floor(GRID_SIZE / 2);

    for (let z = 1; z < GRID_SIZE - 1; z++) {
        const idx = grid.getIdx(cx, cy, z);
        if (grid.blocks[idx] === 0) {
            const pos = gridIndexToWorld(cx, cy, z);
            const nudge = 0.6 * BLOCK_SIZE;
            pos.z -= nudge;
            return pos;
        }
    }
    return new THREE.Vector3(0, 0, (GRID_SIZE * BLOCK_SIZE) / 2 + 2);
}