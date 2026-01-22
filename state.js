import * as THREE from 'three';

export const state = {
    currentLayer: 0,
    seed: Math.random() * 10000,
    isTransitioning: false,
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    grids: [],
    collectibles: [],
    activeGrid: null,
    worldGroup: null,
    transformStack: [],
    waypoints: [],
};