import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { getServerTranslator } from "@/lib/i18n/server";

export async function generateMetadata() {
  const t = getServerTranslator();
  return {
    title: t("help.title"),
    description: t("help.description"),
  };
}

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-surface rounded-xl p-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-on-surface">
        <Icon name={icon} size={22} className="text-primary" />
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-on-surface-variant">
        {children}
      </div>
    </section>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {number}
      </span>
      <div>
        <h3 className="font-medium text-on-surface">{title}</h3>
        <p className="mt-1">{children}</p>
      </div>
    </div>
  );
}

export default async function HelpPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const t = getServerTranslator();

  return (
    <AppShell active="boards">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="mb-6">
          <h1 className="font-headline text-2xl font-semibold text-on-surface">{t("help.h1")}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {t("help.intro")}
          </p>
        </div>

        <Section icon="dashboard" title={t("help.gettingStarted")}>
          <Step number={1} title={t("help.login")}>
            {t("help.loginBody")} <strong>{t("auth.login.title")}</strong>. {t("help.loginBody2")}
          </Step>
          <Step number={2} title={t("help.yourProfile")}>
            {t("help.yourProfileBody")} <strong>{t("nav.profile")}</strong>{" "}
            {t("help.yourProfileBody2")}
          </Step>
          <Step number={3} title={t("help.createBoard")}>
            {t("help.createBoardBody")} <strong>{t("nav.boards")}</strong>, {t("help.createBoardBody2")}{" "}
            <strong>{t("boards.new")}</strong> {t("help.createBoardBody3")}
          </Step>
        </Section>

        <Section icon="view_kanban" title={t("help.manageBoards")}>
          <p>
            {t("help.boardComposed")} <strong>{t("help.columns")}</strong> {t("help.columnsExample")}{" "}
            <strong>{t("help.cards")}</strong> {t("help.cardsParen")}
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>{t("help.addColumn")}</strong> {t("help.addColumnBody")}{" "}
              <em>{t("board.addColumn")}</em>, {t("help.addColumnBody2")}
            </li>
            <li>
              <strong>{t("help.renameColumn")}</strong> {t("help.renameColumnBody")}
            </li>
            <li>
              <strong>{t("help.columnColor")}</strong> {t("help.columnColorBody")}
            </li>
            <li>
              <strong>{t("help.deleteColumn")}</strong> {t("help.deleteColumnBody")}
            </li>
            <li>
              <strong>{t("help.reorderColumns")}</strong> {t("help.reorderColumnsBody")}
            </li>
          </ul>
        </Section>

        <Section icon="checklist" title={t("help.manageCards")}>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>{t("help.addCard")}</strong> {t("help.addCardBody")} <em>{t("board.addTask")}</em>{" "}
              {t("help.addCardBody2")}
            </li>
            <li>
              <strong>{t("help.moveCard")}</strong> {t("help.moveCardBody")}{" "}
              <em>{t("board.defaultColDone")}</em> {t("help.moveCardBody2")}
            </li>
            <li>
              <strong>{t("help.openCard")}</strong> {t("help.openCardBody")}
            </li>
            <li>
              <strong>{t("help.assignCard")}</strong> {t("help.assignCardBody")}
            </li>
            <li>
              <strong>{t("help.checklist")}</strong> {t("help.checklistBody")}
            </li>
          </ul>
        </Section>

        <Section icon="group" title={t("help.teamBoards")}>
          <p>
            {t("help.teamBoardsBody")} <strong>{t("boards.personalFull")}</strong> {t("help.teamBoardsBody2")}{" "}
            <strong>{t("boards.team")}</strong>. {t("help.teamBoardsBody3")}
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {t("help.sharePersonal")} <em>{t("board.makeTeam")}</em>{" "}
              {t("help.sharePersonalBody")}
            </li>
            <li>
              {t("help.inviteMembers")} <strong>{t("board.invite")}</strong>,{" "}
              {t("help.inviteMembersBody")}
            </li>
            <li>
              {t("help.membersCan")}
            </li>
          </ul>
        </Section>

        <Section icon="verified_user" title={t("help.adminGuide")}>
          <p>
            {t("help.adminGuideBody")} <strong>{t("nav.admin")}</strong> {t("help.adminGuideBody2")}
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>{t("help.adminCan1")}</li>
            <li>{t("help.adminCan2")}</li>
            <li>{t("help.adminCan3")}</li>
            <li>{t("help.adminCan4")}</li>
            <li>
              {t("help.adminCan5")}
            </li>
          </ul>
          <p className="mt-3 rounded-lg border border-tertiary/20 bg-tertiary/10 p-3 text-tertiary">
            <strong>{t("help.defaultAdmin")}</strong> {t("help.defaultAdminBody")}
          </p>
        </Section>

        <Section icon="trending_up" title={t("help.dashyWidget")}>
          <p>
            {t("help.dashyWidgetBody")}{" "}
            <a
              href="https://dashy.to/"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Dashy
            </a>{" "}
            {t("help.dashyWidgetBody2")}
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {t("help.dashyWidgetBody3")} <strong>{t("nav.profile")} &gt; {t("profile.tokens")}</strong>{" "}
              {t("help.dashyWidgetBody3")}
            </li>
            <li>
              {t("help.dashyWidgetBody4")} <code>/api/widget/summary?token=YOUR_TOKEN</code>{" "}
              {t("help.dashyWidgetBody4")} <em>API/JSON</em> {t("help.dashyWidgetBody5")}
            </li>
            <li>
              {t("help.dashyWidgetBody6")}
            </li>
          </ul>
        </Section>

        <Section icon="settings" title={t("help.tips")}>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>{t("help.quickNav")}</strong> {t("help.quickNavBody")}
            </li>
            <li>
              <strong>{t("help.darkLight")}</strong> {t("help.darkLightBody")}
            </li>
            <li>
              <strong>{t("help.mobile")}</strong> {t("help.mobileBody")}
            </li>
            <li>
              <strong>{t("help.logout")}</strong> {t("help.logoutBody")} <em>{t("nav.logout")}</em>{" "}
              {t("help.logoutBody2")}
            </li>
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}