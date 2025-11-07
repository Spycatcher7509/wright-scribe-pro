import { format } from "date-fns";

/**
 * Formats a date in GB format: dd/MM/yyyy HH:mm:ss
 * This is strictly enforced throughout the application
 */
export const formatGBDateTime = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return format(dateObj, "dd/MM/yyyy HH:mm:ss");
};

/**
 * Formats a date in GB format: dd/MM/yyyy
 */
export const formatGBDate = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return format(dateObj, "dd/MM/yyyy");
};
