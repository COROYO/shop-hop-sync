import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { testConnection } from "@/lib/shopify-api";
import { ShopConnection } from "@/lib/store";
import { Loader2, CheckCircle2, XCircle, Store } from "lucide-react";

interface Props {
  title: string;
  description: string;
  shop: ShopConnection;
  onUpdate: (shop: Partial<ShopConnection>) => void;
}

export function ShopConnectionCard({
  title,
  description,
  shop,
  onUpdate,
}: Props) {
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const result = await testConnection(shop.url, shop.token);
      onUpdate({ name: result.name, connected: true });
    } catch (e: any) {
      setError(e.message || "Verbindung fehlgeschlagen");
      onUpdate({ connected: false, name: undefined });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="flex-1">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          {shop.connected ? (
            <Badge
              variant="default"
              className="bg-success text-success-foreground"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Verbunden
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Nicht verbunden
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => e.preventDefault()}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${title}-url`}>Shop-URL</Label>
              <Input
                id={`${title}-url`}
                placeholder="mein-shop.myshopify.com"
                value={shop.url}
                onChange={(e) =>
                  onUpdate({ url: e.target.value, connected: false })
                }
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${title}-token`}>Admin API Access Token</Label>
              <Input
                id={`${title}-token`}
                type="text"
                placeholder="shpat_..."
                value={shop.token}
                onChange={(e) =>
                  onUpdate({ token: e.target.value, connected: false })
                }
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                className="font-mono"
              />
            </div>
          </div>
        </form>
        {shop.connected && shop.name && (
          <div className="rounded-md bg-accent p-3 text-sm">
            <span className="font-medium text-accent-foreground">Shop:</span>{" "}
            <span className="text-accent-foreground">{shop.name}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="h-4 w-4" />
            {error}
          </div>
        )}
        <Button
          onClick={handleTest}
          disabled={!shop.url || !shop.token || testing}
          className="w-full"
        >
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Teste Verbindung...
            </>
          ) : (
            "Verbindung testen"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
