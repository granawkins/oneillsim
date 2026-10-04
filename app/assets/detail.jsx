import Link from 'next/link';
import AssetViewer from './viewer';
import '../../assets/gallery.css';

export default function AssetDetail({ type, selected, variants }) {
 const modelRoot = `/oneillsim/assets/${selected.directory}/`;
 const manifest = variants.find(variant => variant.id === selected.id)?.stats;
 const atlas = manifest?.textureAtlas || `${selected.id}_Atlas.png`;
 return <AssetViewer key={selected.id} assetId={selected.id} assetRoot={modelRoot}>

    <header className="topbar"><Link href="/assets/" className="back">← ASSET LIBRARY</Link><div>STANFORD TORUS <span>/</span> ASSET LIBRARY</div><small>{type.name} · {variants.length} design{variants.length === 1 ? '' : 's'}</small></header>
    <nav className="design-list" aria-label="Designs">{variants.map(variant => <Link key={variant.id} href={`/assets/${type.slug}/?design=${variant.id}`} aria-current={variant.id === selected.id ? 'page' : undefined}>{variant.name}<small>{variant.stats ? `${variant.stats.trianglesAfterQuadTriangulation} tris · ${variant.stats.vertices} verts` : 'Model stats unavailable'}</small></Link>)}</nav><main className="layout">
        <section className="viewer-column">
            <div className="title-row"><div><p className="eyebrow">{type.name}</p><h1 id="asset-name">{selected.name}</h1><p className="subtitle">Interactive design study</p></div><span className="status">● ACTIVE MODEL</span></div>
            <div className="viewer-shell"><canvas id="asset-canvas" aria-label={`Interactive 3D view of ${selected.name}`}></canvas><div id="viewer-status">Loading mesh and atlas…</div><div className="viewer-help">DRAG TO ORBIT · SCROLL TO ZOOM · SLOW AUTO-ROTATION</div><div className="axis-label">Y ↑ <small>LOCAL +Z FACES FRONT</small></div></div>
            <div className="caption"><span>ISOMETRIC INSPECTION VIEW</span><span>GENERATED FROM EDITABLE SOURCE</span></div>
        </section>
        <aside className="details">
            <section className="card"><p className="eyebrow">TECHNICAL RECORD</p><h2>Asset details</h2><p id="asset-description" className="body-copy">Loading manifest…</p>
                <div className="specs"><div><label>FORMAT</label><strong>Wavefront OBJ + MTL</strong></div><div><label>GEOMETRY</label><strong id="spec-geometry">—</strong></div><div><label>MATERIALS</label><strong id="spec-materials">—</strong></div><div><label>UV SKIN</label><strong>512 × 512 atlas</strong></div><div><label>MODEL SIZE</label><strong id="spec-bounds">—</strong></div><div><label>EDITOR SCALE</label><strong id="spec-scale">—</strong></div></div>
            </section>
            <section className="card"><p className="eyebrow">SOURCE & INTERPRETATION</p><h2>Design basis</h2><p className="source-line">{type.source}</p><ul className="facts">{(type.facts || []).map(fact => <li key={fact}>{fact}</li>)}</ul><div className="interpretation"><strong>MODEL CHOICE</strong><p id="asset-interpretation">—</p></div></section>
            <section className="card study-reference-card"><p className="eyebrow">SHARED REFERENCES</p><h2>{type.source}</h2><div className="study-figure-links">{type.references.filter(ref => ref.image).map(ref => <Link key={ref.href} href={ref.href}><img src={`/oneillsim/study/images/${ref.image}`} alt={ref.label} loading="lazy"/><span>{ref.label}</span></Link>)}</div><div className="files">{type.references.filter(ref => !ref.image).map(ref => <Link key={ref.href} href={ref.href}>{ref.label} <span>↗</span></Link>)}<Link href="/study/">Search the full reading edition <span>↗</span></Link></div></section>
            <section className="card"><p className="eyebrow">FILES & CAPTURE</p><h2>Inspect the asset</h2><div className="files"><a href={`${modelRoot}${selected.id}.obj`}>OBJ mesh <span>↗</span></a><a href={`${modelRoot}${selected.id}.mtl`}>MTL material <span>↗</span></a><a href={`${modelRoot}${atlas}`}>Texture atlas <span>↗</span></a><a id="snapshot-link" href={`/oneillsim/api/snapshot?scene=asset&asset=${selected.id}&azimuth=38&elevation=22&distance=${manifest?.family === 'Furniture & small props' ? 6 : 17}&imageWidth=1440&imageHeight=1000`} target="_blank" rel="noopener">Render PNG snapshot <span>↗</span></a><a href="/oneillsim/api/snapshot?scene=game&amp;x=778.9737&amp;y=286.5310&amp;z=8&amp;yaw=0&amp;pitch=10&amp;mode=human&amp;imageWidth=1440&amp;imageHeight=1000" target="_blank" rel="noopener">First saved home · +10° view <span>↗</span></a></div><p className="note">The API returns a PNG. Adjust the camera coordinates or the asset azimuth, elevation, and distance in each link's query string.</p></section>
        </aside>
    </main>
    <footer><span>{type.name} · {selected.name}</span><span>PROJECT STUDY MODEL · NOT A CONSTRUCTION DRAWING</span></footer>

</AssetViewer>; }
