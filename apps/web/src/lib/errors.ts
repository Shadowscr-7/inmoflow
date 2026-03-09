/**
 * Safely extract an error message from an unknown caught value.
 * Use in catch blocks: catch (e: unknown) { toast.error(getErrorMessage(e)); }
 */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "Error desconocido";
}
