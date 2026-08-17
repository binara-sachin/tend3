/** Thrown by invert() on a command that has no inverse (e.g. EmptyTrash, spec 7.3). */
export class NotInvertibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotInvertibleError";
  }
}
