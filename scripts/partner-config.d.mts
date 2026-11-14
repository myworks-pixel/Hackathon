export const NOSANA_DEFAULT_URL: string;
export function daytonaNetworkPolicy(
  source?: Readonly<Record<string, string | undefined>>,
): "strict" | "platform";
export function disableExternalTracing(): void;
export function partnerUrl(
  value: string | undefined,
  field: string,
): string | undefined;
export function codeafEnvironment(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string>;
