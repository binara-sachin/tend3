export interface CommandLogRepository {
  append(command: string, payload: string, appliedAt: string): void;
}
