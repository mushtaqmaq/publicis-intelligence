import { Frame } from "@/components/platform/Frame";

export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Frame>{children}</Frame>;
}
