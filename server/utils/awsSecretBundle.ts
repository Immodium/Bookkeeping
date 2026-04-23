export const parseSecretBundle = (): Record<string, string> => {
  const rawBundle = process.env.APP_SECRETS_BUNDLE;
  if (!rawBundle) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawBundle) as Record<string, unknown>;
    const normalized: Record<string, string> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === 'string') {
        normalized[key] = value;
      }
    });
    return normalized;
  } catch (error) {
    console.warn('APP_SECRETS_BUNDLE is not valid JSON and will be ignored.');
    return {};
  }
};

export const applySecretBundleToEnv = (): void => {
  const secretBundle = parseSecretBundle();
  Object.entries(secretBundle).forEach(([key, value]) => {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};
