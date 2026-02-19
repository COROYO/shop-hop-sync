import { ShopConnectionCard } from "@/components/ShopConnectionCard";
import { Footer } from "@/components/Footer";
import { useMigrationStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ExternalLink, Linkedin, Repeat } from "lucide-react";

export default function Setup() {
  const { sourceShop, targetShop, setSourceShop, setTargetShop } =
    useMigrationStore();
  const navigate = useNavigate();
  const bothConnected = sourceShop.connected && targetShop.connected;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Repeat className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Shopify Migrator
              </h1>
              <p className="text-sm text-muted-foreground">
                Shop-zu-Shop Datenmigration
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container max-w-4xl flex-1 py-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold">Shops verbinden</h2>
          <p className="mt-2 text-muted-foreground">
            Verbinde deine Quell- und Ziel-Shops über deren Admin API Access
            Tokens
          </p>
          <p className="mt-2 text-muted-foreground">
            Wenn du keine Ahnung hast, wie du die Access Tokens bekommst, lass
            es einfach. Das Tool ist nichts für dich.
          </p>
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          <ShopConnectionCard
            title="Quell-Shop (A)"
            description="Der Shop, aus dem Daten gelesen werden"
            shop={sourceShop}
            onUpdate={setSourceShop}
          />
          <ShopConnectionCard
            title="Ziel-Shop (B)"
            description="Der Shop, in den Daten geschrieben werden"
            shop={targetShop}
            onUpdate={setTargetShop}
          />
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            disabled={!bothConnected}
            onClick={() => navigate("/dashboard")}
          >
            Weiter zur Datenauswahl
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        <div className="mt-10 flex justify-center">
          <a
            href="https://www.linkedin.com/posts/roman-nenstiel_devs-aufgepasst-wir-haben-einen-store-migrator-activity-7430342237525438465-uQA8"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Linkedin className="h-4 w-4 text-[#0A66C2]" />
            Zum LinkedIn-Beitrag
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
