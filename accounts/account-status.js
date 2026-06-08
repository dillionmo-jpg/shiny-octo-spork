export const ACCOUNT_STATUS_CLASS = Object.freeze({
  ADMIN: 1,
  GUIDE: 2,
  DEFAULT: 5,
  MEMBER: 6,
  MOD: 8,
  SUPER_MOD: 9,
});

export const STAFF_ROLE_RANK = Object.freeze({
  NONE: 0,
  GUIDE: 10,
  MOD: 20,
  SUPER_MOD: 30,
  ADMIN: 40,
});

const ROLE_NAME_TO_CLASS = new Map([
  ["admin", ACCOUNT_STATUS_CLASS.ADMIN],
  ["administrator", ACCOUNT_STATUS_CLASS.ADMIN],
  ["mod", ACCOUNT_STATUS_CLASS.MOD],
  ["moderator", ACCOUNT_STATUS_CLASS.MOD],
  ["supermod", ACCOUNT_STATUS_CLASS.SUPER_MOD],
  ["super-mod", ACCOUNT_STATUS_CLASS.SUPER_MOD],
  ["super_mod", ACCOUNT_STATUS_CLASS.SUPER_MOD],
  ["super moderator", ACCOUNT_STATUS_CLASS.SUPER_MOD],
  ["guide", ACCOUNT_STATUS_CLASS.GUIDE],
  ["member", ACCOUNT_STATUS_CLASS.MEMBER],
  ["vip", ACCOUNT_STATUS_CLASS.MEMBER],
]);

const STATUS_CLASS_COLORS = new Map([
  [ACCOUNT_STATUS_CLASS.ADMIN, "FF0000"],
  [ACCOUNT_STATUS_CLASS.MOD, "0000FF"],
  [ACCOUNT_STATUS_CLASS.SUPER_MOD, "B8860B"],
  [ACCOUNT_STATUS_CLASS.GUIDE, "4A9FD8"],
  [ACCOUNT_STATUS_CLASS.MEMBER, "00AA00"],
]);

function normalizeRoleClass(value) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return 0;
  }

  const namedRole = ROLE_NAME_TO_CLASS.get(rawValue.toLowerCase());
  if (namedRole) {
    return namedRole;
  }

  const roleClass = Number(rawValue);
  return Number.isFinite(roleClass) && roleClass > 0 ? Math.floor(roleClass) : 0;
}

export function accountMembershipFlag(account) {
  const flag = Number(
    account?.vip ??
      account?.membership ??
      account?.isMember ??
      account?.mb ??
      0,
  );

  if (Number.isFinite(flag) && flag > 0) {
    // Check if membership has an expiry date
    const expiresAt = account?.membershipExpiresAt;
    if (expiresAt) {
      const expiryDate = new Date(expiresAt);
      if (Number.isFinite(expiryDate.getTime()) && expiryDate <= new Date()) {
        return 0;
      }
    }
    return 1;
  }

  const roleClass = normalizeRoleClass(account?.roleClass ?? account?.role);
  return roleClass === ACCOUNT_STATUS_CLASS.MEMBER ? 1 : 0;
}

export function accountStatusClass(account, fallback = ACCOUNT_STATUS_CLASS.DEFAULT) {
  const roleCandidates = [
    account?.clientRole,
    account?.client_role,
    account?.chatClass,
    account?.roleClass,
    account?.role,
  ];
  let defaultRole = 0;

  for (const candidate of roleCandidates) {
    const roleClass = normalizeRoleClass(candidate);
    if (!roleClass) {
      continue;
    }
    if (roleClass !== ACCOUNT_STATUS_CLASS.DEFAULT) {
      return roleClass;
    }
    defaultRole = roleClass;
  }

  if (accountMembershipFlag(account)) {
    return ACCOUNT_STATUS_CLASS.MEMBER;
  }

  return defaultRole || fallback;
}

export function staffRankForRoleClass(roleClass) {
  switch (normalizeRoleClass(roleClass)) {
    case ACCOUNT_STATUS_CLASS.ADMIN:
      return STAFF_ROLE_RANK.ADMIN;
    case ACCOUNT_STATUS_CLASS.SUPER_MOD:
      return STAFF_ROLE_RANK.SUPER_MOD;
    case ACCOUNT_STATUS_CLASS.MOD:
      return STAFF_ROLE_RANK.MOD;
    case ACCOUNT_STATUS_CLASS.GUIDE:
      return STAFF_ROLE_RANK.GUIDE;
    default:
      return STAFF_ROLE_RANK.NONE;
  }
}

export function staffRankForAccount(account) {
  return staffRankForRoleClass(accountStatusClass(account, 0));
}

export function isAdminRoleClass(roleClass) {
  return staffRankForRoleClass(roleClass) === STAFF_ROLE_RANK.ADMIN;
}

export function canAccessAdminPanel(roleClass) {
  return staffRankForRoleClass(roleClass) >= STAFF_ROLE_RANK.MOD;
}

export function canModerateRoleClass(actorRoleClass, targetRoleClass) {
  const actorRank = staffRankForRoleClass(actorRoleClass);
  const targetRank = staffRankForRoleClass(targetRoleClass);
  return actorRank >= STAFF_ROLE_RANK.GUIDE && actorRank > targetRank;
}

export function accountStatusColor(account, fallback = "7D7D7D") {
  return STATUS_CLASS_COLORS.get(accountStatusClass(account)) || fallback;
}
