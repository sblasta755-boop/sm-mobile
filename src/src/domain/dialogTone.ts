export type DialogButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void | Promise<void>;
};
export type DialogTone = "info" | "success" | "warning" | "danger";

// The call sites pass plain text, so the tone is read from the wording and the
// buttons rather than asked for at each of them.
export function inferTone(title: string, buttons: DialogButton[]): DialogTone {
  if (buttons.some((b) => b.style === "destructive")) return "danger";
  const t = title.toLowerCase();
  if (/could not|can't|cannot|failed|error|went wrong|denied|rejected|invalid|unable/.test(t)) return "danger";
  if (/missing|needed|required|pick|choose|check|really|sure|\?$/.test(t)) return "warning";
  if (/installed|confirmed|saved|ready|thank|done|complete|closed|success|approved|created|sent/.test(t)) return "success";
  return "info";
}
