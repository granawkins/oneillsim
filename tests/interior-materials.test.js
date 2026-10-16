import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createInteriorMaterialLibrary, createInteriorMetreUVs, INTERIOR_MATERIAL_FAMILIES, INTERIOR_TILE_METRES} from '../src/interior-materials.js';
import {curvedSolid} from '../src/interior-runtime.js';
import {landscapeGeometry} from '../src/interior-landscape.js';

const root = new URL('../assets/textures/interior-lookdev/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));

// Decode the real PNG pixel payload without DOM, GPU or another npm dependency.
function decodePNG(bytes) {
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    let offset = 8, width, height; const chunks = [];
    while (offset < bytes.length) {
        const size = bytes.readUInt32BE(offset), kind = bytes.subarray(offset + 4, offset + 8).toString();
        const data = bytes.subarray(offset + 8, offset + 8 + size);
        if (kind === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4);
            assert.deepEqual([...data.subarray(8)], [8, 2, 0, 0, 0]); // RGB8, no interlace
        }
        if (kind === 'IDAT') chunks.push(data);
        offset += size + 12;
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = width * 3, pixels = Buffer.alloc(width * height * 3);
    assert.equal(raw.length, (stride + 1) * height);
    const paeth = (a, b, c) => {const p = a + b - c, da = Math.abs(p-a), db = Math.abs(p-b), dc = Math.abs(p-c); return da <= db && da <= dc ? a : db <= dc ? b : c;};
    for (let y = 0; y < height; y++) {
        const type = raw[y * (stride + 1)]; assert.ok(type <= 4);
        for (let x = 0; x < stride; x++) {
            const at = y * stride + x, a = x >= 3 ? pixels[at - 3] : 0, b = y ? pixels[at - stride] : 0, c = y && x >= 3 ? pixels[at - stride - 3] : 0;
            pixels[at] = raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth(a,b,c)][type];
        }
    }
    return {width, height, pixels};
}

for (const [family, record] of Object.entries(manifest.surfaces)) for (const [kind, file] of Object.entries(record.files)) {
    test(`${file.name}: decodes, matches digest/bounds, varies, closes both repeat seams`, () => {
        const bytes = readFileSync(new URL(file.name, root));
        assert.equal(bytes.length, file.bytes);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
        const {width, height, pixels} = decodePNG(bytes);
        assert.deepEqual([width, height], [512,512]);
        const min = [255,255,255], max = [0,0,0];
        for (let i=0;i<pixels.length;i++) {min[i%3] = Math.min(min[i%3],pixels[i]); max[i%3] = Math.max(max[i%3],pixels[i]);}
        for (let y=0;y<height;y++) assert.deepEqual(pixels.subarray(y*width*3,y*width*3+3), pixels.subarray((y*width+width-1)*3,(y*width+width)*3));
        assert.deepEqual(pixels.subarray(0,width*3),pixels.subarray((height-1)*width*3));
        if (kind === 'color') {
            assert.ok(min[0] >= 175 && max[0] <= 255, `${family} restrained neutral color range ${min}/${max}`);
            assert.ok(max[0] - min[0] >= 15);
        } else {
            assert.ok(min[1] >= 190 && max[1] <= 255, `${family} roughness range`);
            assert.ok(max[0] - min[0] > 10, `${family} nonflat bump`);
            assert.equal(min[2], 255);
        }
    });
}

test('generator reproduces all checked-in bytes in a scratch directory', () => {
    const scratch = '/home/granawkins/.hermes/cache/scratch'; mkdirSync(scratch,{recursive:true});
    const directory = mkdtempSync(scratch+'/interior-materials-test-');
    try {
        const child = spawnSync('python3', [new URL('../assets/scripts/build_interior_materials.py',import.meta.url).pathname, '--output', directory], {encoding:'utf8',timeout:120000});
        assert.equal(child.status, 0, child.stderr);
        assert.deepEqual(JSON.parse(readFileSync(directory+'/manifest.json')),manifest);
        for (const surface of Object.values(manifest.surfaces)) for (const file of Object.values(surface.files))
            assert.deepEqual(readFileSync(directory+'/'+file.name),readFileSync(new URL(file.name,root)));
    } finally {rmSync(directory,{recursive:true,force:true});}
});

function mockLoader({fail = false} = {}) {
    const requests = [], textures = [];
    return {requests,textures,load(url,onLoad,progress,onError) {
        const texture = new THREE.Texture(); requests.push(url); textures.push(texture);
        queueMicrotask(() => fail ? onError(new Error('fixture failure')) : onLoad(texture));
        return texture;
    }};
}

