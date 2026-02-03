import { state } from './state.js';
import { GRID_SIZE } from './config.js';

function lerp(a, b, t) { return a + (b - a) * t; }
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function oot(num) {
    return num == 1 || num == 2;
}

export function hash3D(x, y, z, s) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s) * 43758.5453;
    return n - Math.floor(n);
}

export function valueNoise3D(x, y, z, s) {
    const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
    const xf = x - xi; const yf = y - yi; const zf = z - zi;
    const u = fade(xf); const v = fade(yf); const w = fade(zf);

    const n = (i, j, k) => hash3D(xi + i, yi + j, zi + k, s);

    return lerp(
        lerp(lerp(n(0,0,0), n(1,0,0), u), lerp(n(0,1,0), n(1,1,0), u), v),
        lerp(lerp(n(0,0,1), n(1,0,1), u), lerp(n(0,1,1), n(1,1,1), u), v),
        w
    );
}

export function isSolidAt(gx, gy, gz, depth, gridSeed, offset, type) {
    const towerCoords = [[3, 3], [3, 12], [12, 3], [12, 12]];
    const isTowerColumn = towerCoords.some(([tx, tz]) => gx === tx && gz === tz);

    if (type === 3) {
        return isTowerColumn ? (Math.random() > 0.9 ? 6 : 3) : 0;
    } else if (type === 8) {
        if (
            (((gx > 3 && gx < 12) || (gz > 3 && gz < 12)) && (gy > 3 && gy < 12)) ||
            ((gx > 3 && gx < 12) && (gz > 3 && gz < 12)) ||
            ((oot(gx % 4) || oot(gz % 4)) && oot(gy % 4)) ||
            (oot(gx % 4) && oot(gz % 4))
        ) {
            return 0;
        } else return 8;
    } else if (type === 10) {
        return Math.random() > 0.4 ? 0 : 10;
    } else if (type === 12) {
        return 12;
    } else if (type === 14) {
        return Math.random() > 0.99 ? 1 : 0;
    }

    const lx = offset.x + gx * offset.s;
    const ly = offset.y + gy * offset.s;
    const lz = offset.z + gz * offset.s;

    // Use multi-octave noise. We normalize by the sum of amplitudes (weightSum) 
    // to ensure the world doesn't get "denser" as we go deeper into the fractal.

    const freq = 0.35 * Math.pow(16, depth);
    const noise = valueNoise3D(lx * freq, ly * freq, lz * freq, state.seed + depth);

    if (type === 6) {
        return (noise > 0.7) ? (Math.random() > 0.99 ? 8 : 6) : 0;
    }

    const isShell = gx === 0 || gx === GRID_SIZE - 1 || gy === 0 || gy === GRID_SIZE - 1 || gz === 0 || gz === GRID_SIZE - 1;

    let block = Math.random() > 0.95 ? 10 : 1;
    //if (Math.random() > 0.95) block = 12;
    let air = Math.random() > 0.95 ? 14 : 0;

    // Door/Corridor logic for every side (using 2x2 openings)
    const mid = Math.floor(GRID_SIZE / 2);
    const isDoor = 
        ((gx === mid || gx === mid - 1) && (gy === mid || gy === mid - 1)) || 
        ((gx === mid || gx === mid - 1) && (gz === mid || gz === mid - 1)) || 
        ((gy === mid || gy === mid - 1) && (gz === mid || gz === mid - 1));

    // The shell has doors
    if (isShell) return isDoor ? air : block;
    
    // Carve out corridors between doors to ensure the "split form" is always navigable
    if (isDoor) return air;

    if (isTowerColumn) {
        return Math.random() > 0.9 ? 6 : 3
    }

    // Additional clearance: hollow out a small area in the very center of every block
    const dx = gx - (mid - 0.5);
    const dy = gy - (mid - 0.5);
    const dz = gz - (mid - 0.5);
    if (dx * dx + dy * dy + dz * dz < 12) return air;
    
    // Normalize to 0-1 range and use a threshold that favors "air" (empty space)
    return noise > 0.58 ? block : air; 
}