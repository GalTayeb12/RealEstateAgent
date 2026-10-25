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

export interface HoverInfo {
  buildingName: string;
  floor: number;
  lobby: boolean;
  unitNumber?: string;
  unitLabel?: string;
  status?: string;
  price?: number;
}
