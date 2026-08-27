import { redirect } from "next/navigation";

export default function AgentsIndexPage() {
  redirect("/agents/runs");
}
