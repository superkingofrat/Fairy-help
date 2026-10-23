import { t } from "../../lib/i18n";
import type { CardStatus } from "./MovieCard";

export function borrowLabel(status: CardStatus): string {
  if (status === "borrowed") {
    return t("library.borrowed");
  }
  if (status === "borrowing") {
    return t("library.borrowing");
  }
  return t("library.borrow");
}
