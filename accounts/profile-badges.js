import { ACCOUNT_STATUS_CLASS, accountMembershipFlag, accountStatusClass } from "./account-status.js";

const MAX_EXPORTED_BADGE_ID = 675;

const NAMED_BADGE_DEFINITIONS = [
  // ── Rank / Role Badges ─────────────────────────────────────────────────────
  { id: 10, name: "Administrator", description: "Game Developer." },
  { id: 11, name: "Moderator", description: "Awarded by a Game Administrator." },
  { id: 161, name: "Senior Moderator", description: "Must be an active Moderator for over 3 seasons." },
  { id: 21, name: "Guide", description: "Awarded by a Game Administrator." },
  { id: 22, name: "Journalist", description: "Awarded by a Game Administrator. Community-based role focused on interviewing, content creation, and game spotlights." },
  { id: 16, name: "Veteran", description: "Must have an active membership and a linked account to Nitto 1320 Challenge. [subject to change]" },
  { id: 12, name: "Member", description: "Must have an active membership." },

  // ── Tournament / Performance Badges ────────────────────────────────────────
  { id: 1, name: "1st Place Tournament", description: "Win 1st place in a Live Tournament. note: a number may appear next to the badge to indicate multiple accomplishments." },
  { id: 19, name: "2nd Place Tournament", description: "Win 2nd place in a Live Tournament. note: a number may appear next to the badge to indicate multiple accomplishments." },
  { id: 2, name: "Perfect R/T", description: "Achieve a reaction time of 0.500 in a completed live race. note: a number may appear next to the badge to indicate multiple accomplishments." },
  { id: 4, name: "5 Second Club", description: "Achieve an elapsed time of 5.999 seconds or faster in a completed live race. Refreshes weekly." },
  { id: 408, name: "Avitron", description: "Awarded to players who succeeded in a limited-time Reaction Time event. [subject to change]" },
  { id: 13, name: "10,000 Races", description: "Complete a combined total of 10,000 or more live races." },

  // ── Wealth & Status Badges ─────────────────────────────────────────────────
  { id: 3, name: "High Roller", description: "Raced for $100,000 or more in a cash race." },
  { id: 14, name: "Baller", description: "Must actively hold $100,000 or more in bank." },
  { id: 160, name: "Black Card", description: "Believed to be acquired through the purchase of an in-game package with real-world currency. Appears to be related to Diamond Point. (Status unconfirmed.)" },

  // ── City Resident Badges ───────────────────────────────────────────────────
  { id: 6, name: "Toreno", description: "Resident of Toreno." },
  { id: 7, name: "Newburge", description: "Resident of Newburge." },
  { id: 8, name: "Creek Side", description: "Resident of Creek Side." },
  { id: 9, name: "Vista Heights", description: "Resident of Vista Heights." },
  { id: 159, name: "Diamond Point", description: "Resident of Diamond Point." },

  // ── Collection & Progression Badges ───────────────────────────────────────
  { id: 23, name: "UCL Specialist", description: "Sell 100 cars for $10,000 or more through non-private sales." },
  { id: 15, name: "Loser", description: "Lose 20 consecutive live races." },
  { id: 24, name: "Car Collector", description: "Own 20 or more cars." },

  // ── VIP & Purchase Badges ──────────────────────────────────────────────────
  { id: 174, name: "VIP", description: "Nitto VIP. Believed to be obtained through the purchase of an in-game package with real-world currency." },
  { id: 175, name: "Silver Rose", description: "Awarded for achieving 7 or more 2nd-place finishes in the Quarter Mile Courtship." },
  { id: 185, name: "RS 200 Dirty Wheel", description: "Awarded for purchasing the RS 200." },
  { id: 187, name: "SVT Lightning Trucker Hat", description: "Proud owner of the first truck in 1320 Legends." },
  { id: 190, name: "The RAM Badge", description: "Awarded to players who purchased the RAM SRT-10." },
  { id: 178, name: "Punch", description: "Punch Buggy! Slug Bug!" },
  { id: 577, name: "Koala Badge", description: "Awarded for purchasing the Ford Falcon XB GT." },
  { id: 607, name: "Lunar New Year YOTS (Black)", description: "Purchased the YOTS Lunar New Year SRT Viper: Matte Black." },
  { id: 608, name: "Lunar New Year YOTS (Red)", description: "Purchased the YOTS Lunar New Year SRT Viper: Red." },
  { id: 609, name: "RWB Ramintra 993R", description: "Purchased the RWB Ramintra 993R." },
  { id: 177, name: "R32", description: "First 1320 users who purchased the R32." },

  // ── Special / Staff Badges ─────────────────────────────────────────────────
  { id: 610, name: "Chaidrin", description: "Special Chaidrin badge. [subject to change]" },
  { id: 611, name: "Jhazmin", description: "Special Jhazmin badge. [subject to change]" },
  { id: 612, name: "Shalymar", description: "Special Shalymar badge. [subject to change]" },
  { id: 613, name: "Moxxi", description: "The most awesome badge ever! Special Moxxi badge. [subject to change]" },
  { id: 614, name: "Velyssan", description: "Special Velyssan badge. [subject to change]" },
  { id: 615, name: "Wrathsputin", description: "Wrathsputin Admin badge. [subject to change]" },
  { id: 616, name: "Connection Error", description: "Purchased Top Fool Dragster." },

  // ── Versus the World Tournament ────────────────────────────────────────────
  { id: 617, name: "VTW Tournament 1st", description: "1st Place in the Versus the World Tournament." },
  { id: 618, name: "VTW Tournament 2nd", description: "2nd Place in the Versus the World Tournament." },
  { id: 619, name: "VTW Tournament Top 5", description: "Finished in the Top 5 of the Versus the World Tournament." },
  { id: 620, name: "VTW Tournament Participant", description: "Participant in the Versus the World Tournament." },

  // ── SLR Tournament ─────────────────────────────────────────────────────────
  { id: 621, name: "Golden Gullwing", description: "1st Place in the SLR Tournament." },
  { id: 622, name: "Silver Gullwing", description: "2nd Place in the SLR Tournament." },
  { id: 170, name: "Thanksgiving Throwdown Hazelnuts", description: "2nd place in the Thanksgiving Throwdown Event." },
  { id: 171, name: "Holiday Hustle Red Bells", description: "1st place in the Holiday Hustle Event." },
  { id: 172, name: "Holiday Hustle Candy Cane Participant", description: "Participant in the Holiday Hustle Event." },
  { id: 173, name: "Thanksgiving Throwdown Turkey", description: "1st place in the Thanksgiving Throwdown Event." },
  { id: 183, name: "Thanksgiving Throwdown Participant", description: "Participant in the Thanksgiving Throwdown Event." },
  { id: 184, name: "Holiday Hustle Blue Ornament", description: "2nd place in the Holiday Hustle Event." },

  // ── Event Badges ───────────────────────────────────────────────────────────
  { id: 162, name: "Tire Buyer Participant", description: "Participant in the Tire Buyer Tournament." },
  { id: 168, name: "Royal Purple II Participant", description: "Participant in the Royal Purple II Tournament." },
  { id: 186, name: "'11 WD-40/SEMA Cares Participant", description: "Participated in a 2011 WD-40/SEMA Cares Tournament." },
  { id: 623, name: "'12 WD-40/SEMA Cares Participant", description: "Participated in a 2012 WD-40/SEMA Cares Tournament." },
  { id: 88, name: "WD-40/SEMA Cares '10 Donor", description: "2010 Charity Donor badge for users who purchased the WD-40 Mustang to help out kids in need." },
  { id: 624, name: "WD-40/SEMA Cares '11 Donor", description: "2011 Charity Donor badge for users who purchased the WD-40 Challenger to support children in need." },
  { id: 625, name: "Graveyard Shift 1st", description: "1st place in the Graveyard Shift Tournament." },
  { id: 626, name: "Graveyard Shift 2nd", description: "2nd place in the Graveyard Shift Tournament." },
  { id: 627, name: "Graveyard Shift Participant", description: "Participant in the Graveyard Shift Tournament." },
  { id: 628, name: "Turkey Leg", description: "1st place in the Turkey Day Tournament." },
  { id: 629, name: "Pilgrim Hat", description: "2nd Place in the Turkey Day Tournament." },
  { id: 630, name: "Leaves", description: "Turkey Day Tournament Participant Badge." },
  { id: 400, name: "Leap Year Tourney Participant", description: "Participant in a Leap Year Tournament." },
  { id: 492, name: "1st in Bergenholtz Battle", description: "1st place in the Bergenholtz Battle." },
  { id: 631, name: "Bergenholtz Battle Participant", description: "Participant in the Bergenholtz Battle." },
  { id: 632, name: "Leprechaun Hat", description: "Participant in the St. Patrick's Day Tournament." },
  { id: 98, name: "Bunny", description: "1st in an Eggceleration Easter Tournament." },
  { id: 633, name: "Egg", description: "2nd Place in an Eggceleration Easter Tournament." },
  { id: 634, name: "Chick", description: "Participant in an Eggceleration Easter Tournament." },
  { id: 635, name: "Gold Bunny", description: "Awarded for achieving 15 or more 1st-place finishes in Eggceleration Easter Tournaments." },
  { id: 636, name: "Pinata", description: "Participant in the Cinco de Mayo Tournament." },
  { id: 461, name: "Chili", description: "2nd in Cinco de Mayo Tournament." },
  { id: 637, name: "Disguise", description: "1st Place in a Fast and Foolishness Tournament." },
  { id: 638, name: "Jester Hat", description: "Participant in a Fast and Foolishness Tournament." },
  { id: 639, name: "Uncle Sam Hat", description: "Participant in the 4th of July Tournament." },
  { id: 640, name: "US Flag", description: "Limited participant badge for a special 4th of July Tournament." },
  { id: 641, name: "Pirate Day Parrot Gold", description: "1st Place in special Pirate Day Tournaments." },
  { id: 642, name: "Pirate Day Parrot Silver", description: "2nd Place in special Pirate Day Tournaments." },
  { id: 643, name: "Pirate Day Parrot", description: "Owner of the Pirate Day Graphics Wrap." },
  { id: 644, name: "Vampire Participant Badge", description: "Participant in the Vampire vs. Zombies Event." },
  { id: 645, name: "Zombie Participant Badge", description: "Zombie Participant Badge." },
  { id: 646, name: "Vampire vs. Zombies Toreno Winner", description: "Winner of the Vampire vs. Zombies Event in Toreno." },
  { id: 647, name: "Vampire vs. Zombies Newburge Winner", description: "Winner of the Vampire vs. Zombies Event in Newburge." },
  { id: 648, name: "Vampire vs. Zombies Diamond Point Winner", description: "Winner of the Vampire vs. Zombies Event in Diamond Point." },
  { id: 649, name: "Vampire vs. Zombies Creek Side Winner", description: "Winner of the Vampire vs. Zombies Event in Creek Side." },
  { id: 650, name: "Vampire vs. Zombies Vista Heights Winner", description: "Winner of the Vampire vs. Zombies Event in Vista Heights." },
  { id: 573, name: "Summer Down Under Kangaroo", description: "Participant in the Summer Down Under Event." },
  { id: 651, name: "Summer Down Under Croc", description: "1st Place in the Summer Down Under Event." },
  { id: 652, name: "Summer Down Under Surf Board", description: "2nd place in the Summer Down Under Event." },
  { id: 93, name: "Football", description: "Participant in Who's Your Daddy Event." },
  { id: 46, name: "Labor Day BBQ Chill", description: "Participant in the Labor Day Event." },
  { id: 458, name: "Labor Day Beach Umbrella", description: "Runner up in the Labor Day Event." },
  { id: 182, name: "Labor Day Hard Hat", description: "Winner of the Labor Day Event." },
  { id: 462, name: "Yo Momma", description: "Participant in the Mother's Day Tournament." },
  { id: 531, name: "Flower", description: "Runner up in the Mother's Day Tournament." },
  { id: 541, name: "Father's Day Tie", description: "Runner up in the Father's Day Event." },
  { id: 398, name: "Genesis", description: "Participant in the Genesis Coupe Event." },
  { id: 653, name: "Genesis Universe", description: "Winner of the Genesis Coupe Event." },
  { id: 654, name: "Avitron Birthday Logo", description: "Participant in the Avitron 3rd Birthday Tournament." },
  { id: 655, name: "Sleigh", description: "1st Place in the Speedy Greetings Tournament." },
  { id: 656, name: "Snowman", description: "2nd Place in the Speedy Greetings Tournament." },
  { id: 657, name: "Gift Box", description: "Participant in the Speedy Greetings Tournament." },
  { id: 658, name: "Silver Police Badge", description: "2nd Place in the Cop Tournament." },
  { id: 659, name: "Cuffs", description: "Participant in the Cop Tournament." },
  { id: 660, name: "5 Year Anniversary Tourney 1st", description: "1st Place in the 5-Year Anniversary Tournament." },
  { id: 571, name: "5 Year Anniversary Tourney 2nd", description: "2nd Place in the 5-Year Anniversary Tournament." },
  { id: 581, name: "Participant in 5-Year Tourney", description: "Participant in the 5-Year Anniversary Tournament." },
  { id: 661, name: "5 Year Daily Challenge", description: "Completed the 5-Year Anniversary Daily Challenge." },
  { id: 662, name: "YOTD Participant", description: "Participated in the Year of the Dragon Tournament." },
  { id: 663, name: "Import vs. Domestic II Winning", description: "Import vs. Domestic II Winning Team." },
  { id: 664, name: "Import in I vs D II", description: "Representin' Imports in Import vs. Domestic II." },
  { id: 180, name: "Domestic", description: "Representin' Domestic!" },
  { id: 203, name: "Donut", description: "Participant in the Horsepower Pursuit Event." },
  { id: 204, name: "Heart Steering Wheel Red", description: "1st Place in the Quarter Mile Courtship." },
  { id: 176, name: "Red Rose", description: "2nd Place in the Quarter Mile Courtship." },
  { id: 576, name: "Heart Helmet", description: "Participant in the Quarter Mile Courtship." },
  { id: 579, name: "Kiss", description: "Participated in a Heart Brake Showdown Tournament." },

  // ── Hellion / Special Cars ─────────────────────────────────────────────────
  { id: 665, name: "Hellion", description: "Limited-edition badge awarded to players who purchased the Hellion Mustang." },
  { id: 666, name: "Venomous Beast", description: "You've been bitten by the BEAST. Possibly awarded for purchasing the Mustang Beast." },
  { id: 667, name: "Shock Badge", description: "Awarded for purchasing the Integra Wrap." },
  { id: 668, name: "Shock Badge 2", description: "Awarded for purchasing the Integra Wrap." },
  { id: 669, name: "SLR McLaren Gullwing", description: "Gullwing badge awarded for purchasing the SLR McLaren." },
  { id: 670, name: "RS 500", description: "RS 500 Owner Badge." },
  { id: 671, name: "Red Seat", description: "Awarded for purchasing a Civic Type-R." },
  { id: 672, name: "Ice Cube Tray", description: "Awarded for purchasing a Nissan Cube." },
  { id: 673, name: "Melting Ice Cube", description: "2nd Place in the Nissan Cube Tournament." },
  { id: 674, name: "Suby Pig", description: "Limited badge awarded to the first 500 purchasers of the '11 WRX STI." },
  { id: 463, name: "Gold Disguise", description: "April Fool's Daily Challenge Badge." },

  // ── Charity Badges ─────────────────────────────────────────────────────────
  { id: 675, name: "Help Japan", description: "Awarded to players who donated to aid victims of the Japan earthquake and tsunami." },
];

