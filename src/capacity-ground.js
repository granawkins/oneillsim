import * as THREE from 'three';

const TAU = 2 * Math.PI, R = 830, COLLIDER_ID = 'capacity-ground-sheet';
const normalize = t => (t % TAU + TAU) % TAU;
const capacityDistrict = id => /^(farm|residential)-[bc]$/.test(id || '');

// Accept a single plan, an array of plans, or layer results ({plan}). Optional
// plan.masterPlan/plan.districts supplies explicit full district boundaries.
function districtRanges(plans) {
    const ranges = new Map();
    for (const plan of plans) {
        const explicit = plan.masterPlan?.districts || plan.districts || [];
        for (const d of explicit) if (capacityDistrict(d.id) && Number.isFinite(d.start) && Number.isFinite(d.end))
            ranges.set(d.id, {id: d.id, start: d.start, end: d.end, source: 'explicit'});
        for (const d of plan.decks || []) {
            if (!capacityDistrict(d.districtId) || ranges.get(d.districtId)?.source === 'explicit') continue;
            // Farm planner reserves precisely one metre at each sector end.
            const start = Number.isFinite(d.start) ? d.start - (d.districtId.startsWith('farm-') ? 1 / d.radius : 0)
                : d.thetaStart ?? d.rect?.[0] / R;
            const end = Number.isFinite(d.end) ? d.end + (d.districtId.startsWith('farm-') ? 1 / d.radius : 0)
                : d.thetaEnd ?? d.rect?.[1] / R;
            if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
            const old = ranges.get(d.districtId);
            ranges.set(d.districtId, {id:d.districtId, start:Math.min(old?.start ?? start,start),
                end:Math.max(old?.end ?? end,end),source:'deck-envelope'});
        }
        // Residential planner's protected ground partition has a 2m sector
        // inset. Include these masks so parks, old plots and visits have real
        // support too, not only the footprints of the new elevated buildings.
        for (const p of plan.publicSpaceMasks || []) {
            if (!capacityDistrict(p.districtId) || !p.rect || ranges.get(p.districtId)?.source === 'explicit') continue;
            const start=(p.rect[0]-2)/R,end=(p.rect[1]+2)/R,old=ranges.get(p.districtId);
            ranges.set(p.districtId,{id:p.districtId,start:Math.min(old?.start ?? start,start),
                end:Math.max(old?.end ?? end,end),source:'protected-ground-envelope'});
        }
    }
    return [...ranges.values()];
}

function containsAngle(t, start, end) {
    const width = end >= start ? end-start : normalize(end-start);
    return width >= TAU || normalize(t-start) < width;
}

// Subtract each rectangle as four successive disjoint convex half-plane pieces.
// Angular boundaries are RAY PLANES, not linear theta interpolation: intersections
// remain on the ORIGINAL chordal triangle and have the exact requested angle.
function clipGeometry(original, openings) {
    if (!original.index || !original.attributes.position) throw new TypeError('ground must have indexed cylinder geometry');
    const attributes=Object.entries(original.attributes), arrays=Object.fromEntries(attributes.map(([name,a])=>[name,Array.from(a.array)]));
    const pos=original.attributes.position, indices=[], source=original.index.array;
    let clippedTriangles=0;
    const vertex = id => ({id, values:Object.fromEntries(attributes.map(([name,a])=>[name,Array.from({length:a.itemSize},(_,k)=>a.array[id*a.itemSize+k])]))});
    const cut = (poly, distance, positive) => {
        const out=[];
        for(let i=0;i<poly.length;i++) {
            const a=poly[i],b=poly[(i+1)%poly.length],da=distance(a)*(positive?1:-1),db=distance(b)*(positive?1:-1);
            if(da>=0)out.push(a);
            if((da>0&&db<0)||(da<0&&db>0)) {
                const f=da/(da-db),values={};
                for(const [name] of attributes)values[name]=a.values[name].map((x,k)=>x+(b.values[name][k]-x)*f);
                out.push({values});
            }
        }
        return out;
    };
    const emit = v => {
        if(v.id !== undefined)return v.id;
        v.id=arrays.position.length/3;
        for(const [name] of attributes)arrays[name].push(...v.values[name]);
        return v.id;
    };
    for(let i=0;i<source.length;i+=3) {
        const ids=[source[i],source[i+1],source[i+2]];
        const angles=ids.map(id=>Math.atan2(-pos.getZ(id),pos.getX(id)));
        for(let k=1;k<3;k++){while(angles[k]-angles[0]>Math.PI)angles[k]-=TAU;while(angles[k]-angles[0]<-Math.PI)angles[k]+=TAU;}
        const lo=Math.min(...angles),hi=Math.max(...angles),zlo=Math.min(...ids.map(id=>pos.getY(id))),zhi=Math.max(...ids.map(id=>pos.getY(id)));
        const holes=[];
        for(const h of openings) {
            const width=h.thetaEnd>=h.thetaStart?h.thetaEnd-h.thetaStart:normalize(h.thetaEnd-h.thetaStart);
            const start=h.thetaStart+Math.round(((lo+hi)/2-h.thetaStart)/TAU)*TAU;
            for(const a of [start-TAU,start,start+TAU])if(a<hi&&a+width>lo&&h.zMin<zhi&&h.zMax>zlo)
                holes.push({...h,a,b:a+width});
        }
        if(!holes.length){indices.push(...ids);continue;}
        clippedTriangles++;
        let pieces=[ids.map(vertex)];
        for(const h of holes) {
            const boundaries=[v=>-v.values.position[2]*Math.cos(h.a)-v.values.position[0]*Math.sin(h.a),
                v=>v.values.position[2]*Math.cos(h.b)+v.values.position[0]*Math.sin(h.b),
                v=>v.values.position[1]-h.zMin,v=>h.zMax-v.values.position[1]];
            const next=[];
            for(const p of pieces){let inside=p;for(const distance of boundaries){
                const outside=cut(inside,distance,false);if(outside.length>=3)next.push(outside);
                inside=cut(inside,distance,true);if(inside.length<3)break;
            }}
            pieces=next;
        }
        for(const p of pieces)for(let k=1;k+1<p.length;k++)indices.push(emit(p[0]),emit(p[k]),emit(p[k+1]));
    }
    const geometry=new THREE.BufferGeometry();
    for(const [name,a] of attributes)geometry.setAttribute(name,new THREE.BufferAttribute(new a.array.constructor(arrays[name]),a.itemSize,a.normalized));
    geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return {geometry,clippedTriangles};
}

