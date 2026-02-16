import { create } from "zustand";

export interface ShopConnection {
  url: string;
  token: string;
  name?: string;
  connected: boolean;
}

export type ConflictMode = "overwrite" | "skip" | "ask";
export type DataType = "products" | "collections" | "metaobjects" | "blogs" | "pages";

export interface MigrationState {
  sourceShop: ShopConnection;
  targetShop: ShopConnection;
  selectedDataTypes: DataType[];
  selectedItems: Record<DataType, string[]>;
  conflictMode: ConflictMode;
  dryRun: boolean;
  setSourceShop: (shop: Partial<ShopConnection>) => void;
  setTargetShop: (shop: Partial<ShopConnection>) => void;
  setSelectedDataTypes: (types: DataType[]) => void;
  setSelectedItems: (type: DataType, ids: string[]) => void;
  setConflictMode: (mode: ConflictMode) => void;
  setDryRun: (dryRun: boolean) => void;
  reset: () => void;
}

const initialShop: ShopConnection = { url: "", token: "", connected: false };

export const useMigrationStore = create<MigrationState>((set) => ({
  sourceShop: { ...initialShop },
  targetShop: { ...initialShop },
  selectedDataTypes: [],
  selectedItems: { products: [], collections: [], metaobjects: [], blogs: [], pages: [] },
  conflictMode: "skip",
  dryRun: false,
  setSourceShop: (shop) => set((s) => ({ sourceShop: { ...s.sourceShop, ...shop } })),
  setTargetShop: (shop) => set((s) => ({ targetShop: { ...s.targetShop, ...shop } })),
  setSelectedDataTypes: (types) => set({ selectedDataTypes: types }),
  setSelectedItems: (type, ids) =>
    set((s) => ({ selectedItems: { ...s.selectedItems, [type]: ids } })),
  setConflictMode: (mode) => set({ conflictMode: mode }),
  setDryRun: (dryRun) => set({ dryRun }),
  reset: () =>
    set({
      sourceShop: { ...initialShop },
      targetShop: { ...initialShop },
      selectedDataTypes: [],
      selectedItems: { products: [], collections: [], metaobjects: [], blogs: [], pages: [] },
      conflictMode: "skip",
      dryRun: false,
    }),
}));