test('six local requests, shared packed maps, physical sampling, preserved palette and reversible ownership', async () => {
    const loader = mockLoader(), renderer = {capabilities:{getMaxAnisotropy:()=>2}};
    const library = createInteriorMaterialLibrary({loader,renderer});
    await library.ready;
    assert.equal(loader.requests.length,6);
    assert.ok(loader.requests.every(u => u.includes('/assets/textures/interior-lookdev/')));
    assert.equal(new Set(loader.requests).size,6);
    const color = new THREE.Color(0x789757), a = new THREE.MeshStandardMaterial({color,vertexColors:true,roughness:.86}), b = a.clone();
    const oldColor = a.color.clone(); library.apply(a,'grass'); library.apply(b,'grass'); library.apply(a,'grass');
    assert.equal(a.map,b.map); assert.equal(a.roughnessMap,a.bumpMap);
    assert.ok(a.color.equals(oldColor)); assert.equal(a.vertexColors,true);
    assert.equal(a.bumpScale,.018); assert.equal(a.roughness,1);
    for (const t of loader.textures) {
        assert.equal(t.wrapS,THREE.RepeatWrapping); assert.equal(t.wrapT,THREE.RepeatWrapping);
        assert.deepEqual(t.repeat.toArray(),[.25,.25]);
        assert.equal(t.anisotropy,2); assert.equal(t.minFilter,THREE.LinearMipmapLinearFilter); assert.equal(t.generateMipmaps,true);
        assert.equal(t.colorSpace,t.name.endsWith('color.png') ? THREE.SRGBColorSpace : THREE.NoColorSpace);
    }
    let materialDisposals = 0, textureDisposals = 0;
    a.addEventListener('dispose',()=>materialDisposals++);
    loader.textures.forEach(t=>t.addEventListener('dispose',()=>textureDisposals++));
    library.dispose(); library.dispose();
    assert.equal(textureDisposals,6); assert.equal(materialDisposals,0);
    assert.equal(a.map,null); assert.equal(a.bumpMap,null); assert.equal(a.roughness,.86); assert.ok(a.color.equals(oldColor));
    assert.throws(()=>library.apply(a,'grass'),/disposed/);
});

test('default palette excludes glass, metal, water, belts, and foliage; does not replace existing maps', async () => {
    for (const key of ['glass','rail','water','belt','beltReverse','gold','darkgreen']) assert.equal(INTERIOR_MATERIAL_FAMILIES[key],undefined);
    const library = createInteriorMaterialLibrary({loader:mockLoader(),bump:false}); await library.ready;
    assert.throws(()=>library.apply(new THREE.MeshBasicMaterial(),'grass'),/opaque/);
    assert.throws(()=>library.apply(new THREE.MeshStandardMaterial({metalness:.15}),'grass'),/opaque/);
    assert.throws(()=>library.apply(new THREE.MeshStandardMaterial({transparent:true}),'grass'),/opaque/);
    assert.throws(()=>library.apply(new THREE.MeshStandardMaterial({map:new THREE.Texture()}),'grass'),/existing/);
    const material = new THREE.MeshStandardMaterial(); library.apply(material,'concrete');
    assert.equal(material.bumpMap,null); assert.ok(material.roughnessMap);
    assert.throws(()=>library.apply(material,'paving'),/Restore/);
    const external = new THREE.Texture(); material.map = external; library.dispose(); assert.equal(material.map,external);
});

test('readiness propagates loading errors, with explicit disposal still available', async () => {
    const library = createInteriorMaterialLibrary({loader:mockLoader({fail:true})});
    await assert.rejects(library.ready,/Failed to load interior texture/); library.dispose();
});

test('disposal while loading rejects readiness and never resurrects borrowed materials', async () => {
    const library = createInteriorMaterialLibrary({loader:mockLoader()}); library.dispose();
    await assert.rejects(library.ready,/disposed/);
});

function triangleUVLengths(geometry) {
    const p=geometry.attributes.position,uv=geometry.attributes.uv,idx=geometry.index;
    const out=[];
    for(let i=0;i<idx.count;i+=3)for(let k=0;k<3;k++){
        const a=idx.getX(i+k),b=idx.getX(i+(k+1)%3);
        out.push([new THREE.Vector3().fromBufferAttribute(p,a).distanceTo(new THREE.Vector3().fromBufferAttribute(p,b)),Math.hypot(uv.getX(a)-uv.getX(b),uv.getY(a)-uv.getY(b))]);
    }
    return out;
}

