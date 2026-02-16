import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMigrationStore, DataType } from "@/lib/store";
import { migrateDataType, MigrationResult, MigrationSummary } from "@/lib/migration-api";
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
  dataType: DataType | "metafields";
  item: string;
  status: "created" | "updated" | "skipped" | "error" | "info";
  message?: string;
}

const STATUS_LABELS: Record<string, string> = {
  products: "Produkte",
  collections: "Collections",
  metaobjects: "Metaobjekte",
  blogs: "Blogs & Artikel",
  pages: "Pages",
  metafields: "Metafelder",
};

// Data types that support metafields
const METAFIELD_TYPES: DataType[] = ["products", "collections", "pages", "blogs"];

export function MigrationProgress() {
  const { sourceShop, targetShop, selectedItems, conflictMode, dryRun, migrateMetafields } = useMigrationStore();

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentType, setCurrentType] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [summary, setSummary] = useState<MigrationSummary>({ total: 0, created: 0, updated: 0, skipped: 0, errors: 0 });

  const addLog = useCallback((entry: Omit<LogEntry, "timestamp">) => {
    setLogs((prev) => [...prev, { ...entry, timestamp: new Date() }]);
  }, []);

  const dataTypesToMigrate = (Object.keys(selectedItems) as DataType[]).filter(
    (dt) => selectedItems[dt].length > 0
  );

  const totalSelected = dataTypesToMigrate.reduce((a, dt) => a + selectedItems[dt].length, 0);

  // Calculate total steps: data types + metafield passes
  const metafieldPasses = migrateMetafields
    ? dataTypesToMigrate.filter((dt) => METAFIELD_TYPES.includes(dt) && selectedItems[dt].length > 0).length
    : 0;
  const totalMigrationSteps = dataTypesToMigrate.length + metafieldPasses;

  const startMigration = useCallback(async () => {
    setRunning(true);
    setFinished(false);
    setLogs([]);
    setCompletedSteps(0);
    setTotalSteps(totalMigrationSteps);
    const globalSummary: MigrationSummary = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
    let stepsDone = 0;

    addLog({ dataType: "products", item: "Migration", status: "info", message: `${dryRun ? "Testlauf" : "Migration"} gestartet mit ${totalSelected} Einträgen${migrateMetafields ? " + Metafelder" : ""}` });

    for (const dt of dataTypesToMigrate) {
      setCurrentType(dt);
      setProgress(Math.round((stepsDone / totalMigrationSteps) * 100));

      addLog({ dataType: dt, item: STATUS_LABELS[dt], status: "info", message: `Starte ${STATUS_LABELS[dt]}...` });

      try {
        const res = await migrateDataType(
          { url: sourceShop.url, token: sourceShop.token },
          { url: targetShop.url, token: targetShop.token },
          dt,
          selectedItems[dt],
          conflictMode,
          dryRun
        );

        for (const r of res.results) {
          addLog({ dataType: dt, item: r.title, status: r.status, message: r.message });
        }

        globalSummary.total += res.summary.total;
        globalSummary.created += res.summary.created;
        globalSummary.updated += res.summary.updated;
        globalSummary.skipped += res.summary.skipped;
        globalSummary.errors += res.summary.errors;

        addLog({ dataType: dt, item: STATUS_LABELS[dt], status: "info", message: `Abgeschlossen: ${res.summary.created} erstellt, ${res.summary.updated} aktualisiert, ${res.summary.skipped} übersprungen, ${res.summary.errors} Fehler` });
      } catch (e: any) {
        addLog({ dataType: dt, item: STATUS_LABELS[dt], status: "error", message: e.message });
        globalSummary.errors += selectedItems[dt].length;
      }

      stepsDone++;
      setCompletedSteps(stepsDone);

      // Metafields pass
      if (migrateMetafields && METAFIELD_TYPES.includes(dt) && selectedItems[dt].length > 0) {
        setCurrentType("metafields");
        setProgress(Math.round((stepsDone / totalMigrationSteps) * 100));

        addLog({ dataType: "metafields", item: `Metafelder (${STATUS_LABELS[dt]})`, status: "info", message: `Starte Metafelder für ${STATUS_LABELS[dt]}...` });

        try {
          const mfRes = await migrateDataType(
            { url: sourceShop.url, token: sourceShop.token },
            { url: targetShop.url, token: targetShop.token },
            "metafields",
            selectedItems[dt],
            conflictMode,
            dryRun,
            dt
          );

          for (const r of mfRes.results) {
            addLog({ dataType: "metafields", item: r.title, status: r.status, message: r.message });
          }

          globalSummary.total += mfRes.summary.total;
          globalSummary.created += mfRes.summary.created;
          globalSummary.updated += mfRes.summary.updated;
          globalSummary.skipped += mfRes.summary.skipped;
          globalSummary.errors += mfRes.summary.errors;

          addLog({ dataType: "metafields", item: `Metafelder (${STATUS_LABELS[dt]})`, status: "info", message: `Abgeschlossen: ${mfRes.summary.created} erstellt, ${mfRes.summary.updated} aktualisiert, ${mfRes.summary.skipped} übersprungen, ${mfRes.summary.errors} Fehler` });
        } catch (e: any) {
          addLog({ dataType: "metafields", item: `Metafelder (${STATUS_LABELS[dt]})`, status: "error", message: e.message });
        }

        stepsDone++;
        setCompletedSteps(stepsDone);
      }
    }

    setProgress(100);
    setSummary(globalSummary);
    setRunning(false);
    setFinished(true);
    setCurrentType(null);
    addLog({ dataType: "products", item: "Migration", status: "info", message: `${dryRun ? "Testlauf" : "Migration"} abgeschlossen` });
  }, [dataTypesToMigrate, sourceShop, targetShop, selectedItems, conflictMode, dryRun, totalSelected, addLog, migrateMetafields, totalMigrationSteps]);

  const statusIcon = (status: LogEntry["status"]) => {
    switch (status) {
      case "created": return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
      case "updated": return <RefreshCw className="h-3.5 w-3.5 text-warning" />;
      case "skipped": return <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />;
      case "error": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case "info": return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
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
              {running && currentType && (
                <Badge variant="secondary">{STATUS_LABELS[currentType] || currentType}</Badge>
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
          disabled={totalSelected === 0}
          onClick={startMigration}
        >
          <Play className="mr-2 h-4 w-4" />
          {dryRun ? "Testlauf starten" : "Migration starten"} ({totalSelected} Einträge)
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
