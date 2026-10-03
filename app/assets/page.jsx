import Link from 'next/link';
import { redirect } from 'next/navigation';
import { assetGroups, assetTypes, findModelType } from '../../src/asset-library.js';
import './library.css';

export const metadata = { title: 'Stanford Torus — Asset Library' };
export default async function AssetsPage({ searchParams }) {
  const query = await searchParams;
  if (query.asset || query.capture) {
    const type = findModelType(query.asset || 'TorusHome_ModA');
    if (type) redirect(`/assets/${type.slug}/?${new URLSearchParams(query)}`);
  }
  const ready = assetTypes.filter(type => type.variants.length).length;
  return <main className="asset-library">
    <nav><a href="/oneillsim/">← Simulation</a><Link href="/study/">Study ↗</Link></nav>
    <header><h1>Asset library</h1><p>{ready} modeled · {assetTypes.length - ready} planned</p></header>
    <p className="library-intro">The building blocks of the settlement. Designs and shared references live together under each type.</p>
    <div className="library-groups">{assetGroups.map(group => <section key={group.name}>
      <h2>{group.name}<span>{group.types.length}</span></h2>
      <ul>{group.types.map(type => <li key={type.slug}>{type.variants.length ?
        <Link className="available" href={`/assets/${type.slug}/`}>{type.thumbnail && <img src={type.thumbnail} alt="" />}<span>{type.name}</span><small>{type.variants.length} design{type.variants.length === 1 ? '' : 's'} ↗</small></Link> :
        <div><span>{type.name}</span><small>Planned</small></div>}</li>)}</ul>
    </section>)}</div>
  </main>;
}
