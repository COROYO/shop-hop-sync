import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConflictMode, useMigrationStore } from "@/lib/store";
import { Settings2 } from "lucide-react";

export function MigrationSettings() {
  const { conflictMode, setConflictMode, dryRun, setDryRun } = useMigrationStore();

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Migrations-Einstellungen</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Konfliktbehandlung</Label>
          <Select value={conflictMode} onValueChange={(v) => setConflictMode(v as ConflictMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overwrite">Überschreiben — existierende Daten aktualisieren</SelectItem>
              <SelectItem value="skip">Überspringen — vorhandene Daten nicht antasten</SelectItem>
              <SelectItem value="ask">Nachfragen — bei jedem Konflikt entscheiden</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Testlauf (Dry Run)</Label>
            <p className="text-sm text-muted-foreground">
              Simuliert die Migration ohne Daten zu schreiben
            </p>
          </div>
          <Switch checked={dryRun} onCheckedChange={setDryRun} />
        </div>
      </CardContent>
    </Card>
  );
}
