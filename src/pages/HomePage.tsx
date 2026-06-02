import { Link } from "@tanstack/react-router";

export default function HomePage() {
  return (
    <div className="flex flex-1 items-center justify-center flex-col gap-4">
      <h1 className="text-3xl font-headline font-bold text-primary">Focal</h1>
      <p className="text-sm text-on-surface-variant font-label">Because focus matters.</p>
      <Link to="/settings" className="text-xs underline text-on-surface-variant hover:text-primary">
        Settings →
      </Link>
    </div>
  );
}
