// Preserve raw authored schemas on disk; expose common library/viewer fields.
export function normalizeAssetManifest(raw) {
  const bounds=raw.actualModelBoundsMeters || (raw.boundsMetres && [0,1,2].map(k=>[raw.boundsMetres.min[k],raw.boundsMetres.max[k]]));
  return {...raw,
    id:raw.id || raw.assetId,
    actualModelBoundsMeters:bounds,
    editorDefaultScale:raw.editorDefaultScale ?? raw.intendedPlacementScale,
    trianglesAfterQuadTriangulation:raw.trianglesAfterQuadTriangulation ?? raw.triangles ?? raw.triangleCount,
    vertices:raw.vertices ?? raw.vertexCount,
    materials:raw.materials ?? raw.materialCount,
    interpretations:raw.interpretations || (raw.interpretation ? [raw.interpretation] : []),
  };
}
