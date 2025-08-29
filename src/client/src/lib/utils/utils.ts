import { type ClassValue, clsx } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateText(text: string, length: number = 20) {
  if (text.length <= length) return text;
  return `${text.slice(0, length)}...`;
}

export const copyToClipboard = async (text: string, field: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${field} copied to clipboard`);
  } catch (err) {
    toast.error('Failed to copy to clipboard');
  }
};