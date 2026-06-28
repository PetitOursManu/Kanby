import { AppShell } from "@/components/AppShell";
import { ProfileForm } from "./ProfileForm";
import { getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { mustChange?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <AppShell active="profile">
      <ProfileForm
        user={{
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          globalRole: user.globalRole,
          mustChangePwd: user.mustChangePwd,
        }}
        mustChangeBanner={searchParams.mustChange === "1" || user.mustChangePwd}
      />
    </AppShell>
  );
}