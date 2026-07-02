import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";

export const metadata = {
  title: "Aide — Kanby",
  description: "Documentation d'utilisation de Kanby pour utilisateurs et administrateurs.",
};

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

  return (
    <AppShell active="boards">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="mb-6">
          <h1 className="font-headline text-2xl font-semibold text-on-surface">Documentation Kanby</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Guide d'utilisation pour les utilisateurs et les administrateurs.
          </p>
        </div>

        <Section icon="dashboard" title="Premiers pas">
          <Step number={1} title="Connexion">
            Utilisez votre adresse e-mail et votre mot de passe sur la page{" "}
            <strong>Connexion</strong>. Si vous êtes sur une instance auto-hébergée,
            l'administrateur vous a créé un compte ou vous pouvez utiliser le compte
            administrateur par défaut.
          </Step>
          <Step number={2} title="Votre profil">
            Cliquez sur votre avatar en haut à droite puis sur <strong>Profil</strong>{" "}
            pour modifier votre nom, votre mot de passe ou votre avatar.
          </Step>
          <Step number={3} title="Créer un tableau">
            Depuis la sidebar ou la page <strong>Tableaux</strong>, cliquez sur{" "}
            <strong>Nouveau tableau</strong> pour démarrer un projet.
          </Step>
        </Section>

        <Section icon="view_kanban" title="Gérer vos tableaux">
          <p>
            Un tableau Kanby est composé de <strong>colonnes</strong> (ex. À faire, En cours,
            Terminé) et de <strong>cartes</strong> (les tâches).
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Ajouter une colonne :</strong> en bas du kanban, cliquez sur{" "}
              <em>Ajouter une colonne</em>, saisissez le nom puis validez.
            </li>
            <li>
              <strong>Renommer une colonne :</strong> double-cliquez ou cliquez sur le
              nom de la colonne.
            </li>
            <li>
              <strong>Couleur d'une colonne :</strong> cliquez sur l'icône palette à
              côté du nom pour choisir une couleur ou la retirer.
            </li>
            <li>
              <strong>Supprimer une colonne :</strong> cliquez sur l'icône corbeille.
              Attention, toutes les cartes de la colonne seront supprimées.
            </li>
            <li>
              <strong>Réorganiser les colonnes :</strong> glissez-déposez une colonne par
              sa poignée (icône ≡) pour changer l'ordre.
            </li>
          </ul>
        </Section>

        <Section icon="checklist" title="Gérer les cartes">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Ajouter une carte :</strong> cliquez sur <em>Ajouter une tâche</em>{" "}
              en bas d'une colonne, saisissez un titre puis validez avec Entrée.
            </li>
            <li>
              <strong>Déplacer une carte :</strong> glissez-déposez la carte vers une
              autre colonne ou une autre position. Déposer une carte dans la colonne
              <em>Terminé</em> déclenche une petite célébration.
            </li>
            <li>
              <strong>Ouvrir une carte :</strong> cliquez sur une carte pour voir le
              détail, ajouter une description, des dates, des étiquettes, une checklist
              ou des commentaires.
            </li>
            <li>
              <strong>Assigner une carte :</strong> dans le détail d'une carte, sélectionnez
              un membre du tableau comme responsable.
            </li>
            <li>
              <strong>Checklist :</strong> ajoutez des sous-tâches et cochez-les pour
              suivre la progression.
            </li>
          </ul>
        </Section>

        <Section icon="group" title="Tableaux d'équipe">
          <p>
            Un tableau peut être <strong>Personnel</strong> ou <strong>Équipe</strong>.
            Seul le propriétaire peut changer le type.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Pour partager un tableau personnel, cliquez sur <em>Rendre en équipe</em>{" "}
              dans l'en-tête du tableau.
            </li>
            <li>
              Pour inviter des membres, cliquez sur le bouton <strong>Membres</strong>,
              recherchez un utilisateur par nom ou e-mail, puis validez.
            </li>
            <li>
              Les membres d'un tableau peuvent créer, déplacer et modifier des cartes.
              Seul le propriétaire peut supprimer le tableau, changer son type et gérer
              les membres.
            </li>
          </ul>
        </Section>

        <Section icon="verified_user" title="Guide administrateur">
          <p>
            Les administrateurs globaux ont accès à la page <strong>Admin</strong> via
            la sidebar. Ils peuvent :
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Voir tous les utilisateurs inscrits sur l'instance.</li>
            <li>Promouvoir ou rétrograder un utilisateur au rôle administrateur.</li>
            <li>Désactiver un compte pour empêcher toute connexion.</li>
            <li>Supprimer définitivement un compte utilisateur.</li>
            <li>
              Consulter les statistiques d'utilisation (nombre d'utilisateurs, de
              tableaux et de cartes).
            </li>
          </ul>
          <p className="mt-3 rounded-lg border border-tertiary/20 bg-tertiary/10 p-3 text-tertiary">
            <strong>Compte admin par défaut :</strong> au premier démarrage, Kanby crée
            automatiquement un compte administrateur configurable via les variables
            d'environnement (DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD). Changez ce
            mot de passe dès la première connexion.
          </p>
        </Section>

        <Section icon="trending_up" title="Widget Dashy">
          <p>
            Kanby expose un endpoint public pour les tableaux de bord{" "}
            <a
              href="https://dashy.to/"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Dashy
            </a>{" "}
            grâce à un token API personnel.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Rendez-vous dans <strong>Profil &gt; Tokens API</strong> pour générer un
              token.
            </li>
            <li>
              Utilisez l'URL <code>/api/widget/summary?token=VOTRE_TOKEN</code> dans un
              widget de type <em>API/JSON</em> de Dashy.
            </li>
            <li>
              Le token ne donne accès qu'à un résumé public de vos tâches (total,
              terminées, en cours) et ne touche jamais à votre session.
            </li>
          </ul>
        </Section>

        <Section icon="settings" title="Astuces">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Navigation rapide :</strong> au-dessus du kanban, une barre de
              puces permet de sauter directement à une colonne.
            </li>
            <li>
              <strong>Mode sombre/clair :</strong> utilisez le bouton en forme de soleil/
              lune pour basculer le thème.
            </li>
            <li>
              <strong>Mobile :</strong> sur petit écran, la sidebar est remplacée par un
              menu accessible depuis l'icône en haut à gauche.
            </li>
            <li>
              <strong>Déconnexion :</strong> cliquez sur <em>Déconnexion</em> en bas de
              la sidebar pour quitter votre session.
            </li>
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}