const NAMED_BADGES_BY_ID = new Map(NAMED_BADGE_DEFINITIONS.map((badge) => [badge.id, badge]));

const UNSUPPORTED_PROFILE_BADGE_IDS = new Set([
  5,
  // Legacy duplicate High Roller asset (badge-0018.png); canonical badge is id 3.
  18,
  // Duplicate VIP asset; canonical VIP badge is id 174.
  505,
]);

const ROLE_DERIVED_BADGE_IDS = new Set([10, 11, 161, 21, 12, 16]);

const SINGLE_COUNT_BADGE_IDS = new Set([4, ...ROLE_DERIVED_BADGE_IDS, 160, 174]);

const PACKAGE_PURCHASE_BADGE_IDS = new Map([
  [160, new Set(["kingpin", "ultimate-vip-garage"])],
  [174, new Set(["kingpin", "ultimate-vip-garage"])],
]);
const ADMIN_BADGE_IMAGE_BASE_PATH = "/admin/badges";
const NEIGHBORHOOD_BADGE_BY_LOCATION_ID = new Map([
  [100, 6],
  [200, 7],
  [300, 8],
  [400, 9],
  [500, 159],
]);

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const BADGE_DEFINITIONS = Array.from({ length: MAX_EXPORTED_BADGE_ID }, (_, index) => {
  const id = index + 1;
  return NAMED_BADGES_BY_ID.get(id) || {
    id,
    name: `Badge ${id}`,
    description: `Badge ${id}`,
  };
});

