// Tondo con l'immagine profilo di un utente (simbolo di colori o art di un
// planeswalker scelti dalla galleria) o, se non l'ha scelta, l'iniziale del nome.

import { avatarImageUrl, validAvatar } from "../friends";

export default function UserAvatar({
  name,
  avatar,
  online,
  className = "friend-avatar",
}: {
  name: string;
  avatar?: string | null;
  /** undefined = niente pallino; true/false = pallino verde/grigio. */
  online?: boolean;
  className?: string;
}) {
  const img = validAvatar(avatar) ? avatarImageUrl(avatar) : null;
  const sym = !!img && !!avatar?.startsWith("sym:");
  return (
    <span
      className={`${className}${img ? " has-img" : ""}${sym ? " is-sym" : ""}`}
      style={img ? { backgroundImage: `url("${img}")` } : undefined}
      aria-hidden
    >
      {!img && (name.trim()[0] ?? "?").toUpperCase()}
      {online !== undefined && <span className={`friend-dot${online ? " on" : ""}`} />}
    </span>
  );
}