/** Exact narrow ground holes; one shared rendered/physical, two-sided sheet.
 * Call after original Cylinder creation and layer plans, and after loading the
 * world. Keep alive while those layer colliders are registered. No altitude gate.
 */
export function createCapacityGround({ground,habitatGroup,plans=[],colliderWorld,controller}) {
    if(!ground?.isMesh || !habitatGroup?.isObject3D)throw new TypeError('ground mesh and habitatGroup are required');
    if(!colliderWorld?.setObject || !colliderWorld?.remove)throw new TypeError('colliderWorld is required for physical ground/ceiling');
    if(!controller || typeof controller.groundExists!=='function')throw new TypeError('controller.groundExists callback is required');
    if(colliderWorld.colliders?.has(COLLIDER_ID))throw new Error('capacity ground is already registered; dispose it before replacement');
    const list=(Array.isArray(plans)?plans:[plans]).filter(Boolean).map(p=>p.plan || p);
    const openings=list.flatMap(p=>(p.groundOpenings || []).map(o=>({...o})));
    for(const h of openings)if(![h.thetaStart,h.thetaEnd,h.zMin,h.zMax].every(Number.isFinite)
        || h.zMax<=h.zMin || normalize(h.thetaEnd-h.thetaStart)===0 || normalize(h.thetaEnd-h.thetaStart)>=Math.PI)
        throw new TypeError('opening must be a finite narrow theta/z rectangle');
    const ranges=districtRanges(list),originalGeometry=ground.geometry,originalGroundExists=controller.groundExists;
    const {geometry,clippedTriangles}=clipGeometry(originalGeometry,openings);
    ground.geometry=geometry;
    try { colliderWorld.setObject(COLLIDER_ID,ground,habitatGroup); }
    catch(error){ground.geometry=originalGeometry;geometry.dispose();throw error;}
    const entries=colliderWorld.colliders?.get(COLLIDER_ID);
    const groundExists=function(theta,z){
        if(Math.abs(z)<=65 && ranges.some(d=>containsAngle(theta,d.start,d.end)))return false;
        return originalGroundExists.call(this,theta,z);
    };
    controller.groundExists=groundExists;
    const stats={originalTriangles:originalGeometry.index.count/3,triangles:geometry.index.count/3,
        clippedTriangles,addedVertices:geometry.attributes.position.count-originalGeometry.attributes.position.count,
        openings:openings.length,colliderId:COLLIDER_ID,colliderTriangles:entries?.length ?? geometry.index.count/3,
        districtRanges:ranges,physicalSupport:true,physicalCeiling:true,sharedRenderGeometry:true};
    let disposed=false;
    return {openings,stats,dispose(){
        if(disposed)return;disposed=true;
        // Do not remove a later owner's replacement or overwrite newer callbacks.
        if(!entries || colliderWorld.colliders?.get(COLLIDER_ID)===entries)colliderWorld.remove(COLLIDER_ID);
        if(controller.groundExists===groundExists)controller.groundExists=originalGroundExists;
        if(ground.geometry===geometry)ground.geometry=originalGeometry;
        geometry.dispose();
    }};
}
