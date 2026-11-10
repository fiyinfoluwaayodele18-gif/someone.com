/** The shape every authenticated screen is hydrated from. */
export function mePayload({ services, ai, user }) {
  if (!user) return { user: null, ai: { configured: ai.configured } };
  const profile = services.profileFor(user.id);
  const companion = services.companionFor(user.id);
  const settings = services.settingsFor(user.id);
  const memories = services.memoriesFor(user.id);
  return {
    user: { id: user.id, email: user.email, createdAt: user.createdAt },
    profile,
    settings,
    companion: companion
      ? {
          name: companion.name,
          traits: companion.traits,
          createdAt: companion.createdAt,
          updatedAt: companion.updatedAt,
          sheet: companion.sheet,
        }
      : null,
    onboardingComplete: Boolean(profile.completedAt),
    stats: {
      messages: services.messageCount(user.id),
      memories: memories.length,
      since: user.createdAt,
    },
    ai: {
      configured: ai.configured,
      chatModel: ai.configured ? ai.model || null : null,
    },
  };
}
