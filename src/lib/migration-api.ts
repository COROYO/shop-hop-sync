import { supabase } from "@/integrations/supabase/client";
import { DataType, ConflictMode } from "@/lib/store";

export interface MigrationResult {
  id: string;
  title: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
}

export interface MigrationSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface MigrationResponse {
  results: MigrationResult[];
  summary: MigrationSummary;
}

export async function migrateDataType(
  sourceShop: { url: string; token: string },
  targetShop: { url: string; token: string },
  dataType: DataType | "metafields" | "metafield_definitions",
  itemIds: string[],
  conflictMode: ConflictMode,
  dryRun: boolean,
  metafieldsOwnerType?: string
): Promise<MigrationResponse> {
  const { data, error } = await supabase.functions.invoke("shopify-migrate", {
    body: { sourceShop, targetShop, dataType, itemIds, conflictMode, dryRun, metafieldsOwnerType },
  });
  if (error) throw new Error(error.message);
  return data as MigrationResponse;
}
