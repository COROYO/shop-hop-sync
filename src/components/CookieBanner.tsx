import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("cookie-consent", "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card p-4 shadow-lg">
      <div className="container flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <p className="text-sm text-muted-foreground text-center sm:text-left">
          Wir verwenden Cookies, um die Nutzung unserer Website zu verbessern.
          Weitere Informationen findest du in unserer{" "}
          <a
            href="https://coroyo.de/datenschutz"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Datenschutzerklärung
          </a>
          .
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={decline}>
            Ablehnen
          </Button>
          <Button size="sm" onClick={accept}>
            Akzeptieren
          </Button>
        </div>
      </div>
    </div>
  );
}
