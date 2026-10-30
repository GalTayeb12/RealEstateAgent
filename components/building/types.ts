export interface ExplorerUnit {
  id: string;
  floor: number;
  unitNumber: string;
  positionIndex: number;
  status: string;
  price: number | null;
  unitTypeId: string;
  unitLabel: string;
  listPrice: number;
}

export interface ExplorerBuilding {
  id: string;
  name: string;
  floorCount: number;
  unitsPerFloor: number;
  sortIndex: number;
  /** Stored for a future GLB. The current explorer does not load it. */
  modelUrl: string | null;
  units: ExplorerUnit[];
}

export interface FloorSelection {
  buildingId: string;
  floor: number;
}

export interface HoverInfo {
  buildingName: string;
  floor: number;
  lobby: boolean;
  unitNumber?: string;
  unitLabel?: string;
  status?: string;
  price?: number;
  /** Floor-level hover: available unit count */
  availableCount?: number;
  /** Floor-level hover: total unit count on this floor */
  totalCount?: number;
  /** Floor-level hover: is this the penthouse floor */
  isPenthouse?: boolean;
}
