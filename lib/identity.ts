import type { AvatarTone, IdentityMode, IdentityProfile } from "@/lib/types";

const AVATAR_TONES: AvatarTone[] = ["green", "violet", "cyan", "rose", "amber"];
const IDENTITY_MODES: IdentityMode[] = ["anonymous", "color", "nickname"];

export function parseIdentity(value: unknown): IdentityProfile | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const identityMode = input.identityMode;
  const avatarTone = input.avatarTone;
  const nickname = input.nickname;
  if (
    typeof identityMode !== "string" ||
    !IDENTITY_MODES.includes(identityMode as IdentityMode) ||
    typeof avatarTone !== "string" ||
    !AVATAR_TONES.includes(avatarTone as AvatarTone) ||
    typeof nickname !== "string"
  ) {
    return null;
  }

  return {
    identityMode: identityMode as IdentityMode,
    avatarTone: avatarTone as AvatarTone,
    nickname: nickname.trim().slice(0, 18),
  };
}

export function normalizeCircleKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 32).toLocaleUpperCase();
}

export function identityLabel(
  profile: IdentityProfile,
  sessionId: string,
): string {
  const nickname = profile.nickname.trim();
  if (profile.identityMode === "nickname" && nickname) return nickname;
  const suffix = sessionId.replace(/-/g, "").slice(-4).toUpperCase();
  return profile.identityMode === "color"
    ? `${profile.avatarTone} alien ${suffix}`
    : `Anonymous alien ${suffix}`;
}