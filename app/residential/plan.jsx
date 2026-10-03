'use client';
import {useState} from 'react';
import {blocks,residentialDecks,palette} from '../../src/residential-plan.js';
export default function Plan(){
 const [id,setId]=useState(residentialDecks[0].id),[selected,setSelected]=useState(null);
 const deck=residentialDecks.find(d=>d.id===id),length=(deck.end-deck.start)*(830-deck.height);
 return <section><h2>Residential cross-section and shelf plan</h2><p>Homes step up both sides of a lower central garden. Select a shelf to inspect its assigned space.</p>
 <svg viewBox="-72 -70 144 142" style={{width:280,maxWidth:'100%'}} aria-label="Residential terraces inside the tube"><circle r="65" fill="#edf0e8" stroke="#809080" strokeWidth=".5"/>{residentialDecks.map(d=><g key={d.id} onClick={()=>{setId(d.id);setSelected(null)}} tabIndex={0} role="button" aria-label={d.name} onKeyDown={e=>{if(e.key==='Enter')setId(d.id)}}>{d.bands.map(([a,b])=><rect key={a} x={a} y={-d.height} width={b-a} height="1" fill={d.id===id?'#b77b31':'#647d65'}/>)}</g>)}{blocks.filter(b=>b.category==='housing'&&Math.abs(b.u-.25)<.001).map(b=><rect key={b.id} x={b.z-b.depth/2} y={-b.elevation-b.height} width={b.depth} height={b.height} fill={b.color} opacity=".8"/>)}</svg>
 <label>Shelf <select value={id} onChange={e=>{setId(e.target.value);setSelected(null)}}>{residentialDecks.map(d=><option key={d.id} value={d.id}>{d.name} · {d.height} m</option>)}</select></label>
 <p><a href={`/oneillsim/?theta=${(deck.start+deck.end)/2*180/Math.PI}&z=0&mode=planner&height=180&pitch=-89&yaw=0&deck=${id}`}>Inspect shelf in 3D ↗</a></p>
 <svg className="district-map" viewBox={`0 -66 ${length} 132`} aria-label="Selected residential shelf plan">{deck.bands.map(([a,b])=><rect key={a} y={a} x="0" width={length} height={b-a} fill="#e3e7df"/>)}{blocks.filter(b=>b.deckId===id).map(b=><g key={b.id} role="button" tabIndex={0} aria-label={b.name} onClick={()=>setSelected(b)} onKeyDown={e=>{if(e.key==='Enter')setSelected(b)}}><title>{`${b.name}: ${b.width.toFixed(1)} × ${b.depth.toFixed(1)} m`}</title><rect x={b.u*length-b.width/2} y={b.z-b.depth/2} width={b.width} height={b.depth} fill={b.color} stroke="white" strokeWidth=".3"/></g>)}{id===residentialDecks[0].id&&<rect x={length/2-12} y="-12" width="24" height="24" fill="#b584b9"><title>Spoke arrival placeholder</title></rect>}</svg>
 <p className="selection">{selected?`${selected.name}: ${selected.width.toFixed(2)} × ${selected.depth.toFixed(2)} m; ${selected.height.toFixed(1)} m high; ${selected.levels} levels; elevation ${selected.elevation} m.`:'Click a parcel for dimensions. Violet marks the spoke arrival platform.'}</p>
 <div className="legend">{Object.entries(palette).map(([name,color])=><span key={name}><i style={{background:color}}/>{name}</span>)}</div>
 </section>;
}
