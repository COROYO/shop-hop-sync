import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMigrationStore, DataType, METAFIELD_OWNER_TYPES } from "@/lib/store";
import { migrateDataType, MigrationSummary, MigrationResult } from "@/lib/migration-api";
import { ConflictModal, ConflictItem } from "@/components/ConflictModal";
import {
  Play,
  CheckCircle2,
  XCircle,
  SkipForward,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface LogEntry {
  timestamp: Date;
  item: string;
  status: "created" | "updated" | "skipped" | "error" | "info" | "conflict";
  message?: string;
}

const STATUS_LABELS: Record<string, string> = {
  products: "Produkte",
  collections: "Collections",
  metaobjects: "Metaobjekte",
  blogs: "Blogs & Artikel",
  pages: "Pages",
};

export function MigrationProgress() {
  const { sourceShop, targetShop, selectedItems, metafieldSelections, conflictMode, dryRun } = useMigrationStore();

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [summary, setSummary] = useState<MigrationSummary>({ total: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

  // Conflict modal state
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictItems, setConflictItems] = useState<ConflictItem[]>([]);
  const [conflictLabel, setConflictLabel] = useState("");
  const conflictResolveRef = useRef<((decisions: Record<string, "overwrite" | "skip">) => void) | null>(null);
  const conflictCancelRef = useRef<(() => void) | null>(null);

  const addLog = useCallback((entry: Omit<LogEntry, "timestamp">) => {
    setLogs((prev) => [...prev, { ...entry, timestamp: new Date() }]);
  }, []);

  const dataTypesToMigrate = (Object.keys(selectedItems) as DataType[]).filter(
    (dt) => selectedItems[dt].length > 0
  );

  const metafieldOwnerTypes = Object.entries(metafieldSelections)
    .filter(([, keys]) => keys.length > 0)
    .map(([ownerType]) => ownerType);

  const totalSelected = dataTypesToMigrate.reduce((a, dt) => a + selectedItems[dt].length, 0);
  const totalMetafields = metafieldOwnerTypes.reduce((a, ot) => a + (metafieldSelections[ot]?.length ?? 0), 0);
  const totalMigrationSteps = dataTypesToMigrate.length + metafieldOwnerTypes.length;

  // Wait for user decisions on conflicts via a promise
  const waitForConflictResolution = (conflicts: ConflictItem[], label: string): Promise<Record<string, "overwrite" | "skip"> | null> => {
    return new Promise((resolve) => {
      setConflictItems(conflicts);
      setConflictLabel(label);
      setConflictModalOpen(true);
      conflictResolveRef.current = (decisions) => {
        setConflictModalOpen(false);
        resolve(decisions);
      };
      conflictCancelRef.current = () => {
        setConflictModalOpen(false);
        resolve(null);
      };
    });
  };

  const processMigrationStep = async (
    label: string,
    dataType: DataType | "metafield_definitions",
    itemIds: string[],
    ownerType?: string
  ): Promise<MigrationSummary> => {
    const stepSummary: MigrationSummary = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 };

    try {
      const res = await migrateDataType(
        { url: sourceShop.url, token: sourceShop.token },
        { url: targetShop.url, token: targetShop.token },
        dataType,
        itemIds,
        conflictMode,
        dryRun,
        ownerType
      );

      // Separate conflicts from other results
      const conflicts = res.results.filter((r) => r.status === "conflict");
      const nonConflicts = res.results.filter((r) => r.status !== "conflict");

      // Log non-conflict results
      for (const r of nonConflicts) {
        addLog({ item: r.title, status: r.status, message: r.message });
      }

      stepSummary.total += nonConflicts.length;
      stepSummary.created += nonConflicts.filter((r) => r.status === "created").length;
      stepSummary.updated += nonConflicts.filter((r) => r.status === "updated").length;
      stepSummary.skipped += nonConflicts.filter((r) => r.status === "skipped").length;
      stepSummary.errors += nonConflicts.filter((r) => r.status === "error").length;

      // Handle conflicts
      if (conflicts.length > 0) {
        addLog({ item: label, status: "conflict", message: `${conflicts.length} Konflikte gefunden — warte auf Entscheidung...` });

        const conflictData: ConflictItem[] = conflicts.map((c) => ({
          id: c.id,
          title: c.title,
          sourceData: c.sourceData || {},
          targetData: c.targetData || {},
        }));

        const decisions = await waitForConflictResolution(conflictData, label);

        if (!decisions) {
          // User cancelled — skip all conflicts
          for (const c of conflicts) {
            addLog({ item: c.title, status: "skipped", message: "Abgebrochen" });
          }
          stepSummary.skipped += conflicts.length;
          stepSummary.total += conflicts.length;
        } else {
          const toOverwrite = Object.entries(decisions).filter(([, d]) => d === "overwrite").map(([id]) => id);
          const toSkip = Object.entries(decisions).filter(([, d]) => d === "skip").map(([id]) => id);

          // Log skipped
          for (const id of toSkip) {
            const c = conflicts.find((cc) => cc.id === id);
            addLog({ item: c?.title ?? id, status: "skipped", message: "Manuell übersprungen" });
          }
          stepSummary.skipped += toSkip.length;
          stepSummary.total += toSkip.length;

          // Re-send overwrite items
          if (toOverwrite.length > 0) {
            addLog({ item: label, status: "info", message: `${toOverwrite.length} Einträge werden überschrieben...` });
            const res2 = await migrateDataType(
              { url: sourceShop.url, token: sourceShop.token },
              { url: targetShop.url, token: targetShop.token },
              dataType,
              toOverwrite,
              "overwrite",
              dryRun,
              ownerType
            );
            for (const r of res2.results) {
              addLog({ item: r.title, status: r.status === "conflict" ? "skipped" : r.status, message: r.message });
            }
            stepSummary.total += res2.results.length;
            stepSummary.created += res2.summary.created;
            stepSummary.updated += res2.summary.updated;
            stepSummary.skipped += res2.summary.skipped;
            stepSummary.errors += res2.summary.errors;
          }
        }
      }

      addLog({ item: label, status: "info", message: `Fertig: ${stepSummary.created} erstellt, ${stepSummary.updated} aktualisiert, ${stepSummary.skipped} übersprungen, ${stepSummary.errors} Fehler` });
    } catch (e: any) {
      addLog({ item: label, status: "error", message: e.message });
      stepSummary.errors += itemIds.length;
    }

    return stepSummary;
  };

  const startMigration = useCallback(async () => {
    setRunning(true);
    setFinished(false);
    setLogs([]);
    setCompletedSteps(0);
    setTotalSteps(totalMigrationSteps);
    const globalSummary: MigrationSummary = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
    let stepsDone = 0;

    addLog({ item: "Migration", status: "info", message: `${dryRun ? "Testlauf" : "Migration"} gestartet — ${totalSelected} Einträge, ${totalMetafields} Metafelder` });

    // Migrate data types
    for (const dt of dataTypesToMigrate) {
      const label = STATUS_LABELS[dt] || dt;
      setCurrentLabel(label);
      setProgress(Math.round((stepsDone / totalMigrationSteps) * 100));
      addLog({ item: label, status: "info", message: `Starte ${label}...` });

      const stepResult = await processMigrationStep(label, dt, selectedItems[dt]);

      globalSummary.total += stepResult.total;
      globalSummary.created += stepResult.created;
      globalSummary.updated += stepResult.updated;
      globalSummary.skipped += stepResult.skipped;
      globalSummary.errors += stepResult.errors;

      stepsDone++;
      setCompletedSteps(stepsDone);
    }

    // Migrate metafields by owner type
    for (const ownerType of metafieldOwnerTypes) {
      const ownerLabel = METAFIELD_OWNER_TYPES.find((ot) => ot.key === ownerType)?.label ?? ownerType;
      const label = `Metafelder (${ownerLabel})`;
      setCurrentLabel(label);
      setProgress(Math.round((stepsDone / totalMigrationSteps) * 100));

      const defKeys = metafieldSelections[ownerType] ?? [];
      addLog({ item: label, status: "info", message: `Starte ${defKeys.length} Metafelder...` });

      const stepResult = await processMigrationStep(label, "metafield_definitions" as any, defKeys, ownerType);

      globalSummary.total += stepResult.total;
      globalSummary.created += stepResult.created;
      globalSummary.updated += stepResult.updated;
      globalSummary.skipped += stepResult.skipped;
      globalSummary.errors += stepResult.errors;

      stepsDone++;
      setCompletedSteps(stepsDone);
    }

    setProgress(100);
    setSummary(globalSummary);
    setRunning(false);
    setFinished(true);
    setCurrentLabel(null);
    addLog({ item: "Migration", status: "info", message: `${dryRun ? "Testlauf" : "Migration"} abgeschlossen` });
  }, [dataTypesToMigrate, metafieldOwnerTypes, sourceShop, targetShop, selectedItems, metafieldSelections, conflictMode, dryRun, totalSelected, totalMetafields, addLog, totalMigrationSteps]);

  const statusIcon = (status: LogEntry["status"]) => {
    switch (status) {
      case "created": return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
      case "updated": return <RefreshCw className="h-3.5 w-3.5 text-warning" />;
      case "skipped": return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
      case "error": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case "conflict": return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
      case "info": return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const canStart = totalSelected > 0 || totalMetafields > 0;

  return (
    <div className="space-y-4">
      <ConflictModal
        open={conflictModalOpen}
        conflicts={conflictItems}
        dataTypeLabel={conflictLabel}
        onResolve={(decisions) => conflictResolveRef.current?.(decisions)}
        onCancel={() => conflictCancelRef.current?.()}
      />

      {finished && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Zusammenfassung</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> {summary.created} erstellt
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <RefreshCw className="h-3 w-3" /> {summary.updated} aktualisiert
              </Badge>
              <Badge variant="outline" className="gap-1">
                <SkipForward className="h-3 w-3" /> {summary.skipped} übersprungen
              </Badge>
              {summary.errors > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" /> {summary.errors} Fehler
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(running || finished) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {running ? "Migration läuft..." : "Fortschritt"}
              </CardTitle>
              {running && currentLabel && (
                <Badge variant="secondary" className="text-xs">{currentLabel}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-sm text-muted-foreground">
              {completedSteps} / {totalSteps} Schritte • {progress}%
            </p>
          </CardContent>
        </Card>
      )}

      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Live-Log</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-1 font-mono text-xs">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 py-0.5">
                    <span className="shrink-0 text-muted-foreground">
                      {log.timestamp.toLocaleTimeString("de-DE")}
                    </span>
                    <span className="shrink-0">{statusIcon(log.status)}</span>
                    <span className="font-medium">{log.item}</span>
                    {log.message && (
                      <span className="text-muted-foreground">— {log.message}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {!running && !finished && (
        <Button
          size="lg"
          className="w-full"
          disabled={!canStart}
          onClick={startMigration}
        >
          <Play className="mr-2 h-4 w-4" />
          {dryRun ? "Testlauf starten" : "Migration starten"} ({totalSelected} Einträge{totalMetafields > 0 ? `, ${totalMetafields} MF` : ""})
        </Button>
      )}

      {running && (
        <Button size="lg" className="w-full" disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Migration läuft...
        </Button>
      )}

      {finished && (
        <Button size="lg" variant="outline" className="w-full" onClick={() => {
          setFinished(false);
          setLogs([]);
          setProgress(0);
          setSummary({ total: 0, created: 0, updated: 0, skipped: 0, errors: 0 });
        }}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Neue Migration
        </Button>
      )}
    </div>
  );
}
