import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';
import { findAssetType } from '../../../src/asset-library.js';
import AssetDetail from '../detail';

export const metadata = { title: 'Stanford Torus — Asset Library' };
export default async function AssetTypePage({ params, searchParams }) {
  const { slug } = await params;
  const type = findAssetType(slug);
  if (!type?.variants.length) notFound();
  const query = await searchParams;
  const selected = type.variants.find(variant => variant.id === (query.design || query.asset)) || type.variants[0];
  const variants = await Promise.all(type.variants.map(async variant => {
    let stats = null;
    try {
      stats = JSON.parse(await readFile(path.join(process.cwd(), 'assets', variant.directory, `${variant.id}.asset.json`), 'utf8'));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return { ...variant, stats };
  }));
  return <AssetDetail type={type} selected={selected} variants={variants}/>;
}
