export function Footer() {
  return (
    <footer className="border-t bg-card py-4">
      <div className="container flex items-center justify-center gap-6 text-sm text-muted-foreground">
        <a
          href="https://coroyo.de/datenschutz"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Datenschutz
        </a>
        <span className="text-border">|</span>
        <a
          href="https://coroyo.de/impressum"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Impressum
        </a>
        <span className="text-border">|</span>
        <a
          href="https://shrymp-commerce.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Shrymp Commerce 🦐
        </a>
      </div>
    </footer>
  );
}
