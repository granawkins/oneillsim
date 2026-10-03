'use client';
import {useState} from 'react';
import {blocks,length,palette} from '../../src/residential-plan.js';
export default function Plan() {
 const [lower,setLower]=useState(false),[selected,setSelected]=useState(null);
 return <section><div className="plan-toolbar"><h2>District A · unrolled plan</h2><button onClick={()=>{setLower(!lower);setSelected(null)}}>{lower?'Show ground level':'Show lower deck'}</button></div>
 <p>Click a shape to inspect its dimensions. Left to right: 0–60° around the ring; top to bottom: 130 m across the tube.</p>
 <svg className="district-map" viewBox={`-5 -72 ${length+10} 144`} role="img" aria-label={lower?'Lower deck service plan':'Residential district ground plan'}>
 <rect x="0" y="-65" width={length} height="130" fill="#e3e7df"/>
 {blocks.filter(b=>lower?b.deck<0:b.deck===0).sort((a,b)=>(a.category==='trees'?1:0)-(b.category==='trees'?1:0)).map(b=><g key={b.id} tabIndex={0} role="button" aria-label={b.name} onClick={()=>setSelected(b)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(b)}}}><title>{`${b.name} · ${b.width.toFixed(1)} × ${b.depth.toFixed(1)} m · ${b.levels} levels`}</title><rect x={b.x-b.width/2} y={b.z-b.depth/2} width={b.width} height={b.depth} fill={b.color} stroke={selected?.id===b.id?'#172c40':'#ffffff'} strokeWidth={selected?.id===b.id?1.5:.3}/>{b.category==='housing' && <text x={b.x} y={b.z+2} textAnchor="middle" fontSize="6" pointerEvents="none">{b.levels}</text>}</g>)}
 </svg>
 <p className="selection">{selected?`${selected.name}: ${selected.width.toFixed(2)} × ${selected.depth.toFixed(2)} m footprint; ${selected.height.toFixed(1)} m high; ${selected.levels} levels; ${(selected.width*selected.depth).toLocaleString('en',{maximumFractionDigits:0})} m² footprint.`:'Housing labels show floor counts. All shapes are planning placeholders.'}</p>
 <div className="legend">{Object.entries(palette).map(([name,color])=><span key={name}><i style={{background:color}}/>{name}</span>)}</div>
 </section>;
}
