import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/modules/auth/session.service";

export default async function HomePage() {
  const user = await getSessionUser();
  redirect(user ? "/app" : "/login");
}
