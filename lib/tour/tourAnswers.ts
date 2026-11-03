import type { Profile } from "./types";

/**
 * Returns the bot answer for a quick-question key, personalised to the active profile.
 */
export function getAnswer(
  questionKey: string,
  profileId: string,
  profiles: Profile[],
): string {
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return "";

  switch (questionKey) {
    case "storage":
      return (
        "מחסן של 6 מ\u05F4ר בקומה \u200F-1, עם נקודת חשמל, רשום כצמוד לדירה." +
        profile.storage
      );
    case "parking":
      return "חניה מקורה אחת בקומה \u200F-2, 15 מטר מהמעלית, עם הכנה לעמדת טעינה לרכב חשמלי.";
    case "mamad":
      return (
        'ממ"ד של 7.9 מ\u05F4ר עם קירות בטון של 30 ס"מ, ודלת וחלון הדף מפלדה.' +
        profile.mamad
      );
    case "price":
      return "המחיר המבוקש: 2,950,000 ₪. עוד 3 קונים עם פרופיל דומה מתעניינים בנכסים באזור. אם תצטרפו לחבילת קונים, אפשר לנהל משא ומתן על מחיר טוב יותר.";
    default:
      return "";
  }
}
