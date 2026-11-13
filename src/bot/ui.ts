import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { getPersona, type Persona } from "../content/personas.js";
import { getProduct } from "../content/products.js";
import type { UserStats } from "../db/stats.js";
import { computeScore } from "../game/engine.js";
import type { Emotion, GameEvent, GameState, Outcome } from "../game/types.js";

export const BUTTON = {
  accept: "kauppa:accept",
  decline: "kauppa:decline",
  quit: "kauppa:quit",
} as const;

const EMOTION_EMOJI: Record<Emotion, string> = {
  neutral: "😐",
  interested: "🤔",
  excited: "🤩",
  suspicious: "🤨",
  annoyed: "😤",
  amused: "😂",
  touched: "🥹",
  confused: "😵‍💫",
};

const COLORS = { active: 0x5865f2, offer: 0xfee75c, sold: 0x57f287, lost: 0xed4245 } as const;

export function eur(value: number): string {
  return `${value.toLocaleString("fi-FI", { maximumFractionDigits: 2 })} €`;
}

function bar(value: number, filled: string, empty = "⬛"): string {
  const cells = Math.round(Math.max(0, Math.min(100, value)) / 10);
  return `${filled.repeat(cells)}${empty.repeat(10 - cells)} ${value}`;
}

const stars = (p: Persona) => "★".repeat(p.difficulty) + "☆".repeat(3 - p.difficulty);

