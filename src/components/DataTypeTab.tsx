import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DataItem {
  id: string | number;
  title?: string;
  name?: string;
  handle?: string;
}

interface Props {
  items: DataItem[];
  loading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onRefresh: () => void;
}

export function DataTypeTab({ items, loading, selectedIds, onSelectionChange, onRefresh }: Props) {
  const [search, setSearch] = useState("");

  const filtered = items.filter((item) => {
    const label = item.title || item.name || item.handle || String(item.id);
    return label.toLowerCase().includes(search.toLowerCase());
  });

  const allSelected = filtered.length > 0 && filtered.every((i) => selectedIds.includes(String(i.id)));

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange(selectedIds.filter((id) => !filtered.some((i) => String(i.id) === id)));
    } else {
      const newIds = new Set(selectedIds);
      filtered.forEach((i) => newIds.add(String(i.id)));
      onSelectionChange(Array.from(newIds));
    }
  };

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((i) => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Lade Daten...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        <Button variant="outline" size="sm" onClick={toggleAll}>
          {allSelected ? "Alle abwählen" : "Alle auswählen"}
        </Button>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Aktualisieren
        </Button>
        <Badge variant="secondary">{selectedIds.length} ausgewählt</Badge>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          Keine Einträge gefunden. Bitte lade die Daten zuerst.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Name / Titel</TableHead>
                <TableHead>Handle / ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => {
                const id = String(item.id);
                return (
                  <TableRow key={id} className="cursor-pointer" onClick={() => toggle(id)}>
                    <TableCell>
                      <Checkbox checked={selectedIds.includes(id)} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {item.title || item.name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.handle || id}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
