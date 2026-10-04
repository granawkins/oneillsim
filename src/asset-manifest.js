// Preserve raw authored schemas on disk; expose common library/viewer fields.
export function normalizeAssetManifest(raw) {
  const sourceBounds=raw.actualModelBoundsMeters || raw.boundsMetres;
  const bounds=Array.isArray(sourceBounds) ? sourceBounds : sourceBounds && [0,1,2].map(k=>[sourceBounds.min[k],sourceBounds.max[k]]);
  return {...raw,
    id:raw.id || raw.assetId,
    actualModelBoundsMeters:bounds,
    editorDefaultScale:raw.editorDefaultScale ?? raw.intendedPlacementScale,
    trianglesAfterQuadTriangulation:raw.trianglesAfterQuadTriangulation ?? raw.triangles ?? raw.triangleCount,
    vertices:raw.vertices ?? raw.vertexCount,
    materials:Array.isArray(raw.materials) ? raw.materials.length : (raw.materials ?? raw.materialCount),
    interpretations:raw.interpretations || (raw.interpretation ? [raw.interpretation] : []),
  };
}
