import { Outlet } from "@tanstack/react-router";

export default function RootLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-on-background font-body">
      <Outlet />
    </div>
  );
}
