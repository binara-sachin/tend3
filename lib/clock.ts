export type Clock = () => string;

export function systemClock(): string {
  return new Date().toISOString();
}

export function fixedClock(iso: string): Clock {
  return () => iso;
}