test('curved solids map floor and both wall orientations in metres, including atan seam', () => {
    for (const theta of [0,Math.PI/2,Math.PI-.003,Math.PI+.003,6.28]) {
        const input=curvedSolid(theta,12,0,12,8,3), originalUV=input.attributes.uv.array.slice();
        const mapped=createInteriorMetreUVs(input);
        assert.deepEqual(input.attributes.uv.array,originalUV);
        assert.equal(mapped.index.count,input.index.count);
        assert.ok(mapped.attributes.position.count<=input.attributes.position.count+20);
        for(const [metres,uvMetres] of triangleUVLengths(mapped)) assert.ok(Math.abs(uvMetres/metres-1)<.008, `${theta}: ${metres}/${uvMetres}`);
        assert.ok(mapped.attributes.color); assert.equal(mapped.attributes.color.count,mapped.attributes.position.count);
        assert.ok(mapped.attributes.normal); input.dispose(); mapped.dispose();
    }
});

test('different radius explicitly calibrates elevated deck metre scale', () => {
    const input=curvedSolid(1.2,0,40,20,8,.24), mapped=createInteriorMetreUVs(input,{radius:790});
    for(const [metres,uvMetres] of triangleUVLengths(mapped)) assert.ok(Math.abs(uvMetres/metres-1)<.003);
});

test('ground cylinder rotation and ring closure retain centimetre-scale phase and metre units', () => {
    const original=new THREE.CylinderGeometry(830,830,130,612,8,true);
    const matrix=new THREE.Matrix4().makeRotationX(Math.PI/2);
    const mapped=createInteriorMetreUVs(original,{matrix,surface:'top'});
    assert.equal(mapped.index.count,original.index.count);
    const uv=mapped.attributes.uv,p=mapped.attributes.position,period=INTERIOR_TILE_METRES;
    const circumference=mapped.userData.interiorMetreUVs.circumference;
    assert.equal(circumference%period,0);
    for(let i=0;i<p.count;i++) assert.ok(Math.abs(uv.getY(i)-p.getY(i))<1e-4,'local cylinder Y maps to habitat Z');
    // A whole 130m tube width is 32.5 repeats, never one stretched texture.
    const vs=Array.from({length:uv.count},(_,i)=>uv.getY(i));
    assert.ok(Math.abs((Math.max(...vs)-Math.min(...vs))/period-32.5)<1e-4);
    assert.ok(mapped.attributes.position.count < original.attributes.position.count*1.1,'no full nonindexed ground expansion');
    const rotated=mapped.clone().applyMatrix4(matrix);
    for(const [metres,uvMetres] of triangleUVLengths(rotated)) assert.ok(Math.abs(uvMetres/metres-1)<.001);
});

test('slopes use the same anchored top coordinates; merged output remains batchable with vertex shading', () => {
    const hill={width:120,depth:44,z:20,theta:.6,height:12,skew:.12};
    const a=landscapeGeometry(hill),b=landscapeGeometry(hill,{path:true});
    const ma=createInteriorMetreUVs(a,{surface:'top'}),mb=createInteriorMetreUVs(b,{surface:'top'});
    const merged=mergeGeometries([ma,mb]); assert.ok(merged);
    assert.equal(merged.index.count,ma.index.count+mb.index.count);
    assert.equal(merged.attributes.color.count,merged.attributes.position.count);
    for(const g of [ma,mb])for(let i=0;i<g.attributes.uv.count;i++){
        const p=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i),u=g.attributes.uv.getX(i),v=g.attributes.uv.getY(i);
        assert.ok(Math.abs(u-Math.atan2(p.y,p.x)*g.userData.interiorMetreUVs.circumference/(2*Math.PI))<.001);
        assert.ok(Math.abs(v-p.z)<1e-5);
    }
});

test('UV mapper refuses unsupported or invalid inputs rather than silently corrupting them', () => {
    assert.throws(()=>createInteriorMetreUVs(new THREE.BoxGeometry(),{radius:0}),/Positive/);
    assert.throws(()=>createInteriorMetreUVs(new THREE.BoxGeometry(),{surface:'guess'}),/Unknown/);
    assert.throws(()=>createInteriorMetreUVs(new THREE.BoxGeometry(),{matrix:new THREE.Matrix4().makeScale(0,1,1)}),/invertible/);
    const morph=new THREE.BoxGeometry(); morph.morphAttributes.position=[morph.attributes.position.clone()];
    assert.throws(()=>createInteriorMetreUVs(morph),/static/);
});