export function badgeImageUrl(badgeId) {
  const id = normalizeBadgeId(badgeId);
  return id ? `${ADMIN_BADGE_IMAGE_BASE_PATH}/badge-${String(id).padStart(4, "0")}.png` : "";
}

export function getBadgeDefinitionById(badgeId) {
  const id = normalizeBadgeId(badgeId);
  return id > 0 && id <= BADGE_DEFINITIONS.length ? BADGE_DEFINITIONS[id - 1] : null;
}

export function getAdminBadgeCatalog() {
  return BADGE_DEFINITIONS.map((badge) => ({
    ...badge,
    imageUrl: badgeImageUrl(badge.id),
  }));
}

export function describeBadgeRow(row = {}) {
  const id = normalizeBadgeId(row.id ?? row.i);
  const definition = getBadgeDefinitionById(id);
  if (!definition) {
    return null;
  }

  const visibleRaw = row.visible ?? row.v;
  const visible = visibleRaw === 0 || visibleRaw === "0" || visibleRaw === false ? false : true;
  return {
    id,
    name: definition.name,
    description: definition.description,
    imageUrl: badgeImageUrl(id),
    visible,
    count: normalizeDisplayBadgeRow({
      id,
      count: row.count ?? row.n,
    }).count,
  };
}

export function buildBadgeCatalogXml() {
  return `<n id='badges'>${BADGE_DEFINITIONS
    .map((badge) => `<b i='${badge.id}' n='${escapeXmlAttribute(badge.name)}' d='${escapeXmlAttribute(badge.description)}'/>`)
    .join("")}</n>`;
}

