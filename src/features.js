import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { CYLINDER_LENGTH } from './cylinder.js';

const SURFACE_RADIUS = 649.8;

let treeModel = null;

export function loadTreeModel() {
    return new Promise((resolve) => {
        const mtlLoader = new MTLLoader();
        mtlLoader.setPath('/assets/ultimate-nature/');
        mtlLoader.load('CommonTree_1.mtl', (materials) => {
            materials.preload();
            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            objLoader.setPath('/assets/ultimate-nature/');
            objLoader.load('CommonTree_1.obj', (obj) => {
                // Make all materials matte (not shiny)
                obj.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material.roughness = 1.0;
                        child.material.metalness = 0.0;
                    }
                });
                treeModel = obj;
                resolve(obj);
            });
        });
    });
}

// River removed - now handled by texture system

export function createTown(habitatGroup, center, count) {
    const radius = 649.5;
    const houseBaseGeo = new THREE.BoxGeometry(8, 6, 8);
    const houseRoofGeo = new THREE.ConeGeometry(7, 4, 4);

    for (let i = 0; i < count; i++) {
        const offsetTheta = (Math.random() - 0.5) * 0.4;
        const offsetZ = (Math.random() - 0.5) * 60;
        const baseAngle = Math.atan2(center.y, center.x);
        const theta = baseAngle + offsetTheta;
        const z = center.z + offsetZ;

        const group = new THREE.Group();
        const base = new THREE.Mesh(houseBaseGeo, new THREE.MeshStandardMaterial({ color: 0xd4c4a8 }));
        const roof = new THREE.Mesh(houseRoofGeo, new THREE.MeshStandardMaterial({ color: 0x8b4513 }));
        base.position.y = 3;
        roof.position.y = 8;
        group.add(base, roof);

        group.position.set(radius * Math.cos(theta), radius * Math.sin(theta), z);
        group.lookAt(0, 0, z);
        group.rotateX(Math.PI / 2);
        habitatGroup.add(group);
    }
}

export function createForest(habitatGroup, count) {
    if (!treeModel) {
        console.warn('Tree model not loaded yet');
        return;
    }

    const radius = 649.5;
    const length = CYLINDER_LENGTH - 10;

    for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        // Bias z toward edges (endcaps): invert squared random so trees cluster at high |z|
        const edgeBias = 1 - Math.pow(Math.random(), 2);
        const z = Math.sign(Math.random() - 0.5) * edgeBias * (length / 2);

        const tree = treeModel.clone();
        // Random scale variation (base 4x size)
        const scale = 3.2 + Math.random() * 1.6;
        tree.scale.set(scale, scale, scale);

        tree.position.set(radius * Math.cos(theta), radius * Math.sin(theta), z);
        tree.lookAt(0, 0, z);
        tree.rotateX(Math.PI / 2);
        // Random spin around tree's up axis for variety
        tree.rotateY(Math.random() * Math.PI * 2);
        habitatGroup.add(tree);
    }
}

export function createWorldFeatures(habitatGroup) {
    // River and ground textures now handled by editor system
    createTown(habitatGroup, new THREE.Vector3(400, -500, 0), 40);
    createTown(habitatGroup, new THREE.Vector3(-450, -470, -15), 30);
    createForest(habitatGroup, 1000);
}
