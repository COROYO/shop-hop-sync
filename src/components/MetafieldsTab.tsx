import { useState, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMigrationStore, METAFIELD_OWNER_TYPES } from "@/lib/store";
import { fetchMetafieldDefinitions } from "@/lib/shopify-api";
import { useToast } from "@/hooks/use-toast";

interface MetafieldDef {
  id: string;
  title: string;
  name: string;
  handle: string;
  namespace: string;
  key: string;
  typeName: string;
  description?: string;
  ownerType: string;
}

export function MetafieldsTab() {
  const { sourceShop, metafieldSelections, setMetafieldSelections } = useMigrationStore();
  const { toast } = useToast();

  const [ownerType, setOwnerType] = useState<string>("PRODUCT");
  const [definitions, setDefinitions] = useState<Record<string, MetafieldDef[]>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const currentDefs = definitions[ownerType] ?? [];
  const selectedIds = metafieldSelections[ownerType] ?? [];

  const loadDefinitions = useCallback(async (ot: string) => {
    setLoading(true);
    try {
      const defs = await fetchMetafieldDefinitions(sourceShop.url, sourceShop.token, ot);
      setDefinitions((prev) => ({ ...prev, [ot]: defs }));
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [sourceShop, toast]);

  const handleOwnerTypeChange = (ot: string) => {
    setOwnerType(ot);
    setSearch("");
    if (!definitions[ot]) {
      loadDefinitions(ot);
    }
  };

  const filtered = currentDefs.filter((def) => {
    const label = `${def.namespace}.${def.key} ${def.name}`.toLowerCase();
    return label.includes(search.toLowerCase());
  });

  const allSelected = filtered.length > 0 && filtered.every((d) => selectedIds.includes(d.id));

  const toggleAll = () => {
    if (allSelected) {
      setMetafieldSelections(ownerType, selectedIds.filter((id) => !filtered.some((d) => d.id === id)));
    } else {
      const newIds = new Set(selectedIds);
      filtered.forEach((d) => newIds.add(d.id));
      setMetafieldSelections(ownerType, Array.from(newIds));
    }
  };

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      setMetafieldSelections(ownerType, selectedIds.filter((i) => i !== id));
    } else {
      setMetafieldSelections(ownerType, [...selectedIds, id]);
    }
  };

  // Count total selected across all owner types
  const totalMetafieldSelections = Object.values(metafieldSelections).reduce((a, b) => a + b.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={ownerType} onValueChange={handleOwnerTypeChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METAFIELD_OWNER_TYPES.map((ot) => {
              const count = (metafieldSelections[ot.key] ?? []).length;
              return (
                <SelectItem key={ot.key} value={ot.key}>
                  {ot.label}{count > 0 ? ` (${count})` : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Badge variant="secondary">{totalMetafieldSelections} Metafelder gesamt</Badge>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {currentDefs.length > 0 && (
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {allSelected ? "Alle abwählen" : "Alle auswählen"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => loadDefinitions(ownerType)}>
          Laden
        </Button>
        <Badge variant="secondary">{selectedIds.length} ausgewählt</Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Lade Metafeld-Definitionen...</span>
        </div>
      ) : currentDefs.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          Keine Metafeld-Definitionen gefunden. Klicke "Laden" um die Daten abzurufen.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Name</TableHead>
                <TableHead>Namespace.Key</TableHead>
                <TableHead>Typ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((def) => (
                <TableRow key={def.id} className="cursor-pointer" onClick={() => toggle(def.id)}>
                  <TableCell>
                    <Checkbox checked={selectedIds.includes(def.id)} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {def.name}
                    {def.description && (
                      <span className="ml-2 text-xs text-muted-foreground">{def.description}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {def.namespace}.{def.key}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{def.typeName}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
