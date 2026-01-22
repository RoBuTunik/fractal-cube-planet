import * as THREE from 'three';
import nipplejs from 'nipplejs';
import { state } from './state.js';

export function setupControls(camera, renderer, controls, onInteract, onGrow) {
    document.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'KeyW': state.moveForward = true; break;
            case 'KeyS': state.moveBackward = true; break;
            case 'KeyA': state.moveLeft = true; break;
            case 'KeyD': state.moveRight = true; break;
            case 'Space': state.moveUp = true; break;
            case 'ShiftLeft': state.moveDown = true; break;
            case 'KeyR': onGrow(); break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW': state.moveForward = false; break;
            case 'KeyS': state.moveBackward = false; break;
            case 'KeyA': state.moveLeft = false; break;
            case 'KeyD': state.moveRight = false; break;
            case 'Space': state.moveUp = false; break;
            case 'ShiftLeft': state.moveDown = false; break;
        }
    });

    window.addEventListener('click', onInteract);
}