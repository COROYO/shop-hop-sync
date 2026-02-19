import { useState, useCallback } from "react";
import { useMigrationStore, DataType } from "@/lib/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTypeTab } from "@/components/DataTypeTab";
import { MetafieldsTab } from "@/components/MetafieldsTab";
import { MigrationSettings } from "@/components/MigrationSettings";
import { MigrationProgress } from "@/components/MigrationProgress";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  fetchProducts,
  fetchCollections,
  fetchPages,
  fetchBlogs,
  fetchMetaobjects,
} from "@/lib/shopify-api";
import {
  ArrowLeft,
  Package,
  FolderOpen,
  FileText,
  BookOpen,
  Boxes,
  Repeat,
  Tags,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TAB_CONFIG: { key: DataType; label: string; icon: React.ReactNode }[] = [
  { key: "products", label: "Produkte", icon: <Package className="h-4 w-4" /> },
  { key: "collections", label: "Collections", icon: <FolderOpen className="h-4 w-4" /> },
  { key: "metaobjects", label: "Metaobjekte", icon: <Boxes className="h-4 w-4" /> },
  { key: "blogs", label: "Blogs & Artikel", icon: <BookOpen className="h-4 w-4" /> },
  { key: "pages", label: "Pages", icon: <FileText className="h-4 w-4" /> },
];

export default function Dashboard() {
  const { sourceShop, targetShop, selectedItems, setSelectedItems, metafieldSelections } = useMigrationStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [data, setData] = useState<Record<DataType, any[]>>({
    products: [],
    collections: [],
    metaobjects: [],
    blogs: [],
    pages: [],
  });
  const [loading, setLoading] = useState<Record<DataType, boolean>>({
    products: false,
    collections: false,
    metaobjects: false,
    blogs: false,
    pages: false,
  });

  const loadData = useCallback(
    async (type: DataType) => {
      if (loading[type]) return;
      setLoading((l) => ({ ...l, [type]: true }));
      try {
        const { url, token } = sourceShop;
        let items: any[] = [];
        switch (type) {
          case "products":
            items = await fetchProducts(url, token);
            break;
          case "collections":
            items = await fetchCollections(url, token);
            break;
          case "pages":
            items = await fetchPages(url, token);
            break;
          case "blogs":
            items = await fetchBlogs(url, token);
            break;
          case "metaobjects":
            items = await fetchMetaobjects(url, token);
            break;
        }
        setData((d) => ({ ...d, [type]: items }));
      } catch (e: any) {
        toast({ title: "Fehler", description: e.message, variant: "destructive" });
      } finally {
        setLoading((l) => ({ ...l, [type]: false }));
      }
    },
    [sourceShop, toast, loading]
  );

  const totalSelected = Object.values(selectedItems).reduce((a, b) => a + b.length, 0);
  const totalMetafields = Object.values(metafieldSelections).reduce((a, b) => a + b.length, 0);

  const handleTabChange = (v: string) => {
    if (v !== "metafields") {
      loadData(v as DataType);
    }
  };

  if (!sourceShop.connected) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Repeat className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">Shopify Migrator</h1>
              <p className="text-sm text-muted-foreground">
                {sourceShop.name} → {targetShop.name || "Ziel-Shop"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{totalSelected} ausgewählt</Badge>
            {totalMetafields > 0 && (
              <Badge variant="outline">{totalMetafields} Metafelder</Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <Tabs defaultValue="products" onValueChange={handleTabChange}>
              <TabsList className="mb-4 w-full justify-start flex-wrap">
                {TAB_CONFIG.map((tab) => (
                  <TabsTrigger key={tab.key} value={tab.key} className="gap-2">
                    {tab.icon}
                    {tab.label}
                    {selectedItems[tab.key].length > 0 && (
                      <Badge variant="default" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                        {selectedItems[tab.key].length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="metafields" className="gap-2">
                  <Tags className="h-4 w-4" />
                  Metafelder
                  {totalMetafields > 0 && (
                    <Badge variant="default" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                      {totalMetafields}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {TAB_CONFIG.map((tab) => (
                <TabsContent key={tab.key} value={tab.key}>
                  <DataTypeTab
                    items={data[tab.key]}
                    loading={loading[tab.key]}
                    selectedIds={selectedItems[tab.key]}
                    onSelectionChange={(ids) => setSelectedItems(tab.key, ids)}
                    onRefresh={() => loadData(tab.key)}
                  />
                </TabsContent>
              ))}

              <TabsContent value="metafields">
                <MetafieldsTab />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-6">
            <MigrationSettings />
            <MigrationProgress />
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