export function statusEmbed(state: GameState, sellerName: string): EmbedBuilder {
  const { persona, product } = state;
  const color =
    state.status === "ended"
      ? state.outcome?.type === "sold"
        ? COLORS.sold
        : COLORS.lost
      : state.currentOffer !== null
        ? COLORS.offer
        : COLORS.active;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${persona.emoji} ${persona.name}, ${persona.age} v.  ${stars(persona)}`)
    .setDescription(`${persona.intro}\n*Vihje: ${persona.weaknessHint}*`)
    .addFields(
      { name: "🎁 Myytävä tuote", value: `**${product.name}**\n${product.description}` },
      { name: "💚 Kiinnostus", value: bar(state.interest, "🟩"), inline: true },
      { name: "🔴 Epäluulo", value: bar(state.suspicion, "🟥"), inline: true },
      { name: "​", value: "​", inline: false },
      { name: "⏳ Kärsivällisyys", value: `${Math.max(0, state.turnsLeft)}/${persona.patienceTurns} vuoroa`, inline: true },
      { name: "💰 Tarjous", value: state.currentOffer !== null ? eur(state.currentOffer) : "—", inline: true },
      { name: "✨ Heikkous", value: state.weaknessFound ? "Löydetty!" : "Ei vielä", inline: true },
    )
    .setFooter({
      text:
        state.status === "ended"
          ? `Myyjä: ${sellerName} · Kauppa päättyi`
          : `Myyjä: ${sellerName} · Kirjoita myyntipuheesi tähän ketjuun`,
    });
}

export function statusButtons(state: GameState): ActionRowBuilder<ButtonBuilder>[] {
  if (state.status === "ended") return [];
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (state.currentOffer !== null) {
    row.addComponents(
      new ButtonBuilder().setCustomId(BUTTON.accept).setStyle(ButtonStyle.Success).setLabel(`Hyväksy ${eur(state.currentOffer)}`).setEmoji("✅"),
    );
  }
  if (state.status === "final_offer") {
    row.addComponents(new ButtonBuilder().setCustomId(BUTTON.decline).setStyle(ButtonStyle.Danger).setLabel("Hylkää").setEmoji("❌"));
  } else {
    row.addComponents(new ButtonBuilder().setCustomId(BUTTON.quit).setStyle(ButtonStyle.Secondary).setLabel("Luovuta").setEmoji("🏳️"));
  }
  return [row];
}

export function buyerLine(persona: Persona, text: string, emotion: Emotion = "neutral"): string {
  return `${EMOTION_EMOJI[emotion]} **${persona.name}:** ${text}`;
}

/** Selittää pelaajalle tapahtumat, joita repliikistä ei suoraan näe. */
export function eventNotes(state: GameState, events: GameEvent[]): string[] {
  const notes: string[] = [];
  for (const e of events) {
    if (e.type === "weakness_found") notes.push("✨ *Osuit heikkoon kohtaan! Kiinnostus nousi ja saat pistebonuksen.*");
    if (e.type === "offer_capped") notes.push(`💸 *${state.persona.name} ei pysty maksamaan ${eur(e.requestedEur)}. Hän tarjoaa sen sijaan ${eur(e.priceEur)}.*`);
    if (e.type === "offer" && !events.some((x) => x.type === "final_offer"))
      notes.push(`💰 *Tarjous: ${eur(e.priceEur)}. Hyväksy napista tai jatka tinkimistä.*`);
    if (e.type === "final_offer") notes.push(`⌛ *Kärsivällisyys loppui. Viimeinen tarjous on ${eur(e.priceEur)}: hyväksy tai hylkää.*`);
  }
  return notes;
}

const OUTCOME_TITLE: Record<Outcome["type"], string> = {
  sold: "💰 KAUPAT TEHTY!",
  hung_up: "📵 Ostaja sulki puhelun",
  walked_away: "🚶 Ostaja lähti",
  timeout: "⌛ Ostajan kärsivällisyys loppui",
  gave_up: "🏳️ Myyjä luovutti",
};

const OUTCOME_TEXT: Record<Outcome["type"], (p: Persona) => string> = {
  sold: (p) => `${p.name} kaivaa lompakkonsa esiin.`,
  hung_up: (p) => `${p.name} haistoi huijauksen kilometrin päähän.`,
  walked_away: (p) => `${p.name} ei jaksanut enää kuunnella.`,
  timeout: (p) => `${p.name} kyllästyi ja jatkoi matkaa.`,
  gave_up: () => "Joskus on viisasta tietää milloin lopettaa.",
};

export function resultEmbed(state: GameState, sellerName: string): EmbedBuilder {
  const outcome = state.outcome ?? { type: "gave_up" as const };
  const score = computeScore(state);
  const embed = new EmbedBuilder()
    .setColor(outcome.type === "sold" ? COLORS.sold : COLORS.lost)
    .setTitle(OUTCOME_TITLE[outcome.type])
    .setDescription(`${OUTCOME_TEXT[outcome.type](state.persona)}\n\n**${sellerName}** · ${state.product.name} → ${state.persona.emoji} ${state.persona.name}`);

  if (outcome.type === "sold") {
    const ratio = score.ratio >= 100 ? Math.round(score.ratio).toString() : score.ratio.toFixed(1);
    embed.addFields(
      { name: "Myyntihinta", value: eur(score.priceEur), inline: true },
      { name: "Todellinen arvo", value: eur(state.product.trueValueEur), inline: true },
      { name: "Ylihinta", value: `${ratio}×`, inline: true },
      {
        name: `🏆 Pisteet: ${score.total}`,
        value: [
          `Perus: ${score.base}`,
          `Absurdius ×${score.absurdityMultiplier}`,
          state.weaknessFound ? "Heikkous löydetty ×1.5" : null,
          score.speedBonus > 0 ? `Nopeusbonus +${score.speedBonus}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    );
  } else {
    embed.addFields({ name: "🏆 Pisteet", value: "0", inline: true });
    if (!state.weaknessFound) embed.addFields({ name: "🔍 Heikkous olisi ollut", value: state.persona.weakness });
  }
  return embed;
}

const RANKS: { minScore: number; title: string }[] = [
  { minScore: 5000, title: "🏜️ Myi Hiekkaa Saharaan" },
  { minScore: 2500, title: "🚀 Kryptoprofeetta" },
  { minScore: 1000, title: "📞 Puhelinmyyjä" },
  { minScore: 250, title: "🥕 Torikauppias" },
  { minScore: 0, title: "🧺 Kirpparimyyjä" },
];

