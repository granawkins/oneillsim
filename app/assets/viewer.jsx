"use client";
import { useEffect, useRef } from 'react';
import { mountAssetViewer } from '../../assets/gallery.js';

export default function AssetViewer({ children, assetId, assetRoot }) {
  const root = useRef(null);
  useEffect(() => mountAssetViewer(root.current, { assetId, assetRoot }), [assetId, assetRoot]);
  return <div ref={root} className="asset-page">{children}</div>;
}