function normalizeBadgeId(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const id = Math.trunc(numeric);
  return id > 0 ? id : 0;
}

function normalizeBadgeCount(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  const count = Math.trunc(numeric);
  return count > 1 ? count : 1;
}

export function parsePlayerBadges(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  let parsed = rawValue;
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return null;
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray(parsed.badges)
      ? parsed.badges
      : null;
  const itemsById = new Map();

  if (list) {
    for (const entry of list) {
      if (typeof entry === "number" || typeof entry === "string") {
        const id = normalizeBadgeId(entry);
        if (id) {
          itemsById.set(id, { id, visible: true, count: 1 });
        }
        continue;
      }

      if (!entry || typeof entry !== "object") {
        continue;
      }

      const id = normalizeBadgeId(entry.i ?? entry.id ?? entry.badge_id);
      if (!id) {
        continue;
      }
      const visibleRaw = entry.v ?? entry.visible;
      const visible = visibleRaw === 0 || visibleRaw === "0" || visibleRaw === false ? false : true;
      const count = normalizeBadgeCount(entry.n ?? entry.count);
      mergeBadgeRowIntoMap(itemsById, { id, visible, count });
    }
  } else if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed)) {
      const id = normalizeBadgeId(key);
      if (id) {
        itemsById.set(id, { id, visible: true, count: normalizeBadgeCount(value) });
      }
    }
  }

  const badges = [...itemsById.values()].sort((left, right) => left.id - right.id);
  return badges.length ? badges : null;
}

