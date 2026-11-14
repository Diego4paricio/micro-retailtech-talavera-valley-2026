export function inlineScriptHashes(html: string): string[];
export function contentSecurityPolicy(scriptHashes: string[]): string;
export function injectPolicy(html: string, policy: string): string;
export function findUnsafeMarkup(html: string): string[];
export function headersFile(): string;
