import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, AlertTriangle } from "lucide-react";

export interface ConflictItem {
  id: string;
  title: string;
  sourceData: Record<string, any>;
  targetData: Record<string, any>;
}

interface ConflictModalProps {
  open: boolean;
  conflicts: ConflictItem[];
  dataTypeLabel: string;
  onResolve: (decisions: Record<string, "overwrite" | "skip">) => void;
  onCancel: () => void;
}

export function ConflictModal({
  open,
  conflicts,
  dataTypeLabel,
  onResolve,
  onCancel,
}: ConflictModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === conflicts.length) setSelected(new Set());
    else setSelected(new Set(conflicts.map((c) => c.id)));
  };

  const handleConfirm = () => {
    const decisions: Record<string, "overwrite" | "skip"> = {};
    for (const c of conflicts) {
      decisions[c.id] = selected.has(c.id) ? "overwrite" : "skip";
    }
    onResolve(decisions);
  };

  const renderValue = (val: any): string => {
    if (val == null) return "—";
    if (typeof val === "object") return JSON.stringify(val, null, 2);
    return String(val);
  };

  const allKeys = (src: Record<string, any>, tgt: Record<string, any>) => {
    return [...new Set([...Object.keys(src || {}), ...Object.keys(tgt || {})])];
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Konflikte — {dataTypeLabel}
          </DialogTitle>
          <DialogDescription>
            {conflicts.length} Einträge existieren bereits im Ziel-Shop. Wähle aus, welche überschrieben werden sollen.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2 border-b">
          <Checkbox
            checked={selected.size === conflicts.length}
            onCheckedChange={selectAll}
          />
          <span className="text-sm font-medium">
            Alle auswählen ({selected.size}/{conflicts.length} zum Überschreiben)
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-3 pr-2">
            {conflicts.map((conflict) => {
              const isSelected = selected.has(conflict.id);
              const keys = allKeys(conflict.sourceData, conflict.targetData);

              return (
                <div
                  key={conflict.id}
                  className={`rounded-lg border p-3 transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleItem(conflict.id)}
                    />
                    <span className="font-medium text-sm">{conflict.title}</span>
                    <Badge variant={isSelected ? "default" : "secondary"} className="ml-auto text-xs">
                      {isSelected ? "Überschreiben" : "Überspringen"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs">
                    <div className="font-medium text-muted-foreground text-center mb-1">Quelle</div>
                    <div />
                    <div className="font-medium text-muted-foreground text-center mb-1">Ziel</div>

                    {keys.map((key) => {
                      const srcVal = renderValue(conflict.sourceData?.[key]);
                      const tgtVal = renderValue(conflict.targetData?.[key]);
                      const isDiff = srcVal !== tgtVal;

                      return (
                        <div key={key} className="contents">
                          <div className={`rounded px-2 py-1 ${isDiff ? "bg-primary/10" : "bg-muted/50"}`}>
                            <span className="text-muted-foreground">{key}:</span>{" "}
                            <span className="font-mono">{srcVal}</span>
                          </div>
                          <div className="flex items-center justify-center">
                            <ArrowRight className={`h-3 w-3 ${isDiff ? "text-primary" : "text-muted-foreground/30"}`} />
                          </div>
                          <div className={`rounded px-2 py-1 ${isDiff ? "bg-destructive/10" : "bg-muted/50"}`}>
                            <span className="text-muted-foreground">{key}:</span>{" "}
                            <span className="font-mono">{tgtVal}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm}>
            {selected.size > 0
              ? `${selected.size} überschreiben, ${conflicts.length - selected.size} überspringen`
              : `Alle ${conflicts.length} überspringen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
