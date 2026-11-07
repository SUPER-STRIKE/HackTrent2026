import { Rail } from "@/components/rail";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <Rail />
      <main className="page">{children}</main>
    </div>
  );
}
