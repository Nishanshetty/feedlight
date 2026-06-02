import { Link } from "@tanstack/react-router";

export default function SettingsPage() {
  return (
    <div className="flex flex-1 items-center justify-center flex-col gap-4">
      <h2 className="text-xl font-headline font-bold text-primary">Settings</h2>
      <p className="text-sm text-on-surface-variant">API keys and preferences will live here.</p>
      <Link to="/" className="text-xs underline text-on-surface-variant hover:text-primary">
        ← Back
      </Link>
    </div>
  );
}