/** Myyjän titteli kokonaispisteiden perusteella. */
export function rankTitle(totalScore: number): { title: string; next: { title: string; minScore: number } | null } {
  const index = RANKS.findIndex((r) => totalScore >= r.minScore);
  const current = RANKS[index] ?? RANKS[RANKS.length - 1]!;
  return { title: current.title, next: index > 0 ? RANKS[index - 1]! : null };
}

const OUTCOME_EMOJI: Record<Outcome["type"], string> = {
  sold: "💰",
  hung_up: "📵",
  walked_away: "🚶",
  timeout: "⌛",
  gave_up: "🏳️",
};

const OUTCOME_LABEL: Record<Outcome["type"], string> = {
  sold: "myyty",
  hung_up: "puhelu suljettu",
  walked_away: "ostaja lähti",
  timeout: "aika loppui",
  gave_up: "luovutettu",
};

export function statsEmbed(stats: UserStats, name: string, avatarUrl?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(COLORS.active).setAuthor({ name: `${name}: myyntitilastot`, iconURL: avatarUrl });

  if (stats.played === 0) {
    return embed.setDescription("Ei vielä yhtään kauppaa. Aloita komennolla `/kauppa aloita`!");
  }

  const rank = rankTitle(stats.totalScore);
  const winRate = Math.round((stats.sold / stats.played) * 100);
  embed.setTitle(rank.title);
  if (rank.next) embed.setDescription(`-# Seuraava titteli ${rank.next.title}: ${rank.next.minScore - stats.totalScore} pistettä jäljellä`);

  embed.addFields(
    { name: "🎮 Kauppoja", value: `${stats.sold}/${stats.played} (${winRate} %)`, inline: true },
    { name: "💶 Myynti yhteensä", value: eur(stats.totalRevenueEur), inline: true },
    { name: "🏆 Pisteet", value: `${stats.totalScore} (paras ${stats.bestScore})`, inline: true },
  );

  if (stats.bestSale) {
    const product = getProduct(stats.bestSale.productId);
    const persona = getPersona(stats.bestSale.personaId);
    const ratio = stats.bestSale.priceEur / Math.max(stats.bestSale.trueValueEur, 0.1);
    embed.addFields({
      name: "🥇 Paras kauppa",
      value: `**${product?.name ?? stats.bestSale.productId}** → ${persona ? `${persona.emoji} ${persona.name}` : stats.bestSale.personaId}\n${eur(stats.bestSale.priceEur)} (${ratio >= 100 ? Math.round(ratio) : ratio.toFixed(1)}× arvo) · ${stats.bestSale.score} pistettä`,
    });
  }

  embed.addFields(
    {
      name: "🧑‍🤝‍🧑 Ostajat (myyty/pelattu)",
      value: stats.perPersona
        .map((r) => {
          const p = getPersona(r.personaId);
          return `${p?.emoji ?? "❔"} ${p?.name ?? r.personaId} ${r.sold}/${r.played}`;
        })
        .join("\n"),
      inline: true,
    },
    {
      name: "📊 Lopputulokset",
      value: (Object.keys(OUTCOME_LABEL) as Outcome["type"][])
        .filter((o) => stats.outcomes[o])
        .map((o) => `${OUTCOME_EMOJI[o]} ${OUTCOME_LABEL[o]}: ${stats.outcomes[o]}`)
        .join("\n"),
      inline: true,
    },
    { name: "✨ Heikkouksia löydetty", value: `${stats.weaknessesFound}`, inline: true },
  );
  return embed;
}

export function personaListEmbed(personas: Persona[]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.active)
    .setTitle("🧑‍🤝‍🧑 Ostajat")
    .setDescription(
      personas
        .map((p) => `${p.emoji} **${p.name}**, ${p.age} v. ${stars(p)} · budjetti ${p.budgetEur < 100 ? "pieni" : p.budgetEur < 400 ? "keskikokoinen" : "iso"}\n${p.intro}\n*Vihje: ${p.weaknessHint}*`)
        .join("\n\n"),
    )
    .setFooter({ text: "Aloita: /kauppa aloita [ostaja]" });
}