function getCurrentMessageBadgeRow(player) {
  const id = normalizeBadgeId(player?.message_badge ?? player?.messageBadge);
  return id ? { id, visible: true, count: 1 } : null;
}

function mergeSupplementalBadgeRows(rows, supplementalRows) {
  const itemsById = new Map(rows.map((badge) => [badge.id, { ...badge }]));

  for (const badge of supplementalRows) {
    if (!badge || itemsById.has(badge.id)) {
      continue;
    }
    itemsById.set(badge.id, {
      id: badge.id,
      visible: badge.visible !== false,
      count: normalizeBadgeCount(badge.count),
    });
  }

  return [...itemsById.values()].sort((left, right) => left.id - right.id);
}

function perfectReactionTimeCount(player) {
  const count = Number(
    player?.perfectReactionTimes
    ?? player?.perfectReactionTimeCount
    ?? player?.perfectRtCount
    ?? player?.perfect_rt_count
    ?? 0,
  );
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

function fiveSecondClubCount(player) {
  const count = Number(
    player?.fiveSecondClubPasses
    ?? player?.fiveSecondClubCount
    ?? player?.fiveSecondPassCount
    ?? player?.five_second_count
    ?? 0,
  );
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

function neighborhoodBadgeId(player) {
  const locationId = Number(
    player?.locationId
    ?? player?.location_id
    ?? player?.lid
    ?? player?.starterCar?.locationId
    ?? player?.cars?.find?.((car) => car?.isCurrent || car?.current)?.locationId
    ?? 100,
  );
  return NEIGHBORHOOD_BADGE_BY_LOCATION_ID.get(locationId) || 0;
}

function highestRaceWager(player) {
  const wager = Number(
    player?.highestRaceWager
    ?? player?.highRollerRaceWager
    ?? player?.highest_race_wager
    ?? 0,
  );
  return Number.isFinite(wager) && wager > 0 ? Math.trunc(wager) : 0;
}

function shouldShowBadge(player, badgeId) {
  const role = accountStatusClass(player, 0);

  switch (badgeId) {
    // ── Neighborhood badges: only show the one matching the player's location ─
    case 6:
    case 7:
    case 8:
    case 9:
    case 159:
      return neighborhoodBadgeId(player) === badgeId;

    // ── Performance ────────────────────────────────────────────────────────────
    case 2:   // Perfect R/T
      return perfectReactionTimeCount(player) > 0;
    case 4:   // 5 Second Club
      return fiveSecondClubCount(player) > 0;

    // ── Role / staff ───────────────────────────────────────────────────────────
    case 10:  // Administrator
      return role === ACCOUNT_STATUS_CLASS.ADMIN;
    case 11:  // Moderator
      return role === ACCOUNT_STATUS_CLASS.MOD;
    case 161: // Senior Moderator
      return role === ACCOUNT_STATUS_CLASS.SUPER_MOD;
    case 21:  // Guide
      return role === ACCOUNT_STATUS_CLASS.GUIDE;
    case 22:  // Journalist — staff-assigned; show only when explicitly granted via manual badges
      return false;
    case 16:  // Veteran — linked legacy N1320C account
      return Boolean(
        player?.linkedNittoAccount
        ?? player?.linked_nitto_account
        ?? player?.nittoLinked
        ?? false,
      );
    case 12:  // Member
      return role === ACCOUNT_STATUS_CLASS.MEMBER || accountMembershipFlag(player) > 0;

    // ── Wealth ─────────────────────────────────────────────────────────────────
    case 3:   // High Roller (green chip; race wager)
      return highestRaceWager(player) >= 100000;
    case 14:  // Baller
      return Number(player?.money || 0) >= 100000;

    // ── Purchase package badges ────────────────────────────────────────────────
    case 160: // Black Card
      return accountQualifiesForPurchaseBadge(player, badgeId);
    case 174: // VIP
      return accountQualifiesForPurchaseBadge(player, badgeId)
        || Number(player?.vip || 0) > 0
        || accountMembershipFlag(player) > 0;

    // ── Stat-based progression ─────────────────────────────────────────────────
    case 13:  // 10,000 Races
      return Number(
        player?.totalRaces ?? player?.total_races ?? player?.raceCount ?? player?.race_count ?? 0,
      ) >= 10000;
    case 15:  // Loser (20 consecutive losses)
      return Number(
        player?.consecutiveLosses ?? player?.consecutive_losses ?? player?.lossStreak ?? 0,
      ) >= 20;
    case 23:  // UCL Specialist (sold 100 cars for $10k+)
      return Number(
        player?.uclSales ?? player?.ucl_sales ?? player?.highValueSales ?? 0,
      ) >= 100;
    case 24:  // Car Collector (own 20+ cars)
      return Number(
        player?.carCount ?? player?.car_count ?? player?.cars?.length ?? 0,
      ) >= 20;

    default:
      return false;
  }
}

function getDerivedBadgeRows(player) {
  return BADGE_DEFINITIONS
    .filter((badge) => shouldShowBadge(player, badge.id))
    .map((badge) => ({
      id: badge.id,
      visible: true,
      count: badge.id === 2
        ? perfectReactionTimeCount(player)
        : 1,
    }));
}

function accountPurchaseSkus(player) {
  return new Set(
    (Array.isArray(player?.purchases) ? player.purchases : [])
      .map((purchase) => String(purchase?.sku || purchase?.packageKey || "").trim().toLowerCase())
      .filter(Boolean),
  );
}

function accountQualifiesForPurchaseBadge(player, badgeId) {
  const normalizedBadgeId = normalizeBadgeId(badgeId);
  const requiredSkus = PACKAGE_PURCHASE_BADGE_IDS.get(normalizedBadgeId);
  if (!requiredSkus) {
    return true;
  }

  for (const sku of requiredSkus) {
    if (accountPurchaseSkus(player).has(sku)) {
      return true;
    }
  }

  return collectRawManualBadgeRows(player).some((badge) => badge.id === normalizedBadgeId);
}

function shouldKeepManualBadge(player, badge) {
  const badgeId = normalizeBadgeId(badge?.id);
  if (!badgeId || UNSUPPORTED_PROFILE_BADGE_IDS.has(badgeId)) {
    return false;
  }

  // Anything the server can derive live should not also live in stored manual badges.
  if (shouldShowBadge(player, badgeId)) {
    return false;
  }

  return true;
}

function normalizeDisplayBadgeRow(badge) {
  const singleCountBadge = SINGLE_COUNT_BADGE_IDS.has(badge.id);
  return {
    ...badge,
    count: singleCountBadge ? 1 : normalizeBadgeCount(badge.count),
  };
}

function mergeBadgeRowIntoMap(itemsById, badge) {
  const id = normalizeBadgeId(badge?.id);
  if (!id) {
    return;
  }

  const visible = badge.visible !== false;
  const count = normalizeBadgeCount(badge.count);
  const existing = itemsById.get(id);
  itemsById.set(id, existing
    ? {
      id,
      visible: existing.visible || visible,
      // Same badge stored in multiple fields must not stack — keep the highest count.
      count: normalizeBadgeCount(Math.max(existing.count, count)),
    }
    : { id, visible, count });
}

function mergeManualBadgeRows(itemsById, badges) {
  for (const badge of badges) {
    mergeBadgeRowIntoMap(itemsById, badge);
  }
}

export function collectRawManualBadgeRows(player) {
  const itemsById = new Map();
  for (const source of [
    player?.badges_json,
    player?.badgesJson,
    player?.manualBadges,
    player?.badges,
  ]) {
    const parsed = parsePlayerBadges(source);
    if (parsed?.length) {
      mergeManualBadgeRows(itemsById, parsed);
    }
  }
  return [...itemsById.values()].sort((left, right) => left.id - right.id);
}

export function collectManualBadgeRows(player) {
  return collectRawManualBadgeRows(player)
    .filter((badge) => shouldKeepManualBadge(player, badge));
}

export function sanitizeManualBadgesForAccount(account) {
  return collectManualBadgeRows(account);
}

export function applySanitizedManualBadgesToAccount(account) {
  const sanitized = sanitizeManualBadgesForAccount(account);
  account.manualBadges = sanitized.map((badge) => ({
    id: badge.id,
    visible: badge.visible !== false,
    count: normalizeBadgeCount(badge.count),
  }));
  account.badges_json = JSON.stringify(account.manualBadges.map((badge) => ({
    id: badge.id,
    v: badge.visible ? 1 : 0,
    n: badge.count,
  })));
  delete account.badges;
  delete account.badgesJson;
  return sanitized;
}

export function applyManualBadgesToAccount(account, badges) {
  const normalized = collectManualBadgeRows({ ...account, manualBadges: badges })
    .map((badge) => ({
      id: badge.id,
      visible: badge.visible !== false,
      count: normalizeBadgeCount(badge.count),
    }));
  account.manualBadges = normalized;
  account.badges_json = JSON.stringify(normalized.map((badge) => ({
    id: badge.id,
    v: badge.visible ? 1 : 0,
    n: badge.count,
  })));
  delete account.badges;
  delete account.badgesJson;
  return normalized;
}

export function getPlayerBadgeRows(player) {
  const derivedRows = getDerivedBadgeRows(player);
  const manualRows = collectManualBadgeRows(player);

  return mergeSupplementalBadgeRows(manualRows, [
    ...derivedRows,
    getCurrentMessageBadgeRow(player),
  ])
    .filter((badge) => !UNSUPPORTED_PROFILE_BADGE_IDS.has(badge.id))
    .map(normalizeDisplayBadgeRow);
}

export function renderVisibleBadgesXml(player, { includeHidden = true } = {}) {
  return getPlayerBadgeRows(player)
    .filter((badge) => includeHidden || badge.visible)
    .map((badge) => `<b i='${badge.id}' v='${badge.visible ? 1 : 0}' n='${badge.count}'/>`)
    .join("");
}

// Alias for backward compatibility
export const renderAccountBadgesXml = renderVisibleBadgesXml;

export function setPlayerBadgeVisibility(player, badgeId, visible) {
  const targetId = normalizeBadgeId(badgeId);
  if (!targetId) {
    return null;
  }

  const rows = getPlayerBadgeRows(player);
  const target = rows.find((badge) => badge.id === targetId);
  if (!target) {
    return null;
  }

  const manualRows = collectManualBadgeRows(player);
  const rowsById = new Map(manualRows.map((badge) => [badge.id, {
    id: badge.id,
    v: badge.visible ? 1 : 0,
    n: badge.count,
  }]));

  const existing = rowsById.get(targetId);
  rowsById.set(targetId, {
    id: targetId,
    v: visible ? 1 : 0,
    n: existing?.n ?? target.count,
  });

  return [...rowsById.values()].sort((left, right) => left.id - right.id);
}
