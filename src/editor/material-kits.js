import {remainingModelContract} from '../remaining-model-contract.js';
const remainingKits = new Map(remainingModelContract.map(a=>[a.id,a.materialKit]));
// Only authored kits with byte-compatible MTL definitions share creators.
// Catalog membership gates generated landscape names; a prefix alone is unsafe.
const street = new Set(['TorusBench_A','TorusTable_A','TorusPlanter_A','TorusRailing_A','TorusSign_A','TorusWasteBin_A']);
const residential = new Set(['TorusHome_CourtyardA','TorusHome_RowA','TorusApartment_TerraceA']);
const districtBuildings = new Set(['TorusDistrict_Housing5A','TorusDistrict_Housing4A','TorusDistrict_Housing2A','TorusDistrict_SchoolA','TorusDistrict_ClinicA','TorusDistrict_HallA','TorusDistrict_ShopsA','TorusDistrict_OfficesA','TorusDistrict_WorkshopA','TorusDistrict_StorageA','TorusDistrict_RecreationA','TorusDistrict_CommunityA']);
export function materialKitKey(name, registeredNames = []) {
  if (remainingKits.has(name) && registeredNames.includes(name)) return remainingKits.get(name);
  if (street.has(name)) return 'street';
  if (residential.has(name)) return 'residential';
  if (districtBuildings.has(name)) return 'district-buildings';
  if (/^TorusDistrict_(?:ParkA|TreeA|Path\d+|Terrace\d+)$/.test(name) && registeredNames.includes(name)) return 'district-landscape';
  return null;
}
