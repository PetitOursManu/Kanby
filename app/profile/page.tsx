import { AppShell } from "@/components/AppShell";
import { ProfileForm } from "./ProfileForm";
import { requirePageUser } from "@/lib/auth/page";
import { isKosmyEnabled } from "@/lib/kosmy-board/server";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { mustChange?: string; kosmy?: string; kosmy_error?: string };
}) {
  const user = await requirePageUser({ path: "/profile", allowMustChange: true });
  const kosmyEnabled = await isKosmyEnabled();

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
        kosmy={{
          enabled: kosmyEnabled,
          linked: !!user.kosmySub,
          justLinked: searchParams.kosmy === "linked",
          error: searchParams.kosmy_error ?? null,
        }}
      />
    </AppShell>
  );
}